/**
 * Theme handling — light / dark / system.
 * Applied instantly on load (before paint-blocking) to avoid flash,
 * and persisted both locally (fast) and to the user's preferences
 * in MySQL when they're signed in (via NewsHubAPI.updatePreferences).
 */
const NewsHubTheme = (() => {
  const KEY = 'newshub.theme';

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function apply(theme) {
    const resolved = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }

  function get() {
    return localStorage.getItem(KEY) || 'system';
  }

  function set(theme, { persist = true } = {}) {
    localStorage.setItem(KEY, theme);
    apply(theme);
    if (persist && window.NewsHubAPI) {
      NewsHubAPI.updatePreferences({ theme }).catch(() => {});
    }
    document.dispatchEvent(new CustomEvent('newshub:theme-changed', { detail: { theme } }));
  }

  function cycle() {
    const order = ['light', 'dark', 'system'];
    const current = get();
    const next = order[(order.indexOf(current) + 1) % order.length];
    set(next);
    return next;
  }

  apply(get());

  return { get, set, cycle, apply };
})();
