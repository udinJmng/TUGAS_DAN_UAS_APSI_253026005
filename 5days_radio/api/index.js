require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

// ─── Core middleware ───────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev_secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// ─── CORS (Vite dev server on :5173) ──────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',   // vite preview
  'http://127.0.0.1:5173',
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Static uploads ────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/users',  require('./routes/users'));
app.use('/api/songs',  require('./routes/songs'));
app.use('/api',        require('./routes/interactions'));
app.use('/api/admin',  require('./routes/admin'));

app.get('/api/ping', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ─── 404 / error handlers ──────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Server error.' });
});

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () =>
  console.log(`5Days Radio API  →  http://localhost:${PORT}`)
);
