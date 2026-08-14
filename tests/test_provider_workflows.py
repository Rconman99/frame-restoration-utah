#!/usr/bin/env python3
"""Offline regression tests for provider-backed maintenance workflows.

The provider scripts are imported directly so every network response can be
controlled. These tests intentionally follow the public interfaces currently on
``origin/main``: CTA checks return failure lists, while the review updater uses
``main()`` plus bidirectional SerpAPI/DataForSEO fallback.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]


def load_script(module_name: str, relative_path: str):
    spec = importlib.util.spec_from_file_location(module_name, REPO / relative_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not import {relative_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class JsonResponse:
    """Minimal ``urlopen`` context manager returning a JSON payload."""

    def __init__(self, payload: dict):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback) -> bool:
        return False

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


cta = load_script("utah_cta_liveness", "scripts/check-cta-liveness.py")
reviews = load_script("utah_google_reviews", "scripts/update-google-reviews.py")
blog_publisher = load_script("utah_blog_publisher", "scripts/blog-publish.py")


class ComplianceWorkflowDependencyTests(unittest.TestCase):
    """Freeze clean-runner dependencies for blocking browser and Deno jobs."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = (REPO / ".github/workflows/compliance-gate.yml").read_text(
            encoding="utf-8"
        )

    def job_source(self, name: str, next_name: str) -> str:
        start = self.workflow.index(f"  {name}:")
        end = self.workflow.index(f"\n  {next_name}:", start)
        return self.workflow[start:end]

    def test_edge_typecheck_installs_locked_npm_dependencies(self) -> None:
        job = self.job_source("edge-function-compile", "static-assets")
        self.assertIn(
            "deno check --frozen --node-modules-dir=auto "
            "supabase/functions/*/index.ts",
            job,
        )

    def test_lead_form_installs_chromium_before_browser_test(self) -> None:
        job = self.job_source("lead-form-single-submit", "lead-sms-contract")
        npm_ci = job.index("npm ci")
        install = job.index("npx playwright install --with-deps chromium")
        test = job.index("npm run test:lead-form")
        self.assertLess(npm_ci, install)
        self.assertLess(install, test)


def sample_cfg() -> dict:
    return {
        "brand": "Frame Restoration Utah",
        "canonical_host": "www.framerestorationutah.com",
        "review_landing_path": "/review",
        "known_wrong_listing_cids": ["dead-cid"],
        "gbp": {"cid": "good-cid", "place_id": "good-place", "data_id": "good-data"},
    }


def sample_review(author: str = "Ada") -> dict:
    return {
        "author": author,
        "city": "",
        "rating": 5,
        "date": "2026-08-01",
        "text": "Clear communication and careful work.",
    }


def sample_full_review(author: str = "Ada") -> dict:
    return {
        "author": author,
        "rating": 5,
        "date": "2026-08-01",
        "text": "Clear communication and careful work.",
        "has_text": True,
    }


def dataforseo_gbp_payload(*, cid: str = "good-cid", title: str = "Frame Restoration Utah", count: int = 34) -> dict:
    return {
        "tasks": [
            {
                "result": [
                    {
                        "items": [
                            {
                                "cid": cid,
                                "title": title,
                                "rating": {"votes_count": count},
                            }
                        ]
                    }
                ]
            }
        ]
    }


