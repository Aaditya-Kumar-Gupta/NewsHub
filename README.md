# 🚀 NewsHUB V2 — Changelog

> A major evolution of NewsHUB focused on **performance, personalization, location-aware news, caching, database optimization, and a more scalable backend architecture**.

---

# 📌 NewsHUB V2.0

## 🌟 Release Overview

NewsHUB V2 transforms the original NewsHUB application from a traditional news aggregation website into a more structured and performance-focused personalized news platform.

The V2 release introduces:

- 🧠 Personalized news recommendations
- 📍 Location-based news
- ⚡ Faster Home page loading
- 🗄️ MySQL-backed API caching
- 🚀 Optimized batch article ingestion
- 🧮 Optimized personalized candidate retrieval
- 🏆 Optimized ranking and scoring
- 🗃️ Additional MySQL indexes
- 🔐 Improved user preference integration
- 🏗️ A more scalable Node.js + Express architecture
- 🤖 Architecture prepared for future AI-powered personalization

---

# ✨ Major Changes

## 1. 🧠 Personalized News Feed

NewsHUB V2 introduces a rule-based personalization engine that generates a user-specific news feed from information stored in the user's profile.

The personalization engine considers:

| Signal | Weight |
|---|---:|
| Interest Match | 40% |
| Location Relevance | 25% |
| Recency | 15% |
| Source Preference | 10% |
| Trending Signal | 10% |

### Personalization Flow

```text
User Preferences
       ↓
Candidate Articles
       ↓
Article Scoring
       ↓
Personalization Ranking
       ↓
Top Articles
       ↓
Personalized Feed
```

The same collection of articles can therefore produce different rankings for different users depending on their interests, location, and preferred sources.

---

# 2. 📍 Location-Aware News

NewsHUB V2 introduces location-based news functionality.

User location preferences can include:

- Country
- State
- City
- Country code

Location information is used to:

- Retrieve local stories
- Rank location-relevant content
- Display Local Focus content
- Improve personalized recommendations

### Location Flow

```text
User Location
     ↓
Location Preferences
     ↓
Local News Provider
     ↓
MySQL Cache
     ↓
Location Relevance Scoring
     ↓
Local News Feed
```

---

# 3. 🏠 Home Page Performance Optimization

The Home page loading flow was redesigned to reduce unnecessary waiting between requests.

### Previous Flow

```text
Authentication
      ↓
Profile
      ↓
Personalized News
      ↓
Render Home
      ↓
Local News
```

### V2 Flow

```text
Authentication
      ↓
 ┌────┴──────────────┐
 ↓                   ↓
Profile        Personalized News
 └───────┬───────────┘
         ↓
     Render Home
         ↓
   Load Local Focus
```

Profile and personalized news requests are now performed in parallel after authentication is established.

Local Focus is treated as secondary content so it does not block the primary Home feed.

### Frontend Improvements

- Parallel profile and personalized API requests
- Independent Local Focus loading
- Lazy loading for Local Focus images
- Primary content rendered before secondary content
- Reduced request waterfall

---

# 4. 🗄️ Persistent MySQL API Cache

NewsHUB V2 introduces a persistent API response cache stored in MySQL.

This reduces repeated calls to the external News Provider and improves repeat request performance.

## Cache Durations

| Data | Cache Duration |
|---|---:|
| Headlines | 5 minutes |
| Search | 2 minutes |
| Sources | 1 hour |
| Location News | 10 minutes |

### Cache Flow

```text
Frontend Request
       ↓
Check MySQL API Cache
       ↓
 ┌─────┴─────┐
 ↓           ↓
HIT         MISS
 ↓           ↓
Return      News Provider
Cached        ↓
Data       Store Cache
             ↓
          Return Data
```

### Cache Status

NewsHUB responses expose cache status using:

```text
X-NewsHub-Cache: HIT
```

or:

```text
X-NewsHub-Cache: MISS
```

This makes cache behavior easy to inspect during development and debugging.

---

# 5. 🚀 Optimized Batch News Ingestion

The original ingestion process required multiple database operations for each article.

NewsHUB V2 introduces a bulk ingestion process.

## Previous Ingestion Pattern

```text
Article 1
 ├── Source lookup
 ├── Article lookup
 ├── Article insert/update
 ├── Category lookup
 └── Category relationship

Article 2
 └── Repeat

Article 3
 └── Repeat

...
```

## V2 Ingestion Pattern

```text
News Provider Response
        ↓
In-memory Deduplication
        ↓
Bulk Source Operation
        ↓
Bulk Article Upsert
        ↓
Bulk Article ID Resolution
        ↓
Bulk Category Relationships
        ↓
MySQL Transaction
```

### Improvements

