/**
 * Thin fetch wrapper for the NewsHub Express API.
 * The browser NEVER talks to NewsAPI.org directly — only to these
 * same-origin /api/* endpoints, which proxy through the server's
 * NewsProvider abstraction.
 */
const NewsHubAPI = (() => {
  async function request(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    });

    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }

    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  return {
    // Auth
    signUp: (payload) => request('/api/auth/signup', { method: 'POST', body: payload }),
    signIn: (payload) => request('/api/auth/signin', { method: 'POST', body: payload }),
    signOut: () => request('/api/auth/signout', { method: 'POST' }),
    me: () => request('/api/auth/me'),
    changePassword: (payload) => request('/api/auth/change-password', { method: 'POST', body: payload }),
    deleteAccount: () => request('/api/auth/account', { method: 'DELETE' }),

    // Onboarding
    getCategories: () => request('/api/onboarding/categories'),
    saveInterests: (categoryIds) => request('/api/onboarding/interests', { method: 'POST', body: { categoryIds } }),
    saveOnboardingLocation: (payload) => request('/api/onboarding/location', { method: 'POST', body: payload }),
    completeOnboarding: () => request('/api/onboarding/complete', { method: 'POST' }),

    // News
    getHeadlines: (params = {}) => request('/api/news/headlines?' + new URLSearchParams(params)),
    searchNews: (q, sortBy) => request('/api/news/search?' + new URLSearchParams({ q, sortBy: sortBy || 'publishedAt' })),
    getSources: (params = {}) => request('/api/news/sources?' + new URLSearchParams(params)),
    getLocalNews: () => request('/api/news/local'),
    getPersonalized: () => request('/api/news/personalized'),
    getArticle: (id) => request(`/api/news/article/${id}`),
    updateReadProgress: (id, progress) => request(`/api/news/article/${id}/progress`, { method: 'POST', body: { progress } }),
    getNewsCategories: () => request('/api/news/categories'),
    getArchives: (params = {}) => request('/api/news/archives?' + new URLSearchParams(params)),

    // User
    getProfile: () => request('/api/user/profile'),
    updatePreferences: (payload) => request('/api/user/preferences', { method: 'PATCH', body: payload }),
    updateInterests: (categoryIds) => request('/api/user/interests', { method: 'PUT', body: { categoryIds } }),
    followSource: (id) => request(`/api/user/sources/${id}`, { method: 'POST' }),
    unfollowSource: (id) => request(`/api/user/sources/${id}`, { method: 'DELETE' }),
    updateLocation: (payload) => request('/api/user/location', { method: 'PUT', body: payload }),
    getSaved: () => request('/api/user/saved'),
    saveArticle: (id) => request(`/api/user/saved/${id}`, { method: 'POST' }),
    unsaveArticle: (id) => request(`/api/user/saved/${id}`, { method: 'DELETE' }),
    getHistory: () => request('/api/user/history'),
    clearHistory: () => request('/api/user/history', { method: 'DELETE' })
  };
})();
