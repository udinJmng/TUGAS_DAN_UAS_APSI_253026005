const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const db      = require('../db');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required.' });
  next();
}

router.get('/:id', async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, first_name, last_name, username, bio, avatar_url, role,
              followers_count, following_count, created_at
       FROM users WHERE id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.put('/me', requireLogin, async (req, res) => {
  try {
    const { first_name, last_name, username, bio, avatar_url,
            old_password, new_password } = req.body;
    const userId = req.session.user.id;

    await db.query(
      `UPDATE users SET first_name = ?, last_name = ?, username = ?,
       bio = ?, avatar_url = ? WHERE id = ?`,
      [first_name, last_name, username, bio || null, avatar_url || null, userId]
    );

    if (old_password && new_password) {
      const rows = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
      const match = await bcrypt.compare(old_password, rows[0].password);
      if (!match) return res.status(400).json({ error: 'Old password is incorrect.' });
      const hash = await bcrypt.hash(new_password, 10);
      await db.query('UPDATE users SET password = ? WHERE id = ?', [hash, userId]);
    }

    req.session.user.username = username;
    res.json({ message: 'Profile updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/:id/songs', async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT s.*, u.username AS artist_username,
              (SELECT COUNT(*) FROM likes WHERE song_id = s.id) AS likes_count,
              (SELECT COUNT(*) FROM reposts WHERE song_id = s.id) AS reposts_count,
              (SELECT COUNT(*) FROM comments WHERE song_id = s.id AND is_deleted = 0) AS comments_count
       FROM songs s
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ? AND s.is_deleted = 0
       ORDER BY s.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
