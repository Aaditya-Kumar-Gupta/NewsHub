const express = require('express');
const db = require('../config/db');
const { getNewsProvider } = require('../services/newsProviderFactory');
const { ingestBatch } = require('../services/ingestionService');
const { getPersonalizedFeed, formatArticle } = require('../services/personalizationEngine');
const { scoreLocationRelevance } = require('../services/locationMatcher');
const apiCache = require('../services/apiCache');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const provider = getNewsProvider();

const CACHE_TTL = {
  headlines: 5 * 60,
  search: 2 * 60,
  sources: 60 * 60,
  location: 10 * 60
};

function safeMessage(err) {
  return err && err.message ? err.message : 'Unexpected error';
}

async function getCachedOrFetch(namespace, params, ttlSeconds, fetcher) {
  const cached = await apiCache.get(namespace, params);
  if (cached) return { value: cached, cached: true };

  const value = await fetcher();
  await apiCache.set(namespace, params, value, ttlSeconds);
  return { value, cached: false };
}

// ---------------------------------------------------------
// GET /api/news/headlines
// Uses persistent cache first to avoid repeated NewsProvider calls.
// ---------------------------------------------------------
router.get('/headlines', async (req, res) => {
  try {
    const { category, country = 'us', q } = req.query;
    const params = { category, country, q, pageSize: 30 };

    const result = await getCachedOrFetch(
      'headlines',
      params,
      CACHE_TTL.headlines,
      () => provider.getTopHeadlines(params)
    );

    // Only ingest fresh provider responses. Cached responses were already
    // ingested when first fetched.
    if (!result.cached) {
      await ingestBatch(result.value, { categorySlug: category });
    }

    res.set('X-NewsHub-Cache', result.cached ? 'HIT' : 'MISS');
    res.json({ articles: result.value });
  } catch (err) {
    console.error('headlines error:', err);
    res.status(502).json({ error: `Could not fetch headlines: ${safeMessage(err)}` });
  }
});

// ---------------------------------------------------------
// GET /api/news/search
// Short cache because search results change frequently.
// ---------------------------------------------------------
router.get('/search', async (req, res) => {
  try {
    const { q, sortBy = 'publishedAt' } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Please provide a search query (?q=).' });
    }

    const params = { q: q.trim(), sortBy, pageSize: 30 };
    const result = await getCachedOrFetch(
      'search',
      params,
      CACHE_TTL.search,
      () => provider.search(params)
    );

    if (!result.cached) await ingestBatch(result.value, {});

    const [localMatches] = await db.query(
      `SELECT a.*, s.name AS source_name FROM articles a
       LEFT JOIN sources s ON s.id = a.source_id
       WHERE MATCH(a.title, a.description, a.content) AGAINST (? IN NATURAL LANGUAGE MODE)
       ORDER BY a.published_at DESC LIMIT 30`,
      [params.q]
    );

    res.set('X-NewsHub-Cache', result.cached ? 'HIT' : 'MISS');
    res.json({
      articles: result.value,
      cached: localMatches.map((a) => formatArticle(a))
    });
  } catch (err) {
    console.error('search error:', err);
    res.status(502).json({ error: `Search failed: ${safeMessage(err)}` });
  }
});

// ---------------------------------------------------------
// GET /api/news/sources
// Sources change slowly, so cache for one hour.
// ---------------------------------------------------------
router.get('/sources', async (req, res) => {
  try {
    const { country, category } = req.query;
    const params = { country, category };

    const result = await getCachedOrFetch(
      'sources',
      params,
      CACHE_TTL.sources,
      () => provider.getSources(params)
    );

    res.set('X-NewsHub-Cache', result.cached ? 'HIT' : 'MISS');
    res.json({ sources: result.value });
  } catch (err) {
    console.error('sources error:', err);
    res.status(502).json({ error: `Could not fetch sources: ${safeMessage(err)}` });
  }
});

// ---------------------------------------------------------
// Local-news helpers
// ---------------------------------------------------------
async function getUserLocation(userId) {
  const [[prefs]] = await db.query(
    `SELECT l.city, l.state, l.country, l.country_code
     FROM user_preferences up
     JOIN locations l ON l.id = up.location_id
     WHERE up.user_id = ?`,
    [userId]
  );
  return prefs || null;
}

async function getCachedLocalArticles(prefs, limit = 24) {
  const locationTags = [...new Set([prefs.city, prefs.state, prefs.country].filter(Boolean))];
  if (!locationTags.length) return [];

  const [rows] = await db.query(
    `SELECT a.*, s.name AS source_name, s.logo_url AS source_logo
     FROM articles a
     LEFT JOIN sources s ON s.id = a.source_id
     WHERE a.location_tag IN (?)
       AND (a.published_at >= (NOW() - INTERVAL 7 DAY) OR a.published_at IS NULL)
     ORDER BY a.published_at DESC
     LIMIT ?`,
    [locationTags, limit]
  );
  return rows;
}

function rankLocalArticles(rows, prefs) {
  return rows
    .map((row) => {
      const article = formatArticle(row);
      const relevance = scoreLocationRelevance(prefs, {
        locationTag: row.location_tag,
        countryCode: row.country_code,
        title: row.title,
        description: row.description
      });
      return { ...article, _rel: relevance };
    })
    .sort((a, b) => b._rel.score - a._rel.score);
}

async function refreshLocalPool(prefs) {
  const params = {
    city: prefs.city,
    state: prefs.state,
    country: prefs.country,
    countryCode: prefs.country_code,
    pageSize: 24
  };

  const result = await getCachedOrFetch(
    'location',
    params,
    CACHE_TTL.location,
    () => provider.getByLocation(params)
  );

  if (!result.cached && result.value.length) {
    await ingestBatch(result.value, {
      locationTag: prefs.city || prefs.state || prefs.country
    });
  }

  return result;
}

