const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    onboardingCompleted: !!row.onboarding_completed,
    createdAt: row.created_at
  };
}

// ---------------------------------------------------------
// POST /api/auth/signup
// ---------------------------------------------------------
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length) {
      return res.status(409).json({ error: 'An account with this email already exists. Try signing in instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name.trim(), normalizedEmail, passwordHash]
    );

    await db.query('INSERT INTO user_preferences (user_id) VALUES (?)', [result.insertId]);

    const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);

    req.session.userId = user.id;
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong while creating your account. Please try again.' });
  }
});

// ---------------------------------------------------------
// POST /api/auth/signin
// ---------------------------------------------------------
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'Something went wrong while signing you in. Please try again.' });
  }
});

// ---------------------------------------------------------
// POST /api/auth/signout
// ---------------------------------------------------------
router.post('/signout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not sign out. Please try again.' });
    res.clearCookie('newshub.sid');
    res.json({ ok: true });
  });
});

// ---------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------
router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(200).json({ user: null });
  }
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.session.userId]);
  if (!rows.length) {
    return res.status(200).json({ user: null });
  }
  res.json({ user: publicUser(rows[0]) });
});

// ---------------------------------------------------------
// POST /api/auth/change-password (protected)
// ---------------------------------------------------------
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    const user = rows[0];
    const valid = await bcrypt.compare(currentPassword || '', user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    const newHash = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Could not update password.' });
  }
});

// ---------------------------------------------------------
// DELETE /api/auth/account (protected)
// ---------------------------------------------------------
router.delete('/account', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = ?', [req.session.userId]);
    req.session.destroy(() => {
      res.clearCookie('newshub.sid');
      res.json({ ok: true });
    });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Could not delete account.' });
  }
});

module.exports = router;