- Duplicate URLs removed before database access
- Bulk source insertion
- Bulk source ID lookup
- Bulk article upsert
- Bulk article ID resolution
- Bulk category relationship insertion
- Transaction-based consistency
- Fewer MySQL round trips
- Better scalability for larger article batches

---

# 6. 🧮 Personalized Candidate Retrieval Optimization

The personalized feed previously retrieved up to **400 candidate articles** for each request.

V2 introduces a bounded candidate pool.

```javascript
const candidateLimit = Math.min(
  240,
  Math.max(limit * 6, 120)
);
```

For the standard:

```text
limit = 30
```

the system evaluates up to:

```text
180 candidates
```

instead of:

```text
400 candidates
```

### Benefits

- Less data retrieved from MySQL
- Lower memory consumption
- Less Node.js processing
- Less personalization work
- Faster candidate preparation
- Better scalability as the article database grows

---

# 7. 🏆 Personalized Ranking Optimization

The personalization engine previously:

```text
Score all candidates
       ↓
Store every scored result
       ↓
Sort the entire collection
       ↓
Return top N
```

V2 instead maintains only the current top results while candidates are being processed.

```text
Candidate
    ↓
Calculate score
    ↓
Compare with current Top N
    ↓
Keep only required ranking results
```

A dedicated `insertTopScore()` routine maintains the current top-ranked articles.

### Benefits

- Avoids a final full-array sort
- Reduces temporary memory usage
- Keeps ranking work focused on requested results
- Preserves the existing personalization scoring model

---

# 8. 🗃️ MySQL Query Index Optimization

Additional indexes were introduced to support common NewsHUB query patterns.

## Articles

```text
(location_tag, published_at)
(source_id, published_at)
```

## Article Categories

```text
(category_id, article_id)
```

## User Sources

```text
(source_id, user_id)
```

### Purpose

These indexes improve queries involving:

- Local news retrieval
- Date-based article ordering
- Source-based filtering
- Category-to-article lookup
- User source relationships

---

# 9. 🔐 User Preference Integration

User preferences now play a larger role in content delivery.

Preferences can influence:

- News categories
- Preferred sources
- Location
- Local news behavior
- Breaking news behavior
- Language
- Theme

This provides the foundation for progressively smarter news recommendations.

---

# 10. 🔄 News Provider Abstraction

NewsHUB V2 uses a provider abstraction rather than tightly coupling routes directly to one external API implementation.

```text
Application
     ↓
News Provider
     ↓
External News API
```

This makes the architecture easier to extend or replace when a different news provider is introduced.

The same abstraction can also support future AI-assisted or alternative news data providers.

---

# 11. 🧱 Backend Architecture Upgrade

The V2 backend uses a Node.js + Express architecture.

### Main Layers

```text
Frontend
   ↓
Express Routes
   ↓
Services
   ↓
News Provider / Personalization
   ↓
MySQL
```

### Main Responsibilities

#### Routes

Handle:

- HTTP requests
- Authentication requirements
- Request validation
- API responses

#### Services

Handle:

- News fetching
- News ingestion
- Personalization
- Location matching
- API caching

#### Database

Handles:

- Users
- Preferences
- Interests
- Sources
- Articles
- Categories
- Saved articles
- Reading history
- Sessions
- API cache

---

# 12. 📚 News Data Pipeline

NewsHUB V2 follows a more structured processing pipeline:

```text
External News API
       ↓
News Provider
       ↓
Normalize Article Data
       ↓
Deduplicate Articles
       ↓
Bulk MySQL Ingestion
       ↓
Article Storage
       ↓
Personalization Engine
       ↓
User-Specific Ranking
       ↓
Frontend
```

For cached requests:

```text
Frontend
   ↓
API Route
   ↓
MySQL API Cache
   ↓
Cache HIT → Response
```

---

# ⚡ Performance Improvements

The primary performance goals of V2 are:

- Reduce external API calls
- Reduce database round trips
- Reduce unnecessary database reads
- Reduce frontend request waterfalls
- Reduce ranking workload
- Reduce memory usage
- Return cached content faster
- Move secondary work away from the critical rendering path

### Performance Strategy

```text
Fetch Less
    +
Cache More
    +
Query Smarter
    +
Process Fewer Candidates
    +
Rank Efficiently
    =
Faster NewsHub
```

---

# 🎯 User Experience Improvements

V2 improves the user-facing experience through:

- Personalized Home feed
- Location-aware content
- Local Focus
- Trending content
- Faster repeat requests
- Better loading behavior
- Reduced dependency on live provider requests
- More responsive content delivery
- Light and dark theme support
- Responsive frontend architecture

---

# 🛠️ Tech Stack — V2

## Frontend

