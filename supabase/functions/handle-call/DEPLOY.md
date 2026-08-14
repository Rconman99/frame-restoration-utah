# Utah missed-call alert rollout

This rollout is production-only and must remain serialized. It never sends a
test call or text.

1. Merge the reviewed release-runner change and require every blocking check on
   the exact main SHA to pass.
2. Secure the exclusive Utah migration-writer window. Do not run Supabase
   Studio schema actions, another migration process, migration repair, raw SQL,
   or `supabase db push` during the window.
3. Obtain the official macOS arm64 Supabase CLI 2.113.0 binary and verify its
   SHA-256 is
   `ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a`.
4. Inject `SUPABASE_ACCESS_TOKEN` from approved secret storage without printing
   it. Bind `RELEASE_SHA` and `UTAH_MIGRATION_EXCLUSIVE_WRITER_ACK` to the same
   full current-main SHA and set `SUPABASE_BIN` to the verified binary. First
   set `UTAH_MIGRATION_EXECUTION_MODE=preflight` and run:

   ```bash
   scripts/run-missed-call-migration.sh
   ```

   Require the exact preflight receipt, then use a fresh process with
   `UTAH_MIGRATION_EXECUTION_MODE=apply` to run the same script.

   Retain the printed mode-0700 receipt directory. The runner must report the
   exact migration basename and the unchanged aggregate suppression-row count.
   A non-zero exit is a hard stop: retain receipts and resume only through this
   same exact-prefix runner. Never substitute the Management API, SQL Editor,
   pasted SQL, migration repair, or a full-tree migration command.
5. Confirm the exact-main Compliance Gate remains green. Issue a fresh,
   single-use signed client-IP receipt for each function dispatch. Deploy
   `handle-sms` first so caller-specific `BLOCK ####` handling is live before
   alerts can begin, then deploy `handle-call`, through
   `.github/workflows/deploy-edge-function.yml` only.
6. Verify both deployments, the live function versions/source hashes, and the
   read-only schema admission contract. Do not trigger an outbound SMS or test
   call without separate explicit approval. Until a natural missed call creates
   a provider-accepted receipt, report the feature as deployed but not
   delivery-proven.

The runner archives only the exact merged migration and poison-guard template.
It requires the reviewed 32-version production history, the current main SHA,
the pinned CLI hash, two unchanged catalog probes immediately before apply, and
an exact postflight. Existing suppression rows are never read or printed; only
their aggregate count is compared before and after.
