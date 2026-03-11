# Onda POC

Onda est un outil de veille et d'intelligence créative sur les réseaux sociaux (LinkedIn, Instagram, TikTok), conçu pour les équipes Customer Success de PlayPlay.

## Objectif

Permettre aux CSMs de :
- **Surveiller** les comptes de leurs clients et prospects sur LinkedIn, Instagram et TikTok
- **Découvrir** les posts les plus performants par secteur, format et use case
- **Identifier** les tendances créatives (formats viraux, types de contenu émergents)
- **Constituer** une bibliothèque de références inspirantes (favoris, collections)
- **Lancer des recherches ad-hoc** sur n'importe quel compte LinkedIn (Custom Search)
- **Taguer** les posts réalisés avec PlayPlay pour suivre l'adoption produit

## Stack technique

### Backend
- **Python 3 / FastAPI** (async) — API REST, entry point `app/main.py`
- **SQLAlchemy 2.0** (async) + **asyncpg** — ORM et accès PostgreSQL
- **PostgreSQL 17** (local via Homebrew, **Neon** en production sur Vercel)
- **httpx** — client HTTP async pour les appels aux APIs externes
- **PyJWT** — authentification par token JWT (cookie HttpOnly)

### Frontend
- **React 18** + **TypeScript** + **Vite** — SPA avec hot reload
- **Tailwind CSS** — styling utility-first
- **Axios** — client HTTP vers l'API `/api`

### APIs de scraping
- **Bright Data** (Datasets API) — scraping des posts LinkedIn (comptes company), Instagram et TikTok. Fonctionne par batch : trigger → poll → fetch results.
- **Apify** (Actor API) — scraping des posts LinkedIn pour les comptes person (via `harvestapi/linkedin-profile-posts`). Un run par lot de comptes.

### IA et classification
- **Claude Haiku** (Anthropic API via httpx) — classification automatique des use cases de chaque post (`claude_use_case`). Le modèle reçoit le titre/contenu du post et retourne une catégorie parmi une liste définie (ex: "announce an event", "spotlight an employee", "present an offer/product"...).
- **Gemini 2.5 Flash** (Google REST API) — analyse structurée complète des posts vidéo : business objective, audience target, tone of voice, content style, storytelling approach, creative execution, ICP, script breakdown. Résultats stockés dans `gemini_analyses` (JSONB).

### Déploiement
- **Vercel** — hébergement frontend + serverless functions (FastAPI via `api/index.py`)
- **Neon** — PostgreSQL serverless managé (connexion via `POSTGRES_URL`)

## Fonctionnement

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  React + Vite   │────▶│  FastAPI (async)  │────▶│  PostgreSQL      │
│  (frontend/)    │ /api│  (app/)           │     │  (Neon en prod)  │
└─────────────────┘     └────────┬─────────┘     └──────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              Bright Data     Apify      Anthropic/Gemini
              (LinkedIn co,  (LinkedIn    (classification
               Instagram,    persons)     use cases)
               TikTok)
