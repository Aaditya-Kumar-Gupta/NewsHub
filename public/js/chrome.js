/**
 * Renders the shared header + footer into any page that includes
 * <div id="site-header"></div> and <div id="site-footer"></div>,
 * and wires up theme toggle, mobile nav, and auth-aware icons.
 */
const NewsHubChrome = (() => {
  const ICONS = {
    search: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M19 19l-4.35-4.35" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    sun: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1.6"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.5 3.5l1.4 1.4M15.1 15.1l1.4 1.4M3.5 16.5l1.4-1.4M15.1 4.9l1.4-1.4"/></g></svg>`,
    moon: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M17 11.5A7 7 0 018.5 3 7 7 0 1017 11.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    system: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="10" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M7 17h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    user: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.4" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 17c1.2-3.4 4-5 6.5-5s5.3 1.6 6.5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    menu: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
  };

  const NAV_LINKS = [
    { href: '/pages/home.html', label: 'Home', key: 'home' },
    { href: '/pages/for-you.html', label: 'For You', key: 'for-you' },
    { href: '/pages/local.html', label: 'Local', key: 'local' },
    { href: '/pages/topics.html', label: 'Topics', key: 'topics' },
    { href: '/pages/saved.html', label: 'Saved', key: 'saved' }
  ];

  function themeIcon(theme) {
    if (theme === 'light') return ICONS.sun;
    if (theme === 'dark') return ICONS.moon;
    return ICONS.system;
  }

  function renderHeader(activeKey) {
    const el = document.getElementById('site-header');
    if (!el) return;
    el.innerHTML = `
      <header class="site-header">
        <div class="container">
          <a href="/pages/home.html" class="brand">NewsHub</a>
          <nav class="main-nav" aria-label="Primary">
            ${NAV_LINKS.map(l => `<a href="${l.href}" class="${l.key===activeKey?'active':''}">${l.label}</a>`).join('')}
          </nav>
          <div class="header-actions">
            <button class="icon-btn mobile-nav-toggle" id="navToggle" aria-label="Menu">${ICONS.menu}</button>
            <a class="icon-btn" href="/pages/search.html" aria-label="Search">${ICONS.search}</a>
            <button class="icon-btn" id="themeToggle" aria-label="Toggle theme">${themeIcon(NewsHubTheme.get())}</button>
            <a class="avatar-btn" href="/pages/profile.html" aria-label="Profile" id="profileLink">${ICONS.user}</a>
          </div>
        </div>
        <nav class="mobile-nav" id="mobileNav" aria-label="Primary mobile">
          ${NAV_LINKS.map(l => `<a href="${l.href}" class="${l.key===activeKey?'active':''}">${l.label}</a>`).join('')}
          <a href="/pages/topics.html">Topics</a>
        </nav>
      </header>`;

    document.getElementById('themeToggle').addEventListener('click', () => {
      const next = NewsHubTheme.cycle();
      document.getElementById('themeToggle').innerHTML = themeIcon(next);
    });
    document.getElementById('navToggle').addEventListener('click', () => {
      document.getElementById('mobileNav').classList.toggle('open');
    });
  }

  function renderFooter() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    el.innerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div>
            <div class="footer-brand">NewsHub</div>
            <div class="footer-copy">© 2026 NewsHub Media Group. All rights reserved.</div>
          </div>
          <nav class="footer-nav" aria-label="Footer">
            <a href="/pages/about.html">About</a>
            <a href="/pages/archives.html">Archives</a>
            <a href="/pages/privacy.html">Privacy</a>
            <a href="/pages/terms.html">Terms</a>
            <a href="/pages/contact.html">Contact</a>
          </nav>
        </div>
      </footer>`;
  }

  function toast(message, ms = 2400) {
    let t = document.getElementById('nh-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'nh-toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function init(activeKey) {
    renderHeader(activeKey);
    renderFooter();
  }

  return { init, toast, timeAgo, escapeHtml, ICONS };
})();
