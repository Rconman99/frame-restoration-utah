#!/usr/bin/env python3
"""Static contract tests for the daily review-request schedule."""
import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WF = (REPO / ".github/workflows/review-request-daily.yml").read_text()
FN = (REPO / "supabase/functions/review-request/index.ts").read_text()


class ReviewRequestScheduleTests(unittest.TestCase):
    def test_daily_schedule_and_manual_dry_run_default(self):
        self.assertRegex(WF, r"cron: '5 16 \* \* \*'")
        self.assertRegex(WF, r"dry_run:[\s\S]*default: true")

    def test_key_comes_from_secret_not_literal(self):
        self.assertIn("secrets.REVIEW_REQUEST_KEY", WF)
        self.assertNotIn("frame-roofing-2026", WF)

    def test_single_concurrency_group(self):
        self.assertIn("group: utah-review-request-daily", WF)
        self.assertIn("cancel-in-progress: false", WF)

    def test_no_customer_fields_logged(self):
        self.assertNotRegex(WF, r"cat \"\$RESPONSE_FILE\"")

    def test_dry_run_returns_before_any_send(self):
        dry = FN.index("if (dryRun)")
        self.assertLess(dry, FN.index("getTwilioConfig(supabase);\n    const results"))

    def test_claim_before_send(self):
        loop = FN[FN.index("for (const lead of leads)"):]
        claim = loop.index('.is("review_requested_at", null)')
        send = loop.index("sendOne(lead")
        self.assertLess(claim, send)
        self.assertIn('skipped: "already_claimed"', loop)

    def test_key_not_hardcoded_in_function(self):
        self.assertNotIn("frame-roofing-2026", FN)
        self.assertIn('env("REVIEW_REQUEST_KEY")', FN)

    def test_new_key_wins_over_legacy(self):
        body = FN[FN.index("export function reviewKeyOk"):]
        self.assertLess(body.index('env("REVIEW_REQUEST_KEY")'), body.index('env("LEGACY_ROUTING_KEY")'))
        self.assertIn("if (current) return timingSafeEqual(provided, current);", body)

    def test_workflow_sends_header_not_query_key(self):
        self.assertIn('x-review-key: ${REVIEW_REQUEST_KEY}', WF)
        self.assertNotIn("?key=", WF)


if __name__ == "__main__":
    unittest.main()
