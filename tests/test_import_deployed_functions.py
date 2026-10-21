#!/usr/bin/env python3
"""scripts/import-deployed-functions.sh must validate and scan what is already on disk, continue past a
failed download, and never report success over a partial import.

Runs the real script from a scratch copy of the repo layout with a fake `supabase` CLI on PATH, so nothing
here talks to Supabase or touches this checkout's supabase/functions directory.
"""
import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "scripts/import-deployed-functions.sh"
LEGACY = "frame-roofing-" + "2026"
CLEAN_INDEX = 'import { functionKeyOk, REDDIT_MONITOR_KEY } from "../_shared/function-key.ts";\n'
FAKE_SUPABASE = """#!/usr/bin/env bash
# supabase functions download NAME --project-ref REF
echo "$*" >> "$FAKE_CALLS"
name="$3"
case ",$FAKE_FAIL," in *",$name,"*) exit 1 ;; esac
mkdir -p "supabase/functions/$name"
printf "%s" "$FAKE_INDEX" > "supabase/functions/$name/index.ts"
"""


class ImportDeployedFunctions(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        (self.tmp / "scripts").mkdir()
        shutil.copy(SCRIPT, self.tmp / "scripts" / SCRIPT.name)
        self.funcs = self.tmp / "supabase" / "functions"
        self.funcs.mkdir(parents=True)
        self.calls = self.tmp / "calls.log"
        bindir = self.tmp / "bin"
        bindir.mkdir()
        fake = bindir / "supabase"
        fake.write_text(FAKE_SUPABASE)
        fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
        self.env = dict(os.environ, PATH=f"{bindir}:/usr/bin:/bin", FAKE_CALLS=str(self.calls),
                        FAKE_FAIL="", FAKE_INDEX=CLEAN_INDEX)

    def run_script(self, *args, **env):
        proc = subprocess.run(["bash", str(self.tmp / "scripts" / SCRIPT.name), *args], env=dict(self.env, **env),
                              capture_output=True, text=True, cwd=str(self.tmp))
        return proc.returncode, proc.stdout + proc.stderr

    def downloads(self):
        return self.calls.read_text().splitlines() if self.calls.exists() else []

    def test_clean_download_of_both_functions_exits_zero(self):
        rc, out = self.run_script()
        self.assertEqual(rc, 0, out)
        self.assertEqual(len(self.downloads()), 2)
        for name in ("reddit-monitor", "lead-report"):
            self.assertTrue((self.funcs / name / "index.ts").is_file(), name)
            self.assertIn(f"OK {name}", out)

    def test_existing_directory_without_index_is_a_partial_import_not_success(self):
        (self.funcs / "reddit-monitor").mkdir()
        rc, out = self.run_script("reddit-monitor")
        self.assertEqual(rc, 1, out)
        self.assertIn("partial import", out)
        self.assertEqual(self.downloads(), [], "must not download over an existing directory")

    def test_existing_directory_is_scanned_not_skipped(self):
        target = self.funcs / "lead-report"
        target.mkdir()
        (target / "index.ts").write_text(f'const KEY = "{LEGACY}-abcdef";\n')
        rc, out = self.run_script("lead-report")
        self.assertEqual(rc, 3, out)
        self.assertIn("HARDCODED legacy key at", out)
        self.assertIn("Do NOT commit", out)
        self.assertEqual(self.downloads(), [])

    def test_failed_download_continues_to_the_next_function(self):
        rc, out = self.run_script(FAKE_FAIL="reddit-monitor")
        self.assertEqual(rc, 1, out)
        self.assertIn("download failed for reddit-monitor", out)
        self.assertEqual(len(self.downloads()), 2, "lead-report must still be attempted")
        self.assertTrue((self.funcs / "lead-report" / "index.ts").is_file())
        self.assertFalse((self.funcs / "reddit-monitor").exists())

    def test_key_found_outranks_a_download_failure(self):
        rc, out = self.run_script(FAKE_FAIL="reddit-monitor", FAKE_INDEX=f'const token = "{LEGACY}-abcdef";\n')
        self.assertEqual(rc, 3, out)
        self.assertIn("download failed for reddit-monitor", out)
        self.assertIn("Do NOT commit", out)

    def test_reports_locations_never_values(self):
        target = self.funcs / "lead-report"
        target.mkdir()
        (target / "index.ts").write_text(f'const apiKey = "{LEGACY}-SECRETVALUE";\n')
        rc, out = self.run_script("lead-report")
        self.assertEqual(rc, 3, out)
        self.assertIn("lead-report/index.ts:1", out)
        self.assertNotIn("SECRETVALUE", out)
        self.assertNotIn(LEGACY, out)


if __name__ == "__main__":
    unittest.main()
