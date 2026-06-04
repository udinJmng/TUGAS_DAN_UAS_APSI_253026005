# 5Days Radio — REST API

ExpressJS + MySQL backend untuk platform musik underground Indonesia.

## Setup

```bash
# 1. install deps
npm install

# 2. buat database
mysql -u root -p < schema.sql

# 3. edit kredensial di db.js (host/user/password)

# 4. jalankan
npm start        # production
npm run dev      # development (nodemon)
```

Server jalan di **http://localhost:3000**

---

## Endpoints

### Auth
| Method | URL | Keterangan |
|--------|-----|------------|
| POST | `/api/auth/register` | Daftar akun baru |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET  | `/api/auth/me` | Cek session aktif |

**Body register:**
```json
{
  "first_name": "Alex",
  "last_name": "Rivera",
  "username": "alexrivera",
  "email": "alex@mail.com",
  "password": "secret123"
}
```

---

### Users
| Method | URL | Keterangan |
|--------|-----|------------|
| GET  | `/api/users/:id` | Lihat profil public |
| PUT  | `/api/users/me` | Edit profil sendiri |
| GET  | `/api/users/:id/songs` | Lagu milik user |

**Body PUT /api/users/me:**
```json
{
  "first_name": "Alex",
  "last_name": "Rivera",
  "username": "alexrivera",
  "bio": "Producer 🎸",
  "avatar_url": "https://...",
  "old_password": "secret123",   // opsional
  "new_password": "newpass456"   // opsional
}
```

---

### Songs
| Method | URL | Keterangan |
|--------|-----|------------|
| GET  | `/api/songs` | List semua lagu (explore) |
| GET  | `/api/songs/:id` | Detail lagu + tracks + credits |
| POST | `/api/songs` | Upload lagu/album (`multipart/form-data`) |
| POST | `/api/songs/:id/audio` | Upload file audio per track |
| PUT  | `/api/songs/:id` | Edit lagu |
| DELETE | `/api/songs/:id` | Hapus lagu (soft delete) |

**Query params GET /api/songs:**
- `search` — cari judul/username
- `genre` — filter genre
- `sort` — `newest` | `oldest` | `popular` | `plays`
- `limit` / `offset` — pagination

**Body POST /api/songs (multipart):**
```
cover     ← file gambar (JPG/PNG/WEBP, max 5MB)
title     ← string
type      ← "single" | "album"
genre     ← string
description ← string
tracks    ← JSON array: [{"title":"Track 1","dur":"3:20"}, ...]
credits   ← JSON array: [{"role":"Producer","name":"Alex"}, ...]
```

---

### Interactions
| Method | URL | Keterangan |
|--------|-----|------------|
| POST | `/api/songs/:id/like` | Toggle like/unlike |
| GET  | `/api/songs/:id/likes` | Cek status like user |
| POST | `/api/songs/:id/repost` | Toggle repost |
| GET  | `/api/songs/:id/comments` | Ambil komentar |
| POST | `/api/songs/:id/comments` | Tulis komentar |
| DELETE | `/api/comments/:id` | Hapus komentar sendiri |
| GET  | `/api/me/liked` | Library: semua lagu yang di-like |

---

### Admin (role = admin only)
| Method | URL | Keterangan |
|--------|-----|------------|
| GET   | `/api/admin/users` | Semua user |
| PATCH | `/api/admin/users/:id/ban` | Toggle ban user |
| GET   | `/api/admin/songs` | Semua lagu (termasuk deleted) |
| DELETE | `/api/admin/songs/:id` | Hapus lagu |
| GET   | `/api/admin/comments` | Semua komentar aktif |
| DELETE | `/api/admin/comments/:id` | Hapus komentar |

---

## Struktur Folder

```
api/
├── index.js              ← entry point
├── db.js                 ← MySQL connection pool
├── schema.sql            ← SQL schema + seed
├── middleware/
│   └── upload.js         ← multer config (cover + audio)
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── songs.js
│   ├── interactions.js
│   └── admin.js
└── uploads/
    ├── covers/           ← cover art
    └── audio/            ← file audio
```

## Notes
- Autentikasi pakai `express-session` (cookie-based), no JWT
- Soft delete: data tidak dihapus fisik dari DB, cukup set `is_deleted = 1`
- Upload audio max **100MB**, cover max **5MB**
- Jalankan `mysql -u root -p < schema.sql` untuk setup DB pertama kali