class CTALivenessTests(unittest.TestCase):
    def test_site_check_passes_with_canonical_identifier(self) -> None:
        with mock.patch.object(
            cta,
            "http_get",
            return_value=(200, "...good-place...", "https://example/review"),
        ):
            failures = cta.check_live_review_page(sample_cfg())
        self.assertEqual(failures, [])

    def test_site_check_rejects_known_dead_identifier(self) -> None:
        with mock.patch.object(
            cta,
            "http_get",
            return_value=(200, "...good-place...dead-cid...", "https://example/review"),
        ):
            failures = cta.check_live_review_page(sample_cfg())
        self.assertEqual(len(failures), 1)
        self.assertIn("known-dead listing cid dead-cid", failures[0])

    def test_missing_serpapi_key_is_an_explicit_optional_skip(self) -> None:
        output = io.StringIO()
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            contextlib.redirect_stdout(output),
        ):
            failures = cta.check_gbp_alive(sample_cfg())
        self.assertEqual(failures, [])
        self.assertIn("SERPAPI_KEY not set", output.getvalue())

    def test_serpapi_quota_error_is_not_reported_as_a_dead_listing(self) -> None:
        response = JsonResponse({"error": "Your account has run out of searches."})
        with (
            mock.patch.dict(os.environ, {"SERPAPI_KEY": "offline-test"}, clear=True),
            mock.patch.object(cta.urllib.request, "urlopen", return_value=response),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            failures = cta.check_gbp_alive(sample_cfg())
        rendered = " ".join(failures).lower()
        self.assertIn("serpapi error", rendered)
        self.assertIn("run out of searches", rendered)
        self.assertNotIn("listing dead", rendered)
        self.assertNotIn("listing missing", rendered)

    def test_serpapi_outage_uses_dataforseo_fallback(self) -> None:
        responses = [
            urllib.error.URLError("HTTP 429 quota/rate limit"),
            JsonResponse(dataforseo_gbp_payload()),
        ]
        output = io.StringIO()
        with (
            mock.patch.dict(
                os.environ,
                {
                    "SERPAPI_KEY": "offline-test",
                    "DATAFORSEO_LOGIN": "offline-login",
                    "DATAFORSEO_PASSWORD": "offline-password",
                },
                clear=True,
            ),
            mock.patch.object(cta.urllib.request, "urlopen", side_effect=responses),
            contextlib.redirect_stdout(output),
        ):
            failures = cta.check_gbp_alive(sample_cfg())
        self.assertEqual(failures, [])
        self.assertIn("trying DataForSEO fallback", output.getvalue())
        self.assertIn("via DataForSEO fallback", output.getvalue())

    def test_inconclusive_dataforseo_fallback_preserves_provider_failure(self) -> None:
        responses = [
            urllib.error.URLError("HTTP 429 quota/rate limit"),
            JsonResponse(dataforseo_gbp_payload(cid="different-cid")),
        ]
        with (
            mock.patch.dict(
                os.environ,
                {
                    "SERPAPI_KEY": "offline-test",
                    "DATAFORSEO_LOGIN": "offline-login",
                    "DATAFORSEO_PASSWORD": "offline-password",
                },
                clear=True,
            ),
            mock.patch.object(cta.urllib.request, "urlopen", side_effect=responses),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            failures = cta.check_gbp_alive(sample_cfg())
        rendered = " ".join(failures).lower()
        self.assertIn("serpapi request failed", rendered)
        self.assertIn("429 quota/rate limit", rendered)
        self.assertNotIn("listing dead", rendered)

    def test_main_fails_closed_when_any_hard_check_fails(self) -> None:
        output = io.StringIO()
        with (
            mock.patch.object(cta, "load_cfg", return_value=sample_cfg()),
            mock.patch.object(cta, "check_live_review_page", return_value=["review page returned 500"]),
            mock.patch.object(cta, "check_gbp_alive", return_value=[]),
            contextlib.redirect_stdout(output),
        ):
            code = cta.main()
        self.assertEqual(code, 1)
        self.assertIn("::error::CTA liveness", output.getvalue())


class GoogleReviewsRoutingTests(unittest.TestCase):
    def setUp(self) -> None:
        reviews._DFS_CACHE = None
        reviews._QUOTA_CACHE = None
        reviews._QUOTA_CHECKED = False

    def tearDown(self) -> None:
        reviews._DFS_CACHE = None
        reviews._QUOTA_CACHE = None
        reviews._QUOTA_CHECKED = False

    def test_healthy_serpapi_quota_uses_prepaid_provider(self) -> None:
        with (
            mock.patch.dict(
                os.environ,
                {
                    "SERPAPI_KEY": "offline-serp",
                    "DATAFORSEO_LOGIN": "offline-login",
                    "DATAFORSEO_PASSWORD": "offline-password",
                },
                clear=True,
            ),
            mock.patch.object(reviews, "serpapi_quota_left", return_value=reviews.SERPAPI_RESERVE_FLOOR),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            provider = reviews.choose_provider()
        self.assertEqual(provider, "serpapi")

    def test_low_serpapi_quota_routes_to_dataforseo(self) -> None:
        with (
            mock.patch.dict(
                os.environ,
                {
                    "SERPAPI_KEY": "offline-serp",
                    "DATAFORSEO_LOGIN": "offline-login",
                    "DATAFORSEO_PASSWORD": "offline-password",
                },
                clear=True,
            ),
            mock.patch.object(reviews, "serpapi_quota_left", return_value=reviews.SERPAPI_RESERVE_FLOOR - 1),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            provider = reviews.choose_provider()
        self.assertEqual(provider, "dataforseo")

    def test_unknown_quota_does_not_silently_reroute(self) -> None:
        with (
            mock.patch.dict(
                os.environ,
                {
                    "SERPAPI_KEY": "offline-serp",
                    "DATAFORSEO_LOGIN": "offline-login",
                    "DATAFORSEO_PASSWORD": "offline-password",
                },
                clear=True,
            ),
            mock.patch.object(reviews, "serpapi_quota_left", return_value=None),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            provider = reviews.choose_provider()
        self.assertEqual(provider, "serpapi")

    def test_no_serpapi_key_uses_dataforseo_when_available(self) -> None:
        with (
            mock.patch.dict(
                os.environ,
                {
                    "DATAFORSEO_LOGIN": "offline-login",
                    "DATAFORSEO_PASSWORD": "offline-password",
                },
                clear=True,
            ),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            provider = reviews.choose_provider()
        self.assertEqual(provider, "dataforseo")

    def test_serpapi_failure_fails_over_to_dataforseo(self) -> None:
        dfs = {
            "name": "Frame Restoration Utah",
            "count": 34,
            "rating": 5.0,
            "place_id": "good-place",
            "items": [],
        }
        with (
            mock.patch.dict(
                os.environ,
                {
                    "SERPAPI_KEY": "offline-serp",
                    "DATAFORSEO_LOGIN": "offline-login",
                    "DATAFORSEO_PASSWORD": "offline-password",
                },
                clear=True,
            ),
            mock.patch.object(reviews, "choose_provider", return_value="serpapi"),
            mock.patch.object(reviews, "_fetch_place_serpapi", side_effect=SystemExit("HTTP 429")),
            mock.patch.object(reviews, "_fetch_dataforseo", return_value=dfs) as dfs_fetch,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            place = reviews.fetch_place()
        self.assertEqual(place, {"name": "Frame Restoration Utah", "count": 34, "rating": 5.0, "place_id": "good-place"})
        dfs_fetch.assert_called_once_with()

    def test_dataforseo_failure_falls_back_to_serpapi(self) -> None:
        serp = {"name": "Frame Restoration Utah", "count": 34, "rating": 5.0, "place_id": "good-place"}
        with (
            mock.patch.object(reviews, "choose_provider", return_value="dataforseo"),
            mock.patch.object(reviews, "_fetch_dataforseo", return_value=None),
            mock.patch.object(reviews, "_fetch_place_serpapi", return_value=serp) as serp_fetch,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            place = reviews.fetch_place()
        self.assertEqual(place, serp)
        serp_fetch.assert_called_once_with()

    def test_both_provider_failures_raise_instead_of_publishing_false_zero(self) -> None:
        with (
            mock.patch.dict(
                os.environ,
                {
                    "SERPAPI_KEY": "offline-serp",
                    "DATAFORSEO_LOGIN": "offline-login",
                    "DATAFORSEO_PASSWORD": "offline-password",
                },
                clear=True,
            ),
            mock.patch.object(reviews, "choose_provider", return_value="serpapi"),
            mock.patch.object(reviews, "_fetch_place_serpapi", side_effect=SystemExit("HTTP 429")),
            mock.patch.object(reviews, "_fetch_dataforseo", return_value=None),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            with self.assertRaisesRegex(SystemExit, "refusing to publish a zero"):
                reviews.fetch_place()

    def test_dataforseo_result_without_aggregate_is_inconclusive(self) -> None:
        post = {"tasks": [{"id": "task-1"}]}
        get = {"tasks": [{"status_code": 20000, "result": [{"rating": {}, "items": []}]}]}
        with (
            mock.patch.object(reviews, "_dataforseo_request", side_effect=[post, get]),
            mock.patch.object(reviews.time, "sleep"),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            result = reviews._fetch_dataforseo()
        self.assertIsNone(result)
        self.assertIsNone(reviews._DFS_CACHE)


class GoogleReviewsMutationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "pages").mkdir()
        (self.root / "data").mkdir()
        self.index = self.root / "index.html"
        self.about = self.root / "pages" / "about.html"
        self.feed = self.root / "reviews.json"
        self.full = self.root / "data" / "reviews-full.json"
        self.audit = self.root / "data" / "google-reviews.json"
        self.index.write_text(
            '<div data-surface-marker="google-reviews-1">1 Google reviews and counting</div>\n'
            "★★★★★ 4.9 &nbsp;See All 1 Google Reviews\n",
            encoding="utf-8",
        )
        self.about.write_text(
            '<meta name="description" content="4.9-star rated">\n'
            '<div class="hero-stat"><div class="num">4.9&#9733;</div><div class="lbl">1 Google Reviews</div></div>\n',
            encoding="utf-8",
        )
        self.feed.write_text(
            json.dumps({
                "place_name": "Old",
                "aggregate": {"rating": 4.9, "review_count": 1},
                "reviews": [sample_review("Existing")],
            }),
            encoding="utf-8",
        )
        self.full.write_text('{"old":true}\n', encoding="utf-8")
        self.audit.write_text("[]\n", encoding="utf-8")

        self.constants = mock.patch.multiple(
            reviews,
            ROOT=self.root,
            TARGETS=[self.index, self.about],
            REVIEWS_JSON=self.feed,
            REVIEWS_FULL_JSON=self.full,
            AUDIT_LOG=self.audit,
        )
        self.constants.start()

    def test_multi_digit_review_counts_do_not_suffix_match(self) -> None:
        self.index.write_text(
            '<div data-surface-marker="google-reviews-34">34 Google reviews and counting</div>\n'
            "★★★★★ 5.0 &nbsp;See All 34 Google Reviews\n",
            encoding="utf-8",
        )
        self.about.write_text(
            '<div class="hero-stat"><div class="num">5.0&#9733;</div>'
            '<div class="lbl">34 Google Reviews</div></div>\n',
            encoding="utf-8",
        )

        self.assertFalse(reviews.update_file(self.index, 34, 5.0, dry_run=False))
        self.assertTrue(reviews.update_file(self.index, 35, 5.0, dry_run=False))
        self.assertTrue(reviews.update_file(self.about, 35, 5.0, dry_run=False))

        index_text = self.index.read_text(encoding="utf-8")
        self.assertIn("See All 35 Google Reviews", index_text)
        self.assertNotIn("See All 335 Google Reviews", index_text)
        self.assertIn("35 Google Reviews", self.about.read_text(encoding="utf-8"))

    def tearDown(self) -> None:
        self.constants.stop()
        self.temp.cleanup()

    def snapshot(self) -> dict[Path, bytes]:
        return {path: path.read_bytes() for path in (self.index, self.about, self.feed, self.full, self.audit)}

    @staticmethod
    def place(count: int = 2) -> dict:
        return {"name": "Frame Restoration Utah", "count": count, "rating": 5.0, "place_id": "good-place"}

    def test_aggregate_provider_failure_leaves_all_targets_unchanged(self) -> None:
        before = self.snapshot()
        with (
            mock.patch.object(reviews, "fetch_place", side_effect=SystemExit("both providers unavailable")),
            mock.patch.object(reviews, "fetch_reviews") as feed_fetch,
            mock.patch.object(reviews, "fetch_all_reviews") as full_fetch,
            mock.patch.object(reviews.sys, "argv", ["update-google-reviews.py"]),
        ):
            with self.assertRaisesRegex(SystemExit, "both providers unavailable"):
                reviews.main()
        feed_fetch.assert_not_called()
        full_fetch.assert_not_called()
        self.assertEqual(before, self.snapshot())

    def test_empty_secondary_feeds_preserve_existing_review_rows(self) -> None:
        existing_feed = json.loads(self.feed.read_text(encoding="utf-8"))["reviews"]
        existing_full = self.full.read_bytes()
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertTrue(reviews.write_reviews_json(self.place(), []))
            self.assertFalse(reviews.write_reviews_full_json([], self.place()))
        refreshed = json.loads(self.feed.read_text(encoding="utf-8"))
        self.assertEqual(refreshed["reviews"], existing_feed)
        self.assertEqual(refreshed["aggregate"]["review_count"], 2)
        self.assertEqual(self.full.read_bytes(), existing_full)

    def test_dry_run_is_mutation_free(self) -> None:
        before = self.snapshot()
        with (
            mock.patch.object(reviews, "fetch_place", return_value=self.place()),
            mock.patch.object(reviews, "fetch_reviews", return_value=[sample_review()]),
            mock.patch.object(reviews, "fetch_all_reviews", return_value=[sample_full_review()]),
            mock.patch.object(reviews.sys, "argv", ["update-google-reviews.py", "--dry-run"]),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            code = reviews.main()
        self.assertEqual(code, 0)
        self.assertEqual(before, self.snapshot())

    def test_complete_snapshot_updates_all_outputs_after_fetches_succeed(self) -> None:
        fresh = [sample_review("Ada"), sample_review("Grace")]
        full = [sample_full_review("Ada"), sample_full_review("Grace")]
        with (
            mock.patch.object(reviews, "fetch_place", return_value=self.place(count=2)),
            mock.patch.object(reviews, "fetch_reviews", return_value=fresh),
            mock.patch.object(reviews, "fetch_all_reviews", return_value=full),
            mock.patch.object(reviews.sys, "argv", ["update-google-reviews.py"]),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            code = reviews.main()
        self.assertEqual(code, 0)
        self.assertIn('data-surface-marker="google-reviews-2"', self.index.read_text(encoding="utf-8"))
        self.assertIn("See All 2 Google Reviews", self.index.read_text(encoding="utf-8"))
        self.assertIn("5.0&#9733;", self.about.read_text(encoding="utf-8"))
        self.assertIn("5.0-star rated", self.about.read_text(encoding="utf-8"))
        self.assertIn("2 Google Reviews", self.about.read_text(encoding="utf-8"))
        self.assertEqual(json.loads(self.feed.read_text(encoding="utf-8"))["aggregate"]["review_count"], 2)
        self.assertEqual(json.loads(self.full.read_text(encoding="utf-8"))["reviews_fetched"], 2)
        audit = json.loads(self.audit.read_text(encoding="utf-8"))
        self.assertTrue(audit[-1]["changed"])
        self.assertEqual(audit[-1]["previous_count"], 1)


class WorkflowContractTests(unittest.TestCase):
    def test_blog_quarantine_pushes_only_the_candidate_ref(self) -> None:
        sha = "a" * 40
        calls: list[tuple[str, ...]] = []

        def fake_git(*args: str):
            calls.append(args)
            stdout = ""
            if args[0] == "rev-parse":
                stdout = f"{sha}\n"
            elif args[0] == "ls-remote":
                stdout = f"{sha}\trefs/heads/blog-candidate-test\n"
            return mock.Mock(returncode=0, stdout=stdout, stderr="")

        with tempfile.TemporaryDirectory(dir=REPO) as tmp:
            tmp_path = Path(tmp)
            manifest_path = tmp_path / "draft.json"
            manifest = {"slug": "fenced-draft", "status": "drafted"}
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            state = blog_publisher.TreeState()
            state.remember(manifest_path)

            with (
                mock.patch.object(blog_publisher, "git", side_effect=fake_git),
                mock.patch.object(blog_publisher, "RUN_LOG", tmp_path / "run-log.jsonl"),
                contextlib.redirect_stderr(io.StringIO()),
                self.assertRaises(SystemExit) as raised,
            ):
                blog_publisher.fail_closed(
                    state,
                    manifest_path,
                    manifest,
                    "test fence",
                    True,
                    "blog-candidate-test",
                )

            self.assertEqual(raised.exception.code, blog_publisher.QUARANTINE_EXIT_CODE)
            self.assertEqual(json.loads(manifest_path.read_text())["status"], "needs-review")
            self.assertIn(
                ("push", "origin", "HEAD:refs/heads/blog-candidate-test"),
                calls,
            )
            self.assertNotIn(("push", "origin", "HEAD:main"), calls)

    def test_cta_workflow_runs_combined_check_with_both_provider_credentials(self) -> None:
        workflow = (REPO / ".github/workflows/cta-liveness.yml").read_text(encoding="utf-8")
        self.assertIn("SERPAPI_KEY: ${{ secrets.SERPAPI_KEY }}", workflow)
        self.assertIn("DATAFORSEO_LOGIN: ${{ secrets.DATAFORSEO_LOGIN }}", workflow)
        self.assertIn("DATAFORSEO_PASSWORD: ${{ secrets.DATAFORSEO_PASSWORD }}", workflow)
        self.assertIn("run: python3 scripts/check-cta-liveness.py", workflow)
        self.assertNotIn("continue-on-error", workflow)
        self.assertNotIn("check-cta-liveness.py ||", workflow)

    def test_review_sync_propagates_scraper_and_validation_failures(self) -> None:
        workflow = (REPO / ".github/workflows/google-reviews-sync.yml").read_text(encoding="utf-8")
        self.assertIn("python3 scripts/update-google-reviews.py", workflow)
        self.assertIn('elif [ "$code" -ne 0 ]', workflow)
        self.assertIn('exit "$code"', workflow)
        self.assertIn("node scripts/audit-jsonld.mjs", workflow)
        self.assertIn("node scripts/audit-compliance-words.mjs --quiet", workflow)
        self.assertIn("node scripts/audit-review-integrity.mjs --strict", workflow)
        self.assertNotIn("continue-on-error", workflow)
        self.assertNotIn("update-google-reviews.py || true", workflow)

    def test_blog_workflows_fail_closed_on_publish_or_push_failure(self) -> None:
        autopost = (REPO / ".github/workflows/blog-autopost.yml").read_text(encoding="utf-8")
        traction = (REPO / ".github/workflows/blog-traction.yml").read_text(encoding="utf-8")
        compliance = (REPO / ".github/workflows/compliance-gate.yml").read_text(encoding="utf-8")
        publisher = (REPO / "scripts/blog-publish.py").read_text(encoding="utf-8")
        self.assertIn('python3 scripts/blog-publish.py --push --push-ref "$CANDIDATE_BRANCH"', autopost)
        self.assertNotIn("blog-publish.py --push ||", autopost)
        self.assertIn("actions: write", autopost)
        self.assertIn("gh workflow run compliance-gate.yml", autopost)
        self.assertIn("select(.headSha ==", autopost)
        self.assertIn('gh run watch "$RUN_ID"', autopost)
        self.assertIn('git push origin "$CANDIDATE_SHA:refs/heads/main"', autopost)
        self.assertNotIn("python3 scripts/blog-publish.py --push\n", autopost)
        self.assertIn('if [ "$PUBLISH_EXIT" -eq 3 ]', autopost)
        self.assertIn("direct-to-main publishing is forbidden", publisher)
        self.assertNotIn('git("push", "origin", "HEAD:main")', publisher)
        promote_step = autopost.split("- name: Promote the exact green candidate to main", 1)[1].split(
            "- name: Report candidate outcome", 1
        )[0]
        self.assertIn('git push origin "$CANDIDATE_SHA:refs/heads/main"', promote_step)
        report_step = autopost.split("- name: Report candidate outcome", 1)[1].split(
            "- name: Dry-run", 1
        )[0]
        self.assertNotIn("git push origin", report_step)
        self.assertLess(
            autopost.index('gh run watch "$RUN_ID"'),
            autopost.index('git push origin "$CANDIDATE_SHA:refs/heads/main"'),
        )
        self.assertIn("workflow_dispatch:", compliance)
        self.assertIn('(\"public-seo-and-mobile\", [\"npm\", \"run\", \"audit:public-seo\"])', publisher)
        self.assertIn('(\"links\", [\"node\", \"scripts/audit-links.mjs\", \"--strict\"])', publisher)
        self.assertIn("github.event.workflow_run.conclusion == 'success'", traction)
        self.assertIn('echo "push failed after retries"; exit 1', traction)
        self.assertNotIn("continue-on-error", autopost)
        self.assertNotIn("continue-on-error", traction)

    def test_split_url_validator_warns_instead_of_killing_refresh(self) -> None:
        validator = (REPO / "scripts/validate-slv-gsc-split-url-diagnosis.mjs").read_text(
            encoding="utf-8"
        )
        self.assertIn("splitUrlDiagnosisFreshness", validator)
        self.assertIn("SPLIT_URL_DIAGNOSIS_STALE_WARNING", validator)
        self.assertNotIn(
            "assert.equal(attribution.sources.gscSnapshot.sha256, snapshotSource.sha256",
            validator,
        )
        sync = (REPO / "scripts/sync-slv-intervention-queue.mjs").read_text(encoding="utf-8")
        self.assertIn("gscStateWithStaleSplitUrlFallback", sync)


if __name__ == "__main__":
    unittest.main()
