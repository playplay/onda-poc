# Plan d'implementation : Migration Apify → Bright Data

## Contexte

Remplacer le scraping LinkedIn via Apify (`powerai~linkedin-posts-search-scraper`) par l'API Bright Data Web Scraper (LinkedIn Posts Discovery). L'objectif est de gagner en fiabilite (infra enterprise vs acteurs communautaires) tout en simplifiant l'architecture (1 batch request au lieu de N runs paralleles).

## Architecture cible

```
AVANT (Apify):
  1 scrape request → N Apify runs (1 par compte) → N polling loops → merge results

APRES (Bright Data):
  1 scrape request → 1 batch API call (toutes les URLs du secteur) → 1 snapshot_id → poll → fetch results
```

## API Bright Data - Reference technique

- **Dataset ID** : `gd_lyy3tktm25m4avu764` (LinkedIn Posts)
- **Trigger** : `POST https://api.brightdata.com/datasets/v3/trigger`
  - Params: `dataset_id`, `type=discover_new`, `discover_by=url`
  - Body: JSON array d'objets `{url, start_date?, end_date?, limit?}`
  - Response: `{snapshot_id: "..."}`
- **Progress** : `GET https://api.brightdata.com/datasets/v3/progress/{snapshot_id}`
  - Response: `{status: "running"|"ready"|"failed"}`
- **Fetch** : `GET https://api.brightdata.com/datasets/v3/snapshot/{snapshot_id}?format=json`
  - Response: JSON array des posts scrapes

### Input format

```json
[
  {
    "url": "https://www.linkedin.com/in/john-doe",
    "start_date": "2026-01-20T00:00:00.000Z",
    "end_date": "2026-02-19T00:00:00.000Z"
  },
  {
    "url": "https://www.linkedin.com/company/google",
    "start_date": "2026-01-20T00:00:00.000Z",
    "end_date": "2026-02-19T00:00:00.000Z"
  }
]
```

Les profils perso (`/in/...`) et les pages entreprise (`/company/...`) peuvent etre envoyes dans le **meme batch**.

### Output fields (par post)

```
url, id, title, headline, post_text, post_text_html, date_posted,
hashtags, embedded_links, images, videos, post_type, account_type,
num_likes, num_comments, top_visible_comments,
user_id, user_url, user_followers, user_posts, user_articles
```

---

## Etapes d'implementation

### Etape 1 : Config (`app/config.py`)

Ajouter `BRIGHT_DATA_API_TOKEN: str = ""` dans la classe `Settings`.

### Etape 2 : Nouveau service (`app/services/brightdata_scraper.py`)

Creer un nouveau fichier qui expose les memes 2 fonctions que `apify_scraper.py` :

```python
async def start_scrape(db: AsyncSession, job: ScrapeJob) -> None
async def check_and_process_scrape(db: AsyncSession, job: ScrapeJob) -> None
```

#### `start_scrape()`

1. Fetch tous les `WatchedAccount` du secteur (identique a avant)
2. Construire le batch d'URLs :
   ```python
   batch = []
   cutoff = datetime.utcnow() - timedelta(days=RECENT_DAYS)
   for account in accounts:
       batch.append({
           "url": account.linkedin_url,
           "start_date": cutoff.strftime("%Y-%m-%dT00:00:00.000Z"),
           "end_date": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z"),
       })
   ```
3. Appeler l'API Bright Data trigger via `httpx` (deja dans les deps, pas besoin de nouveau SDK) :
   ```python
   response = await httpx_client.post(
       "https://api.brightdata.com/datasets/v3/trigger",
       headers={"Authorization": f"Bearer {settings.BRIGHT_DATA_API_TOKEN}"},
       params={
           "dataset_id": "gd_lyy3tktm25m4avu764",
           "type": "discover_new",
           "discover_by": "url",
       },
       json=batch,
   )
   snapshot_id = response.json()["snapshot_id"]
   ```
4. Stocker le `snapshot_id` dans `job.brightdata_snapshot_id` (nouveau champ) ou reutiliser `job.apify_run_id` temporairement
5. Mettre `job.status = "running"`

#### `check_and_process_scrape()`

1. Appeler l'API progress :
   ```python
   response = await httpx_client.get(
       f"https://api.brightdata.com/datasets/v3/progress/{snapshot_id}",
       headers={"Authorization": f"Bearer {settings.BRIGHT_DATA_API_TOKEN}"},
   )
   status = response.json().get("status")
   ```
2. Si `status != "ready"` → return (on repassera au prochain poll du frontend)
3. Si `"ready"` → fetch les resultats :
   ```python
   response = await httpx_client.get(
       f"https://api.brightdata.com/datasets/v3/snapshot/{snapshot_id}",
       headers={"Authorization": f"Bearer {settings.BRIGHT_DATA_API_TOKEN}"},
       params={"format": "json"},
   )
   items = response.json()
   ```
4. Mapper les items vers le modele `Post` via `_item_to_post()` (nouvelle version adaptee au schema Bright Data)
5. Trier par engagement (`num_likes + num_comments`), garder top N
6. Detecter les posts video (champ `videos` non vide) → trigger video download si besoin
7. `job.status = "completed"`

#### `_item_to_post()` — Mapping Bright Data → Post

