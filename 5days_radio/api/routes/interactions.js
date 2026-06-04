const express = require('express');
const router  = express.Router();
const db      = require('../db');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required.' });
  next();
}

router.post('/songs/:id/like', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const songId = req.params.id;

    const existing = await db.query(
      'SELECT id FROM likes WHERE user_id = ? AND song_id = ? LIMIT 1',
      [userId, songId]
    );

    if (existing.length) {
      await db.query('DELETE FROM likes WHERE user_id = ? AND song_id = ?', [userId, songId]);
      const [{ total }] = await db.query('SELECT COUNT(*) AS total FROM likes WHERE song_id = ?', [songId]);
      return res.json({ liked: false, likes_count: total });
    }

    await db.query('INSERT INTO likes (user_id, song_id) VALUES (?, ?)', [userId, songId]);
    const [{ total }] = await db.query('SELECT COUNT(*) AS total FROM likes WHERE song_id = ?', [songId]);
    res.json({ liked: true, likes_count: total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/songs/:id/likes', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const existing = await db.query(
      'SELECT id FROM likes WHERE user_id = ? AND song_id = ? LIMIT 1',
      [userId, req.params.id]
    );
    const [{ total }] = await db.query(
      'SELECT COUNT(*) AS total FROM likes WHERE song_id = ?',
      [req.params.id]
    );
    res.json({ liked: existing.length > 0, likes_count: total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/songs/:id/repost', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const songId = req.params.id;

    const existing = await db.query(
      'SELECT id FROM reposts WHERE user_id = ? AND song_id = ? LIMIT 1',
      [userId, songId]
    );

    if (existing.length) {
      await db.query('DELETE FROM reposts WHERE user_id = ? AND song_id = ?', [userId, songId]);
      const [{ total }] = await db.query('SELECT COUNT(*) AS total FROM reposts WHERE song_id = ?', [songId]);
      return res.json({ reposted: false, reposts_count: total });
    }

    await db.query('INSERT INTO reposts (user_id, song_id) VALUES (?, ?)', [userId, songId]);
    const [{ total }] = await db.query('SELECT COUNT(*) AS total FROM reposts WHERE song_id = ?', [songId]);
    res.json({ reposted: true, reposts_count: total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/songs/:id/comments', async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT c.id, c.body, c.created_at,
              u.id AS user_id, u.username, u.avatar_url
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.song_id = ? AND c.is_deleted = 0
       ORDER BY c.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/songs/:id/comments', requireLogin, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Comment body is required.' });
    }

    const result = await db.query(
      'INSERT INTO comments (user_id, song_id, body) VALUES (?, ?, ?)',
      [req.session.user.id, req.params.id, body.trim()]
    );

    const rows = await db.query(
      `SELECT c.id, c.body, c.created_at,
              u.id AS user_id, u.username, u.avatar_url
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ? LIMIT 1`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/comments/:id', requireLogin, async (req, res) => {
  try {
    const rows = await db.query(
      'SELECT user_id FROM comments WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Comment not found.' });
    if (rows[0].user_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    await db.query('UPDATE comments SET is_deleted = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Comment deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/me/liked', requireLogin, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT s.*, u.username, u.avatar_url,
              (SELECT COUNT(*) FROM likes WHERE song_id = s.id) AS likes_count
       FROM likes l
       JOIN songs s ON s.id = l.song_id
       JOIN users u ON u.id = s.user_id
       WHERE l.user_id = ? AND s.is_deleted = 0
       ORDER BY l.created_at DESC`,
      [req.session.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
