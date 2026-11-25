@AGENTS.md

# Claude-only notes (Frame Restoration Utah)

AGENTS.md is canonical for commands, lanes and protected paths. The full prior CLAUDE.md
(session log, refresh history, site/SEO narrative, ~1.8 MB) moved unchanged to
`docs/history/CLAUDE-context-archive-2026-10-28.md`; read it only when you need history.

## Critical rules (read before any edit)
- Never invent certifications, awards or memberships. Not true: any BBB letter grade,
  NRCA member, GAF Master Elite / OC Preferred. If unsure, ask; don't guess.
- True and usable: Licensed & Insured in Utah, Free Roof Inspections, 24/7 Storm Response,
  Financing Available, 10-Year Workmanship Warranty, BBB Accredited.
- Do not re-add things that were previously removed.
- Phone: Utah has ONE public number, the Twilio line ending 8802 (display, tel:, sms:, schema,
  GBP, directories, consent/privacy/terms copy). The owner's cell (ending 4422) is internal-only
  as the `LANDON_PHONE` forwarding constant in supabase/functions/handle-{call,lead,sms}; it must
  never appear on a public surface. The SLC tracking DIDs (ending 0526, 8978) are orphaned; do
  not republish them (owner decision pending).
- No drone inspection as a marketed service (drone photography is fine).
- Heber Valley is one market (Heber City, Midway, Wallsburg, Charleston, Daniel); don't fragment.
- "The valley" = Salt Lake Valley premium ZIPs, not Heber Valley.
- Every GBP post needs a photo. NEVER auto-publish to Google Business Profile: owner-manual only.
- Hours: Mon–Fri 8AM–7PM, Sat 8AM–6PM.

## Git
- Draft PRs only; push to `main` auto-deploys to Vercel, so never push to main directly.
- Use a fresh worktree; the local primary clone may be dirty/stale, don't pull over it.