```

### Flux de scraping

1. **Admin** lance un scrape (par secteur ou "All sectors")
2. Le backend déclenche les APIs Bright Data (companies) + Apify (persons) en parallèle
3. Les résultats sont filtrés, dédupliqués, et les top N posts par compte sont conservés
4. Les posts sont classifiés par use case via Claude Haiku
5. Les CSMs consultent la **Library** avec filtres (secteur, format, use case, etc.)

### Interface utilisateur

- **Library** : 4 onglets — All Posts, My Portfolio, Favorites, Custom Search
- **Accounts** : liste des comptes surveillés avec filtres (admin: CRUD, users: lecture seule)
- **Admin** : gestion des comptes + utilisateurs, lancement des scrapes
- **PostDetailModal** : détail d'un post avec actions (lien LinkedIn, copier, favori, flag PlayPlay)

### Authentification

Multi-utilisateur via variable d'environnement `USERS` (JSON array). JWT cookie HttpOnly. Rôles : `admin` (scrape + CRUD) et `user` (lecture + favoris + collections).

## Schéma de base de données

```
┌──────────────────────┐       ┌──────────────────────────┐
│   watched_accounts   │       │       scrape_jobs         │
├──────────────────────┤       ├──────────────────────────┤
│ id (UUID) PK         │       │ id (UUID) PK             │
│ name                 │       │ search_query             │
│ type (company/person)│       │ sector                   │
│ sector               │       │ status (pending/running/ │
│ company_name         │       │   completed/failed)      │
│ linkedin_url         │       │ total_posts              │
│ instagram_url        │       │ scrape_posts_per_account  │
│ tiktok_url           │       │ scrape_by_date           │
│ assigned_cs_email    │       │ scraper_backend          │
│ is_playplay_client   │       │ brightdata_snapshot_id   │
│ follower_count       │       │ instagram_snapshot_id    │
│ created_at           │       │ tiktok_snapshot_id       │
└──────────────────────┘       │ is_custom_search         │
                               │ user_email               │
                               │ custom_account_url       │
                               │ error_message            │
                               │ created_at / completed_at│
                               └────────────┬─────────────┘
                                            │ 1:N
                                            ▼
┌──────────────────────────────────────────────────────────┐
│                         posts                            │
├──────────────────────────────────────────────────────────┤
│ id (UUID) PK                                             │
│ scrape_job_id (FK → scrape_jobs)                         │
│ title, author_name, author_company, sector, platform     │
│ content_type, format_family, format_variation            │
│ reactions, comments, shares, clicks, impressions         │
│ engagement_score, engagement_rate, author_follower_count │
│ post_url, video_url, image_url, duration_seconds         │
│ publication_date, claude_use_case, raw_data (JSONB)      │
│ playplay_flag, playplay_flag_by/name/at                  │
│ playplay_design_flag, playplay_design_flag_by/name/at    │
│ created_at                                               │
└──────────┬──────────────────┬───────────────┬────────────┘
           │ 1:1              │ N:M           │ 1:N
           ▼                  ▼               ▼
┌─────────────────┐  ┌──────────────┐  ┌─────────────┐
│gemini_analyses  │  │ saved_posts  │  │  favorites   │
├─────────────────┤  ├──────────────┤  ├─────────────┤
│ id (UUID) PK    │  │ id PK        │  │ id (UUID) PK│
│ post_id (FK, UQ)│  │ user_email   │  │ user_email  │
│ business_obj    │  │ post_id (FK) │  │ post_id (FK)│
│ use_case        │  │ collection_id│  │ created_at  │
│ audience_target │  │   (FK)       │  └─────────────┘
│ tone_of_voice   │  │ created_at   │
│ content_style   │  └──────┬───────┘
│ creative_exec   │         │ N:1
│ icp, ...        │         ▼
│ full_analysis   │  ┌──────────────┐
│ created_at      │  │ collections  │
└─────────────────┘  ├──────────────┤
                     │ id PK (auto) │
                     │ user_email   │
                     │ name         │
                     │ created_at   │
                     └──────────────┘
```

### Relations clés

| Relation | Type | Description |
|----------|------|-------------|
| `scrape_jobs` → `posts` | 1:N | Un job produit N posts |
| `posts` → `gemini_analyses` | 1:1 | Analyse IA optionnelle par post |
| `posts` → `favorites` | 1:N | Favoris par utilisateur (isolés) |
| `collections` → `saved_posts` → `posts` | N:M | Collections personnelles |

## Développement local

```bash
# Base de données
brew services start postgresql@17

# Backend (port 3001)
/opt/homebrew/bin/python3 -m uvicorn app.main:app --port 3001

# Frontend (port 5173, proxy /api → 3001)
cd frontend && npm run dev
```

Variables d'environnement : voir `.env.example`
