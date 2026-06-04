const express = require('express');
const router  = express.Router();
const db      = require('../db');

function requireAdmin(req, res, next) {
  if (!req.session.user)              return res.status(401).json({ error: 'Login required.' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  next();
}

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, first_name, last_name, username, email, role, is_banned,
              followers_count, following_count, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/users/:id/ban', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // ga boleh ban diri sendiri
    if (Number(userId) === req.session.user.id) {
      return res.status(400).json({ error: 'Cannot ban yourself.' });
    }

    const rows = await db.query('SELECT is_banned FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });

    const newStatus = rows[0].is_banned ? 0 : 1;
    await db.query('UPDATE users SET is_banned = ? WHERE id = ?', [newStatus, userId]);

    res.json({
      message: newStatus ? 'User banned.' : 'User unbanned.',
      is_banned: Boolean(newStatus),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/songs/:id', requireAdmin, async (req, res) => {
  try {
    const rows = await db.query(
      'SELECT id FROM songs WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Song not found.' });

    await db.query('UPDATE songs SET is_deleted = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Song deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/comments/:id', requireAdmin, async (req, res) => {
  try {
    const rows = await db.query(
      'SELECT id FROM comments WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Comment not found.' });

    await db.query('UPDATE comments SET is_deleted = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Comment deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/songs', requireAdmin, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT s.*, u.username,
              (SELECT COUNT(*) FROM likes    WHERE song_id = s.id) AS likes_count,
              (SELECT COUNT(*) FROM comments WHERE song_id = s.id AND is_deleted = 0) AS comments_count
       FROM songs s
       JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/comments', requireAdmin, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT c.id, c.body, c.created_at, c.is_deleted,
              u.username, s.title AS song_title, s.id AS song_id
       FROM comments c
       JOIN users u ON u.id = c.user_id
       JOIN songs s ON s.id = c.song_id
       WHERE c.is_deleted = 0
       ORDER BY c.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
