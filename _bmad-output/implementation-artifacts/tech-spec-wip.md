---
title: 'ScrapTrends - LinkedIn Trend Intelligence Tool'
slug: 'scraptrends'
created: '2026-02-11'
status: 'review'
stepsCompleted: [1, 2, 3]
tech_stack:
  - Python 3.12+
  - FastAPI
  - React (Vite + TypeScript)
  - PostgreSQL
  - SQLAlchemy
  - Apify API (powerai/linkedin-posts-search-scraper)
  - Gemini API
  - Docker Compose
files_to_modify:
  - backend/app/main.py
  - backend/app/config.py
  - backend/app/db.py
  - backend/app/models/post.py
  - backend/app/models/scrape_job.py
  - backend/app/schemas/scrape.py
  - backend/app/schemas/post.py
  - backend/app/schemas/analysis.py
  - backend/app/routers/scrape.py
  - backend/app/routers/posts.py
  - backend/app/routers/analysis.py
  - backend/app/services/apify_scraper.py
  - backend/app/services/ranking.py
  - backend/app/services/classifier.py
  - backend/app/services/gemini.py
  - frontend/src/App.tsx
  - frontend/src/api/client.ts
  - frontend/src/components/ScrapeForm.tsx
  - frontend/src/components/ResultsTable.tsx
  - frontend/src/components/TrendRanking.tsx
  - frontend/src/components/AnalysisPanel.tsx
  - frontend/src/pages/HomePage.tsx
  - frontend/src/pages/ResultsPage.tsx
  - frontend/src/types/index.ts
  - docker-compose.yml
  - .env.example
code_patterns:
  - FastAPI async routers with Pydantic schemas
  - SQLAlchemy ORM models with Alembic migrations
  - React functional components with hooks
  - Service layer pattern (scraper, ranking, gemini)
test_patterns:
  - pytest + httpx for FastAPI endpoint testing
  - Manual E2E testing for MVP
---

# Tech-Spec: ScrapTrends - LinkedIn Trend Intelligence Tool

**Created:** 2026-02-11

## Overview

### Problem Statement

PlayPlay's product and creative teams rely on manual monitoring to identify emerging social media and corporate communication trends. This process is slow, inconsistent, and doesn't scale. There is a structural lag between trend emergence and PlayPlay developing corresponding motion design templates.

### Solution

A web-based internal tool that automates LinkedIn trend discovery via Apify scraping, stores structured post data in PostgreSQL, ranks content by engagement score, and uses Gemini AI to analyze creative execution on top-performing posts. Users configure scraping parameters (search query, corporate/generic, sector, content type) through a React frontend, and receive ranked trend reports with AI-powered creative insights.

### Scope

**In Scope (POC - LinkedIn only):**
- LinkedIn scraping via Apify actor `powerai/linkedin-posts-search-scraper`
- Corporate/generic content filtering with sector selection (Health, Retail, Industry, Finance, Tech, Education, Sport, Media)
- PostgreSQL database with full post metadata
- Engagement scoring: (Reactions + Comments + Shares + Clicks) / Impressions x 100
- Top 10 trend ranking grouped by format type with all source URLs
- Metadata-based format family classification (long video, short video, static, text)
- Gemini API creative analysis on top performers only (format variation, ICP, communication style)
- React frontend for configuration input and results display
- FastAPI backend with REST endpoints
- Local deployment first, then Namecheap domain

**Out of Scope (POC):**
- YouTube and TikTok scraping (future platforms)
- Client-facing features
- Automated scheduling/recurring scrapes
- User authentication/multi-tenancy
- Historical trend tracking over time
- Export/reporting features

## Context for Development

### Confirmed Clean Slate

Greenfield project at `/Users/carlo.dhalluin/Desktop/ScrapTrends/`. No existing codebase.

### Project Structure

