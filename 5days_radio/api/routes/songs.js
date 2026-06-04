const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { uploadAudio, uploadCover } = require('../middleware/upload');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required.' });
  next();
}

router.get('/', async (req, res) => {
  try {
    const { search, genre, sort = 'newest', limit = 20, offset = 0 } = req.query;

    let where = 's.is_deleted = 0';
    const params = [];

    if (search) {
      where += ' AND (s.title LIKE ? OR u.username LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (genre) {
      where += ' AND s.genre = ?';
      params.push(genre);
    }

    const orderMap = {
      newest:  's.created_at DESC',
      oldest:  's.created_at ASC',
      popular: 'likes_count DESC',
      plays:   's.play_count DESC',
    };
    const orderBy = orderMap[sort] || orderMap.newest;

    const rows = await db.query(
      `SELECT s.*,
              u.username, u.avatar_url,
              (SELECT COUNT(*) FROM likes    WHERE song_id = s.id)                   AS likes_count,
              (SELECT COUNT(*) FROM reposts  WHERE song_id = s.id)                   AS reposts_count,
              (SELECT COUNT(*) FROM comments WHERE song_id = s.id AND is_deleted = 0) AS comments_count
       FROM songs s
       JOIN users u ON u.id = s.user_id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT s.*,
              u.username, u.avatar_url,
              (SELECT COUNT(*) FROM likes    WHERE song_id = s.id)                   AS likes_count,
              (SELECT COUNT(*) FROM reposts  WHERE song_id = s.id)                   AS reposts_count,
              (SELECT COUNT(*) FROM comments WHERE song_id = s.id AND is_deleted = 0) AS comments_count
       FROM songs s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.is_deleted = 0 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Song not found.' });

    const song = rows[0];

    song.tracks = await db.query(
      'SELECT * FROM tracks WHERE song_id = ? ORDER BY track_number ASC',
      [song.id]
    );

    song.credits = await db.query(
      'SELECT * FROM credits WHERE song_id = ? ORDER BY id ASC',
      [song.id]
    );

    await db.query('UPDATE songs SET play_count = play_count + 1 WHERE id = ?', [song.id]);

    res.json(song);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/', requireLogin, uploadCover.single('cover'), async (req, res) => {
  try {
    const { title, type, genre, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required.' });

    const coverUrl = req.file ? `/uploads/covers/${req.file.filename}` : null;

    const result = await db.query(
      `INSERT INTO songs (user_id, title, type, genre, description, cover_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.user.id, title, type || 'single', genre || 'Other',
       description || null, coverUrl]
    );
    const songId = result.insertId;

    const tracks = req.body.tracks ? JSON.parse(req.body.tracks) : [];
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      await db.query(
        `INSERT INTO tracks (song_id, track_number, title, duration)
         VALUES (?, ?, ?, ?)`,
        [songId, i + 1, t.title || '', t.dur || null]
      );
    }

    const credits = req.body.credits ? JSON.parse(req.body.credits) : [];
    for (const c of credits) {
      if (!c.name) continue;
      await db.query(
        'INSERT INTO credits (song_id, role, name) VALUES (?, ?, ?)',
        [songId, c.role || 'Other', c.name]
      );
    }

    res.status(201).json({ message: 'Song uploaded.', song_id: songId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:id/audio', requireLogin, uploadAudio.single('audio'), async (req, res) => {
  try {
    const song = await db.query(
      'SELECT user_id FROM songs WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [req.params.id]
    );
    if (!song.length) return res.status(404).json({ error: 'Song not found.' });
    if (song[0].user_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No audio file provided.' });

    const audioUrl = `/uploads/audio/${req.file.filename}`;
    const { track_number = 1 } = req.body;

    if (req.body.track_id) {
      await db.query(
        'UPDATE tracks SET audio_url = ? WHERE id = ? AND song_id = ?',
        [audioUrl, req.body.track_id, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE songs SET audio_url = ? WHERE id = ?',
        [audioUrl, req.params.id]
      );
    }

    res.json({ message: 'Audio uploaded.', audio_url: audioUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.put('/:id', requireLogin, uploadCover.single('cover'), async (req, res) => {
  try {
    const song = await db.query(
      'SELECT * FROM songs WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [req.params.id]
    );
    if (!song.length) return res.status(404).json({ error: 'Song not found.' });
    if (song[0].user_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const { title, type, genre, description } = req.body;
    const coverUrl = req.file
      ? `/uploads/covers/${req.file.filename}`
      : song[0].cover_url;

    await db.query(
      `UPDATE songs SET title = ?, type = ?, genre = ?, description = ?, cover_url = ?
       WHERE id = ?`,
      [title || song[0].title, type || song[0].type, genre || song[0].genre,
       description ?? song[0].description, coverUrl, req.params.id]
    );

    if (req.body.credits) {
      const credits = JSON.parse(req.body.credits);
      await db.query('DELETE FROM credits WHERE song_id = ?', [req.params.id]);
      for (const c of credits) {
        if (!c.name) continue;
        await db.query(
          'INSERT INTO credits (song_id, role, name) VALUES (?, ?, ?)',
          [req.params.id, c.role || 'Other', c.name]
        );
      }
    }

    res.json({ message: 'Song updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:id', requireLogin, async (req, res) => {
  try {
    const song = await db.query(
      'SELECT user_id FROM songs WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [req.params.id]
    );
    if (!song.length) return res.status(404).json({ error: 'Song not found.' });
    if (song[0].user_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    await db.query('UPDATE songs SET is_deleted = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Song deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
