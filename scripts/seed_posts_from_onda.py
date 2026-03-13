"""
Seed onda_poc posts from old onda DB.

For each CS that has watched accounts, assigns 10 posts randomly across
3-4 of their accounts (recycling LinkedIn posts from the old onda DB).
Post content is real but author_name is reassigned to match onda_poc accounts.
This is purely for UI/navigation testing — not real data.

Usage:
    python3 scripts/seed_posts_from_onda.py [--dry-run]
"""
import sys
import uuid
import random
import re
from datetime import datetime

import psycopg2
import psycopg2.extras
from psycopg2.extras import Json

psycopg2.extras.register_uuid()

SRC_DSN = "dbname=onda"
DST_DSN = "dbname=onda_poc"

POSTS_PER_CS = 10
SEED_JOB_LABEL = "Seed — données de démonstration"

DRY_RUN = "--dry-run" in sys.argv


def extract_slug(linkedin_url: str) -> str:
    m = re.search(r"/(in|company)/([^/?]+)", linkedin_url)
    return m.group(2).lower() if m else ""


def main():
    src = psycopg2.connect(SRC_DSN)
    dst = psycopg2.connect(DST_DSN)
    src.autocommit = True

    with src.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as sc:
        # Pull a good pool of LinkedIn posts with gemini analyses
        sc.execute("""
            SELECT p.*,
                ga.business_objective, ga.use_case, ga.audience_target, ga.tone_of_voice,
                ga.content_style, ga.storytelling_approach, ga.creative_execution,
                ga.icp, ga.script_hook, ga.script_outline, ga.script_cta,
                ga.voice_language, ga.text_language, ga.contains_an_interview_footage,
                ga.video_dynamism, ga.media_analyzed, ga.full_analysis
            FROM posts p
            LEFT JOIN gemini_analyses ga ON ga.post_id = p.id
            WHERE p.platform = 'linkedin'
              AND p.title IS NOT NULL
              AND p.title != ''
            ORDER BY p.engagement_score DESC
            LIMIT 200
        """)
        source_posts = sc.fetchall()

    print(f"Source pool: {len(source_posts)} LinkedIn posts from onda")

    with dst.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as dc:
        # Get watched accounts grouped by CS
        dc.execute("""
            SELECT id, name, linkedin_url, assigned_cs_email, sector
            FROM watched_accounts
            WHERE linkedin_url IS NOT NULL AND assigned_cs_email IS NOT NULL
            ORDER BY assigned_cs_email, name
        """)
        all_accounts = dc.fetchall()

        # Check existing seed job
        dc.execute("SELECT id FROM scrape_jobs WHERE search_query = %s", (SEED_JOB_LABEL,))
        existing = dc.fetchone()
        if existing:
            print(f"Seed job already exists: {existing['id']}. Delete it first if you want to re-seed.")
            print("  psql -d onda_poc -c \"DELETE FROM scrape_jobs WHERE search_query = 'Seed — données de démonstration';\"")
            return

    # Group accounts by CS
    cs_accounts: dict[str, list] = {}
    for acc in all_accounts:
        cs = acc["assigned_cs_email"]
        cs_accounts.setdefault(cs, []).append(acc)

    print(f"\nCS with accounts:")
    for cs, accs in cs_accounts.items():
        print(f"  {cs}: {len(accs)} comptes")

    # Plan assignment: for each CS, pick min(4, n_accounts) accounts, distribute POSTS_PER_CS posts
    assignments: list[dict] = []  # {account, post_template}

    random.seed(42)  # reproducible
    post_pool = list(source_posts)
    random.shuffle(post_pool)
    pool_idx = 0

    for cs_email, accounts in cs_accounts.items():
        # Pick up to 4 accounts to receive posts
        n_target_accounts = min(4, len(accounts))
        target_accounts = random.sample(accounts, n_target_accounts)

        # Distribute POSTS_PER_CS posts across target accounts
        posts_assigned = 0
        acc_cycle = 0
        while posts_assigned < POSTS_PER_CS:
            account = target_accounts[acc_cycle % n_target_accounts]
            template = post_pool[pool_idx % len(post_pool)]
            pool_idx += 1
            assignments.append({"account": account, "template": template, "cs_email": cs_email})
            posts_assigned += 1
            acc_cycle += 1

        print(f"\n  {cs_email}: {POSTS_PER_CS} posts → {[a['name'] for a in target_accounts]}")

    print(f"\nTotal posts to create: {len(assignments)}")

    if DRY_RUN:
        print("\n[DRY RUN] No changes written.")
        return

    # Create seed scrape job
    job_id = uuid.uuid4()
    now = datetime.utcnow()

    with dst.cursor() as dc:
        dc.execute("""
            INSERT INTO scrape_jobs (id, search_query, sector, status, total_posts,
                scraper_backend, created_at, completed_at, scrape_posts_per_account, scrape_by_date)
            VALUES (%s, %s, NULL, 'completed', %s, 'seed', %s, %s, %s, true)
        """, (job_id, SEED_JOB_LABEL, len(assignments), now, now, POSTS_PER_CS))

        created_posts = []
        for a in assignments:
            account = a["account"]
            t = a["template"]
            slug = extract_slug(account["linkedin_url"])
            new_id = uuid.uuid4()

            dc.execute("""
                INSERT INTO posts (
                    id, scrape_job_id, title, author_name, author_company,
                    sector, platform, content_type, format_family, format_variation,
                    reactions, comments, shares, clicks, impressions,
                    engagement_score, author_follower_count, engagement_rate,
                    post_url, video_url, image_url, duration_seconds,
                    publication_date, raw_data, claude_use_case, created_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s
                )
            """, (
                new_id, job_id,
                t["title"], slug, account["name"],
                account["sector"], t["platform"], t["content_type"], t["format_family"], t["format_variation"],
                t["reactions"], t["comments"], t["shares"], t["clicks"], t["impressions"],
                t["engagement_score"], t["author_follower_count"], t["engagement_rate"],
                t["post_url"], t["video_url"], t["image_url"], t["duration_seconds"],
                t["publication_date"], Json(t["raw_data"]) if isinstance(t["raw_data"], dict) else t["raw_data"], t["claude_use_case"], now,
            ))

            # Copy gemini analysis if exists
            if t.get("use_case") or t.get("business_objective"):
                dc.execute("""
                    INSERT INTO gemini_analyses (
                        id, post_id, business_objective, use_case, audience_target, tone_of_voice,
                        content_style, storytelling_approach, creative_execution, icp,
                        script_hook, script_outline, script_cta, voice_language, text_language,
                        contains_an_interview_footage, video_dynamism, media_analyzed, full_analysis, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    uuid.uuid4(), new_id,
                    t.get("business_objective"), t.get("use_case"), t.get("audience_target"), t.get("tone_of_voice"),
                    t.get("content_style"), t.get("storytelling_approach"), t.get("creative_execution"), t.get("icp"),
                    t.get("script_hook"), t.get("script_outline"), t.get("script_cta"),
                    t.get("voice_language"), t.get("text_language"),
                    t.get("contains_an_interview_footage"), t.get("video_dynamism"), t.get("media_analyzed"),
                    Json(t["full_analysis"]) if isinstance(t.get("full_analysis"), dict) else t.get("full_analysis"), now,
                ))

            created_posts.append((account["name"], slug, a["cs_email"]))

        dst.commit()

    print(f"\n✓ Seed job created: {job_id}")
    print(f"✓ {len(created_posts)} posts inserted")
    print("\nDistribution:")
    for name, slug, cs in created_posts:
        print(f"  {cs[:20]:20s}  {name[:30]:30s}  ({slug})")


if __name__ == "__main__":
    main()
