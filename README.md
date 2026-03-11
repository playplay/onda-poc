# Onda POC

Onda est un outil de veille et d'intelligence créative sur LinkedIn, conçu pour les équipes Customer Success de PlayPlay.

## Objectif

Les CSMs suivent chacun une vingtaine de comptes clients sur LinkedIn. Aujourd'hui, pour préparer un meeting client ou recommander des formats de contenu, ils doivent manuellement consulter chaque profil LinkedIn, parcourir les posts un par un, et se souvenir de ce qu'ils ont vu.

Onda automatise cette veille en scrapant les posts publiés par les comptes suivis et en les centralisant dans une bibliothèque partagée, filtrable par format, type de communication, niveau d'engagement et secteur. Le CSM retrouve en quelques secondes les tendances de son portefeuille et peut arriver en meeting client avec des recommandations pertinentes et sourcées.

## Fonctionnement

### Coté administrateur

L'administrateur est responsable de :
- **Importer et valider la liste de comptes** LinkedIn à suivre (environ 20 comptes par CSM, uniquement des pages company LinkedIn pour cette phase)
- **Déclencher les scrapes** sur l'ensemble des comptes. Le scraping récupère les posts publiés, les déduplique, et conserve les plus performants par compte
- **Gérer les utilisateurs** (création de comptes, attribution des portefeuilles)

Les utilisateurs n'ont pas accès à ces fonctions d'administration.

### Coté utilisateur (CSM)

Chaque CSM accède à :
- **Library (All Posts)** — bibliothèque partagée de tous les posts scrapés sur l'ensemble des comptes suivis dans Onda, filtrables par secteur, format, use case, niveau d'engagement, compte, etc.
- **My Portfolio** — vue filtrée sur les posts des comptes qui lui sont assignés, pour se concentrer sur ses propres clients
- **Favorites** — posts mis en favoris pour se constituer sa propre sélection de références inspirantes
- **Custom Search** — recherche ad-hoc sur n'importe quel compte LinkedIn (company) pour explorer un compte qui n'est pas dans la liste suivie
- **Flag PlayPlay** — possibilité de marquer si un post a été créé avec PlayPlay ou non. Ce statut est **collaboratif** : une fois qu'un CSM valide qu'un post est "Made with PlayPlay", c'est visible par tous les utilisateurs

### Phase de test (POC)

Le déploiement initial se fait avec :
- **6 utilisateurs** (CSMs PlayPlay)
- **~20 comptes LinkedIn** par CSM (pages company uniquement)
- **Scrape initial** : les 15 derniers posts de chaque compte
- **Scrapes hebdomadaires** : les 5 derniers posts de chaque compte, relancés chaque semaine par l'admin
- **Plateforme** : LinkedIn uniquement

## Stack technique

### Backend
- **Python 3 / FastAPI** (async) — API REST, entry point `app/main.py`
- **SQLAlchemy 2.0** (async) + **asyncpg** — ORM et accès PostgreSQL
- **PostgreSQL 17** (local via Homebrew, **Neon** en production)
- **httpx** — client HTTP async pour les appels aux APIs externes
- **PyJWT** — authentification par token JWT (cookie HttpOnly)

### Frontend
- **React 18** + **TypeScript** + **Vite** — SPA avec hot reload
- **Tailwind CSS** — styling utility-first
- **Axios** — client HTTP vers l'API `/api`

### APIs externes
- **Bright Data** (Datasets API) — scraping des posts LinkedIn (comptes company). Fonctionne par batch asynchrone : trigger → poll → fetch results.
- **Apify** (Actor API) — scraping des posts LinkedIn pour les comptes person (via `harvestapi/linkedin-profile-posts`)
- **Claude Haiku** (Anthropic API via httpx) — classification automatique du use case de chaque post (`claude_use_case` : "announce an event", "spotlight an employee", "present an offer/product"...)

### Authentification
Multi-utilisateur via variable d'environnement `USERS` (JSON array). JWT cookie HttpOnly. Deux rôles : `admin` (scrape + CRUD comptes/utilisateurs) et `user` (consultation + favoris + collections + flag PlayPlay).

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
│ assigned_cs_email    │       │ scrape_posts_per_account  │
│ is_playplay_client   │       │ scrape_by_date           │
│ created_at           │       │ is_custom_search         │
└──────────────────────┘       │ user_email               │
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
│ content_type, format_family                              │
│ reactions, comments, shares                              │
│ engagement_score, engagement_rate, author_follower_count │
│ post_url, video_url, image_url, duration_seconds         │
│ publication_date, claude_use_case                        │
│ playplay_flag, playplay_flag_by/name/at                  │
│ created_at                                               │
└──────────┬──────────────────────────────┬────────────────┘
           │ N:M                          │ 1:N
           ▼                              ▼
┌──────────────────┐              ┌─────────────┐
│   saved_posts    │              │  favorites   │
├──────────────────┤              ├─────────────┤
│ id PK            │              │ id (UUID) PK│
│ user_email       │              │ user_email  │
│ post_id (FK)     │              │ post_id (FK)│
│ collection_id FK │              │ created_at  │
│ created_at       │              └─────────────┘
└────────┬─────────┘
         │ N:1
         ▼
┌──────────────────┐
│   collections    │
├──────────────────┤
│ id PK (auto)     │
│ user_email       │
│ name             │
│ created_at       │
└──────────────────┘
```

### Relations clés

| Relation | Type | Description |
|----------|------|-------------|
| `scrape_jobs` → `posts` | 1:N | Un job produit N posts |
| `posts` → `favorites` | 1:N | Favoris par utilisateur (isolés par user) |
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
