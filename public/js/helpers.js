/**
 * Redirects to sign-in if there's no active session. Call at the top
 * of any protected page's script. Resolves with the current user if
 * authenticated.
 */
async function requireAuthOrRedirect() {
  try {
    const { user } = await NewsHubAPI.me();
    if (!user) {
      window.location.href = '/pages/signin.html?next=' + encodeURIComponent(location.pathname);
      return null;
    }
    return user;
  } catch (e) {
    window.location.href = '/pages/signin.html';
    return null;
  }
}

/**
 * If already signed in, send the user straight to Home (used on
 * sign-in / sign-up pages so a logged-in user doesn't see the form again).
 */
async function redirectIfAuthed(target = '/pages/home.html') {
  try {
    const { user } = await NewsHubAPI.me();
    if (user) window.location.href = target;
  } catch (e) { /* not signed in, stay on page */ }
}

const ArticleCards = (() => {
  function saveButtonSvg() {
    return `<svg width="16" height="18" viewBox="0 0 16 18" fill="none"><path d="M1 1.5A1.5 1.5 0 012.5 0h11A1.5 1.5 0 0115 1.5V17l-7-4-7 4V1.5z" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>`;
  }
  function shareSvg() {
    return `<svg width="18" height="20" viewBox="0 0 18 20" fill="none"><circle cx="15" cy="4" r="2.4" stroke="currentColor" stroke-width="1.4"/><circle cx="3" cy="10" r="2.4" stroke="currentColor" stroke-width="1.4"/><circle cx="15" cy="16" r="2.4" stroke="currentColor" stroke-width="1.4"/><path d="M5.1 8.8l7.8-3.6M5.1 11.2l7.8 3.6" stroke="currentColor" stroke-width="1.4"/></svg>`;
  }

  function lead(article) {
    const img = article.imageUrl || article.image_url || '';
    return `
      <article class="lead-story">
        <a href="/pages/article.html?id=${article.id}" class="article-media cinema">
          ${img ? `<img src="${img}" alt="${NewsHubChrome.escapeHtml(article.title)}" loading="lazy">` : ''}
        </a>
        <div class="eyebrow accent" style="margin-top:16px">${NewsHubChrome.escapeHtml((article.categoryName || 'NEWS').toUpperCase())}</div>
        <a href="/pages/article.html?id=${article.id}"><h1>${NewsHubChrome.escapeHtml(article.title)}</h1></a>
        <p class="dek">${NewsHubChrome.escapeHtml(article.description || '')}</p>
        <div class="meta-row">
          <span class="meta">BY ${NewsHubChrome.escapeHtml((article.author||'Staff').toUpperCase())} • ${NewsHubChrome.timeAgo(article.publishedAt).toUpperCase()}</span>
          <span style="display:flex;gap:8px;">
            <button class="icon-btn save-btn" data-id="${article.id}" aria-label="Save article">${saveButtonSvg()}</button>
            <button class="icon-btn" aria-label="Share">${shareSvg()}</button>
          </span>
        </div>
      </article>`;
  }

  function secondary(article) {
    const img = article.imageUrl || article.image_url || '';
    return `
      <article class="article-card" style="flex:1;min-width:260px;">
        <a href="/pages/article.html?id=${article.id}" class="article-media tall">
          ${img ? `<img src="${img}" alt="${NewsHubChrome.escapeHtml(article.title)}" loading="lazy">` : ''}
        </a>
        <div class="eyebrow accent">${NewsHubChrome.escapeHtml((article.categoryName || article.source?.name || 'NEWS').toUpperCase())}</div>
        <a href="/pages/article.html?id=${article.id}"><h2>${NewsHubChrome.escapeHtml(article.title)}</h2></a>
        <div class="meta-row">
          <span class="meta">${NewsHubChrome.timeAgo(article.publishedAt).toUpperCase()}</span>
          <button class="icon-btn save-btn" data-id="${article.id}" aria-label="Save article">${saveButtonSvg()}</button>
        </div>
      </article>`;
  }

  function compact(article) {
    const img = article.imageUrl || article.image_url || '';
    return `
      <article class="article-card">
        <a href="/pages/article.html?id=${article.id}" class="article-media">
          ${img ? `<img src="${img}" alt="${NewsHubChrome.escapeHtml(article.title)}" loading="lazy">` : ''}
        </a>
        <div class="eyebrow accent">${NewsHubChrome.escapeHtml((article.categoryName || article.source?.name || 'NEWS').toUpperCase())}</div>
        <a href="/pages/article.html?id=${article.id}"><h3>${NewsHubChrome.escapeHtml(article.title)}</h3></a>
        <p style="color:var(--text-muted);font-size:13px;margin:0;">${NewsHubChrome.timeAgo(article.publishedAt)}</p>
      </article>`;
  }

  function trendingItem(article, rank) {
    return `
      <li>
        <span class="trending-num">${rank}</span>
        <div>
          <div class="meta" style="text-transform:none;letter-spacing:.4px;">${NewsHubChrome.escapeHtml(article.categoryName || article.source?.name || '')}</div>
          <a href="/pages/article.html?id=${article.id}"><h4>${NewsHubChrome.escapeHtml(article.title)}</h4></a>
        </div>
      </li>`;
  }

  function bindSaveButtons(root = document) {
    root.querySelectorAll('.save-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await NewsHubAPI.saveArticle(btn.dataset.id);
          btn.style.color = 'var(--accent)';
          NewsHubChrome.toast('Saved to your reading list');
        } catch (err) {
          NewsHubChrome.toast(err.message.includes('authenticated') ? 'Sign in to save articles' : 'Could not save article');
        }
      });
    });
  }

  return { lead, secondary, compact, trendingItem, bindSaveButtons };
})();
