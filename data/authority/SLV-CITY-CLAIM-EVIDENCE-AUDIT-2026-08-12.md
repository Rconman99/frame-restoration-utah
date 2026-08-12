# Salt Lake Valley city-claim evidence audit — 2026-08-12

## Scope and handling

This internal ledger records a read-only Google Drive evidence search for the claim classes already red-blocking the Millcreek, Sandy, Holladay, Cottonwood Heights, and Draper pages. It stores status and document titles only. It intentionally excludes credentials, customer identities, addresses, policy numbers, review text, and private financial details.

The available Drive connector was authenticated to `ryanconwell99@gmail.com`, not the required Frame business account. Therefore `NOT FOUND` means not found in the connected personal-account corpus; it is not proof that no document exists in `ryan@framerestorations.com`. No Drive files, permissions, messages, or public surfaces were changed.

On 2026-08-12, a second read-only search through the Codex Google Drive connector confirmed the authenticated profile as `ryanconwell99@gmail.com`. Searches for certificate of liability, workers compensation, certificate of insurance, workmanship/roof warranty, building permits, roofing contracts, invoices, and each target city returned website exports, internal task lists, generic guides, or unrelated files rather than a current primary instrument. Those self-referential and draft materials were rejected as evidence. The public-use decisions below therefore remain unchanged.

At `2026-08-12T15:54:34Z`, a third audit attempted to use the approved Claude bridge specifically to reach the Frame business Drive. Its identity preflight again resolved the active connector to `ryanconwell99@gmail.com`, not `ryan@framerestorations.com`, so it failed closed before running any business-content query. It accepted zero evidence, disclosed zero sensitive fields, and made zero Drive, sharing, message, or publishing mutations. Secretless receipt hashes: JSON `5715c0de5daccb85570f982cf5a12202459184f8af2ab26335d7242146eb3cbb`; Markdown `d32407477c61434f88ed65a9aa6b4543d9de0d14d2079266bd443b0ce60dc3b0`. This strengthens the access-gap finding but does not establish that the business Drive lacks the requested evidence.

## Evidence ledger

| Claim class | Status | Sanitized evidence | Public-use decision |
|---|---|---|---|
| 10-year workmanship warranty | Provisional first-party support | `Frame-Restoration-Website-Audit.docx`, created 2026-03-11 and modified 2026-03-12, contains a dated owner correction that the workmanship warranty is 10 years rather than 5 years. | Do not add to the verified claim registry yet. Obtain the current warranty contract/certificate or re-verify through the Frame business account, then register an exact, scoped claim with review/expiry policy. Do not remove solely as unsupported while this verification is pending. |
| General liability and workers compensation | Not found | No current COI, ACORD, or policy evidence surfaced. `Frame-Restoration-Project-Tracker.xlsx` still described license/insurance evidence as waiting on the client. | Remove or narrow from the five public pages unless current business-account evidence is supplied and registered. |
| Permit handling | Not found | No policy or documented promise establishing who obtains permits surfaced. | Remove universal permit-handling promises unless a scoped operating policy is supplied and registered. |
| Exact travel/response times and 24/7 availability | Not found | The only related tracker material asked the owner to define actual response time and whether a 24/7 line exists; it did not establish a promise. | Remove exact 15-minute, within-24/48-hour, and 24/7 promises unless a current operating policy is supplied and registered. |
| City-specific completed projects or reviews | Not found / ambiguous | The connected Drive contained generic city drafts but no publishable proof tying a completed project or review to any of the five cities. The completed-project archive found in that account was empty. | Remove city attribution or rewrite as non-project neighborhood context. Never infer location from an unverified asset filename or generic review. |
| Salt Lake Valley pricing ranges | Not supported | The only pricing note found was scoped outside the five cities and included an owner direction not to publish pricing. The current tracker still marked pricing as waiting on the client. | Remove city price ranges. Do not extrapolate from another market or private job data. |

## Remaining blocked classes

No new evidence was established for unsourced hail-frequency, roof-life-loss, or project-duration assertions. Those classes remain blocked under `data/route-factory/claim-registry.json` until a primary source and a correctly scoped public statement are registered.

## Next verification

Repeat the read-only search under `ryan@framerestorations.com`. If the business-account search returns a current warranty instrument, COI/ACORD evidence, operating policy, or city-specific project proof, record only the minimum public fact in the claim registry and keep the private source out of Git. Until then, the integrity gate remains red and no city-page experiment may amplify the disputed copy.
