import assert from "node:assert/strict";

export function aggregateMapsLeaders(queries = []) {
  const leaders = new Map();
  for (const query of queries) {
    for (const leader of query?.surfaces?.maps?.leaders || []) {
      if (leader.isTarget) continue;
      const key = leader.cid || `${leader.name}|${leader.domain}`;
      const row = leaders.get(key) || {
        name: leader.name,
        cid: leader.cid || null,
        domain: leader.domain,
        appearances: 0,
        numberOneQueries: 0,
        bestRank: null,
        keywords: [],
      };
      row.appearances += 1;
      row.numberOneQueries += leader.rank === 1 ? 1 : 0;
      row.bestRank = row.bestRank == null ? leader.rank : Math.min(row.bestRank, leader.rank);
      if (!row.keywords.includes(query.keyword)) row.keywords.push(query.keyword);
      leaders.set(key, row);
    }
  }
  return [...leaders.values()]
    .sort((a, b) => b.numberOneQueries - a.numberOneQueries
      || b.appearances - a.appearances
      || a.bestRank - b.bestRank
      || String(a.name).localeCompare(String(b.name)));
}

export function mapsReadinessLane({ city, serviceAreaStatus, identityProfile, exactCidReviewState, ownerProfileCompletenessState }) {
  if (serviceAreaStatus?.startsWith("pending-")) return "service-area-proof-before-exact-cid-planning";
  if (serviceAreaStatus?.startsWith("not-saved-")) return "not-saved-service-area-no-exact-cid-planning";
  if (identityProfile !== "salt-lake-valley-exact-cid") return "owner-gated-page-identity-correction";
  if (exactCidReviewState !== "measured-exact-cid" || ownerProfileCompletenessState !== "measured-exact-cid-owner-view") return "exact-cid-review-and-owner-profile-audit";
  if (city === "Salt Lake City") return "weekly-exact-cid-displacement-measurement";
  return "verified-city-weekly-exact-cid-displacement-measurement";
}

export function assertMapsReadinessCity(city) {
  assert.equal(city.queries.length, 4, `fixed query count mismatch: ${city.city}`);
  assert.equal(city.maps.packsPresent + city.maps.packsAbsent, 4, `Maps pack accounting mismatch: ${city.city}`);
  assert.ok(city.maps.exactCidReturned >= 0 && city.maps.exactCidReturned <= 4);
  assert.ok(city.maps.exactCidNumberOne >= 0 && city.maps.exactCidNumberOne <= city.maps.exactCidReturned);
  assert.ok(city.nextAction);
  assert.equal(city.publicMutationAuthorized, false);
}
