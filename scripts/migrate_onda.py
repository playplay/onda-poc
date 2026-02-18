"""
Migration script: ScrapTrends → Onda
- Creates watched_accounts table
- Adds apify_run_ids JSONB column to scrape_jobs

Run with: python scripts/migrate_onda.py
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

print("Running migrations...")

cur.execute("""
    CREATE TABLE IF NOT EXISTS watched_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        type VARCHAR(20) NOT NULL,
        linkedin_url TEXT NOT NULL,
        sector VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
    );
""")
print("  ✓ watched_accounts table created (or already exists)")

cur.execute("""
    ALTER TABLE scrape_jobs
    ADD COLUMN IF NOT EXISTS apify_run_ids JSONB;
""")
print("  ✓ apify_run_ids column added to scrape_jobs (or already exists)")

cur.close()
conn.close()
print("Done.")
