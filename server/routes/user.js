const express = require('express');
const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { formatArticle } = require('../services/personalizationEngine');

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------
// GET /api/user/profile — full profile summary for the settings page
// ---------------------------------------------------------
router.get('/profile', async (req, res) => {
  const userId = req.session.userId;

  const [[user]] = await db.query('SELECT id, name, email, created_at FROM users WHERE id = ?', [userId]);
  const [[prefs]] = await db.query(
    `SELECT up.language, up.local_news_enabled, up.breaking_news_enabled, up.theme,
            l.id AS location_id, l.city, l.state, l.country, l.country_code
     FROM user_preferences up LEFT JOIN locations l ON l.id = up.location_id
     WHERE up.user_id = ?`,
    [userId]
  );
  const [interests] = await db.query(
    `SELECT c.id, c.name, c.slug FROM user_interests ui JOIN categories c ON c.id = ui.category_id WHERE ui.user_id = ?`,
    [userId]
  );
  const [sources] = await db.query(
    `SELECT s.id, s.name FROM user_sources us JOIN sources s ON s.id = us.source_id WHERE us.user_id = ?`,
    [userId]
  );
  const [[savedCount]] = await db.query('SELECT COUNT(*) AS n FROM saved_articles WHERE user_id = ?', [userId]);
  const [[historyCount]] = await db.query('SELECT COUNT(*) AS n FROM reading_history WHERE user_id = ?', [userId]);

  res.json({
    user,
    preferences: prefs || {},
    interests,
    sources,
    stats: { saved: savedCount.n, articlesRead: historyCount.n }
  });
});

// ---------------------------------------------------------
// PATCH /api/user/preferences — theme, language, toggles
// ---------------------------------------------------------
router.patch('/preferences', async (req, res) => {
  const { theme, language, localNewsEnabled, breakingNewsEnabled } = req.body || {};
  const fields = [];
  const params = [];
  if (theme) { fields.push('theme = ?'); params.push(theme); }
  if (language) { fields.push('language = ?'); params.push(language); }
  if (localNewsEnabled !== undefined) { fields.push('local_news_enabled = ?'); params.push(localNewsEnabled ? 1 : 0); }
  if (breakingNewsEnabled !== undefined) { fields.push('breaking_news_enabled = ?'); params.push(breakingNewsEnabled ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: 'No preference fields provided.' });

  params.push(req.session.userId);
  await db.query(`UPDATE user_preferences SET ${fields.join(', ')} WHERE user_id = ?`, params);
  res.json({ ok: true });
});

// ---------------------------------------------------------
// PUT /api/user/interests — { categoryIds: [] }
// ---------------------------------------------------------
router.put('/interests', async (req, res) => {
  const { categoryIds } = req.body || {};
  if (!Array.isArray(categoryIds)) return res.status(400).json({ error: 'categoryIds must be an array.' });
  const userId = req.session.userId;
  await db.query('DELETE FROM user_interests WHERE user_id = ?', [userId]);
  if (categoryIds.length) {
    await db.query('INSERT INTO user_interests (user_id, category_id) VALUES ?', [categoryIds.map((c) => [userId, c])]);
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------
// POST /api/user/sources/:sourceId  — follow a source
// DELETE /api/user/sources/:sourceId — unfollow
// ---------------------------------------------------------
router.post('/sources/:sourceId', async (req, res) => {
  await db.query('INSERT IGNORE INTO user_sources (user_id, source_id) VALUES (?, ?)', [req.session.userId, req.params.sourceId]);
  res.json({ ok: true });
});
router.delete('/sources/:sourceId', async (req, res) => {
  await db.query('DELETE FROM user_sources WHERE user_id = ? AND source_id = ?', [req.session.userId, req.params.sourceId]);
  res.json({ ok: true });
});

// ---------------------------------------------------------
// PUT /api/user/location
// ---------------------------------------------------------
router.put('/location', async (req, res) => {
  const { country, countryCode, state, city, latitude, longitude } = req.body || {};
  if (!country || !countryCode) return res.status(400).json({ error: 'Country is required.' });

  const roundedLat = latitude != null ? Math.round(latitude * 100) / 100 : null;
  const roundedLng = longitude != null ? Math.round(longitude * 100) / 100 : null;

  const [existing] = await db.query(
    'SELECT id FROM locations WHERE country_code = ? AND state <=> ? AND city <=> ?',
    [countryCode.toUpperCase(), state || null, city || null]
  );
  let locationId;
  if (existing.length) {
    locationId = existing[0].id;
  } else {
    const [result] = await db.query(
      'INSERT INTO locations (country, country_code, state, city, latitude, longitude) VALUES (?,?,?,?,?,?)',
      [country, countryCode.toUpperCase(), state || null, city || null, roundedLat, roundedLng]
    );
    locationId = result.insertId;
  }
  await db.query(
    `INSERT INTO user_preferences (user_id, location_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE location_id = VALUES(location_id)`,
    [req.session.userId, locationId]
  );
  res.json({ ok: true, locationId });
});

// ---------------------------------------------------------
// Saved articles
// ---------------------------------------------------------
router.get('/saved', async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.*, s.name AS source_name, sa.saved_at
     FROM saved_articles sa
     JOIN articles a ON a.id = sa.article_id
     LEFT JOIN sources s ON s.id = a.source_id
     WHERE sa.user_id = ? ORDER BY sa.saved_at DESC`,
    [req.session.userId]
  );
  res.json({ articles: rows.map((a) => ({ ...formatArticle(a), savedAt: a.saved_at })) });
});

router.post('/saved/:articleId', async (req, res) => {
  await db.query('INSERT IGNORE INTO saved_articles (user_id, article_id) VALUES (?, ?)', [req.session.userId, req.params.articleId]);
  res.json({ ok: true });
});

router.delete('/saved/:articleId', async (req, res) => {
  await db.query('DELETE FROM saved_articles WHERE user_id = ? AND article_id = ?', [req.session.userId, req.params.articleId]);
  res.json({ ok: true });
});

// ---------------------------------------------------------
// Reading history
// ---------------------------------------------------------
router.get('/history', async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.id, a.title, a.image_url, a.published_at, s.name AS source_name, rh.read_at, rh.reading_progress
     FROM reading_history rh
     JOIN articles a ON a.id = rh.article_id
     LEFT JOIN sources s ON s.id = a.source_id
     WHERE rh.user_id = ? ORDER BY rh.read_at DESC LIMIT 100`,
    [req.session.userId]
  );
  res.json({ history: rows });
});

router.delete('/history', async (req, res) => {
  await db.query('DELETE FROM reading_history WHERE user_id = ?', [req.session.userId]);
  res.json({ ok: true });
});

module.exports = router;
