const express = require('express');
const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// GET /api/onboarding/categories — list all selectable interest categories
router.get('/categories', async (req, res) => {
  const [rows] = await db.query('SELECT id, name, slug FROM categories ORDER BY name');
  res.json({ categories: rows });
});

// POST /api/onboarding/interests (protected) — { categoryIds: [1,2,3] }
router.post('/interests', requireAuth, async (req, res) => {
  const { categoryIds } = req.body || {};
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    return res.status(400).json({ error: 'Please select at least one topic of interest.' });
  }
  const userId = req.session.userId;
  await db.query('DELETE FROM user_interests WHERE user_id = ?', [userId]);
  const values = categoryIds.map((cid) => [userId, cid]);
  await db.query('INSERT INTO user_interests (user_id, category_id) VALUES ?', [values]);
  res.json({ ok: true });
});

// POST /api/onboarding/location (protected)
// { country, countryCode, state, city, latitude, longitude, useCurrentLocation }
router.post('/location', requireAuth, async (req, res) => {
  try {
    const { country, countryCode, state, city, latitude, longitude } = req.body || {};
    if (!country || !countryCode) {
      return res.status(400).json({ error: 'Country is required.' });
    }

    // Snap coordinates to city-level precision (2 decimals ~ 1.1km) —
    // we intentionally avoid storing exact device GPS coordinates.
    const roundedLat = latitude !== undefined && latitude !== null ? Math.round(latitude * 100) / 100 : null;
    const roundedLng = longitude !== undefined && longitude !== null ? Math.round(longitude * 100) / 100 : null;

    const [existing] = await db.query(
      'SELECT id FROM locations WHERE country_code = ? AND state <=> ? AND city <=> ?',
      [countryCode.toUpperCase(), state || null, city || null]
    );

    let locationId;
    if (existing.length) {
      locationId = existing[0].id;
    } else {
      const [result] = await db.query(
        `INSERT INTO locations (country, country_code, state, city, latitude, longitude)
         VALUES (?,?,?,?,?,?)`,
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
  } catch (err) {
    console.error('Onboarding location error:', err);
    res.status(500).json({ error: 'Could not save location.' });
  }
});

// POST /api/onboarding/complete (protected) — "Build My NewsHub"
router.post('/complete', requireAuth, async (req, res) => {
  await db.query('UPDATE users SET onboarding_completed = 1 WHERE id = ?', [req.session.userId]);
  res.json({ ok: true });
});

module.exports = router;