- HTML5
- CSS3
- JavaScript
- Responsive design
- Light / Dark theme system

## Backend

- Node.js
- Express.js
- REST APIs
- Session-based authentication

## Database

- MySQL 8.x
- InnoDB
- Relational schema
- Indexed queries
- Persistent API cache

## External APIs

- Free/Public News API integration
- News Provider abstraction

## Development Tools

- Visual Studio Code
- Git
- GitHub

---

# 🔐 Security & Privacy

NewsHUB V2 continues to use authenticated access for protected functionality.

Protected functionality includes:

- Personalized News
- Local News
- Reading progress
- User-specific data

User location is represented at the application level using location records such as:

- City
- State
- Country
- Country code

The database architecture separates user information, preferences, locations, interests, sources, and articles into dedicated tables.

---

# 🗂️ Database Structure

NewsHUB V2 uses a normalized relational data model.

Major tables include:

```text
users
locations
user_preferences
categories
sources
articles
article_categories
user_interests
user_sources
saved_articles
reading_history
sessions
api_cache
```

### High-Level Relationship

```text
Users
 ├── User Preferences
 │       └── Location
 │
 ├── User Interests
 │       └── Categories
 │
 ├── User Sources
 │       └── Sources
 │
 ├── Saved Articles
 │       └── Articles
 │
 └── Reading History
         └── Articles

Articles
 ├── Sources
 └── Categories
```

---

# 🤖 Future AI Integration

AI integration is intentionally planned as a future extension.

The current rule-based personalization engine provides a foundation that can later incorporate AI/ML models.

Potential future signals include:

- Reading history
- Saved articles
- User engagement
- Article similarity
- Topic similarity
- Source affinity
- Reading frequency
- User behavior patterns

### Potential Future Architecture

```text
User Behavior
      ↓
Feature Collection
      ↓
AI / ML Model
      ↓
Recommendation Score
      ↓
Personalized Feed
```

The existing V2 architecture allows this to be introduced without replacing the entire application architecture.

---

# 🔮 Future Roadmap

## 🤖 AI-Powered Recommendations

Introduce AI-assisted recommendation and ranking.

## 📰 Smarter Content Discovery

Improve article discovery using behavioral and semantic signals.

## 📊 Analytics

Potential analytics for:

- User engagement
- Popular categories
- Trending topics
- Article popularity
- Source performance

## 🎥 Multimedia News

Potential support for:

- Videos
- Podcasts
- Infographics
- Rich media

## 🌍 Multilingual Expansion

Expand support for localized and multilingual content.

## 🧠 Advanced Personalization

Future recommendation models may combine:

```text
Explicit Preferences
+
Reading History
+
Saved Articles
+
Location
+
Source Preferences
+
Behavior
+
AI Signals
```

---

# 📊 Version Comparison

| Area | NewsHUB V1 | NewsHUB V2 |
|---|---|---|
| Frontend | HTML / CSS / JavaScript | HTML / CSS / JavaScript |
| Backend | PHP | Node.js + Express |
| Database | MySQL | MySQL 8.x |
| News Fetching | External News API | Provider abstraction + caching |
| Personalization | Basic | Weighted rule-based engine |
| Interest Matching | Limited | ✅ |
| Location News | Limited | ✅ |
| Local Focus | ❌ | ✅ |
| API Response Cache | ❌ | ✅ |
| Bulk Ingestion | Basic | ✅ |
| Article Deduplication | Basic | ✅ |
| Candidate Pool | Up to 400 | Bounded candidate pool |
| Ranking | Full collection sort | Top-N ranking |
| Query Indexes | Basic | Query-specific indexes |
| Home Loading | Sequential requests | Parallel critical requests |
| Secondary Content | Blocking/Sequential | Background loading |
| Lazy Image Loading | Limited | ✅ |
| AI Integration | Future | Architecture prepared |

---

# 🧪 Database Migration for V2

## API Cache Table

V2 introduces the following table:

```sql
CREATE TABLE IF NOT EXISTS api_cache (
  cache_key CHAR(64) NOT NULL PRIMARY KEY,
  namespace VARCHAR(80) NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_api_cache_expires (expires_at),
  KEY idx_api_cache_namespace (namespace)
) ENGINE=InnoDB;
```

## Additional Indexes

V2 also introduces indexes for frequently used query patterns:

```sql
ALTER TABLE articles
  ADD INDEX idx_articles_location_published
    (location_tag, published_at),
  ADD INDEX idx_articles_source_published
    (source_id, published_at);

ALTER TABLE article_categories
  ADD INDEX idx_article_categories_category_article
    (category_id, article_id);

ALTER TABLE user_sources
  ADD INDEX idx_user_sources_source_user
    (source_id, user_id);
```

