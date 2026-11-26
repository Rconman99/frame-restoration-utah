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
import re
import subprocess
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
blog_drafter = load_script("utah_blog_drafter", "scripts/blog-draft-openrouter.py")
blog_renderer = load_script("utah_blog_renderer", "scripts/generate-blog-post.py")


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

    def test_review_sync_reuses_only_an_open_draft_pr(self) -> None:
        workflow = (REPO / ".github/workflows/google-reviews-sync.yml").read_text(encoding="utf-8")
        self.assertRegex(
            workflow,
            r'gh pr list \\\s+--head "\$BRANCH" \\\s+--base main \\\s+--state open',
        )
        self.assertIn('if [ -n "$OPEN_PR_NUMBER" ]; then', workflow)
        self.assertIn('gh pr edit "$OPEN_PR_NUMBER"', workflow)
        self.assertRegex(workflow, r"gh pr create \\\s+--draft")
        self.assertNotIn('gh pr view "$BRANCH"', workflow)
        self.assertNotIn("1st & 15th", workflow)

    def test_blog_workflow_is_gated_approval_pr_only(self) -> None:
        # Since 2026-11-18 (Ryan's approval) the Utah lane stages each gated
        # draft on a claude/blog-approval-* branch and opens an "Approve to
        # publish" PR. It must still never push main, never deploy, and keep
        # quarantining drafts that fail the gates.
        autopost = (REPO / ".github/workflows/blog-autopost.yml").read_text(encoding="utf-8")
        traction = (REPO / ".github/workflows/blog-traction.yml").read_text(encoding="utf-8")
        publisher = (REPO / "scripts/blog-publish.py").read_text(encoding="utf-8")
        self.assertIn("contents: write", autopost)
        self.assertIn("pull-requests: write", autopost)
        self.assertNotIn("actions: write", autopost)
        self.assertIn("APPROVAL_BRANCH: claude/blog-approval-${{ github.run_id }}", autopost)
        self.assertIn('python3 scripts/blog-publish.py --manifest "$DRAFT_PATH"', autopost)
        self.assertEqual(autopost.count("--push "), 1)
        self.assertIn('--push --push-ref "$APPROVAL_BRANCH"', autopost)
        self.assertIn('--base main --head "$APPROVAL_BRANCH"', autopost)
        self.assertIn("if: steps.gate.outcome == 'success'", autopost)
        self.assertIn('manifest["status"] = "needs-review"', autopost)
        self.assertIn("actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9", autopost)
        self.assertIn("always() && steps.target.outputs.count != '0'", autopost)
        self.assertIn("steps.draft.outcome == 'success'", autopost)
        self.assertIn('GATE_OUTCOME: ${{ steps.gate.outcome }}', autopost)
        self.assertIn("steps.quarantine.outcome == 'success'", autopost)
        self.assertIn("node scripts/close-to-page-one.mjs --print-queue", autopost)
        self.assertIn('tee "$GATE_LOG"', autopost)
        self.assertNotIn("git push", autopost)
        self.assertNotIn("HEAD:main", autopost)
        self.assertNotIn("--push-ref main", autopost)
        self.assertNotIn("gh pr merge", autopost)
        self.assertNotIn("gh workflow run", autopost)
        self.assertNotIn("FRAME_TX_VERCEL_DEPLOY_HOOK_URL", autopost)
        self.assertNotIn("vercel deploy", autopost.lower())
        self.assertNotIn("continue-on-error", autopost)
        self.assertIn("direct-to-main publishing is forbidden", publisher)
        self.assertNotIn('git("push", "origin", "HEAD:main")', publisher)
        self.assertIn('(\"public-seo-and-mobile\", [\"npm\", \"run\", \"audit:public-seo\"])', publisher)
        self.assertIn('(\"links\", [\"node\", \"scripts/audit-links.mjs\", \"--strict\"])', publisher)
        self.assertIn("check-published-sitemap.mjs", publisher)
        self.assertIn("SITEMAP MISSING PUBLISHED PAGE", publisher)
        self.assertNotIn("workflow_run:", traction)
        self.assertNotIn("Blog auto-post (Utah)", traction)
        self.assertIn("workflow_dispatch:", traction)
        self.assertIn("schedule:", traction)
        self.assertIn('echo "push failed after retries"; exit 1', traction)
        self.assertNotIn("continue-on-error", traction)

    def test_blog_draft_uses_claude_plan_without_metered_keys(self) -> None:
        autopost = (REPO / ".github/workflows/blog-autopost.yml").read_text(encoding="utf-8")
        drafter = (REPO / "scripts/blog-draft-openrouter.py").read_text(encoding="utf-8")
        self.assertIn("secrets.CLAUDE_CODE_OAUTH_TOKEN", autopost)
        self.assertIn("--provider claude-plan", autopost)
        self.assertIn("--model claude-sonnet-5-5", autopost)
        self.assertNotIn("secrets.OPENROUTER_API_KEY", autopost)
        self.assertNotIn("secrets.ANTHROPIC_API_KEY", autopost)
        self.assertIn('"ANTHROPIC_API_KEY"', drafter)  # stripped from the CLI env
        self.assertIn('DEFAULT_PROVIDER = os.getenv("FRAME_BLOG_PROVIDER", "claude-plan")', drafter)

    def test_close_to_page_one_is_a_draft_review_and_skips_without_gsc(self) -> None:
        workflow = (REPO / ".github/workflows/close-to-page-one.yml").read_text(encoding="utf-8")
        self.assertIn("cron: '47 14 * * 1'", workflow)
        self.assertIn("secrets.GSC_SERVICE_ACCOUNT_JSON", workflow)
        self.assertIn("vars.GSC_SITE_URL", workflow)
        self.assertIn("secrets.CLAUDE_CODE_OAUTH_TOKEN", workflow)
        self.assertIn("node scripts/check-published-sitemap.mjs", workflow)
        self.assertIn("node scripts/close-to-page-one.mjs", workflow)
        self.assertIn("--skip-if-unconfigured", workflow)
        self.assertIn('BRANCH="cursor/close-to-page-one-weekly"', workflow)
        self.assertRegex(workflow, r"gh pr create \\\s+--draft")
        self.assertIn("github.event_name != 'pull_request'", workflow)
        self.assertNotIn("openrouter", workflow.lower())
        self.assertNotIn("secrets.OPENROUTER_API_KEY", workflow)
        self.assertNotIn("secrets.ANTHROPIC_API_KEY", workflow)
        self.assertNotIn("git push origin HEAD:main", workflow)
        self.assertNotIn("continue-on-error", workflow)

    def test_lead_notification_recovery_schedule_restored(self) -> None:
        workflow = (REPO / ".github/workflows/lead-notification-worker.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("workflow_dispatch:", workflow)
        self.assertRegex(workflow, r"(?m)^  schedule:\n(?:\s*#.*\n)*\s+- cron: '[^']+'")
        self.assertIn("cron.unschedule('lead-notification-worker')", workflow)
        self.assertRegex(workflow, r"dry_run:[\s\S]*default: true")
        self.assertIn("x-frame-worker-mode: recover", workflow)
        self.assertIn("x-frame-worker-mode: health-only", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertNotIn('cat "$RESPONSE_FILE"', workflow)

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


def _highland_insurance_manifest(title: str) -> dict:
    """Shape of the 11-04/11-12 Highland insurance drafts that passed the old
    pre-scan at 3 but failed the fence at 5 (title rendered 3x)."""
    para = ("Frame Restoration Utah documents the observed roof conditions and prepares a "
            "written scope your carrier can review. Call 435-292-8802. ")
    sections = []
    for i in range(8):
        sections.append({"type": "h2", "text": f"Highland Roof Step {i + 1}"})
        sections.append({"type": "p", "text": para * 3})
    sections[1]["text"] = "A Highland insurance claim starts with you filing. " + para
    sections[3]["text"] = "Read about {{link:/pages/insurance-claims|insurance claim documentation}}. " + para
    return {
        "title": title,
        "slug": "highland-utah-roof-claim-documentation-guide",
        "excerpt": "Highland roof documentation guide. Call 435-292-8802.",
        "category": "Storm Response",
        "tldr": "Document storm damage first. Call 435-292-8802.",
        "sections": sections,
        "faqs": [{"q": f"Question {i}?", "a": "You file with your insurer."} for i in range(5)],
        "howto": {"name": "Document roof damage", "total_time": "PT48H",
                  "steps": [{"name": f"Step {i}", "text": "Photograph the roof."} for i in range(5)]},
        "sources": [{"label": "NWS", "url": "https://www.weather.gov/slc/"}],
        "image_alt": "Illustration of a Highland home",
        "image_caption": "Illustration — not a photograph of a Frame Restoration Utah project",
        "city_slug": "highland",
        "style": "storm",
        "keyword": "Highland roof insurance claim",
    }


class BlogDraftFenceParityTests(unittest.TestCase):
    """2026-11-17 Highland keyword-counter fix: drafter pre-scan == publish fence."""

    TITLE_WITH_BIGRAM = "Highland Roof Insurance Claim Guide 2026: Storm Damage Documentation"

    def rendered_fence_count(self, manifest: dict) -> int:
        html = blog_renderer.render_html(manifest, None, "/images/blog/x.webp")
        return blog_publisher.visible_text(html).lower().count(blog_publisher.INSURANCE_BIGRAM)

    def test_old_field_count_understates_the_rendered_fence(self) -> None:
        manifest = _highland_insurance_manifest(self.TITLE_WITH_BIGRAM)
        field_count = blog_drafter.visible_blob(manifest).lower().count("insurance claim")
        self.assertEqual(field_count, 3)  # the old pre-scan said "3 (cap 3)": looked fine
        self.assertEqual(self.rendered_fence_count(manifest), 5)  # the fence saw 5 > 4

    def test_prescan_matches_publish_fence_exactly(self) -> None:
        manifest = _highland_insurance_manifest(self.TITLE_WITH_BIGRAM)
        scan = blog_drafter.fence_prescan(manifest)
        self.assertEqual(scan["count"], self.rendered_fence_count(manifest))
        self.assertEqual(scan["cap"], blog_publisher.INSURANCE_MAX_STORM)
        self.assertTrue(any("5x" in r for r in scan["reasons"]), scan["reasons"])

    def test_prescan_clean_when_bigram_kept_out_of_title(self) -> None:
        manifest = _highland_insurance_manifest("Highland Roof Claim Guide 2026: Storm Documentation")
        scan = blog_drafter.fence_prescan(manifest)
        self.assertEqual(scan["count"], 2)
        self.assertEqual(scan["reasons"], [])

    def test_fence_limits_are_unchanged(self) -> None:
        self.assertEqual(blog_publisher.INSURANCE_MAX, 3)
        self.assertEqual(blog_publisher.INSURANCE_MAX_STORM, 4)

    def test_drafter_redrafts_when_prescan_would_fail_closed(self) -> None:
        bad = _highland_insurance_manifest(self.TITLE_WITH_BIGRAM)
        good = _highland_insurance_manifest("Highland Roof Claim Guide 2026: Storm Documentation")
        replies = [json.dumps(bad), json.dumps(good)]
        prompts = []

        def fake_call(model, user, env):
            prompts.append(user)
            return replies.pop(0)

        brief = {"city_slug": "highland", "city_name": "Highland", "service_slug": "storm-damage",
                 "service_name": "Storm Damage", "style": "storm",
                 "keyword": "Highland roof insurance claim", "facts": [], "internal_links": []}
        with tempfile.TemporaryDirectory() as tmp:
            brief_path = Path(tmp) / "brief.json"
            out_path = Path(tmp) / "draft.json"
            brief_path.write_text(json.dumps(brief), encoding="utf-8")
            argv = ["blog-draft-openrouter.py", "--brief", str(brief_path), "--out", str(out_path),
                    "--provider", "claude-plan", "--model", "claude-sonnet-5-5", "--status", "drafted"]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(blog_drafter, "claude_plan_env", return_value={}),
                mock.patch.object(blog_drafter, "call_claude_plan", side_effect=fake_call),
                contextlib.redirect_stderr(io.StringIO()) as err,
                contextlib.redirect_stdout(io.StringIO()),
            ):
                blog_drafter.main()
            written = json.loads(out_path.read_text(encoding="utf-8"))
        self.assertEqual(len(prompts), 2)
        self.assertIn("REJECTED by the legal compliance fence", prompts[1])
        self.assertNotIn("insurance claim", written["title"].lower())
        self.assertIn("fence clean", err.getvalue())



class BlogDraftClaudeFailureLogTests(unittest.TestCase):
    """Masked CLI failure logs for the Utah blog drafter (empty-stderr fix)."""

    FAKE_OAUTH = "oauth-plan-token-TESTONLY-do-not-use-0001"
    FAKE_ANTHROPIC = "anthropic-key-TESTONLY-do-not-use-0002"

    def test_mask_secrets_redacts_env_values(self) -> None:
        env = {
            "CLAUDE_CODE_OAUTH_TOKEN": self.FAKE_OAUTH,
            "ANTHROPIC_API_KEY": self.FAKE_ANTHROPIC,
        }
        text = f"token={self.FAKE_OAUTH} key={self.FAKE_ANTHROPIC} ok"
        masked = blog_drafter.mask_secrets(text, env)
        self.assertNotIn(self.FAKE_OAUTH, masked)
        self.assertNotIn(self.FAKE_ANTHROPIC, masked)
        self.assertIn("[REDACTED]", masked)
        self.assertIn("ok", masked)

    def test_mask_secrets_redacts_token_like_strings(self) -> None:
        jwt = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ."
            "signaturepartgoeshereok"
        )
        b64 = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlq+" + "A" * 8 + "=="
        text = (
            "sk-ant-api03-abcdefghijklmnopqrstuvwxyz "
            "Bearer abcdefghijklmnopqrstuvwxyz012345 "
            f"{jwt} {b64} leftover"
        )
        masked = blog_drafter.mask_secrets(text, {})
        self.assertNotIn("sk-ant-api03-abcdefghijklmnopqrstuvwxyz", masked)
        self.assertNotIn("abcdefghijklmnopqrstuvwxyz012345", masked)
        self.assertNotIn(jwt, masked)
        self.assertNotIn(b64, masked)
        self.assertIn("sk-ant-[REDACTED]", masked)
        self.assertIn("Bearer [REDACTED]", masked)
        self.assertIn("[JWT-REDACTED]", masked)
        self.assertIn("[B64-REDACTED]", masked)
        self.assertIn("leftover", masked)

    def test_tail_text_keeps_last_4kb(self) -> None:
        body = ("HEAD" + ("x" * 5000) + "TAIL")
        tailed = blog_drafter.tail_text(body, 4096)
        self.assertTrue(tailed.endswith("TAIL"))
        self.assertNotIn("HEAD", tailed)
        self.assertLessEqual(len(tailed.encode("utf-8")), 4096)

    def test_token_sanity_reports_presence_not_value(self) -> None:
        env = {"CLAUDE_CODE_OAUTH_TOKEN": self.FAKE_OAUTH}
        report = blog_drafter.token_sanity_report(env)
        self.assertIn("present: yes", report)
        self.assertIn("length>0: yes", report)
        self.assertNotIn(self.FAKE_OAUTH, report)
        empty = blog_drafter.token_sanity_report({})
        self.assertIn("present: no", empty)
        self.assertIn("length>0: no", empty)

    def test_format_and_summary_include_stdout_when_stderr_empty(self) -> None:
        proc = subprocess.CompletedProcess(
            args=["claude"],
            returncode=1,
            stdout=f"model error; token {self.FAKE_OAUTH}",
            stderr="",
        )
        env = {"CLAUDE_CODE_OAUTH_TOKEN": self.FAKE_OAUTH}
        dumped = blog_drafter.format_claude_cli_failure(proc, env)
        self.assertIn("exit_code=1", dumped)
        self.assertIn("signal=none", dumped)
        self.assertIn("model error", dumped)
        self.assertIn("(empty)", dumped)
        self.assertNotIn(self.FAKE_OAUTH, dumped)
        summary = blog_drafter.claude_cli_error_summary(proc, env)
        self.assertIn("claude CLI exit 1, signal none", summary)
        self.assertIn("stderr=(empty)", summary)
        self.assertIn("stdout=model error", summary)
        self.assertNotIn(self.FAKE_OAUTH, summary)

    def test_format_reports_signal_for_negative_returncode(self) -> None:
        proc = subprocess.CompletedProcess(
            args=["claude"], returncode=-15, stdout="", stderr="killed"
        )
        dumped = blog_drafter.format_claude_cli_failure(proc, {})
        self.assertIn("exit_code=-15", dumped)
        self.assertIn("SIGTERM (15)", dumped)
        self.assertIn("killed", dumped)

    def test_call_claude_plan_logs_masked_streams_on_failure(self) -> None:
        proc = subprocess.CompletedProcess(
            args=["claude"],
            returncode=1,
            stdout=f"CLI wrote the error here {self.FAKE_OAUTH}",
            stderr="",
        )
        env = {"CLAUDE_CODE_OAUTH_TOKEN": self.FAKE_OAUTH}
        with (
            mock.patch.object(blog_drafter.subprocess, "run", return_value=proc),
            contextlib.redirect_stderr(io.StringIO()) as err,
        ):
            with self.assertRaises(RuntimeError) as raised:
                blog_drafter.call_claude_plan("claude-sonnet-5-5", "hello", env)
        logged = err.getvalue()
        message = str(raised.exception)
        self.assertIn("exit_code=1", logged)
        self.assertIn("CLI wrote the error here", logged)
        self.assertIn("stderr=(empty)", message)
        self.assertIn("CLI wrote the error here", message)
        self.assertNotIn(self.FAKE_OAUTH, logged)
        self.assertNotIn(self.FAKE_OAUTH, message)

    def test_retry_default_stays_three_attempts(self) -> None:
        source = (REPO / "scripts/blog-draft-openrouter.py").read_text(encoding="utf-8")
        self.assertIn('ap.add_argument("--retries", type=int, default=3)', source)
        self.assertIn("for attempt in range(1, args.retries + 1):", source)



if __name__ == "__main__":
    unittest.main()
