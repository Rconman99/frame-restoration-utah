#!/usr/bin/env python3
"""Guard: the retired shared routing key must not reappear in shipped code."""
import subprocess
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
LEGACY = "frame-roofing-" + "2026"
ALLOWED = {  # assertions that the key is ABSENT
    "scripts/test-dashboard-session-client.mjs",
    "supabase/functions/weekly-report/source-security.test.ts",
    "tests/test_review_request_schedule.py",
}


class NoSharedRoutingKey(unittest.TestCase):
    def test_no_literal_outside_docs(self):
        out = subprocess.run(["git", "grep", "-l", LEGACY], cwd=REPO, capture_output=True, text=True).stdout.split()
        bad = [p for p in out if p not in ALLOWED and not p.endswith(".md")]
        self.assertEqual(bad, [], f"legacy shared key still present in: {bad}")

    def test_browser_login_sends_pin_only(self):
        for rel in ("leads.html", "seo-report.html", "dashboard/dashboard.js"):
            src = (REPO / rel).read_text()
            self.assertNotIn("ROUTING_KEY", src, rel)
            self.assertNotIn("routing_key", src, rel)

    def test_lead_crm_pin_only_is_env_gated(self):
        src = (REPO / "supabase/functions/lead-crm/index.ts").read_text()
        self.assertIn('Deno.env.get("LEAD_CRM_PIN_ONLY_LOGIN") === "true"', src)
        self.assertIn('API_KEY !== "" && routingKey === API_KEY', src)


if __name__ == "__main__":
    unittest.main()