> Run migration statements only once on an existing database. If an index already exists, do not create a duplicate index with the same name.

---

# 🚀 Getting Started with NewsHUB V2

## Prerequisites

Make sure you have:

- Node.js
- npm
- MySQL 8.x
- Git
- A configured News API key

---

## Clone the Repository

```bash
git clone https://github.com/Aaditya-Kumar-Gupta/NewsHub.git
cd NewsHub
```

---

## Switch to V2

```bash
git checkout NewsHub-V2
```

---

## Install Dependencies

```bash
npm install
```

---

## Configure Environment Variables

Create or update your `.env` file with the required database and API configuration.

Example:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=newshub

NEWS_API_KEY=your_news_api_key

SESSION_SECRET=your_session_secret
```

> Do not commit `.env` or API secrets to GitHub.

---

## Initialize the Database

Run:

```bash
npm run db:init
```

This initializes the NewsHUB database schema.

For the V2 API cache, make sure the `api_cache` table has also been created.

---

## Start the Application

```bash
npm start
```

The application will run on the configured server port.

---

# 🧪 Recommended V2 Testing

After deployment or local setup, verify the following.

## Authentication

```text
Signup
   ↓
Signin
   ↓
Session maintained
   ↓
Protected pages accessible
```

## Personalized Feed

```text
Signin
   ↓
Home
   ↓
Personalized articles
```

## Local News

```text
User Location
   ↓
Local News
   ↓
Cached/Provider articles
```

## Cache

Open browser developer tools:

```text
F12
→ Network
→ API request
→ Response Headers
```

Check:

```text
X-NewsHub-Cache
```

Expected values:

```text
HIT
```

or:

```text
MISS
```

## Database Cache

Run:

```sql
SELECT
  namespace,
  created_at,
  expires_at
FROM api_cache
ORDER BY created_at DESC;
```

---

# 📌 V2 Optimization Summary

### Step 1 — Personalized Feed

Introduced cached, user-specific personalized news generation.

### Step 2 — Local News

Added MySQL-first local news retrieval with background provider refresh.

### Step 3 — Home Loading

Reduced frontend request waterfall through parallel API requests and independent Local Focus loading.

### Step 4 — Batch Ingestion

Reworked article ingestion to use bulk database operations and fewer MySQL round trips.

### Step 5 — API Caching

Introduced persistent MySQL-backed caching for external News Provider responses.

### Step 6 — Database Indexing

Added indexes for location, source, category, and relationship lookup patterns.

### Step 7A — Candidate Retrieval

Reduced the personalized feed candidate pool from up to 400 articles to a bounded candidate set.

### Step 7B — Ranking Optimization

Changed ranking to maintain only the required Top-N results rather than sorting the complete scored collection.

---

# 🏁 V2 Philosophy

NewsHUB V2 is built around five principles:

> **Fetch less.**  
> **Cache more.**  
> **Query smarter.**  
> **Personalize better.**  
> **Deliver faster.**

---

# 📜 Release Information

| Property | Value |
|---|---|
| Project | NewsHUB |
| Version | 2.0 |
| Backend | Node.js + Express |
| Frontend | HTML + CSS + JavaScript |
| Database | MySQL 8.x |
| News Provider | Free/Public News API |
| Personalization | Rule-based |
| API Caching | MySQL-backed |
| Location Support | City / State / Country |
| AI Integration | Planned |
| Repository Branch | `NewsHub-V2` |

---

# 👥 Contributors

The original NewsHUB project contributors include:

- [Aditya Kumar Gupta](https://github.com/Aaditya-Kumar-Gupta)
- [Rishabh Bhardwaj](https://github.com/rishu-bhardwajjj)
- [Abhi Grover](https://github.com/abhigrover12)
- [Pratik](https://github.com/PratikXPramanik)
- [Shobhit Sharma](https://github.com/ShobhitxSharma)

---

# 🤝 GitHub Contributors

We would like to recognize everyone who has contributed to the NewsHUB project through GitHub.

<a href="https://github.com/Aaditya-Kumar-Gupta/NewsHub/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Aaditya-Kumar-Gupta/NewsHub" alt="NewsHUB GitHub Contributors" />
</a>

---

### 📊 GitHub Contributors

[View all contributors and contribution activity on GitHub](https://github.com/Aaditya-Kumar-Gupta/NewsHub/graphs/contributors)

---

# 📄 License

NewsHUB is released under the **MIT License**.

---

# 🙌 Acknowledgments

Thanks to mentors, peers, contributors, and the open-source community for their support and feedback throughout the development of NewsHUB.

---

# ⭐ NewsHUB V2

**A faster, smarter, more personalized way to experience the news.**