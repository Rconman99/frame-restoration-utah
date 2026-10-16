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

    def test_deployed_only_functions_read_key_from_env(self):
        # reddit-monitor / lead-report are deployed-only until imported with
        # scripts/import-deployed-functions.sh. Once in the repo they must use
        # the env-backed shared check, not a literal.
        for name, spec in (("reddit-monitor", "REDDIT_MONITOR_KEY"), ("lead-report", "LEAD_REPORT_KEY")):
            path = REPO / "supabase/functions" / name / "index.ts"
            if not path.exists():
                continue
            src = path.read_text()
            self.assertIn("../_shared/function-key.ts", src, name)
            self.assertIn(spec, src, name)

    def test_function_key_helper_fails_closed(self):
        src = (REPO / "supabase/functions/_shared/function-key.ts").read_text()
        self.assertIn('legacy !== "" &&', src)
        self.assertIn("if (!provided) return false;", src)

    def test_traffic_snapshot_key_is_optional(self):
        src = (REPO / "scripts/refresh-traffic-snapshot.sh").read_text()
        self.assertIn('echo "ERROR: FRAME_REPORT_PIN must be set."', src)
        self.assertIn('if $routing_key == "" then {pin:$pin}', src)


if __name__ == "__main__":
    unittest.main()
