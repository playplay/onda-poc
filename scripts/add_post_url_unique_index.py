#!/usr/bin/env python3
"""
Migration: deduplicate posts by post_url and add a partial unique index.

Steps:
1. Find duplicate post_url values in the posts table
2. For each group of duplicates, keep the row with the most data
   (prefer rows with gemini analysis, then favorites, then oldest id as tiebreaker)
3. Delete the remaining duplicates
4. Create partial unique index: CREATE UNIQUE INDEX uq_posts_post_url ON posts (post_url)
   WHERE post_url IS NOT NULL

Usage:
    python scripts/add_post_url_unique_index.py
"""

import os
import sys
import asyncio

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.config import settings


async def run_migration() -> None:
    engine = create_async_engine(settings.async_database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # 1. Find duplicate post_urls
        result = await db.execute(text("""
            SELECT post_url, COUNT(*) AS cnt
            FROM posts
            WHERE post_url IS NOT NULL
            GROUP BY post_url
            HAVING COUNT(*) > 1
        """))
        duplicates = result.fetchall()
        print(f"Found {len(duplicates)} post_url(s) with duplicates")

        total_deleted = 0
        for row in duplicates:
            post_url = row[0]
            # Find best row to keep: prefer row with gemini analysis, then favorites,
            # then keep the one with the smallest (oldest) id as tiebreaker
            best = await db.execute(text("""
                SELECT p.id
                FROM posts p
                LEFT JOIN (
                    SELECT post_id, COUNT(*) AS analysis_count
                    FROM gemini_analyses
                    GROUP BY post_id
                ) ga ON ga.post_id = p.id
                LEFT JOIN (
                    SELECT post_id, COUNT(*) AS fav_count
                    FROM favorites
                    GROUP BY post_id
                ) fav ON fav.post_id = p.id
                WHERE p.post_url = :url
                ORDER BY
                    COALESCE(ga.analysis_count, 0) DESC,
                    COALESCE(fav.fav_count, 0) DESC,
                    p.id ASC
                LIMIT 1
            """), {"url": post_url})
            keep_id = best.scalar()

            # Delete all other rows with this url
            del_result = await db.execute(text("""
                DELETE FROM posts
                WHERE post_url = :url AND id != :keep_id
            """), {"url": post_url, "keep_id": keep_id})
            deleted = del_result.rowcount
            total_deleted += deleted
            print(f"  {post_url[:80]}: kept {keep_id}, deleted {deleted} duplicate(s)")

        await db.commit()
        print(f"\nTotal deleted: {total_deleted} duplicate posts")

        # 2. Create partial unique index
        print("\nCreating partial unique index on posts.post_url ...")
        await db.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_posts_post_url
            ON posts (post_url)
            WHERE post_url IS NOT NULL
        """))
        await db.commit()
        print("Index created: uq_posts_post_url")

        # 3. Add scrape_since_date column to scrape_jobs (idempotent)
        await db.execute(text(
            "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS scrape_since_date DATE"
        ))
        await db.commit()
        print("Column scrape_since_date added to scrape_jobs (if not already present)")

    await engine.dispose()
    print("\nMigration complete.")


if __name__ == "__main__":
    asyncio.run(run_migration())
