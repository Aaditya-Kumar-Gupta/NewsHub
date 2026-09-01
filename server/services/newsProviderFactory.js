/**
 * Single point where the concrete NewsProvider implementation is chosen.
 * Everything else in the app imports getNewsProvider() and only ever
 * calls the abstract NewsProvider methods — never NewsAPI directly.
 */
const NewsAPIProvider = require('./NewsAPIProvider');

let instance = null;

function getNewsProvider() {
  if (!instance) {
    instance = new NewsAPIProvider();
  }
  return instance;
}

module.exports = { getNewsProvider };
