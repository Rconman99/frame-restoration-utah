#!/usr/bin/env python3
"""Queue approval rules for close-to-page-one tasks."""

from __future__ import annotations

import importlib.util
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def load_draft():
    spec = importlib.util.spec_from_file_location(
        "close_to_page_one_draft",
        ROOT / "scripts" / "close-to-page-one-draft.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_prioritizer():
    spec = importlib.util.spec_from_file_location(
        "blog_target_prioritizer",
        ROOT / "scripts" / "blog-target-prioritizer.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CloseToPageOneQueueTests(unittest.TestCase):
    def test_page_refresh_is_not_promoted_and_blocked_topics_stay_out(self) -> None:
        prioritizer = load_prioritizer()
        queue = {
            "artifact": "frame-utah-close-to-page-one",
            "tasks": [{
                "kind": "page-refresh",
                "status": "approved",
                "draftable": True,
                "keyword": "roof repair heber city ut",
                "query": "roof repair heber city ut",
            }],
            "candidateTopics": [
                {
                    "kind": "candidate-topic",
                    "status": "approved",
                    "draftable": True,
                    "newTopicBlocked": True,
                    "rankingPages": [{"page": "https://www.framerestorationutah.com/locations/heber-city"}],
                    "keyword": "roof repair heber city ut",
                    "query": "roof repair heber city ut",
                    "city_slug": "heber-city",
                },
                {
                    "kind": "candidate-topic",
                    "status": "needs-review",
                    "draftable": True,
                    "newTopicBlocked": False,
                    "rankingPages": [],
                    "keyword": "utah roof ventilation",
                    "query": "utah roof ventilation",
                    "city_slug": "utah",
                },
                {
                    "kind": "candidate-topic",
                    "status": "approved",
                    "draftable": True,
                    "newTopicBlocked": False,
                    "rankingPages": [],
                    "keyword": "asphalt versus metal roof utah",
                    "query": "asphalt versus metal roof utah",
                    "city_slug": "utah",
                    "city_name": "Utah",
                },
            ],
        }
        promoted = prioritizer.promotable_topic_targets(queue)
        self.assertEqual([row["keyword"] for row in promoted], ["asphalt versus metal roof utah"])
        self.assertEqual(promoted[0]["source"], "close-to-page-one")
        self.assertFalse(promoted[0]["autoPublish"])
        self.assertIn("not a volume estimate", promoted[0]["score_basis"])

    def test_missing_queue_is_not_measured(self) -> None:
        prioritizer = load_prioritizer()
        with tempfile.TemporaryDirectory() as tmp:
            missing = pathlib.Path(tmp) / "missing.json"
            self.assertIsNone(prioritizer.load_close_to_page_one_queue(missing))

    def test_claude_notes_cannot_change_measured_metrics(self) -> None:
        draft = load_draft()
        queue = {
            "tasks": [{
                "page": "https://www.framerestorationutah.com/locations/heber-city",
                "queries": [{"query": "roof repair heber city ut", "clicks": 0, "impressions": 1972, "position": 6.4}],
                "status": "needs-review",
            }],
            "candidateTopics": [],
        }
        updated = draft.apply_narrative(queue, {
            "pages": [{
                "page": queue["tasks"][0]["page"],
                "changes": [{
                    "heading": "roof repair heber city ut",
                    "instruction": "Add a section that answers roof repair in Heber City in the first paragraph.",
                }, {
                    "heading": "invented query",
                    "instruction": "Do not keep this.",
                }],
            }]
        })
        self.assertTrue(draft.metrics_unchanged(queue, updated))
        self.assertEqual(updated["tasks"][0]["queries"][0]["impressions"], 1972)
        self.assertEqual(len(updated["tasks"][0]["claudePlanChanges"]), 1)
        self.assertFalse(updated["tasks"][0]["draftable"])
        self.assertFalse(updated["autoPublish"])
        prompt = draft.build_prompt(queue)
        self.assertIn("1972", prompt)
        self.assertIn("Do not invent a metric", prompt)
        source = (ROOT / "scripts" / "close-to-page-one-draft.py").read_text(encoding="utf-8")
        self.assertNotIn("openrouter.ai", source)
        self.assertIn("CLAUDE_CODE_OAUTH_TOKEN", source)


if __name__ == "__main__":
    unittest.main()
