/**
 * Reusable location matching / relevance scoring.
 *
 * Given a user's chosen location (city, state, country) and an
 * article's location signal (location_tag, country_code, and free
 * text in title/description), returns a relevance tier and a 0-1
 * score used by the personalization engine's "Location relevance"
 * weight, and also used directly by the /api/news/local endpoint to
 * rank stories.
 *
 * Tiering (highest to lowest relevance), mirroring the brief's example:
 *   city match      -> 1.00
 *   state match      -> 0.75
 *   country match    -> 0.5
 *   "national" kw    -> 0.35
 *   global/no match  -> 0.15
 */

function normalize(str) {
  return (str || '').toString().trim().toLowerCase();
}

function textContains(haystack, needle) {
  if (!needle) return false;
  return normalize(haystack).includes(normalize(needle));
}

/**
 * @param {object} userLocation { city, state, country, countryCode }
 * @param {object} article { locationTag, countryCode, title, description }
 * @returns {{ tier: string, score: number }}
 */
function scoreLocationRelevance(userLocation = {}, article = {}) {
  if (!userLocation || (!userLocation.city && !userLocation.state && !userLocation.country)) {
    return { tier: 'unknown', score: 0.2 };
  }

  const haystack = `${article.locationTag || ''} ${article.title || ''} ${article.description || ''}`;

  if (userLocation.city && textContains(haystack, userLocation.city)) {
    return { tier: 'city', score: 1.0 };
  }
  if (userLocation.state && textContains(haystack, userLocation.state)) {
    return { tier: 'state', score: 0.75 };
  }
  if (
    (userLocation.countryCode && normalize(article.countryCode) === normalize(userLocation.countryCode)) ||
    (userLocation.country && textContains(haystack, userLocation.country))
  ) {
    return { tier: 'country', score: 0.5 };
  }
  if (textContains(haystack, 'national')) {
    return { tier: 'national', score: 0.35 };
  }
  return { tier: 'global', score: 0.15 };
}

module.exports = { scoreLocationRelevance };