// ---------------------------------------------------------
// GET /api/news/local
// ---------------------------------------------------------
router.get('/local', requireAuth, async (req, res) => {
  try {
    const prefs = await getUserLocation(req.session.userId);
    if (!prefs) {
      return res.status(400).json({
        error: 'No location set yet. Please complete onboarding or set a location in your profile.'
      });
    }

    const cachedRows = await getCachedLocalArticles(prefs);

    if (cachedRows.length > 0) {
      res.json({ location: prefs, articles: rankLocalArticles(cachedRows, prefs) });
      setImmediate(() => {
        refreshLocalPool(prefs).catch((err) => console.error('Background local refresh failed:', err.message));
      });
      return;
    }

    await refreshLocalPool(prefs);
    const freshRows = await getCachedLocalArticles(prefs);
    res.json({ location: prefs, articles: rankLocalArticles(freshRows, prefs) });
  } catch (err) {
    console.error('local news error:', err);
    res.status(502).json({ error: `Could not fetch local news: ${safeMessage(err)}` });
  }
});

// ---------------------------------------------------------
// GET /api/news/personalized
// ---------------------------------------------------------
router.get('/personalized', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    let feed = await getPersonalizedFeed(userId, { limit: 30 });

    if (feed.length > 0) {
      res.json({ articles: feed });
      refreshPersonalizedPool(userId).catch((err) => {
        console.error('Background personalized refresh failed:', err.message);
      });
      return;
    }

    try {
      await refreshPersonalizedPool(userId);
      feed = await getPersonalizedFeed(userId, { limit: 30 });
    } catch (e) {
      console.error('Initial personalized refresh failed:', e.message);
    }

    res.json({ articles: feed });
  } catch (err) {
    console.error('personalized feed error:', err);
    res.status(500).json({ error: `Could not build personalized feed: ${safeMessage(err)}` });
  }
});

async function refreshPersonalizedPool(userId) {
  const [interestRows] = await db.query(
    `SELECT c.slug
     FROM user_interests ui
     JOIN categories c ON c.id = ui.category_id
     WHERE ui.user_id = ?`,
    [userId]
  );

  await Promise.all(
    interestRows.slice(0, 3).map(async ({ slug }) => {
      try {
        const params = { category: slug, pageSize: 10 };
        const result = await getCachedOrFetch(
          'personalized-headlines',
          params,
          CACHE_TTL.headlines,
          () => provider.getTopHeadlines(params)
        );

        if (!result.cached) {
          await ingestBatch(result.value, { categorySlug: slug });
        }
      } catch (e) {
        console.error(`Background ingestion failed for ${slug}:`, e.message);
      }
    })
  );
}

// ---------------------------------------------------------
// GET /api/news/article/:id
// ---------------------------------------------------------
router.get('/article/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[article]] = await db.query(
      `SELECT a.*, s.name AS source_name, s.logo_url AS source_logo
       FROM articles a LEFT JOIN sources s ON s.id = a.source_id WHERE a.id = ?`,
      [id]
    );
    if (!article) return res.status(404).json({ error: 'Article not found.' });

    const [categories] = await db.query(
      `SELECT c.id, c.name, c.slug FROM article_categories ac
       JOIN categories c ON c.id = ac.category_id WHERE ac.article_id = ?`,
      [id]
    );

    let related = [];
    if (categories.length) {
      const [rel] = await db.query(
        `SELECT DISTINCT a.id, a.title, a.image_url, a.published_at, s.name AS source_name
         FROM articles a
         JOIN article_categories ac ON ac.article_id = a.id
         LEFT JOIN sources s ON s.id = a.source_id
         WHERE ac.category_id IN (?) AND a.id != ?
         ORDER BY a.published_at DESC LIMIT 4`,
        [categories.map((c) => c.id), id]
      );
      related = rel;
    }

    if (req.session && req.session.userId) {
      await db.query(
        'INSERT INTO reading_history (user_id, article_id, reading_progress) VALUES (?, ?, 0)',
        [req.session.userId, id]
      );
    }

    res.json({ article: { ...formatArticle(article), categories }, related });
  } catch (err) {
    console.error('article detail error:', err);
    res.status(500).json({ error: 'Could not load article.' });
  }
});

router.post('/article/:id/progress', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const progress = Math.max(0, Math.min(100, Number(req.body.progress) || 0));
  await db.query(
    `UPDATE reading_history SET reading_progress = ?
     WHERE user_id = ? AND article_id = ?
     ORDER BY read_at DESC LIMIT 1`,
    [progress, req.session.userId, id]
  );
  res.json({ ok: true });
});

router.get('/categories', async (req, res) => {
  const [rows] = await db.query('SELECT id, name, slug FROM categories ORDER BY name');
  res.json({ categories: rows });
});

router.get('/archives', async (req, res) => {
  const { date, category, page = 1 } = req.query;
  const limit = 20;
  const offset = (Number(page) - 1) * limit;
  let sql = `SELECT a.id, a.title, a.description, a.image_url, a.published_at, s.name AS source_name
             FROM articles a LEFT JOIN sources s ON s.id = a.source_id`;
  const params = [];
  const clauses = [];

  if (date) {
    clauses.push('DATE(a.published_at) = ?');
    params.push(date);
  }
  if (category) {
    sql += ' JOIN article_categories ac ON ac.article_id = a.id JOIN categories c ON c.id = ac.category_id';
    clauses.push('c.slug = ?');
    params.push(category);
  }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY a.published_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await db.query(sql, params);
  res.json({ articles: rows });
});

module.exports = router;
