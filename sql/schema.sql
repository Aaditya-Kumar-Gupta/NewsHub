-- ============================================================
-- NewsHub — MySQL 8.x normalized schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS newshub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE newshub;

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------
-- users
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  onboarding_completed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- locations  (city-level granularity; no exact GPS stored
-- unless the user explicitly opts in via "use current location",
-- and even then we snap to city-level lat/lng, not device-precise)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  country VARCHAR(100) NOT NULL,
  country_code CHAR(2) NOT NULL,
  state VARCHAR(100) DEFAULT NULL,
  city VARCHAR(120) DEFAULT NULL,
  latitude DECIMAL(9,6) DEFAULT NULL,
  longitude DECIMAL(9,6) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_location (country_code, state, city)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- user_preferences  (1:1 with users)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INT UNSIGNED PRIMARY KEY,
  location_id INT UNSIGNED DEFAULT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  local_news_enabled TINYINT(1) NOT NULL DEFAULT 1,
  breaking_news_enabled TINYINT(1) NOT NULL DEFAULT 1,
  theme ENUM('light','dark','system') NOT NULL DEFAULT 'system',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_prefs_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- categories
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  slug VARCHAR(60) NOT NULL,
  UNIQUE KEY uq_category_slug (slug)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- sources
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(100) DEFAULT NULL,
  name VARCHAR(150) NOT NULL,
  url VARCHAR(500) DEFAULT NULL,
  logo_url VARCHAR(500) DEFAULT NULL,
  UNIQUE KEY uq_source_name (name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- articles  (deduplicated by url_hash)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS articles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(191) DEFAULT NULL,
  source_id INT UNSIGNED DEFAULT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  content MEDIUMTEXT,
  url VARCHAR(700) NOT NULL,
  url_hash CHAR(64) NOT NULL,
  image_url VARCHAR(700) DEFAULT NULL,
  author VARCHAR(200) DEFAULT NULL,
  published_at DATETIME DEFAULT NULL,
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  language VARCHAR(10) DEFAULT 'en',
  country_code CHAR(2) DEFAULT NULL,
  location_tag VARCHAR(120) DEFAULT NULL,
  trending_score DECIMAL(6,3) NOT NULL DEFAULT 0,
  CONSTRAINT fk_article_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL,
  UNIQUE KEY uq_article_url (url_hash),
  KEY idx_article_published (published_at),
  KEY idx_article_country (country_code),
  FULLTEXT KEY ft_article_search (title, description, content)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- article_categories (M:N)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS article_categories (
  article_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (article_id, category_id),
  CONSTRAINT fk_ac_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
  CONSTRAINT fk_ac_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- user_interests (M:N)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_interests (
  user_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, category_id),
  CONSTRAINT fk_ui_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ui_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- user_sources (M:N) — followed / preferred sources
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sources (
  user_id INT UNSIGNED NOT NULL,
  source_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, source_id),
  CONSTRAINT fk_us_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_us_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- saved_articles
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_articles (
  user_id INT UNSIGNED NOT NULL,
  article_id INT UNSIGNED NOT NULL,
  saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, article_id),
  CONSTRAINT fk_sa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- reading_history
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS reading_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  article_id INT UNSIGNED NOT NULL,
  read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reading_progress DECIMAL(5,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_rh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
  KEY idx_rh_user_read (user_id, read_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- sessions (for express-mysql-session store)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------
-- Seed categories
-- ---------------------------------------------------------
INSERT IGNORE INTO categories (name, slug) VALUES
('Technology','technology'),
('Business','business'),
('Science','science'),
('World','world'),
('Politics','politics'),
('Culture','culture'),
('Sports','sports'),
('Climate','climate'),
('Entertainment','entertainment'),
('Education','education'),
('Travel','travel');
