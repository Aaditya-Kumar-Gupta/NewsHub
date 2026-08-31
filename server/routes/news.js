const express = require('express');
const db = require('../config/db');
const { getNewsProvider } = require('../services/newsProviderFactory');
const { ingestBatch } = require('../services/ingestionService');
const { getPersonalizedFeed, formatArticle } = require('../services/personalizationEngine');
const { scoreLocationRelevance } = require('../services/locationMatcher');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const provider = getNewsProvider(); // Browser never talks to this directly — only via these routes.

function safeMessage(err) {
  return err && err.message ? err.message : 'Unexpected error';
}

// ---------------------------------------------------------
// GET /api/news/headlines?category=&country=&q=
// Browser -> Express -> NewsProvider.getTopHeadlines() -> NewsAPI
// Ingests results into MySQL, then returns them.
// ---------------------------------------------------------
router.get('/headlines', async (req, res) => {
  try {
    const { category, country = 'us', q } = req.query;
    const articles = await provider.getTopHeadlines({ category, country, q, pageSize: 30 });
    await ingestBatch(articles, { categorySlug: category });
    res.json({ articles });
  } catch (err) {
    console.error('headlines error:', err);
    res.status(502).json({ error: `Could not fetch headlines: ${safeMessage(err)}` });
  }
});

// ---------------------------------------------------------
// GET /api/news/search?q=&sortBy=
// Browser -> Express -> NewsProvider.search() -> NewsAPI
// ---------------------------------------------------------
router.get('/search', async (req, res) => {
  try {
    const { q, sortBy = 'publishedAt' } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Please provide a search query (?q=).' });
    }
    const articles = await provider.search({ q, sortBy, pageSize: 30 });
    await ingestBatch(articles, {});

    // Also search anything already stored locally that matches, in case
    // the live provider call is rate-limited or partial.
    const [localMatches] = await db.query(
      `SELECT a.*, s.name AS source_name FROM articles a
       LEFT JOIN sources s ON s.id = a.source_id
       WHERE MATCH(a.title, a.description, a.content) AGAINST (? IN NATURAL LANGUAGE MODE)
       ORDER BY a.published_at DESC LIMIT 30`,
      [q]
    );

    res.json({
      articles,
      cached: localMatches.map((a) => ({ ...formatArticle(a) }))
    });
  } catch (err) {
    console.error('search error:', err);
    res.status(502).json({ error: `Search failed: ${safeMessage(err)}` });
  }
});

// ---------------------------------------------------------
// GET /api/news/sources
// Browser -> Express -> NewsProvider.getSources() -> NewsAPI
// ---------------------------------------------------------
router.get('/sources', async (req, res) => {
  try {
    const { country, category } = req.query;
    const sources = await provider.getSources({ country, category });
    res.json({ sources });
  } catch (err) {
    console.error('sources error:', err);
    res.status(502).json({ error: `Could not fetch sources: ${safeMessage(err)}` });
  }
});

// ---------------------------------------------------------
// GET /api/news/local (protected) — uses the user's stored location
// NewsProvider.getByLocation() applies the NewsAPI keyword-search
// workaround internally; this route just calls the abstraction.
// ---------------------------------------------------------
router.get('/local', requireAuth, async (req, res) => {
  try {
    const [[prefs]] = await db.query(
      `SELECT l.city, l.state, l.country, l.country_code
       FROM user_preferences up JOIN locations l ON l.id = up.location_id
       WHERE up.user_id = ?`,
      [req.session.userId]
    );

    if (!prefs) {
      return res.status(400).json({ error: 'No location set yet. Please complete onboarding or set a location in your profile.' });
    }

    const articles = await provider.getByLocation({
      city: prefs.city,
      state: prefs.state,
      country: prefs.country,
      countryCode: prefs.country_code,
      pageSize: 24
    });
    await ingestBatch(articles, { locationTag: prefs.city || prefs.state || prefs.country });

    // Rank using the reusable location matcher
    const ranked = articles
      .map((a) => ({ ...a, _rel: scoreLocationRelevance(prefs, { title: a.title, description: a.description, countryCode: a.countryCode }) }))
      .sort((a, b) => b._rel.score - a._rel.score);

    res.json({ location: prefs, articles: ranked });
  } catch (err) {
    console.error('local news error:', err);
    res.status(502).json({ error: `Could not fetch local news: ${safeMessage(err)}` });
  }
});
// ---------------------------------------------------------
// GET /api/news/personalized (protected)
// user preferences -> cached MySQL articles -> score -> return
// External news refresh happens in the background.
// ---------------------------------------------------------
// ---------------------------------------------------------
// GET /api/news/personalized (protected)
// Fast path: use MySQL immediately.
// Background path: refresh NewsAPI without blocking response.
// ---------------------------------------------------------
router.get('/personalized', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    // 1. Try the fast MySQL-based personalized feed.
    let feed = await getPersonalizedFeed(userId, {
      limit: 30
    });

    // 2. Return what we already have immediately.
    // If there are existing articles, do not make the user wait.
    if (feed.length > 0) {
      res.json({ articles: feed });

      refreshPersonalizedPool(userId).catch((err) => {
        console.error(
          'Background personalized refresh failed:',
          err.message
        );
      });

      return;
    }

    // 3. First-time/empty-cache fallback.
    // Populate a small candidate pool before responding.
    try {
      await refreshPersonalizedPool(userId);
      feed = await getPersonalizedFeed(userId, {
        limit: 30
      });
    } catch (e) {
      console.error(
        'Initial personalized refresh failed:',
        e.message
      );
    }

    res.json({ articles: feed });

  } catch (err) {
    console.error('personalized feed error:', err);

    res.status(500).json({
      error: `Could not build personalized feed: ${safeMessage(err)}`
    });
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
        const articles = await provider.getTopHeadlines({
          category: slug,
          pageSize: 10
        });

        await ingestBatch(articles, {
          categorySlug: slug
        });
      } catch (e) {
        console.error(
          `Background ingestion failed for ${slug}:`,
          e.message
        );
      }
    })
  );
}

// ---------------------------------------------------------
// GET /api/news/article/:id — article detail (from local DB) + related
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
        `INSERT INTO reading_history (user_id, article_id, reading_progress) VALUES (?, ?, 0)`,
        [req.session.userId, id]
      );
    }

    res.json({ article: { ...formatArticle(article), categories }, related });
  } catch (err) {
    console.error('article detail error:', err);
    res.status(500).json({ error: 'Could not load article.' });
  }
});

// ---------------------------------------------------------
// POST /api/news/article/:id/progress (protected) — update reading_history
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// GET /api/news/categories
// ---------------------------------------------------------
router.get('/categories', async (req, res) => {
  const [rows] = await db.query('SELECT id, name, slug FROM categories ORDER BY name');
  res.json({ categories: rows });
});

// ---------------------------------------------------------
// GET /api/news/archives?date=YYYY-MM-DD&category=
// ---------------------------------------------------------
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
