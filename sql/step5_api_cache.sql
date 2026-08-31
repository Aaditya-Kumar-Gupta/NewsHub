-- Persistent cache for external NewsProvider responses
CREATE TABLE IF NOT EXISTS api_cache (
  cache_key CHAR(64) NOT NULL PRIMARY KEY,
  namespace VARCHAR(80) NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_api_cache_expires (expires_at),
  KEY idx_api_cache_namespace (namespace)
) ENGINE=InnoDB;

