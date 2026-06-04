const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const db      = require('../db');

router.post('/register', async (req, res) => {
  try {
    const { first_name, last_name, username, email, password } = req.body;

    if (!first_name || !last_name || !username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    // cek duplikat
    const existing = await db.query(
      'SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1',
      [email, username]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Email or username already taken.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (first_name, last_name, username, email, password, role)
       VALUES (?, ?, ?, ?, ?, 'user')`,
      [first_name, last_name, username, email, hash]
    );

    const user = {
      id: result.insertId,
      username,
      email,
      role: 'user',
    };

    req.session.user = user;
    res.status(201).json({ message: 'Account created.', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const rows = await db.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = rows[0];
    if (user.is_banned) {
      return res.status(403).json({ error: 'Your account has been banned.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const sessionUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
    req.session.user = sessionUser;

    res.json({ message: 'Login successful.', user: sessionUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out.' });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  res.json({ user: req.session.user });
});

module.exports = router;
