/**
 * Market intel scoring — turns 6 input factors per (city, channel) into
 * a 0-100 score. Pure functions, no external API calls.
 *
 * Inputs per city: { demoFit, searchVolume, paidDensity, organicSat,
 *                    season, budgetFloor }, each on 0-1 scale.
 * Weights: from channels/<vertical>.json factorWeights (sum to 1.0).
 * Channel sensitivity: how each factor bends each channel's score.
 *
 * The +/- sign on sensitivity matters:
 *   positive = factor helps this channel (e.g. searchVolume helps Search)
 *   negative = factor hurts this channel (e.g. organicSat hurts SEO —
 *              if competitors already own SERP, SEO breakeven slips)
 *
 * Final score: sum(factorValue * channelSensitivity * factorWeight) * 100,
 * clamped 0-100. Channels below their minMonthlyBudget get score 0.
 */

export function scoreCityChannel({ city, channel, factors, weights }) {
  // Hard gate: below budget floor → 0
  if (city.monthlyBudget < channel.minMonthlyBudget) {
    return { score: 0, gated: 'belowBudgetFloor', factorContributions: {} };
  }

  let total = 0;
  const contributions = {};
  for (const [factor, weight] of Object.entries(weights)) {
    const factorValue = factors[factor] ?? 0; // 0-1
    const sensitivity = channel.sensitivity[factor] ?? 0;
    const contribution = factorValue * sensitivity * weight;
    contributions[factor] = Math.round(contribution * 100) / 100;
    total += contribution;
  }

  // Map raw total to 0-100. Without bias, neutral factors score 50; positive
  // sensitivities push above, negatives below. We shift + scale.
  const score = Math.round(Math.max(0, Math.min(100, 50 + total * 50)));
  return { score, gated: null, factorContributions: contributions };
}

/**
 * Score every (city, channel) pair. Returns a 2D matrix:
 *   [{ city, scores: { channelId: { score, factorContributions } } }, ...]
 */
export function scoreAllCities({ cities, channels, weights }) {
  return cities.map((city) => {
    const scores = {};
    for (const channel of channels) {
      scores[channel.id] = scoreCityChannel({
        city,
        channel,
        factors: city.factors,
        weights,
      });
    }
    return { city, scores };
  });
}

/**
 * Apply seasonality multiplier to all channels for a given city.
 * Used for storm-month overrides in DFW (CPC swings 2-3x March-June).
 */
export function applySeasonalityOverride(scoredCities, multipliers) {
  return scoredCities.map(({ city, scores }) => {
    const cityMultiplier = multipliers[city.id] ?? 1.0;
    if (cityMultiplier === 1.0) return { city, scores };
    const adjusted = {};
    for (const [channelId, info] of Object.entries(scores)) {
      const channelSensitivityToSeason = info.factorContributions?.season ?? 0;
      const lift = channelSensitivityToSeason > 0 ? cityMultiplier : 1.0;
      adjusted[channelId] = {
        ...info,
        score: Math.round(Math.min(100, info.score * lift)),
      };
    }
    return { city, scores: adjusted };
  });
}

/**
 * Identify which budget tier a project falls into.
 * Returns { tier: 'starter'|'growth'|'scale', skipChannels: [...] }
 */
export function classifyBudget(monthlyBudget, tiers) {
  for (const [tierName, tier] of Object.entries(tiers)) {
    if (monthlyBudget >= tier.min && (tier.max === null || monthlyBudget < tier.max)) {
      return { tier: tierName, skipChannels: tier.skipChannels };
    }
  }
  return { tier: 'starter', skipChannels: [] };
}
