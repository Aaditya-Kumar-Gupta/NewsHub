/**
 * NewsProvider — abstract interface.
 *
 * The rest of the NewsHub application (routes, personalization engine,
 * ingestion jobs) must depend ONLY on this abstraction, never on a
 * concrete provider like NewsAPI. This allows swapping the underlying
 * news source (e.g. NewsAPI -> GNews -> a custom crawler) without
 * touching any other layer of the app.
 *
 *   NewsHub Services
 *         |
 *   NewsProvider  (this file, abstract)
 *         |
 *   NewsAPIProvider  (concrete implementation, server/services/NewsAPIProvider.js)
 *         |
 *      NewsAPI.org
 */
class NewsProvider {
  /**
   * @param {object} opts
   * @param {string} [opts.country]  ISO 3166-1 alpha-2 country code
   * @param {string} [opts.category] category slug
   * @param {string} [opts.q]        free text query
   * @param {number} [opts.pageSize]
   * @param {number} [opts.page]
   * @returns {Promise<Array<NormalizedArticle>>}
   */
  async getTopHeadlines(opts = {}) {
    throw new Error('getTopHeadlines() must be implemented by a NewsProvider subclass');
  }

  /**
   * @param {object} opts
   * @param {string} opts.q          free text query (required)
   * @param {string} [opts.sortBy]   relevancy | popularity | publishedAt
   * @param {string} [opts.language]
   * @param {string} [opts.from]     ISO date
   * @param {string} [opts.to]       ISO date
   * @param {number} [opts.pageSize]
   * @param {number} [opts.page]
   * @returns {Promise<Array<NormalizedArticle>>}
   */
  async search(opts = {}) {
    throw new Error('search() must be implemented by a NewsProvider subclass');
  }

  /**
   * @param {object} opts
   * @param {string} [opts.country]
   * @param {string} [opts.category]
   * @param {string} [opts.language]
   * @returns {Promise<Array<NormalizedSource>>}
   */
  async getSources(opts = {}) {
    throw new Error('getSources() must be implemented by a NewsProvider subclass');
  }
}

module.exports = NewsProvider;

/**
 * @typedef {object} NormalizedArticle
 * @property {string} externalId
 * @property {string} title
 * @property {string} description
 * @property {string} content
 * @property {string} url
 * @property {string} imageUrl
 * @property {string} author
 * @property {string} publishedAt   ISO date string
 * @property {string} language
 * @property {string} countryCode
 * @property {{name: string, url: string}} source
 */
