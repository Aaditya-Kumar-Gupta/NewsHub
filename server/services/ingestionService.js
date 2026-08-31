const crypto = require('crypto');
const db = require('../config/db');

function hashUrl(url) {
  return crypto.createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

async function getOrCreateSource(name, url = null) {
  if (!name) name = 'Unknown Source';
  const [rows] = await db.query('SELECT id FROM sources WHERE name = ?', [name]);
  if (rows.length) return rows[0].id;
  const [result] = await db.query('INSERT INTO sources (name, url) VALUES (?, ?)', [name, url]);
  return result.insertId;
}

async function getCategoryIdBySlug(slug) {
  if (!slug) return null;
  const [rows] = await db.query('SELECT id FROM categories WHERE slug = ?', [slug]);
  return rows.length ? rows[0].id : null;
}

async function upsertArticle(article, opts = {}) {
  const urlHash = hashUrl(article.url);
  const sourceId = await getOrCreateSource(article.source && article.source.name, article.source && article.source.url);
  const [existing] = await db.query('SELECT id FROM articles WHERE url_hash = ?', [urlHash]);

  let articleId;
  if (existing.length) {
    articleId = existing[0].id;
    await db.query('UPDATE articles SET fetched_at = NOW(), trending_score = trending_score + 0.1 WHERE id = ?', [articleId]);
  } else {
    const [result] = await db.query(
      `INSERT INTO articles
       (external_id, source_id, title, description, content, url, url_hash, image_url, author, published_at, language, country_code, location_tag)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [article.externalId || null, sourceId, article.title, article.description, article.content, article.url, urlHash,
       article.imageUrl, article.author, article.publishedAt ? new Date(article.publishedAt) : null,
       article.language || 'en', article.countryCode || null, opts.locationTag || null]
    );
    articleId = result.insertId;
  }

  if (opts.categorySlug) {
    const categoryId = await getCategoryIdBySlug(opts.categorySlug);
    if (categoryId) {
      await db.query('INSERT IGNORE INTO article_categories (article_id, category_id) VALUES (?, ?)', [articleId, categoryId]);
    }
  }
  return articleId;
}

/**
 * Efficient batch ingestion.
 * Deduplicates provider results and uses bulk MySQL operations in one transaction.
 */
async function ingestBatch(articles, opts = {}) {
  if (!Array.isArray(articles) || articles.length === 0) return [];

  const unique = [];
  const seenHashes = new Set();

  for (const article of articles) {
    if (!article || !article.url) continue;
    const urlHash = hashUrl(article.url);
    if (seenHashes.has(urlHash)) continue;
    seenHashes.add(urlHash);
    unique.push({ article, urlHash });
  }

  if (!unique.length) return [];

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Bulk source insert and lookup.
    const sources = new Map();
    for (const { article } of unique) {
      const name = (article.source && article.source.name) || 'Unknown Source';
      if (!sources.has(name)) sources.set(name, (article.source && article.source.url) || null);
    }

    const sourceNames = [...sources.keys()];
    if (sourceNames.length) {
      const sourceValues = [];
      for (const [name, url] of sources) sourceValues.push(name, url);
      const placeholders = sourceNames.map(() => '(?, ?)').join(', ');
      await connection.query(`INSERT IGNORE INTO sources (name, url) VALUES ${placeholders}`, sourceValues);
    }

    const sourceMap = new Map();
    if (sourceNames.length) {
      const [sourceRows] = await connection.query('SELECT id, name FROM sources WHERE name IN (?)', [sourceNames]);
      for (const row of sourceRows) sourceMap.set(row.name, row.id);
    }

    // Bulk article upsert.
    const articleValues = [];
    for (const { article, urlHash } of unique) {
      const sourceName = (article.source && article.source.name) || 'Unknown Source';
      articleValues.push(
        article.externalId || null,
        sourceMap.get(sourceName) || null,
        article.title,
        article.description,
        article.content,
        article.url,
        urlHash,
        article.imageUrl,
        article.author,
        article.publishedAt ? new Date(article.publishedAt) : null,
        article.language || 'en',
        article.countryCode || null,
        opts.locationTag || null
      );
    }

    const articlePlaceholders = unique.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(', ');
    await connection.query(
      `INSERT INTO articles
       (external_id, source_id, title, description, content, url, url_hash, image_url, author, published_at, language, country_code, location_tag)
       VALUES ${articlePlaceholders}
       ON DUPLICATE KEY UPDATE
         fetched_at = NOW(),
         trending_score = trending_score + 0.1`,
      articleValues
    );

    // Resolve article IDs in one query.
    const hashes = unique.map(({ urlHash }) => urlHash);
    const [articleRows] = await connection.query(
      'SELECT id, url_hash FROM articles WHERE url_hash IN (?)',
      [hashes]
    );

    const articleIdMap = new Map(articleRows.map(row => [row.url_hash, row.id]));
    const ids = unique.map(({ urlHash }) => articleIdMap.get(urlHash)).filter(Boolean);

    // Bulk category relationships.
    if (opts.categorySlug && ids.length) {
      const [categoryRows] = await connection.query('SELECT id FROM categories WHERE slug = ?', [opts.categorySlug]);
      if (categoryRows.length) {
        const categoryId = categoryRows[0].id;
        const relationPlaceholders = ids.map(() => '(?, ?)').join(', ');
        const relationValues = [];
        for (const id of ids) relationValues.push(id, categoryId);

        await connection.query(
          `INSERT IGNORE INTO article_categories (article_id, category_id) VALUES ${relationPlaceholders}`,
          relationValues
        );
      }
    }

    await connection.commit();
    return ids;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { ingestBatch, upsertArticle, hashUrl };
