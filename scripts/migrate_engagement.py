"""
Migration: Add engagement rate columns.

- posts.author_follower_count (INTEGER, nullable)
- posts.engagement_rate (FLOAT, nullable)
- watched_accounts.follower_count (INTEGER, nullable)

Run with: python scripts/migrate_engagement.py
Requires POSTGRES_URL env var (from .env or .env.vercel).
"""

import os
import sys

# Allow running from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.vercel")

import psycopg2

url = os.environ.get("POSTGRES_URL")
if not url:
    print("ERROR: POSTGRES_URL not set")
    sys.exit(1)

# psycopg2 needs postgresql:// not postgres://
url = url.replace("postgres://", "postgresql://", 1)

conn = psycopg2.connect(url)
conn.autocommit = True
cur = conn.cursor()

print("Running engagement rate migrations...")

cur.execute("""
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS author_follower_count INTEGER;
""")
print("  + posts.author_follower_count")

cur.execute("""
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS engagement_rate FLOAT;
""")
print("  + posts.engagement_rate")

cur.execute("""
    ALTER TABLE watched_accounts
    ADD COLUMN IF NOT EXISTS follower_count INTEGER;
""")
print("  + watched_accounts.follower_count")

cur.close()
conn.close()
print("Done.")
