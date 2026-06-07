const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// ─── Avatar storage ────────────────────────────────────────────────────────
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'avatars');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

// ─── Cover storage ─────────────────────────────────────────────────────────
const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'covers');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `cover_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

// ─── Audio storage ─────────────────────────────────────────────────────────
const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'audio');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `audio_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

// ─── File filters ──────────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a']);

function combinedFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.fieldname === 'cover'  && IMAGE_EXTS.has(ext)) return cb(null, true);
  if (file.fieldname === 'audio'  && AUDIO_EXTS.has(ext)) return cb(null, true);
  // track audio fields are named audio_0, audio_1, ...
  if (file.fieldname.startsWith('audio_') && AUDIO_EXTS.has(ext)) return cb(null, true);
  cb(new Error(`File type not allowed for field "${file.fieldname}"`));
}

function storageRouter(req, file, cb) {
  // Route to correct storage based on field name
  if (file.fieldname === 'cover') {
    coverStorage._handleFile(req, file, cb);
  } else {
    audioStorage._handleFile(req, file, cb);
  }
}

// ─── Combined upload (cover + one audio for singles) ──────────────────────
const uploadCover = multer({
  storage: coverStorage,
  fileFilter: combinedFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: combinedFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
});

// uploadSong: handles cover (optional) + audio (optional for singles)
// Also handles album tracks: audio_0, audio_1, ... (up to 50 tracks)
const uploadSong = multer({
  storage: {
    _handleFile(req, file, cb) {
      if (file.fieldname === 'cover') {
        coverStorage._handleFile(req, file, cb);
      } else {
        audioStorage._handleFile(req, file, cb);
      }
    },
    _removeFile(_req, file, cb) {
      fs.unlink(file.path, cb);
    },
  },
  fileFilter: combinedFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
}).fields([
  { name: 'cover',  maxCount: 1 },
  { name: 'audio',  maxCount: 1 },
  ...Array.from({ length: 50 }, (_, i) => ({ name: `audio_${i}`, maxCount: 1 })),
]);

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_EXTS.has(ext)) return cb(null, true);
    cb(new Error('Avatar must be JPG, PNG, or WEBP'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('avatar');

module.exports = { uploadCover, uploadAudio, uploadSong, uploadAvatar };
