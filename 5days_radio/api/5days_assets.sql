CREATE DATABASE IF NOT EXISTS `5days_radio`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `5days_radio`;

CREATE TABLE IF NOT EXISTS users (
  id               INT          UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name       VARCHAR(80)  NOT NULL,
  last_name        VARCHAR(80)  NOT NULL,
  username         VARCHAR(50)  NOT NULL UNIQUE,
  email            VARCHAR(191) NOT NULL UNIQUE,
  password         VARCHAR(255) NOT NULL,
  bio              TEXT,
  avatar_url       VARCHAR(512),
  role             ENUM('user','admin') NOT NULL DEFAULT 'user',
  is_banned        TINYINT(1)   NOT NULL DEFAULT 0,
  followers_count  INT UNSIGNED NOT NULL DEFAULT 0,
  following_count  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_email    (email),
  INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO users (first_name, last_name, username, email, password, role)
VALUES ('Admin', '5Days', 'admin', 'admin@5days.radio',
        '$2b$10$YourHashHere', 'admin')
ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS songs (
  id           INT          UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT          UNSIGNED NOT NULL,
  title        VARCHAR(255) NOT NULL,
  type         ENUM('single','album') NOT NULL DEFAULT 'single',
  genre        VARCHAR(80)  NOT NULL DEFAULT 'Other',
  description  TEXT,
  cover_url    VARCHAR(512),
  audio_url    VARCHAR(512),        -- untuk single; album pake tabel tracks
  play_count   INT UNSIGNED NOT NULL DEFAULT 0,
  is_deleted   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user    (user_id),
  INDEX idx_genre   (genre),
  INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tracks (
  id           INT          UNSIGNED NOT NULL AUTO_INCREMENT,
  song_id      INT          UNSIGNED NOT NULL,
  track_number TINYINT      UNSIGNED NOT NULL DEFAULT 1,
  title        VARCHAR(255) NOT NULL,
  duration     VARCHAR(10),          -- format "3:45"
  audio_url    VARCHAR(512),
  PRIMARY KEY (id),
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  INDEX idx_song (song_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS credits (
  id      INT          UNSIGNED NOT NULL AUTO_INCREMENT,
  song_id INT          UNSIGNED NOT NULL,
  role    VARCHAR(80)  NOT NULL,
  name    VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  INDEX idx_song (song_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS likes (
  id         INT      UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT      UNSIGNED NOT NULL,
  song_id    INT      UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_like (user_id, song_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reposts (
  id         INT      UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT      UNSIGNED NOT NULL,
  song_id    INT      UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_repost (user_id, song_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comments (
  id         INT      UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT      UNSIGNED NOT NULL,
  song_id    INT      UNSIGNED NOT NULL,
  body       TEXT     NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  INDEX idx_song    (song_id),
  INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