```
ScrapTrends/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                # FastAPI app, CORS, router registration
│   │   ├── config.py              # Settings via pydantic-settings (.env)
│   │   ├── db.py                  # SQLAlchemy engine, session, Base
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── post.py            # Post model (all scraped data)
│   │   │   └── scrape_job.py      # ScrapeJob model (tracks each run)
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── scrape.py          # ScrapeRequest, ScrapeResponse
│   │   │   ├── post.py            # PostOut, RankedPostOut
│   │   │   └── analysis.py        # AnalysisRequest, AnalysisResponse
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── scrape.py          # POST /api/scrape (trigger Apify)
│   │   │   ├── posts.py           # GET /api/posts (list, filter, rank)
│   │   │   └── analysis.py        # POST /api/analysis (Gemini on selected posts)
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── apify_scraper.py   # Apify client: run actor, parse results, store
│   │       ├── ranking.py         # Engagement scoring + Top 10 grouping
│   │       ├── classifier.py      # Metadata-based format family classification
│   │       └── gemini.py          # Gemini video analysis client
│   ├── alembic/                   # Database migrations
│   ├── alembic.ini
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── api/
│   │   │   └── client.ts          # Axios/fetch wrapper for backend
│   │   ├── components/
│   │   │   ├── ScrapeForm.tsx     # Search query + sector + content type + corporate toggle
│   │   │   ├── ResultsTable.tsx   # All scraped posts with sorting
│   │   │   ├── TrendRanking.tsx   # Top 10 grouped by format
│   │   │   └── AnalysisPanel.tsx  # Gemini creative analysis display
│   │   ├── pages/
│   │   │   ├── HomePage.tsx       # ScrapeForm + trigger
│   │   │   └── ResultsPage.tsx    # ResultsTable + TrendRanking + AnalysisPanel
│   │   └── types/
│   │       └── index.ts           # TypeScript interfaces matching backend schemas
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── Dockerfile
├── docker-compose.yml             # FastAPI + PostgreSQL + React (dev)
├── .env.example                   # APIFY_TOKEN, GEMINI_API_KEY, DATABASE_URL
└── _bmad-output/                  # BMAD planning + implementation artifacts
```

### Codebase Patterns

- **Backend**: FastAPI with async routers, service layer pattern, SQLAlchemy ORM, Pydantic schemas
- **Frontend**: React 18 + Vite + TypeScript, functional components, hooks for state/effects
- **Database**: PostgreSQL via SQLAlchemy, Alembic for migrations
- **Config**: pydantic-settings loading from `.env` file
- **API design**: RESTful, JSON request/response, OpenAPI auto-docs at `/docs`

### Technical Decisions

1. **POC scoped to LinkedIn only** - Using `powerai/linkedin-posts-search-scraper` Apify actor. YouTube/TikTok deferred
2. **Apify actor input mapping**:
   - `searchQuery` → user's search term
   - `contentType` → "videos" / "images" / "documents" / all (maps to format family filter)
   - `authorIndustry` → sector filter (Health, Retail, etc.)
   - `fromOrganization` / `authorCompany` → corporate filter
   - `maxResults` → configurable limit
   - `sortBy` → "relevance" (default)
3. **FastAPI over Flask/Django** - Async for parallel Apify + Gemini calls, auto OpenAPI docs
4. **PostgreSQL** - Proper querying for ranked aggregations, sector/platform filtering
5. **React + Vite** - Fast dev, TypeScript safety, reusable for future client-facing version
6. **Two-tier format classification**:
   - Tier 1 (all posts): Metadata rules for format family (video duration → long/short, content type detection)
   - Tier 2 (top performers only): Gemini AI for format variation + creative execution analysis
7. **Docker Compose** for local dev, then deploy to VPS with Namecheap domain

### Database Schema

**posts table:**
| Column | Type | Description |
| --- | --- | --- |
| id | UUID | Primary key |
| scrape_job_id | UUID FK | Links to scrape job |
| title | TEXT | Post title/text |
| author_name | TEXT | Author name |
| author_company | TEXT | Company/organization |
| sector | VARCHAR | Sector classification |
| platform | VARCHAR | "linkedin" (extensible) |
| content_type | VARCHAR | Original content type from scraper |
| format_family | VARCHAR | Classified: long_video, short_video, static, text |
| format_variation | VARCHAR | Gemini-classified: UGC, stop_motion, reaction, etc. (nullable) |
| reactions | INTEGER | Reaction count |
| comments | INTEGER | Comment count |
| shares | INTEGER | Share count |
| clicks | INTEGER | Click count |
| impressions | INTEGER | Impression count |
| engagement_score | FLOAT | Computed: (reactions+comments+shares+clicks)/impressions*100 |
| post_url | TEXT | Source URL |
| video_url | TEXT | Direct video URL (nullable) |
| publication_date | TIMESTAMP | Original post date |
| created_at | TIMESTAMP | Record creation time |

