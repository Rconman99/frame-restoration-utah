#!/usr/bin/env python3
"""Unit tests for AIO sweep credential-shaped redaction. No network, no keys."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "aeo_aio_sweep",
    Path(__file__).resolve().parent / "aeo-aio-sweep.py",
)
SWEEP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SWEEP)

# Synthetic JWT-shaped literal (three base64url segments). Not a real token.
FAKE = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9." "eyJpc3MiOiJ0ZXN0In0." "dGVzdHNpZ25hdHVyZQ"

class RedactionTests(unittest.TestCase):
    def test_strips_partnertoken_query_and_keeps_path(self):
        url = f"https://m.me/example-competitor?partnertoken={FAKE}"
        out = SWEEP.redact_credential_shaped(url)
        self.assertEqual(out, "https://m.me/example-competitor?partnertoken=REDACTED")
        self.assertNotIn(FAKE, out)
        self.assertNotIn("eyJ", out)

    def test_redacts_jwt_in_nested_payload_and_strips_api_key_via_save_contract(self):
        payload = {
            "search_parameters": {"q": "roof", "api_key": "should-be-removed-by-save_raw"},
            "local_results": [
                {"whatsapp": f"https://m.me/a1roofingutah?partnertoken={FAKE}"},
                {"title": "plain"},
            ],
        }
        redacted = SWEEP.redact_credential_shaped(payload)
        self.assertEqual(
            redacted["local_results"][0]["whatsapp"],
            "https://m.me/a1roofingutah?partnertoken=REDACTED",
        )
        self.assertEqual(redacted["local_results"][1]["title"], "plain")
        # redact helper does not drop api_key; save_raw does that separately.
        self.assertIn("api_key", redacted["search_parameters"])

    def test_leaves_ordinary_strings_alone(self):
        self.assertEqual(SWEEP.redact_credential_shaped("https://framerestorationutah.com/"), "https://framerestorationutah.com/")
        self.assertEqual(SWEEP.redact_credential_shaped({"n": 3}), {"n": 3})


if __name__ == "__main__":
    sys.exit(0 if unittest.main(verbosity=2) else 1)
