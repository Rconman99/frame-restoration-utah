/**
 * Budget allocator — turns scored cities into $/month + % allocations.
 *
 * Two-pass allocation:
 *   1. Allocate share-of-budget across cities by total city score weight
 *      (cities with stronger fundamentals get more $)
 *   2. Within each city's allocation, split by channel scores, respecting
 *      channel minimums (a channel below floor gets $0; rest re-share)
 *
 * Returns: { byCity: [{ city, monthlyAllocation, perChannel: [...] }], totals: {...} }
 */

export function allocateBudget({ scoredCities, totalMonthlyBudget, channels, skipChannels = [] }) {
  // ── Pass 1: per-city allocation ──────────────────────────────────────
  // Sum each city's top-3 channel scores as its "city weight" (ignores
  // channels we're skipping for this budget tier).
  const cityWeights = scoredCities.map(({ city, scores }) => {
    const eligibleScores = Object.entries(scores)
      .filter(([id]) => !skipChannels.includes(id))
      .map(([, info]) => info.score)
      .sort((a, b) => b - a)
      .slice(0, 3); // top 3 channels carry the city's weight signal
    const weight = eligibleScores.reduce((a, b) => a + b, 0);
    return { city, scores, weight };
  });

  const totalWeight = cityWeights.reduce((a, c) => a + c.weight, 0);

  const byCity = cityWeights.map(({ city, scores, weight }) => {
    const cityShare = totalWeight > 0 ? weight / totalWeight : 1 / cityWeights.length;
    const cityAllocation = Math.round(totalMonthlyBudget * cityShare);

    // ── Pass 2: per-channel allocation within the city's $ pool ───────
    const eligibleChannels = channels.filter((c) => !skipChannels.includes(c.id));
    const eligibleScored = eligibleChannels.map((channel) => ({
      channel,
      info: scores[channel.id] || { score: 0, gated: 'missing' },
    }));

    // Filter to channels whose floor fits AND scored > 0
    const affordable = eligibleScored
      .filter(({ channel }) => channel.minMonthlyBudget <= cityAllocation)
      .filter(({ info }) => info.score > 0)
      .sort((a, b) => b.info.score - a.info.score);

    // Greedy fill: walk top-scored channels, reserve each one's floor,
    // then distribute remaining by score share. Cap at top 4 channels
    // per city so $ isn't fragmented across too many small allocations.
    let perChannel = [];
    const candidates = affordable.slice(0, 4);

    if (candidates.length === 0) {
      // No channel meets its own floor — give the full city budget to the
      // best-scoring eligible channel anyway (flagged as below-floor).
      const fallback = eligibleScored
        .filter(({ info }) => info.score > 0)
        .sort((a, b) => b.info.score - a.info.score)[0];
      if (fallback) {
        perChannel.push({
          channelId: fallback.channel.id,
          channelName: fallback.channel.name,
          score: fallback.info.score,
          share: 1,
          dollars: cityAllocation,
          belowFloor: true,
          estimatedCpl: fallback.channel.estimatedCpl,
        });
      }
    } else {
      // Greedy fill: walk top-scored channels in order, only include
      // channel if its floor still fits in remaining budget. Stop when
      // we run out of room. Then distribute remainder by score share
      // among the included channels.
      const accepted = [];
      let reserved = 0;
      for (const cand of candidates) {
        if (reserved + cand.channel.minMonthlyBudget <= cityAllocation) {
          accepted.push(cand);
          reserved += cand.channel.minMonthlyBudget;
        }
      }

      const remainder = Math.max(0, cityAllocation - reserved);
      const totalScore = accepted.reduce((a, c) => a + c.info.score, 0);

      perChannel = accepted.map(({ channel, info }) => {
        const floor = channel.minMonthlyBudget;
        const extraShare = totalScore > 0 ? info.score / totalScore : 1 / accepted.length;
        const extra = Math.round(remainder * extraShare);
        const dollars = floor + extra;
        return {
          channelId: channel.id,
          channelName: channel.name,
          score: info.score,
          share: dollars / cityAllocation,
          dollars,
          belowFloor: false,
          estimatedCpl: channel.estimatedCpl,
        };
      });
    }

    perChannel.sort((a, b) => b.dollars - a.dollars);

    return {
      city,
      monthlyAllocation: cityAllocation,
      cityShare,
      cityWeight: weight,
      perChannel,
    };
  });

  // Totals + rollups
  const channelTotals = {};
  for (const { perChannel } of byCity) {
    for (const c of perChannel) {
      channelTotals[c.channelId] = (channelTotals[c.channelId] || 0) + c.dollars;
    }
  }

  return {
    byCity,
    totals: {
      monthlyBudget: totalMonthlyBudget,
      perChannel: channelTotals,
      cityCount: byCity.length,
    },
  };
}

/**
 * Storm override: lift LSA + Search by N% in active-storm cities; pull
 * from SEO content (which compounds — short pause is fine).
 */
export function applyStormOverride(allocation, stormCities, lift = 0.30) {
  return {
    ...allocation,
    byCity: allocation.byCity.map((city) => {
      if (!stormCities.includes(city.city.id)) return city;
      let extraDollars = 0;
      const adjusted = city.perChannel.map((c) => {
        if (c.channelId === 'seoContent') {
          const pull = Math.round(c.dollars * lift);
          extraDollars += pull;
          return { ...c, dollars: c.dollars - pull };
        }
        return c;
      });
      // Distribute extra to LSA + Search (60/40 split)
      let lsaIdx = adjusted.findIndex((c) => c.channelId === 'googleLSA');
      let searchIdx = adjusted.findIndex((c) => c.channelId === 'googleSearch');
      if (lsaIdx >= 0) adjusted[lsaIdx] = { ...adjusted[lsaIdx], dollars: adjusted[lsaIdx].dollars + Math.round(extraDollars * 0.6) };
      if (searchIdx >= 0) adjusted[searchIdx] = { ...adjusted[searchIdx], dollars: adjusted[searchIdx].dollars + Math.round(extraDollars * 0.4) };
      adjusted.sort((a, b) => b.dollars - a.dollars);
      return { ...city, perChannel: adjusted, stormOverrideApplied: true };
    }),
  };
}