**scrape_jobs table:**
| Column | Type | Description |
| --- | --- | --- |
| id | UUID | Primary key |
| search_query | TEXT | User's search query |
| sector | VARCHAR | Selected sector |
| content_type_filter | VARCHAR | Content type filter used |
| is_corporate | BOOLEAN | Corporate filter toggle |
| max_results | INTEGER | Requested max results |
| status | VARCHAR | pending/running/completed/failed |
| total_posts | INTEGER | Posts scraped |
| apify_run_id | VARCHAR | Apify run reference |
| created_at | TIMESTAMP | Job creation time |
| completed_at | TIMESTAMP | Job completion time |

**gemini_analyses table:**
| Column | Type | Description |
| --- | --- | --- |
| id | UUID | Primary key |
| post_id | UUID FK | Links to analyzed post |
| format_variation | VARCHAR | Identified format variation |
| target_icp | TEXT | Identified ICP |
| communication_tone | TEXT | Communication tone analysis |
| visual_style | TEXT | Visual style description |
| editing_techniques | TEXT | Editing techniques identified |
| full_analysis | JSONB | Complete Gemini response |
| created_at | TIMESTAMP | Analysis time |

### API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/scrape` | Trigger Apify scrape with parameters |
| GET | `/api/scrape/{job_id}` | Get scrape job status |
| GET | `/api/posts` | List posts with filtering (sector, format, date range) |
| GET | `/api/posts/ranking` | Get Top 10 trends grouped by format with engagement scores |
| POST | `/api/analysis` | Trigger Gemini analysis on selected post IDs |
| GET | `/api/analysis/{post_id}` | Get Gemini analysis result for a post |

## Implementation Plan

### Tasks

#### Phase 1: Infrastructure Setup

- [ ] Task 1: Initialize project scaffolding
  - Files: `docker-compose.yml`, `.env.example`, `backend/requirements.txt`, `backend/Dockerfile`, `backend/app/__init__.py`
  - Action: Create Docker Compose with PostgreSQL 16 + FastAPI services. Create `.env.example` with `APIFY_TOKEN`, `GEMINI_API_KEY`, `DATABASE_URL`, `CORS_ORIGINS`. Create `requirements.txt` with fastapi, uvicorn, sqlalchemy, asyncpg, alembic, pydantic-settings, apify-client, google-generativeai, httpx, python-dotenv.
  - Notes: PostgreSQL container with persistent volume. FastAPI container with hot-reload for dev.

- [ ] Task 2: Backend config and database setup
  - Files: `backend/app/config.py`, `backend/app/db.py`, `backend/app/main.py`
  - Action: Create `Settings` class using pydantic-settings to load env vars. Create SQLAlchemy async engine + session factory. Create FastAPI app with CORS middleware and router registration.
  - Notes: Use `asyncpg` driver for async PostgreSQL. CORS allows `localhost:5173` (Vite dev).

- [ ] Task 3: Database models and migrations
  - Files: `backend/app/models/__init__.py`, `backend/app/models/post.py`, `backend/app/models/scrape_job.py`, `backend/alembic.ini`, `backend/alembic/`
  - Action: Create SQLAlchemy models for `posts`, `scrape_jobs`, and `gemini_analyses` tables per schema above. Initialize Alembic and generate initial migration.
  - Notes: Use UUID primary keys via `uuid.uuid4`. Add indexes on `scrape_job_id`, `sector`, `format_family`, `engagement_score`.

- [ ] Task 4: Pydantic schemas
  - Files: `backend/app/schemas/__init__.py`, `backend/app/schemas/scrape.py`, `backend/app/schemas/post.py`, `backend/app/schemas/analysis.py`
  - Action: Create request/response schemas. `ScrapeRequest` (search_query, sector, content_type_filter, is_corporate, max_results). `ScrapeResponse` (job_id, status). `PostOut` (all post fields). `RankedTrendOut` (format_family, post_count, avg_engagement_score, top_posts list with URLs). `AnalysisRequest` (post_ids list). `AnalysisOut` (all gemini_analyses fields).
  - Notes: Use Pydantic v2 model_config for ORM mode.

