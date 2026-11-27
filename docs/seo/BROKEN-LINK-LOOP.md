# Broken-link loop (Utah) — static gate + live check, Mac launchd job

**Added 2026-11-03.** The Mac job had no entrypoint in this repo; it was a bare
`node scripts/audit-links.mjs` call. This documents the loop, the two scripts it runs, the
dry-run, and the launchd template. Report-only: the loop never commits, pushes, deploys, or
touches GBP / Twilio / Vercel. Fixing a link stays a human-reviewed draft PR.

## Why it kept failing on the Mac (diagnosed from code)

| Cause | Symptom in the launchd log | Fix in this repo |
|---|---|---|
| `audit-links.mjs` took the repo root from `process.cwd()`. launchd starts jobs with cwd `/` unless the plist sets `WorkingDirectory`. | Walker started at `/`, hit `EPERM`/`EACCES` on protected macOS folders (`~/Library`, `/private/var/…`) and threw before scanning a page; or a plist with a relative script path got `Cannot find module`. | Root is derived from the script's own location (`--root` / `FRAME_UTAH_REPO` override). Unreadable folders are a warning, not a crash. Zero files scanned exits 2 instead of printing a clean report. |
| launchd's PATH has no Homebrew `node`. | `node: command not found` with exit 127. | `broken-link-cron.sh` puts `/opt/homebrew/bin` and `/usr/local/bin` on PATH and logs the reason if node is still missing. |
| The static scanner only sees the checkout. A stale or dirty clone (the primary clone is documented as dirty/stale) reports links for HTML production is not serving, and never sees what production returns. | "0 broken" while a live page 404s, or phantom breaks from local drafts. | `check-broken-links.mjs` fetches the **live sitemap** and checks every link on the live pages. |
| Header said "Frame Restoration TX" (port slip). | Confusing, not fatal. | Fixed. |

## The two halves

1. **Static** — `node scripts/audit-links.mjs [--strict] [--json] [--root DIR]`
   Every local `href` in the checkout resolves to a file, `x.html`, `x/index.html`, or a
   `vercel.json` route. No network. Blocking in CI (`compliance-gate.yml` link-integrity).
2. **Live** — `node scripts/check-broken-links.mjs [--dry-run] [--urls FILE | --url U | --sitemap [FILE]]`
   Fetches each listed page on this market's host, then every internal link those pages carry.
   Reports 404/410, 5xx, redirect loops, chains, network errors and off-origin redirects, each with
   the pages that carry it. Default URL list = the live `sitemap.xml`.

## Market isolation (hard rule)

- `--site` must be `www.framerestorationutah.com` / `framerestorationutah.com` (read from
  `data/route-factory/business.json` `canonical_host`) or a loopback fixture. Anything else exits 2
  before a request is made. The cron wrapper enforces the same allowlist on `FRAME_UTAH_SITE`.
- A listed URL on another host is never fetched; it is printed under "off-market listed URLs".
- A link to another host is never fetched. External hosts are **counted and listed** so a link to
  another Frame market's site would be visible in the report, without this loop ever crawling it.
- A redirect that leaves the origin is recorded (`external-redirect`) and not followed.
- The retired brand host `frameroofingutah.com` is flagged `legacy-host-link` (warn) and not fetched.

## Dry-run

```bash
# read-only: fetches, prints results, writes nothing, exits 0 on findings
node scripts/check-broken-links.mjs --dry-run
node scripts/check-broken-links.mjs --urls path/to/urls.txt --dry-run     # one public URL list
node scripts/check-broken-links.mjs --url https://www.framerestorationutah.com/pages/roof-repair --dry-run
bash scripts/broken-link-cron.sh --dry-run                                # whole loop, read-only
```

A URL list is newline-delimited URLs or paths, or a `sitemap.xml`. Lines starting with `#` are ignored.

## Real run (what launchd calls)

```bash
bash scripts/broken-link-cron.sh
# log:     ~/.cache/frame-roofing-links.log   (self-truncates past 5 MB)
# report:  ~/.cache/frame-roofing-links/<YYYY-MM-DD>.json
# exit:    0 clean · 1 broken links or unresolved local hrefs · 2 could not run
```

Env overrides: `FRAME_UTAH_REPO`, `FRAME_UTAH_SITE`, `FRAME_UTAH_LINK_LOG`, `FRAME_UTAH_LINK_OUT`.
Flags: `--dry-run`, `--static-only`, `--live-only`, `--urls FILE`, `--max-pages N`, `--max-links N`,
`--timeout MS`, `--concurrency N`, `--quiet`.

## launchd template

Save as `~/Library/LaunchAgents/com.ryan.frame-roofing-links.plist` (owner action; the plist is not
tracked in this repo), then `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ryan.frame-roofing-links.plist`.
Weekly, Monday 07:41 Mac local time, off the 06:37 SEO-loop and 08:23 AEO windows.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.ryan.frame-roofing-links</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/REPLACE_ME/projects/frame-restoration-utah/scripts/broken-link-cron.sh</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/REPLACE_ME/projects/frame-restoration-utah</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>41</integer></dict>
  <key>StandardOutPath</key><string>/Users/REPLACE_ME/.cache/frame-roofing-links.launchd.log</string>
  <key>StandardErrorPath</key><string>/Users/REPLACE_ME/.cache/frame-roofing-links.launchd.log</string>
</dict>
</plist>
```

Test it before trusting the schedule: `launchctl kickstart -k gui/$(id -u)/com.ryan.frame-roofing-links`
then read `~/.cache/frame-roofing-links.log`.

## Tests

`node --test scripts/check-broken-links.test.mjs` — loopback fixtures only; proves 404/loop/chain
detection with source attribution, that a second (other-market) host receives zero requests, that
an off-market `--site` is refused, that a run which fetched nothing fails instead of reporting
"0 broken", and that `--dry-run` writes no report and exits 0 while `--strict` exits 1.

## Honesty rules (same as the SEO loop)

- A URL that was not fetched produces neither an issue nor a clean bill of health.
- Zero pages fetched is a failed run (exit 2), never "0 broken links".
- Issue URL lists are sorted before capping at 50, with the true `count` kept.
