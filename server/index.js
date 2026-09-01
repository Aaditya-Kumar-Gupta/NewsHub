require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const db = require('./config/db');
const authRoutes = require('./routes/auth');
const onboardingRoutes = require('./routes/onboarding');
const newsRoutes = require('./routes/news');
const userRoutes = require('./routes/user');

const app = express();
// app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

app.use(express.json());

const sessionStore = new MySQLStore({}, db);

app.use(session({
  key: 'newshub.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
  maxAge: 1000 * 60 * 60 * 24 * 14,
  httpOnly: true,
  sameSite: 'lax',
  // secure: process.env.NODE_ENV === 'production'
}
}));

// ---- API routes ----
app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/user', userRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---- Static frontend ----
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'pages', '404.html'), (err) => {
    if (err) res.status(404).send('Not found');
  });
});

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// app.listen(PORT, '0.0.0.0', () => {
//   console.log(`NewsHub server running on port ${PORT}`);
// });
app.listen(PORT, () => {
  console.log(`NewsHub server running at http://localhost:${PORT}`);
});