# Blog Auto-Publish Decision — 2026-06-10 (supersedes the "queue drafts, not publish" stance)

## Decision (Ryan, 2026-06-10 evening)

Ryan directed: build a **no-PR scheduler that posts twice a week per territory**
(Utah + Texas) — high-ROI cities, weather/storm-aligned topics, CTR/conversion-
optimized titles. This supersedes the "automation should queue drafts, not
publish" line in `BLOG-AUTOMATION-SCHEDULER-DECISION-2026-06-11.md` (written by a
parallel lane the same evening, before Ryan's directive).

## How publishing stays safe without human review

The human-review concern that motivated draft-first is addressed structurally,
fail-closed at every stage:

1. **Generator quality fork** (pre-existing): drafts with reviewer warnings get
   `status: needs-review` and are NEVER auto-published. Only clean `drafted`
   manifests are eligible.
2. **YMYL compliance hard-fence** (`scripts/blog-publish.py`): 14 forbidden
   advocacy phrases (§31A-26-201 vocabulary incl. the gate-blind-spot list:
   maximize payout / claim navigation / advocates on your behalf / handle the
   claim / work directly with your adjuster / settlement / negotiate / public
   adjuster) scanned in rendered visible text; plus an "insurance claim"
   concentration cap (3 visible mentions, 4 for storm posts) per
   `feedback_aeo_concentration_over_repetition`. Any hit → render deleted,
   manifest flipped to needs-review, run aborts.
3. **Full local gate suite** before any commit: audit-jsonld, audit-links,
   audit-compliance-words, audit-doc-isolation. Any failure → byte-exact
   working-tree restore, abort.
4. **Push verification**: `git ls-remote` confirms remote main == local HEAD
   after every publish (this repo's push has lied before).
5. **Isolation**: runs only in the dedicated blogbot worktree
   (`~/projects/frame-restoration-utah-blogbot`), reset to `origin/main` per
   run — never the shared foreground checkout.

## Cadence + flow

- launchd `com.ryan.frame-roofing-blog.plist` Mon + Thu 9:31am →
  `scripts/blog-publish-cron.sh` → draft stage (`blog-cron.sh`: weather/ROI
  prioritizer + Ollama draft) → publish stage (`blog-publish.py --push`).
- One post per run = 2/week. Direct push to main (no PR) → Vercel auto-deploy.
- Texas mirrors this: `com.ryan.frame-texas-blog.plist` Mon + Thu 10:07am in
  `~/projects/frame-restoration-texas-v2-blogbot` (TX fence additionally blocks
  "4102"/"TDI" anywhere and adjuster/insurance saturation).

## Audit trail

Every run appends a JSON line to `~/.cache/frame-roofing-blog-publish.jsonl`
(`{ts, manifest, slug, action: published|skipped|failed, reason}`). Published
manifests move to `data/blog-published/` with `published_at` + `published_url`.