```python
# Mapping des champs Bright Data → Post
Post(
    title        = item.get("post_text", "")[:500],
    author_name  = item.get("user_id"),
    author_company = None,  # pas directement dispo, a extraire de headline/user_url
    sector       = job.sector,
    platform     = "linkedin",
    content_type = "video" if item.get("videos") else ("image" if item.get("images") else "text"),
    reactions    = int(item.get("num_likes", 0)),
    comments     = int(item.get("num_comments", 0)),
    shares       = 0,  # pas dans le schema Bright Data standard
    post_url     = item.get("url"),
    video_url    = (item.get("videos") or [None])[0],
    image_url    = (item.get("images") or [None])[0],
    publication_date = _parse_date(item.get("date_posted")),
    raw_data     = item,
)
```

### Etape 3 : Migration DB (optionnel mais recommande)

Ajouter un champ au modele `ScrapeJob` pour tracker le snapshot Bright Data :

```python
# Option A : reutiliser apify_run_id (pas de migration)
# Option B : nouveau champ (plus propre)
brightdata_snapshot_id: Mapped[str | None] = mapped_column(Text, nullable=True)
scraper_backend: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "apify" | "brightdata"
```

Script de migration :
```sql
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS brightdata_snapshot_id TEXT;
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS scraper_backend VARCHAR(20) DEFAULT 'apify';
```

### Etape 4 : Router (`app/routers/scrape.py`)

Modifier l'import pour utiliser le nouveau service :

```python
# Avant
from app.services.apify_scraper import start_scrape, check_and_process_scrape

# Apres (switch direct)
from app.services.brightdata_scraper import start_scrape, check_and_process_scrape

# OU : feature flag via config
if settings.BRIGHT_DATA_API_TOKEN:
    from app.services.brightdata_scraper import start_scrape, check_and_process_scrape
else:
    from app.services.apify_scraper import start_scrape, check_and_process_scrape
```

### Etape 5 : Video download

Le scraper Bright Data retourne deja les URLs video dans le champ `videos[]`. Deux options :

- **Option simple** : Utiliser directement `videos[0]` du resultat Bright Data (si c'est un CDN URL utilisable). Tester d'abord si Gemini peut analyser ces URLs directement.
- **Option fallback** : Garder le video downloader Apify (`xanthic_polygon~linkedin-video-downloader`) pour les cas ou les URLs Bright Data ne sont pas directement telechargeables.

### Etape 6 : Env vars Vercel

```bash
# Ajouter sur Vercel
printf '%s' 'ton_token_ici' | npx vercel env add BRIGHT_DATA_API_TOKEN production preview development
```

---

## Fichiers a modifier/creer

| Fichier | Action |
|---------|--------|
| `app/config.py` | Ajouter `BRIGHT_DATA_API_TOKEN` |
| `app/services/brightdata_scraper.py` | **CREER** — nouveau service |
| `app/services/apify_scraper.py` | Garder tel quel (fallback) |
| `app/routers/scrape.py` | Changer l'import (ou feature flag) |
| `app/models/scrape_job.py` | Ajouter `brightdata_snapshot_id` + `scraper_backend` (optionnel) |
| `scripts/migrate_brightdata.py` | **CREER** — migration DB |
| `.env` | Ajouter `BRIGHT_DATA_API_TOKEN=...` |

## Fichiers NON modifies

- `app/models/post.py` — le modele Post reste identique
- `app/services/classifier.py` — inchange
- `app/services/ranking.py` — inchange
- `app/services/video_downloader.py` — garde pour fallback
- Frontend — aucun changement (meme API)

---

## Simplifications vs Apify

| Aspect | Apify (avant) | Bright Data (apres) |
|--------|--------------|---------------------|
| Requetes API pour lancer | N (1 par compte) | 1 (batch unique) |
| IDs a tracker | `apify_run_ids[]` (JSONB) | 1 `snapshot_id` (string) |
| Polling | N runs a verifier | 1 snapshot a verifier |
| Filtrage par date | Post-scraping en Python | Pre-scraping via `start_date`/`end_date` |
| SDK/dependance | `apify-client` pip package | `httpx` (deja present) |
| Merge des resultats | Manuel (flatten N datasets) | Deja merge par Bright Data |

---

## Ordre d'execution recommande

1. **Config** — ajouter le token (2 min)
2. **Service** — creer `brightdata_scraper.py` (30 min)
3. **Test local** — lancer un scrape sur 2-3 comptes d'un secteur, verifier le JSON retourne
4. **Mapping** — ajuster `_item_to_post()` en fonction du JSON reel (les noms de champs peuvent varier)
5. **Router** — switcher l'import (2 min)
6. **Migration DB** — ajouter les colonnes si on choisit l'option B (5 min)
7. **Deploy** — push + env var Vercel (5 min)
8. **Video** — tester si les URLs video Bright Data sont directement utilisables par Gemini

## Point d'attention

Le JSON de sortie Bright Data peut avoir des noms de champs legerement differents de ce que montre la doc. **L'etape 3 (test local) est critique** : il faut lancer un vrai scrape, inspecter le JSON brut, et ajuster le mapping en consequence. Sauvegarder le JSON brut dans `raw_data` pour debug.

## Risque principal

Bright Data peut prendre **quelques minutes** pour completer un snapshot (vs ~30s pour Apify avec 3 posts/compte). Le frontend poll deja toutes les 3-5 secondes, donc ca devrait fonctionner sans changement, mais il faut tester le temps de reponse reel.
