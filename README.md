# NewsHub

A location-aware, personalized news web app built with **vanilla HTML/CSS/JS** on the frontend and **Node.js + Express + MySQL** on the backend — no frontend frameworks, no ORMs, no TypeScript.

Design is grounded in the supplied Figma file (editorial serif headlines, warm terracotta/cream palette, teal accents).

## 🌐 Live Website

**[Visit NewsHub Live](https://newshub-z730.onrender.com/pages/home.html)**

## Architecture

```
Browser (public/) — plain HTML/CSS/JS, talks only to same-origin /api/*
        │
Express API (server/)
        │
  ┌─────┴──────────────────────────────┐
  │                                     │
MySQL (users, articles, prefs, ...)   NewsProvider (abstract)
                                         │
                                   NewsAPIProvider
                                         │
                                     NewsAPI.org
```

- `server/services/NewsProvider.js` — abstract interface (`getTopHeadlines`, `search`, `getSources`).
- `server/services/NewsAPIProvider.js` — the only file that knows about NewsAPI.org's REST shape, auth header, and endpoint mapping. Also implements `getByLocation()` (NewsAPI has no such endpoint, so this searches `/v2/everything` for the place name and falls back to `/v2/top-headlines?country=`).
- `server/services/personalizationEngine.js` — rule-based scoring: Interest match 40%, Location relevance 25%, Recency 15%, Source preference 10%, Trending 10%.
- `server/services/locationMatcher.js` — reusable city/state/country relevance scoring, used by both `/api/news/local` and the personalization engine.
- `server/services/ingestionService.js` — normalizes and **deduplicates** provider articles into MySQL via a SHA-256 hash of the article URL (unique key `url_hash`).
- The browser **never** calls NewsAPI.org directly and the `NEWS_API_KEY` never leaves the server.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# edit .env: MySQL credentials + your NewsAPI.org key (https://newsapi.org)
```

### 3. Create the database schema
```bash
npm run db:init
```
This connects to MySQL and runs `sql/schema.sql`, which creates the `newshub` database, all tables (users, locations, user_preferences, categories, sources, articles, article_categories, user_interests, user_sources, saved_articles, reading_history, sessions), and seeds the 11 interest categories.

### 4. Run the server
```bash
npm start
```
Visit `http://localhost:3000`.

## User flow implemented

- **New user:** Sign Up → Preference Selection (interests) → Location Selection → Build My NewsHub → Home/Discover
- **Existing user:** Sign In → Home/Discover
- **Main nav:** Home, For You, Local, Topics, Search, Profile
- **Supporting nav:** About, Archives, Privacy, Terms, Contact
- **Article navigation:** any article → Article Detail → related story → another Article Detail; Saved → Article Detail; Archives → Article Detail

## Notes on scope

This is a complete, runnable full-stack implementation of every required page and API surface. A couple of pragmatic choices worth knowing about:

- Reverse-geocoding for "Use current location" during onboarding calls a free, keyless client-side geocoding API (`bigdatacloud.net`) purely to turn lat/lng into a city/state/country label — this is unrelated to the NewsAPI key rule (which only concerns NewsAPI.org) and never touches the server. Only city-level, rounded coordinates are ever persisted.
- The personalization engine scores against whatever has already been ingested into MySQL (via prior headline/search/local calls). In a production deployment you'd add a scheduled job calling `ingestionService` on a cron to keep the candidate pool fresh continuously; the hook points for that are in `server/services/ingestionService.js`.
- The 36 Figma frames map onto ~13 distinct page templates (desktop/mobile/state variants of the same designs); this build implements one responsive template per page rather than 36 separate static screens, per the brief's own instruction that "Figma mobile screens are references for responsive behavior," not separate pages.

## 🤝 GitHub Contributors

We would like to recognize everyone who has contributed to the NewsHUB project through GitHub.

<a href="https://github.com/Aaditya-Kumar-Gupta/NewsHub/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Aaditya-Kumar-Gupta/NewsHub" alt="NewsHUB GitHub Contributors" />
</a>

### 👥 Project Contributors

We're grateful to everyone who has contributed to the development and improvement of NewsHUB.

<a href="https://github.com/rishu-bhardwajjj">
  <img src="https://github.com/rishu-bhardwajjj.png" width="60" height="60" alt="Rishabh Bhardwaj" />
</a>
<a href="https://github.com/abhigrover12">
  <img src="https://github.com/abhigrover12.png" width="60" height="60" alt="Abhi Grover" />
</a>
<a href="https://github.com/PratikXPramanik">
  <img src="https://github.com/PratikXPramanik.png" width="60" height="60" alt="Pratik" />
</a>
<a href="https://github.com/ShobhitxSharma">
  <img src="https://github.com/ShobhitxSharma.png" width="60" height="60" alt="Shobhit Sharma" />
</a>

> 💙 Thank you to everyone who has contributed code, ideas, feedback, testing, and improvements to NewsHUB.

[View all contributors on GitHub](https://github.com/Aaditya-Kumar-Gupta/NewsHub/graphs/contributors)
