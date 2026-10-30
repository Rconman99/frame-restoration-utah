#!/usr/bin/env python3
"""Offline contract tests for scripts/classify-lead-spam.py.

No model, no network, no market project: the Ollama call and the Supabase
transport are replaced, so this runs in CI. The prompt eval
(scripts/classify-lead-spam.eval.py) needs a local model and stays a local run.
"""
import importlib.util
import os
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
UTAH = "https://hdcflshhomzildwqlmwh.supabase.co"


def load_classifier():
    # Thresholds, market wording and endpoints are read from the environment at
    # import time, so import with those variables removed to test the defaults.
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("FRAME_", "SUPABASE_", "OLLAMA_"))}
    with mock.patch.dict(os.environ, env, clear=True):
        spec = importlib.util.spec_from_file_location(
            "classify_lead_spam", REPO / "scripts/classify-lead-spam.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module


classifier = load_classifier()
CALL_LEAD = {"id": 1, "message": "", "tier_classifier": "auto-inbound-call-screened"}


class CallTalkTimeTests(unittest.TestCase):
    def test_talk_time_alone_never_labels_spam(self):
        for seconds in range(0, 601):
            label, _, _ = classifier.classify(CALL_LEAD, seconds)
            self.assertNotEqual(label, "spam", f"{seconds}s call labelled spam")

    def test_short_screened_call_is_uncertain(self):
        for seconds in (1, 5, 15, 16, 44):
            with self.subTest(seconds=seconds):
                label, score, _ = classifier.classify(CALL_LEAD, seconds)
                self.assertEqual((label, score), ("uncertain", 0.5))

    def test_call_at_the_real_threshold_is_real(self):
        label, score, _ = classifier.classify(CALL_LEAD, classifier.CALL_REAL_MIN_SEC)
        self.assertEqual((classifier.CALL_REAL_MIN_SEC, label, score), (45, "real", 0.15))

    def test_call_without_talk_time_is_uncertain(self):
        self.assertEqual(classifier.classify(CALL_LEAD, None)[0], "uncertain")

    def test_call_lead_never_reaches_the_model(self):
        with mock.patch.object(classifier, "ask_model",
                               side_effect=AssertionError("model called")):
            classifier.classify({**CALL_LEAD, "message": "   "}, 7)

    def test_message_lead_is_labelled_by_the_model_not_talk_time(self):
        with mock.patch.object(classifier, "ask_model",
                               return_value=("real", 0.1, "own roof")) as ask:
            got = classifier.classify({**CALL_LEAD, "message": "my roof leaks"}, 3)
        self.assertEqual(got, ("real", 0.1, "own roof"))
        ask.assert_called_once()


class UtahProjectGuardTests(unittest.TestCase):
    def test_utah_project_is_accepted(self):
        classifier.require_utah_project(UTAH)
        classifier.require_utah_project("https://HDCFLSHHOMZILDWQLMWH.supabase.co")

    def test_other_projects_and_look_alikes_are_refused(self):
        for url in (
            "https://abcdefghijklmnopqrst.supabase.co",
            "https://hdcflshhomzildwqlmwh.supabase.co.example.com",
            "https://xhdcflshhomzildwqlmwh.supabase.co",
            "https://example.com/hdcflshhomzildwqlmwh.supabase.co",
            "http://hdcflshhomzildwqlmwh.supabase.co",
            "hdcflshhomzildwqlmwh.supabase.co",
            "http://127.0.0.1:54321",
            "",
        ):
            with self.subTest(url=url), self.assertRaises(SystemExit):
                classifier.require_utah_project(url)

    def test_other_project_is_refused_before_any_request(self):
        with mock.patch.object(classifier, "SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co"), \
                mock.patch.object(classifier, "SERVICE_KEY", "test-only-placeholder"), \
                mock.patch.object(classifier, "_req",
                                  side_effect=AssertionError("request sent")):
            for call in (lambda: classifier.sb("leads?select=id&limit=1"),
                         lambda: classifier.fetch_leads(5, False),
                         classifier.print_stats):
                with self.assertRaises(SystemExit):
                    call()

    def test_utah_request_reaches_the_transport(self):
        with mock.patch.object(classifier, "SUPABASE_URL", UTAH), \
                mock.patch.object(classifier, "SERVICE_KEY", "test-only-placeholder"), \
                mock.patch.object(classifier, "_req", return_value=[]) as req:
            classifier.sb("leads?select=id&limit=1")
        self.assertEqual(req.call_args.args[0], f"{UTAH}/rest/v1/leads?select=id&limit=1")


class MarketWordingTests(unittest.TestCase):
    def test_default_prompt_names_the_utah_business(self):
        self.assertTrue(classifier.SYSTEM_PROMPT.startswith(
            "You classify inbound messages to a Utah residential ROOFING "
            "contractor (Frame Roofing Utah, Salt Lake Valley)."))
        self.assertNotIn("__MARKET__", classifier.SYSTEM_PROMPT)


if __name__ == "__main__":
    unittest.main()