#### Phase 2: Apify Scraping Pipeline

- [ ] Task 5: Apify scraper service
  - File: `backend/app/services/apify_scraper.py`
  - Action: Create `ApifyScraper` class that: (1) accepts scrape parameters, (2) maps them to Apify actor input (searchQuery, contentType, authorIndustry, fromOrganization, maxResults, sortBy), (3) calls `powerai/linkedin-posts-search-scraper` via apify-client, (4) polls for completion, (5) fetches dataset items, (6) returns parsed results.
  - Notes: Use `ApifyClient` from `apify-client` package. Map actor output fields to our Post model fields. Carlo will confirm exact output field names during implementation.

- [ ] Task 6: Format classifier service
  - File: `backend/app/services/classifier.py`
  - Action: Create `classify_format_family(post_data)` function that uses metadata rules to assign format_family. Rules: if content_type contains "video" and duration > 60s → "long_video", video and duration <= 60s → "short_video", image/carousel → "static", text-only → "text". If duration not available, default video to "short_video".
  - Notes: Format taxonomy details TBD from Carlo. Implement with configurable thresholds.

- [ ] Task 7: Scrape router and endpoint
  - File: `backend/app/routers/scrape.py`
  - Action: Create `POST /api/scrape` endpoint that: (1) validates ScrapeRequest, (2) creates ScrapeJob record with status "pending", (3) launches Apify scrape in background task, (4) on completion: parses results, classifies format families, computes engagement scores, stores all posts in DB, updates job status. Create `GET /api/scrape/{job_id}` to poll job status.
  - Notes: Use FastAPI BackgroundTasks for async scrape execution. Update job status to "running" then "completed"/"failed".

#### Phase 3: Ranking Engine

- [ ] Task 8: Ranking service
  - File: `backend/app/services/ranking.py`
  - Action: Create `compute_engagement_score(reactions, comments, shares, clicks, impressions)` returning float. Create `get_top_trends(db_session, scrape_job_id, limit=10)` that: (1) queries posts for job, (2) groups by format_family, (3) orders by avg engagement_score desc, (4) returns top N groups with individual post URLs preserved.
  - Notes: Engagement formula: (reactions + comments + shares + clicks) / impressions * 100. Handle impressions=0 edge case (score=0).

- [ ] Task 9: Posts router with filtering and ranking
  - File: `backend/app/routers/posts.py`
  - Action: Create `GET /api/posts` with query params (scrape_job_id, sector, format_family, sort_by, limit, offset). Create `GET /api/posts/ranking` that returns Top 10 trends grouped by format for a given scrape_job_id.
  - Notes: Support sorting by engagement_score desc (default), publication_date, reactions, comments.

#### Phase 4: Gemini Analysis

- [ ] Task 10: Gemini analysis service
  - File: `backend/app/services/gemini.py`
  - Action: Create `GeminiAnalyzer` class that: (1) accepts a post with video_url, (2) downloads or references the video, (3) sends to Gemini API with Carlo's creative analysis prompt, (4) parses structured response (format_variation, target_icp, communication_tone, visual_style, editing_techniques), (5) stores result in gemini_analyses table.
  - Notes: Use `google-generativeai` package. Model: Gemini 2.0 Flash or 1.5 Pro (supports video input). Carlo will provide the analysis prompt. Request structured JSON output from Gemini.

- [ ] Task 11: Analysis router
  - File: `backend/app/routers/analysis.py`
  - Action: Create `POST /api/analysis` that accepts list of post_ids, triggers Gemini analysis on each, stores results. Create `GET /api/analysis/{post_id}` to retrieve analysis for a specific post.
  - Notes: Process sequentially to respect Gemini rate limits. Update post.format_variation field after analysis.

#### Phase 5: React Frontend

