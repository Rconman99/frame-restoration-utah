#!/usr/bin/env bash
# Local/CI checks for the IndexNow changed-URL submit path.
# Uses a mock submitter only — never sends a live IndexNow request.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUBMIT="$ROOT/scripts/indexnow-submit.sh"
MAPPY="$ROOT/scripts/indexnow-map-changed-urls.py"

PASS=0
FAIL=0
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

SUBMITTED="$WORKDIR/submitted.txt"
MOCK="$WORKDIR/mock-submitter"
: > "$SUBMITTED"

cat > "$MOCK" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
# Record each URL. Ignore a leading --dry-run flag if present.
out="${INDEXNOW_TEST_LOG:?}"
if [ "${1:-}" = "--dry-run" ]; then
  shift
fi
printf '%s\n' "$1" >> "$out"
MOCK
chmod +x "$MOCK"

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $label"
    echo "      expected: $(printf '%q' "$expected")"
    echo "      actual:   $(printf '%q' "$actual")"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_empty() {
  local label="$1" path="$2"
  if [ ! -s "$path" ]; then
    echo "PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $label (file not empty: $(wc -c < "$path" | tr -d ' ') bytes)"
    FAIL=$((FAIL + 1))
  fi
}

run_submit() {
  local urls_file="$1" outfile="$2"
  : > "$SUBMITTED"
  set +e
  INDEXNOW_SUBMITTER="$MOCK" INDEXNOW_TEST_LOG="$SUBMITTED" \
    "$SUBMIT" --urls-file "$urls_file" > "$outfile" 2>&1
  local rc=$?
  set -e
  printf '%s' "$rc"
}

echo "=== IndexNow submit tests (mock only, no live requests) ==="

# 1. Empty file exits 0 and does not submit.
: > "$WORKDIR/empty.txt"
rc="$(run_submit "$WORKDIR/empty.txt" "$WORKDIR/out-empty.txt")"
assert_eq "empty file exits 0" "0" "$rc"
if grep -q "No changed page is in the sitemap; nothing to submit." "$WORKDIR/out-empty.txt"; then
  echo "PASS  empty file logs skip message"
  PASS=$((PASS + 1))
else
  echo "FAIL  empty file logs skip message"
  echo "      output: $(cat "$WORKDIR/out-empty.txt")"
  FAIL=$((FAIL + 1))
fi
assert_file_empty "empty file submits nothing" "$SUBMITTED"

# 2. Bare newline (the failing CI case) exits 0 and does not submit.
printf '\n' > "$WORKDIR/newline.txt"
rc="$(run_submit "$WORKDIR/newline.txt" "$WORKDIR/out-newline.txt")"
assert_eq "bare-newline file exits 0" "0" "$rc"
if grep -q "No changed page is in the sitemap; nothing to submit." "$WORKDIR/out-newline.txt"; then
  echo "PASS  bare-newline file logs skip message"
  PASS=$((PASS + 1))
else
  echo "FAIL  bare-newline file logs skip message"
  echo "      output: $(cat "$WORKDIR/out-newline.txt")"
  FAIL=$((FAIL + 1))
fi
assert_file_empty "bare-newline file submits nothing" "$SUBMITTED"
if grep -q "Submitting" "$WORKDIR/out-newline.txt"; then
  echo "FAIL  bare-newline must not count as 1 URL"
  FAIL=$((FAIL + 1))
else
  echo "PASS  bare-newline is not counted as a URL"
  PASS=$((PASS + 1))
fi

# 3. Whitespace-only lines exit 0 and do not submit.
printf '  \n\n\t\n \t \n' > "$WORKDIR/whitespace.txt"
rc="$(run_submit "$WORKDIR/whitespace.txt" "$WORKDIR/out-ws.txt")"
assert_eq "whitespace-only file exits 0" "0" "$rc"
assert_file_empty "whitespace-only file submits nothing" "$SUBMITTED"

# 4. Real URLs are processed, counted correctly, and the loop exits 0.
cat > "$WORKDIR/real.txt" <<'URLS'
https://www.framerestorationutah.com/
https://www.framerestorationutah.com/pages/roof-repair
URLS
rc="$(run_submit "$WORKDIR/real.txt" "$WORKDIR/out-real.txt")"
assert_eq "real URL list exits 0" "0" "$rc"
if grep -q "Submitting 2 changed URL(s):" "$WORKDIR/out-real.txt"; then
  echo "PASS  real URL list reports count 2"
  PASS=$((PASS + 1))
