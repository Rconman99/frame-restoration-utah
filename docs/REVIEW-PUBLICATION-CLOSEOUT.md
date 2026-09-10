# Google review publication closeout

A successful `google-reviews-sync.yml` run means collection/proposal, not a live
website update. The workflow intentionally creates a draft and never auto-merges.
On September 10, production remained at34 while draft277 held35. A fresh exact-CID
DataForSEO collection returned Heber36/5.0 (36 full rows) and separately SLC6/5.0.
Keep these profiles separate; do not put42 into the Heber aggregate.

Before each release:

1. Fetch current data using the existing updater in a clean current-main lane.
   Preserve reviewer wording and profile identity; do not infer reviewer cities.
2. Run `node scripts/audit-review-integrity.mjs --strict`,
   `python3 scripts/test-update-google-reviews-targeting.py`, and
   `node --test scripts/test-review-publication.mjs`.
3. Run `node scripts/check-review-publication.mjs` against the proposed snapshot.
   A mismatch is **pending release**, not a failed Google collection. This check
   must not block the prerequisite merge by running as a pre-merge parity gate.
4. Require independent review, rendered source and immutable-preview receipts,
   all blocking PR checks, authorized merge, and successful default-branch CI.
5. Run the publication check again against that exact snapshot plus a fresh
   five-viewport production receipt. Only both passing establishes closure.

The check is read-only, never merges or deploys, and fails closed on unavailable
production. It is an operator closeout check, not a newly installed schedule or
proof of perpetual freshness. Future draft proposals still require a release.
The homepage remains a selected carousel with a link to all reviews on Google;
the internal full export is not a new publicly exposed customer-data endpoint.
No Google review request, response, GBP edit, or owner message is part of this job.
