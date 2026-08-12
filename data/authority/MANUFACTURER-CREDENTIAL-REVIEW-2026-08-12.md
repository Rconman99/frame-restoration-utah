# Manufacturer credential review — 2026-08-12

Purpose: prevent unsupported manufacturer certification claims from becoming a
public trust or structured-data signal.

## Evidence status

The claim registry contains no approved primary-source evidence that Frame
Restoration Utah is a CertainTeed- or TAMKO-certified contractor or installer.
This record does not assert that Frame lacks either credential. It records only
that the repository has no evidence suitable for publishing the claims.

## Frame-controlled correction

The 2026-08-12 correction:

1. Removed CertainTeed/TAMKO certification wording from 14 deployed public
   surfaces while retaining verified Utah DOPL license wording where relevant.
2. Replaced unsupported enhanced-warranty wording with qualified manufacturer
   terms that vary by product, installation, eligibility, and registration.
3. Added a public-surface blocker for unregistered CertainTeed/TAMKO
   certification claims.
4. Added the same blocker to the blog generator so new drafts cannot reintroduce
   those claims.
5. Removed the same claims from legacy city-content generator inputs and changed
   internal directory actions from assumed eligibility to evidence-first holds.

## Reinstatement standard

Reinstate a manufacturer credential only after adding current primary-source
evidence, the exact credential name and scope, a verification date, and an
expiry/recheck date to `data/route-factory/claim-registry.json`. Public wording
must match that evidence and must not imply broader warranty eligibility than
the manufacturer documents.