else
  echo "FAIL  real URL list reports count 2"
  echo "      output: $(cat "$WORKDIR/out-real.txt")"
  FAIL=$((FAIL + 1))
fi
got="$(cat "$SUBMITTED")"
expected="$(printf '%s\n' "https://www.framerestorationutah.com/" "https://www.framerestorationutah.com/pages/roof-repair")"
assert_eq "real URL list submitted both URLs in order" "$expected" "$got"

# 5. Mixed blank and real lines: only real URLs are counted and submitted.
cat > "$WORKDIR/mixed.txt" <<'URLS'

https://www.framerestorationutah.com/pages/roof-replacement
  
https://www.framerestorationutah.com/pages/hail-damage

URLS
rc="$(run_submit "$WORKDIR/mixed.txt" "$WORKDIR/out-mixed.txt")"
assert_eq "mixed list exits 0" "0" "$rc"
if grep -q "Submitting 2 changed URL(s):" "$WORKDIR/out-mixed.txt"; then
  echo "PASS  mixed list reports count 2 (blanks dropped)"
  PASS=$((PASS + 1))
else
  echo "FAIL  mixed list reports count 2 (blanks dropped)"
  echo "      output: $(cat "$WORKDIR/out-mixed.txt")"
  FAIL=$((FAIL + 1))
fi
got="$(cat "$SUBMITTED")"
expected="$(printf '%s\n' "https://www.framerestorationutah.com/pages/roof-replacement" "https://www.framerestorationutah.com/pages/hail-damage")"
assert_eq "mixed list submitted only real URLs" "$expected" "$got"

# 6. Mapper: pages not in the sitemap write a 0-byte file (not a newline).
cat > "$WORKDIR/sitemap.xml" <<'SITEMAP'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.framerestorationutah.com/</loc></url>
  <url><loc>https://www.framerestorationutah.com/pages/roof-repair</loc></url>
</urlset>
SITEMAP
printf '%s\n' "directory-blitz-tool.html" "directory-tracker.html" > "$WORKDIR/changed-tools.txt"
python3 "$MAPPY" --changed-file "$WORKDIR/changed-tools.txt" --sitemap "$WORKDIR/sitemap.xml" > "$WORKDIR/mapped-empty.txt"
map_bytes="$(wc -c < "$WORKDIR/mapped-empty.txt" | tr -d ' ')"
assert_eq "mapper writes 0 bytes when no changed page is in the sitemap" "0" "$map_bytes"
rc="$(run_submit "$WORKDIR/mapped-empty.txt" "$WORKDIR/out-mapped-empty.txt")"
assert_eq "mapped empty list (ffcd6f51 case) exits 0" "0" "$rc"

# 7. Mapper: a sitemap page is emitted with a trailing newline, no extras.
printf '%s\n' "pages/roof-repair.html" "README.md" > "$WORKDIR/changed-real.txt"
python3 "$MAPPY" --changed-file "$WORKDIR/changed-real.txt" --sitemap "$WORKDIR/sitemap.xml" > "$WORKDIR/mapped-real.txt"
assert_eq "mapper emits the sitemap URL for a changed public page" \
  "https://www.framerestorationutah.com/pages/roof-repair" \
  "$(cat "$WORKDIR/mapped-real.txt")"
rc="$(run_submit "$WORKDIR/mapped-real.txt" "$WORKDIR/out-mapped-real.txt")"
assert_eq "mapped real URL list exits 0" "0" "$rc"
assert_eq "mapped real URL was submitted" \
  "https://www.framerestorationutah.com/pages/roof-repair" \
  "$(cat "$SUBMITTED")"

# 8. --dry-run reaches the mock with the flag and still exits 0 (no live call).
: > "$SUBMITTED"
set +e
INDEXNOW_SUBMITTER="$MOCK" INDEXNOW_TEST_LOG="$SUBMITTED" \
  "$SUBMIT" --dry-run --urls-file "$WORKDIR/real.txt" > "$WORKDIR/out-dry.txt" 2>&1
dry_rc=$?
set -e
assert_eq "--dry-run with real URLs exits 0" "0" "$dry_rc"
assert_eq "--dry-run still records the URLs via the mock" \
  "$(printf '%s\n' "https://www.framerestorationutah.com/" "https://www.framerestorationutah.com/pages/roof-repair")" \
  "$(cat "$SUBMITTED")"

echo
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
exit 0
