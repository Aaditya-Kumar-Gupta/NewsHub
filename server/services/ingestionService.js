const crypto = require('crypto');
const db = require('../config/db');

function hashUrl(url) {
  return crypto.createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

async function getOrCreateSource(name, url = null) {
  if (!name) name = 'Unknown Source';
  const [rows] = await db.query('SELECT id FROM sources WHERE name = ?', [name]);
  if (rows.length) return rows[0].id;
  const [result] = await db.query(
    'INSERT INTO sources (name, url) VALUES (?, ?)',
    [name, url]
  );
  return result.insertId;
}

async function getCategoryIdBySlug(slug) {
  if (!slug) return null;
  const [rows] = await db.query('SELECT id FROM categories WHERE slug = ?', [slug]);
  return rows.length ? rows[0].id : null;
}

/**
 * Insert or update a normalized article (from any NewsProvider) into
 * MySQL. Deduplication is enforced via a unique hash of the article URL
 * (url_hash), so re-ingesting the same story is a no-op that just
 * refreshes fetched_at / trending_score rather than creating a duplicate row.
 *
 * @param {NormalizedArticle} article
 * @param {object} opts
 * @param {string} [opts.categorySlug]
 * @param {string} [opts.locationTag]
 * @returns {Promise<number>} articles.id
 */
async function upsertArticle(article, opts = {}) {
  const urlHash = hashUrl(article.url);
  const sourceId = await getOrCreateSource(
    article.source && article.source.name,
    article.source && article.source.url
  );

  const [existing] = await db.query('SELECT id FROM articles WHERE url_hash = ?', [urlHash]);

  let articleId;
  if (existing.length) {
    articleId = existing[0].id;
    await db.query(
      `UPDATE articles SET fetched_at = NOW(), trending_score = trending_score + 0.1
       WHERE id = ?`,
      [articleId]
    );
  } else {
    const [result] = await db.query(
      `INSERT INTO articles
        (external_id, source_id, title, description, content, url, url_hash,
         image_url, author, published_at, language, country_code, location_tag)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        article.externalId || null,
        sourceId,
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
      ]
    );
    articleId = result.insertId;
  }

  if (opts.categorySlug) {
    const categoryId = await getCategoryIdBySlug(opts.categorySlug);
    if (categoryId) {
      await db.query(
        'INSERT IGNORE INTO article_categories (article_id, category_id) VALUES (?, ?)',
        [articleId, categoryId]
      );
    }
  }

  return articleId;
}

/**
 * Ingest a batch of normalized articles returned by any NewsProvider call.
 */
async function ingestBatch(articles, opts = {}) {
  const ids = [];
  for (const article of articles) {
    try {
      const id = await upsertArticle(article, opts);
      ids.push(id);
    } catch (err) {
      console.error('Failed to ingest article:', article.url, err.message);
    }
  }
  return ids;
}

module.exports = { ingestBatch, upsertArticle, hashUrl };
