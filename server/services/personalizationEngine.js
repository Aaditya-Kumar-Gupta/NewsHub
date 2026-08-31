const db = require('../config/db');
const { scoreLocationRelevance } = require('./locationMatcher');

/**
 * Rule-based personalization engine (v1, no ML/AI).
 *
 * Score weights (sum to 1.0):
 *   Interest match     40%
 *   Location relevance 25%
 *   Recency            15%
 *   Source preference  10%
 *   Trending signal    10%
 *
 * Flow:
 *   user preferences -> candidate articles -> score articles -> sort -> return
 *
 * This depends entirely on data stored for the *specific* logged-in
 * user (their interests, followed sources, and location), so two
 * different users produce two different feeds from the same candidate pool.
 */

const WEIGHTS = {
  interest: 0.40,
  location: 0.25,
  recency: 0.15,
  source: 0.10,
  trending: 0.10
};

async function getUserContext(userId) {
  const [interestRows] = await db.query(
    `SELECT c.id, c.slug FROM user_interests ui
     JOIN categories c ON c.id = ui.category_id WHERE ui.user_id = ?`,
    [userId]
  );
  const [sourceRows] = await db.query(
    `SELECT source_id FROM user_sources WHERE user_id = ?`,
    [userId]
  );
  const [[prefs]] = await db.query(
    `SELECT up.language, up.local_news_enabled, up.breaking_news_enabled,
            l.city, l.state, l.country, l.country_code
     FROM user_preferences up
     LEFT JOIN locations l ON l.id = up.location_id
     WHERE up.user_id = ?`,
    [userId]
  );

  return {
    interestCategoryIds: new Set(interestRows.map((r) => r.id)),
    interestSlugs: new Set(interestRows.map((r) => r.slug)),
    preferredSourceIds: new Set(sourceRows.map((r) => r.source_id)),
    location: prefs
      ? { city: prefs.city, state: prefs.state, country: prefs.country, countryCode: prefs.country_code }
      : null,
    localNewsEnabled: prefs ? !!prefs.local_news_enabled : true
  };
}

function recencyScore(publishedAt) {
  if (!publishedAt) return 0.3;
  const ageHours = (Date.now() - new Date(publishedAt).getTime()) / 3600000;
  if (ageHours <= 0) return 1;
  if (ageHours >= 168) return 0.05; // older than a week -> floor
  // exponential-ish decay across a week
  return Math.max(0.05, 1 - ageHours / 168);
}

function trendingScoreNormalized(trendingScore, max) {
  if (!max || max <= 0) return 0;
  return Math.min(1, trendingScore / max);
}

/**
 * Score one candidate article for one user context.
 */
function scoreArticle(article, ctx, maxTrending) {
  // Interest match: does the article belong to any of the user's chosen categories?
  const articleCategoryIds = article.categoryIds || [];
  const interestHit = articleCategoryIds.some((id) => ctx.interestCategoryIds.has(id));
  const interestScore = ctx.interestCategoryIds.size === 0 ? 0.5 : (interestHit ? 1 : 0.1);

  // Location relevance
  const { score: locationScore } = scoreLocationRelevance(ctx.location, {
    locationTag: article.location_tag,
    countryCode: article.country_code,
    title: article.title,
    description: article.description
  });

  // Recency
  const recency = recencyScore(article.published_at);

  // Source preference
  const sourceScore = ctx.preferredSourceIds.size === 0
    ? 0.5
    : (ctx.preferredSourceIds.has(article.source_id) ? 1 : 0.2);

  // Trending signal
  const trending = trendingScoreNormalized(article.trending_score, maxTrending);

  const total =
    interestScore * WEIGHTS.interest +
    locationScore * WEIGHTS.location +
    recency * WEIGHTS.recency +
    sourceScore * WEIGHTS.source +
    trending * WEIGHTS.trending;

  return {
    total,
    breakdown: { interestScore, locationScore, recency, sourceScore, trending }
  };
}

/**
 * Build a personalized, ranked feed for a given user from articles
 * already ingested into MySQL.
 */
async function getPersonalizedFeed(userId, { limit = 30 } = {}) {
  const ctx = await getUserContext(userId);

  const [candidates] = await db.query(
    `SELECT a.*, s.name AS source_name, s.logo_url AS source_logo,
            GROUP_CONCAT(ac.category_id) AS category_ids
     FROM articles a
     LEFT JOIN sources s ON s.id = a.source_id
     LEFT JOIN article_categories ac ON ac.article_id = a.id
     WHERE a.published_at >= (NOW() - INTERVAL 14 DAY) OR a.published_at IS NULL
     GROUP BY a.id
     ORDER BY a.published_at DESC
     LIMIT 400`
  );

  const maxTrending = candidates.reduce((m, a) => Math.max(m, Number(a.trending_score) || 0), 0);

  const scored = candidates.map((a) => {
    const categoryIds = (a.category_ids || '')
      .split(',')
      .filter(Boolean)
      .map(Number);
    const { total, breakdown } = scoreArticle({ ...a, categoryIds }, ctx, maxTrending);
    return { article: a, score: total, breakdown };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => ({
    ...formatArticle(s.article),
    personalizationScore: Number(s.score.toFixed(4)),
    scoreBreakdown: s.breakdown
  }));
}

function formatArticle(a) {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    content: a.content,
    url: a.url,
    imageUrl: a.image_url,
    author: a.author,
    publishedAt: a.published_at,
    source: { id: a.source_id, name: a.source_name, logoUrl: a.source_logo },
    countryCode: a.country_code,
    locationTag: a.location_tag,
    trendingScore: Number(a.trending_score)
  };
}

module.exports = { getPersonalizedFeed, getUserContext, scoreArticle, WEIGHTS, formatArticle };
