#!/usr/bin/env python3
"""Offline contract tests for scripts/classify-lead-spam.py.

No model, no network, no market project: the Ollama call and the Supabase
transport are replaced, so this runs in CI. The prompt eval
(scripts/classify-lead-spam.eval.py) needs a local model and stays a local run.
"""
import importlib.util
import io
import os
import unittest
import urllib.error
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


def model_says(content):
    """Patch the transport so /api/chat returns this raw message content."""
    return mock.patch.object(
        classifier, "_req", return_value={"message": {"content": content}})


class ModelOutputTests(unittest.TestCase):
    def test_non_object_json_is_skipped_not_crashed(self):
        # format=json guarantees valid JSON, not a JSON object. Any of these
        # used to raise AttributeError and kill the whole batch run.
        for content in ('["spam"]', 'null', '"spam"', '3', 'true', '[]'):
            with self.subTest(content=content), model_says(content):
                self.assertIsNone(classifier.ask_model("my roof leaks", "sms"))

    def test_unparseable_output_is_skipped(self):
        with model_says("I think this is spam."):
            self.assertIsNone(classifier.ask_model("my roof leaks", "sms"))

    def test_unknown_label_is_skipped(self):
        with model_says('{"label": "maybe", "confidence": 0.9}'):
            self.assertIsNone(classifier.ask_model("my roof leaks", "sms"))

    def test_spam_score_always_means_probability_of_spam(self):
        # The model reports certainty in its own label; the column must mean
        # P(spam) whatever the label is, or a `spam_score > 0.8` filter drops
        # real customers.
        cases = [
            ('{"label":"spam","confidence":0.93,"reason":"insurance pitch"}', ("spam", 0.93)),
            ('{"label":"real","confidence":0.93,"reason":"own roof"}', ("real", 0.07)),
            ('{"label":"uncertain","confidence":0.93,"reason":"greeting"}', ("uncertain", 0.5)),
            ('{"label":"real","confidence":1.0,"reason":"own roof"}', ("real", 0.0)),
        ]
        for content, want in cases:
            with self.subTest(content=content), model_says(content):
                label, score, _ = classifier.ask_model("x", "sms")
                self.assertEqual((label, score), want)

    def test_out_of_range_and_non_numeric_confidence_are_clamped(self):
        for content, want in (
            ('{"label":"spam","confidence":7}', 1.0),
            ('{"label":"spam","confidence":-2}', 0.0),
            ('{"label":"spam","confidence":"high"}', 0.5),
            ('{"label":"spam","confidence":{"a":1}}', 0.5),
            ('{"label":"spam"}', 0.5),
        ):
            with self.subTest(content=content), model_says(content):
                self.assertEqual(classifier.ask_model("x", "sms")[1], want)


class WriteContractTests(unittest.TestCase):
    SPAM_ONLY = {"spam_label", "spam_score", "spam_reason", "spam_classifier",
                 "spam_classified_at"}

    def test_write_touches_only_the_machine_owned_spam_columns(self):
        with mock.patch.object(classifier, "SUPABASE_URL", UTAH), \
                mock.patch.object(classifier, "SERVICE_KEY", "test-only-placeholder"), \
                mock.patch.object(classifier, "_req", return_value=None) as req:
            classifier.write_label(7, "spam", 0.9123, "insurance pitch")
        url, method, body = req.call_args.args[:3]
        self.assertEqual(url, f"{UTAH}/rest/v1/leads?id=eq.7")
        self.assertEqual(method, "PATCH")
        self.assertEqual(set(body), self.SPAM_ONLY)
        self.assertEqual(body["spam_score"], 0.912)
        self.assertNotIn("status", body)

    def test_write_failure_names_the_unapplied_migration_and_stops(self):
        # The migration is file-only: before it is applied PostgREST answers
        # PGRST204 on every write. A raw HTTPError traceback mid-batch told
        # nobody that; this must be a readable hard stop.
        err = urllib.error.HTTPError(
            f"{UTAH}/rest/v1/leads?id=eq.7", 400, "Bad Request", {},
            io.BytesIO(b'{"code":"PGRST204","message":'
                       b'"Could not find the \'spam_label\' column"}'))
        leads = [{"id": 7, "message": "my roof leaks", "tier_classifier": "sms"}]
        with mock.patch.object(classifier, "fetch_leads", return_value=leads), \
                mock.patch.object(classifier, "call_durations", return_value={}), \
                mock.patch.object(classifier, "ask_model",
                                  return_value=("spam", 0.9, "pitch")), \
                mock.patch.object(classifier, "write_label", side_effect=err), \
                mock.patch.object(classifier, "print_stats"), \
                mock.patch("sys.argv", ["classify-lead-spam.py"]):
            with self.assertRaises(SystemExit) as caught:
                classifier.main()
        message = str(caught.exception)
        self.assertIn("20261027221000_lead_spam_classification.sql", message)
        self.assertIn("PGRST204", message)


if __name__ == "__main__":
    unittest.main()
