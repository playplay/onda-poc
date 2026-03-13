# Instagram & TikTok Scraper Configuration

> **Status: DISABLED** — March 2026 POC focuses on LinkedIn only.
> Re-enable by adding `instagram_url` / `tiktok_url` to watched_accounts rows.

---

## How Scrapers Are Triggered

In `app/routers/scrape.py` (`trigger_scrape`), each platform scraper only fires when accounts with matching URLs exist:

```python
# Instagram — only runs if accounts have instagram_url set
instagram_accounts = [a for a in accounts if a.instagram_url]
if instagram_accounts and settings.API_BRIGHT_DATA:
    from app.services.instagram_scraper import start_scrape as ig_start
    await ig_start(db, job, instagram_accounts)

# TikTok — only runs if accounts have tiktok_url set
tiktok_accounts = [a for a in accounts if a.tiktok_url]
if tiktok_accounts and settings.API_BRIGHT_DATA:
    from app.services.tiktok_scraper import start_scrape as tt_start
    await tt_start(db, job, tiktok_accounts, limit_per_input=req.posts_per_account * 3)
```

**To re-enable:** Add `instagram_url` / `tiktok_url` values to watched_accounts in DB (or update the Notion import script), then restart the server. No code changes needed.

---

## Instagram Scraper

**File:** `app/services/instagram_scraper.py`

**Bright Data dataset:** `gd_l1vikfch901nx3by4`

**Trigger URL:** `https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_l1vikfch901nx3by4&include_errors=true`

**Input format:**
```json
[
  { "url": "https://www.instagram.com/bnpparibas/", "num_of_posts": 30 }
]
```

**Polling:** `GET https://api.brightdata.com/datasets/v3/progress/{snapshot_id}`

**Results:** `GET https://api.brightdata.com/datasets/v3/snapshot/{snapshot_id}?format=json`

**Key fields extracted:**
- `shortCode` → post ID
- `url` → post URL
- `caption` → text content
- `likesCount`, `commentsCount`, `videoViewCount`
- `timestamp` → post date
- `displayUrl` → thumbnail
- `ownerUsername` → author name (slug)
- `ownerFullName` → display name
- `followersCount` → author followers

**Engagement score:** `likes + comments * 3 + views * 0.1`

**Posts-to-fetch:** `num_of_posts = posts_to_keep * 5` (default 15)

---

## TikTok Scraper

**File:** `app/services/tiktok_scraper.py`

**Bright Data dataset:** `gd_lu702nij2f790tmv9h`

**Trigger URL:** `https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_lu702nij2f790tmv9h&include_errors=true`

**Input format:**
```json
[
  { "url": "https://www.tiktok.com/@finaryhq", "posts_to_collect": 30 }
]
```

**Polling:** Same as Instagram — `GET /datasets/v3/progress/{snapshot_id}`

**Results:** `GET /datasets/v3/snapshot/{snapshot_id}?format=json`

**Key fields extracted:**
- `id` → post ID
- `url` → post URL
- `text` → caption
- `digg_count` (likes), `comment_count`, `play_count` (views), `share_count`
- `create_time` → Unix timestamp
- `video.cover` → thumbnail
- `author.unique_id` → slug
- `author.nickname` → display name
- `author.follower_count`

**Engagement score:** `likes + comments * 3 + plays * 0.05`

**Posts-to-fetch:** `posts_to_collect = limit_per_input` (passed from `req.posts_per_account * 3`)

---

## Known Account URLs (from Notion DB, March 2026)

| Account | Instagram | TikTok |
|---------|-----------|--------|
| BNP | https://www.instagram.com/bnpparibas/ | — |
| Qonto | https://www.instagram.com/qonto/ | — |
| Revolut | https://www.instagram.com/revolut/ | — |
| Finary | https://www.instagram.com/finary/ | https://www.tiktok.com/@finaryhq |

---

## API Key

`API_BRIGHT_DATA` env var — same key used for LinkedIn scraper.
