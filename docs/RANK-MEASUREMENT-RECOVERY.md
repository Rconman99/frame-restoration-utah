# Recovering Salt Lake Valley rank measurements

2026-09-08 — implementation receipt, not a new ranking win.

## What failed

Run [34280344748](https://github.com/Rconman99/frame-restoration-utah/actions/runs/34280344748)
collected 22 of 24 queries, then failed on provider status 40106. The previous
artifact retained checked-out panels, not those newly collected results.
Do not label that artifact a fresh complete baseline.

## Repair contract

- Save task IDs and each complete public SERP to an atomic checkpoint.
- Hold an exclusive checkpoint lock across reading, collection and report writes,
  including resume. Concurrent recoveries cannot buy duplicate replacements.
- Resume known task IDs with direct GET; already-collected tasks need not appear
  in `tasks_ready`. Saved results are not fetched again.
- Retry only provider errors 40101, 40103 and 40106, at most twice per keyword,
  with the count preserved on resume. Partial SERPs never become rank readings.
- Never automatically retry a paid POST whose response was lost. The checkpoint
  stays `submitting` or `reposting` until an operator reconciles provider records.
- Require the same task matrix, unique IDs/tags and a checkpoint no older than
  24 hours. Reports retain the collection start timestamp, not the recovery time.
- Do not change published `latest.json` unless the full matrix is collected.
- Preflight every destination under a shared promotion lock; an older recovery
  cannot replace newer latest or dated observations, including a dated file
  left behind by a promotion that crashed before updating latest.
- Both rank workflows archive checkpoints even on failure. Recovery files are
  git-ignored; credentials are not stored in them.
- A dedicated `*-recovery-*` artifact requires the actual checkpoint file;
  checked-in historical reports cannot satisfy it. Workflow reruns refuse new
  paid collection. Download and resume the checkpoint explicitly instead.

Provider references: [error codes](https://docs.dataforseo.com/v3/appendix/errors/)
and [Google organic advanced retrieval](https://docs.dataforseo.com/v3/serp/google/organic/task_get/advanced/).
GET retrieval is free for 30 days; the stricter 24-hour recovery window here
prevents presenting an old task set as a current observation. A replacement POST
can incur a new task charge; this is not an unlimited free retry policy.

## Recovery runbook

1. Inspect the failed run and download its exact `slv-rank-recovery-*` or
   `slv-expansion-recovery-*` artifact into a clean same-code worktree.
   Do not overwrite the primary clone or copy archived old panels over current data.
2. Place the downloaded `checkpoint.json` at
   `data/rank-tracker/recovery/checkpoint.json`. Inspect phase, timestamp and
   completed/pending counts. No secrets belong in this file.
   A `.lock` file means another process owns recovery. If a process was killed,
   verify its recorded PID is no longer running before removing that exact lock;
   never break an active lock. Do not copy a checkpoint into two active worktrees.
3. With the existing approved provider credentials loaded privately, run:

   ```sh
   node scripts/dataforseo-rank-tracker.mjs --registry data/rank-tracker/panels.json --resume data/rank-tracker/recovery/checkpoint.json
   ```

   For the expansion matrix use `expansion-panels.json`. A different matrix fails
   closed. Resume may purchase up to two replacement tasks per failed keyword;
   it never intentionally submits the whole matrix again.
4. If phase is `submitting`, `reposting` or `rejected`, reconcile the accepted task
   IDs through the provider before proceeding. Do not delete the checkpoint and
   blindly retry. The previous Sep8 run predates checkpoints and needs provider
   ID reconciliation separately; this patch cannot recreate its missing IDs.
5. Run the downstream sync/audit steps from the corresponding workflow; review
   the complete dated reports before committing them. A saved checkpoint alone
   is not dashboard freshness or production proof.

For a deliberately new measurement, choose a new `--checkpoint` path under
`data/rank-tracker/recovery/`. Existing checkpoint paths refuse implicit overwrite.
In GitHub, a new manual dispatch is a deliberately new paid batch, NOT recovery.
The Re-run button is blocked; use the CLI recovery instructions for a failed batch.
No consumer-AI citation baseline, GBP approval, booking outcome or lead increase
is implied by passing this recovery test suite.

## Actual recovery receipt — 2026-09-08

Using the existing Command Center provider configuration (values never emitted),
`serp/id_list` recovered the 24 task IDs from run 34280344748. Every posted
keyword, location, language, device, OS, depth, priority and AI setting matched
the current matrix exactly. Original submission time: 21:23:56 UTC.

The resume retrieved 23 existing complete results and replaced only the failed
Cottonwood Heights roof-replacement task once. All 24 then completed. Six dated
panels and their downstream evidence-safe ledgers were regenerated; all 11
downstream audit commands passed. The separate 12-city expansion panel remains
dated August 12 and consumer-AI remains unmeasured. Do not call those fresh.

Fresh SLC fixed mobile top-30 results: repair 23, replacement 22, roofer 29,
roofing-contractor not found within the measured depth. No exact SLC GBP CID
appeared in the returned Maps packs; the roofing-contractor query returned no
Maps pack. One query displayed an AI Overview, without a Frame citation.
These are visibility observations, not booked jobs, a citywide rank grid, or
evidence that this infrastructure repair lifted rankings.