- [ ] Task 12: Initialize React project
  - Files: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/Dockerfile`
  - Action: Scaffold React + Vite + TypeScript project. Add axios dependency. Configure Vite proxy to backend API. Set up React Router with two routes: "/" (HomePage) and "/results/:jobId" (ResultsPage).
  - Notes: Use Vite proxy for dev to avoid CORS issues. Add Tailwind CSS for rapid styling.

- [ ] Task 13: TypeScript types and API client
  - Files: `frontend/src/types/index.ts`, `frontend/src/api/client.ts`
  - Action: Define TypeScript interfaces matching all backend Pydantic schemas. Create API client module with functions: `triggerScrape(params)`, `getScrapeStatus(jobId)`, `getPosts(jobId, filters)`, `getRanking(jobId)`, `triggerAnalysis(postIds)`, `getAnalysis(postId)`.
  - Notes: All functions return typed promises. Base URL from env or Vite proxy.

- [ ] Task 14: ScrapeForm component
  - File: `frontend/src/components/ScrapeForm.tsx`
  - Action: Create form with: text input for search query, dropdown for sector (Health, Retail, Industry, Finance, Tech, Education, Sport, Media), dropdown for content type (All, Videos, Images, Documents), toggle for Corporate/Generic, number input for max results (default 50). Submit button triggers `POST /api/scrape` and redirects to results page with job ID.
  - Notes: Show loading state while scrape runs. Poll `GET /api/scrape/{job_id}` every 3s until completed.

- [ ] Task 15: ResultsTable component
  - File: `frontend/src/components/ResultsTable.tsx`
  - Action: Sortable table showing all scraped posts: title (truncated), author, company, format_family, reactions, comments, shares, clicks, impressions, engagement_score, post_url (clickable link), publication_date. Default sort by engagement_score desc.
  - Notes: Clickable column headers for sorting. Post URL opens in new tab.

- [ ] Task 16: TrendRanking component
  - File: `frontend/src/components/TrendRanking.tsx`
  - Action: Display Top 10 trends from `/api/posts/ranking`. Each trend card shows: rank number, format_family, number of posts in group, average engagement score, list of source URLs (clickable). Highlight top 3.
  - Notes: Each group is a collapsible card. Show "Analyze with Gemini" button next to video posts.

- [ ] Task 17: AnalysisPanel component
  - File: `frontend/src/components/AnalysisPanel.tsx`
  - Action: When user clicks "Analyze with Gemini" on a post/group, trigger `POST /api/analysis` with selected post_ids. Display results: format_variation, target_icp, communication_tone, visual_style, editing_techniques. Show loading spinner during analysis.
  - Notes: Display results inline below the post/trend card. Show video thumbnail if available.

- [ ] Task 18: Page assembly
  - Files: `frontend/src/pages/HomePage.tsx`, `frontend/src/pages/ResultsPage.tsx`
  - Action: HomePage renders ScrapeForm centered. ResultsPage takes jobId from URL params, loads posts and ranking, renders ResultsTable + TrendRanking side by side (or tabbed), with AnalysisPanel as expandable section.
  - Notes: Add navigation between pages. Show job metadata (search query, sector, date, total posts) as header on results page.

#### Phase 6: Docker & Integration

- [ ] Task 19: Docker Compose setup
  - File: `docker-compose.yml`
  - Action: Define 3 services: `db` (postgres:16, volume for data, port 5432), `backend` (build from backend/, port 8000, depends on db, env_file .env), `frontend` (build from frontend/, port 5173, depends on backend). Add healthcheck for db.
  - Notes: Backend waits for DB healthy before starting. Frontend proxies API calls to backend.

- [ ] Task 20: End-to-end integration test
  - Action: Manual test flow: (1) docker compose up, (2) open frontend, (3) enter search query + sector + content type, (4) trigger scrape, (5) verify posts appear in results table, (6) verify Top 10 ranking displays, (7) trigger Gemini analysis on top post, (8) verify analysis results display.
  - Notes: Requires valid APIFY_TOKEN and GEMINI_API_KEY in .env file.

### Acceptance Criteria

#### Scraping Pipeline
- [ ] AC 1: Given a user enters a search query and selects "Tech" sector with "Videos" content type, when they click "Start Scrape", then an Apify job is triggered and posts are stored in the database with correct metadata.
- [ ] AC 2: Given a scrape is in progress, when the user views the results page, then they see a loading indicator with status updates until completion.
- [ ] AC 3: Given the Apify actor returns posts, when posts are stored, then each post has engagement_score computed as (reactions+comments+shares+clicks)/impressions*100.
- [ ] AC 4: Given a post has no impressions data (impressions=0), when engagement score is computed, then the score defaults to 0 without errors.

#### Format Classification
- [ ] AC 5: Given a scraped post contains video content with duration > 60 seconds, when classified, then format_family is set to "long_video".
- [ ] AC 6: Given a scraped post contains video content with duration <= 60 seconds, when classified, then format_family is set to "short_video".
- [ ] AC 7: Given a scraped post is image/carousel content, when classified, then format_family is set to "static".
- [ ] AC 8: Given a scraped post is text-only, when classified, then format_family is set to "text".

#### Ranking
- [ ] AC 9: Given posts are stored for a scrape job, when the user views the ranking, then they see Top 10 trends grouped by format_family, ordered by average engagement score descending.
- [ ] AC 10: Given a trend group contains multiple posts, when displayed, then all source URLs are listed and clickable.

#### Gemini Analysis
- [ ] AC 11: Given the user selects a top-performing video post, when they click "Analyze with Gemini", then the video is sent to Gemini API and analysis results (format_variation, target_icp, communication_tone, visual_style, editing_techniques) are displayed.
- [ ] AC 12: Given Gemini analysis completes for a post, when the results are stored, then the post's format_variation field is updated with the Gemini classification.

#### Frontend
- [ ] AC 13: Given the user is on the home page, when they see the scrape form, then they can select search query, sector, content type, corporate toggle, and max results.
- [ ] AC 14: Given results are loaded, when the user clicks a column header in the results table, then posts are sorted by that column.
- [ ] AC 15: Given the results page is loaded, when the user views the trend ranking, then Top 10 groups are displayed with rank, format, post count, avg score, and URLs.

## Additional Context

### Dependencies

| Dependency | Version | Purpose |
| --- | --- | --- |
| fastapi | latest | Web framework |
| uvicorn | latest | ASGI server |
| sqlalchemy[asyncio] | 2.x | ORM + async support |
| asyncpg | latest | PostgreSQL async driver |
| alembic | latest | Database migrations |
| pydantic-settings | latest | Config from .env |
| apify-client | latest | Apify API client |
| google-generativeai | latest | Gemini API client |
| httpx | latest | Async HTTP client |
| react | 18.x | UI framework |
| vite | latest | Frontend build tool |
| axios | latest | HTTP client for frontend |
| tailwindcss | latest | CSS utility framework |
| react-router-dom | 6.x | Client-side routing |
| postgresql | 16 | Database |

### Testing Strategy

**MVP Testing (Manual):**
- End-to-end flow: scrape → store → rank → analyze
- Verify engagement score computation on known data
- Verify format family classification rules
- Verify Gemini analysis returns structured results
- Test error states: invalid API keys, Apify timeout, empty results

**Unit Tests (Post-MVP):**
- `test_ranking.py`: Test engagement score formula with edge cases (0 impressions, max values)
- `test_classifier.py`: Test format family rules with various content types
- `test_schemas.py`: Test Pydantic validation on request/response schemas

### Notes

**Blockers before implementation:**
- Carlo to provide format taxonomy (families + variations list)
- Carlo to provide Gemini creative analysis prompt
- Carlo to confirm Apify actor output field names (from a sample run)

**Known limitations:**
- LinkedIn scraping via Apify may not return clicks/impressions for all posts (depends on post visibility). Engagement score may need to fallback to available metrics only.
- Gemini video analysis requires video URL to be accessible. Some LinkedIn videos may be behind authentication.
- Apify actor costs $9.99 per 1,000 results - budget consideration for large scrapes.

**Future considerations (out of scope):**
- Add YouTube and TikTok platform support with additional Apify actors
- Scheduled/automated scraping with n8n or cron
- Historical trend tracking and time-series analysis
- Client-facing dashboard with authentication
- Export to CSV/PDF for reporting
- Webhook notifications for new trend alerts
