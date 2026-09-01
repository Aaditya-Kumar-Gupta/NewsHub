const crypto = require('crypto');
const db = require('../config/db');

function makeKey(namespace, params = {}) {
  const normalized = Object.keys(params).sort().reduce((out, key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') out[key] = String(value).trim().toLowerCase();
    return out;
  }, {});
  return crypto.createHash('sha256').update(`${namespace}:${JSON.stringify(normalized)}`).digest('hex');
}

async function get(namespace, params = {}) {
  const key = makeKey(namespace, params);
  const [[row]] = await db.query(
    'SELECT payload FROM api_cache WHERE cache_key = ? AND expires_at > NOW() LIMIT 1',
    [key]
  );
  if (!row) return null;
  try { return JSON.parse(row.payload); }
  catch (err) { console.error('API cache parse failed:', err.message); return null; }
}

async function set(namespace, params, value, ttlSeconds = 300) {
  const key = makeKey(namespace, params);
  const ttl = Math.max(1, Number(ttlSeconds) || 300);
  await db.query(
    `INSERT INTO api_cache (cache_key, namespace, payload, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), expires_at = VALUES(expires_at), namespace = VALUES(namespace)`,
    [key, namespace, JSON.stringify(value), ttl]
  );
}

module.exports = { get, set, makeKey };
