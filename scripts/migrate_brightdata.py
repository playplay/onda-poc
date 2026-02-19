"""
Migration script: Add Bright Data columns to scrape_jobs.
- brightdata_snapshot_id TEXT
- scraper_backend VARCHAR(20)

Run with: python scripts/migrate_brightdata.py
Requires POSTGRES_URL env var (from .env or .env.vercel).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.vercel")

import psycopg2

url = os.environ.get("POSTGRES_URL")
if not url:
    print("ERROR: POSTGRES_URL not set")
    sys.exit(1)

url = url.replace("postgres://", "postgresql://", 1)

conn = psycopg2.connect(url)
conn.autocommit = True
cur = conn.cursor()

print("Running Bright Data migrations...")

cur.execute("""
    ALTER TABLE scrape_jobs
    ADD COLUMN IF NOT EXISTS brightdata_snapshot_id TEXT;
""")
print("  brightdata_snapshot_id column added (or already exists)")

cur.execute("""
    ALTER TABLE scrape_jobs
    ADD COLUMN IF NOT EXISTS scraper_backend VARCHAR(20);
""")
print("  scraper_backend column added (or already exists)")

cur.close()
conn.close()
print("Done.")
