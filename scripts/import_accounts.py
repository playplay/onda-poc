#!/usr/bin/env python3
"""
Import watched accounts from a CSV file into the onda_poc database.

Usage:
    python scripts/import_accounts.py <path-to-csv>

Expected CSV columns (case-insensitive):
    - Name (account name)
    - LinkedIn URL (or "URL" / "LinkedIn")
    - Type (optional: "Persona" → person, else company)
    - Sector (or "secteur")
    - Client PP ? (optional: "Yes" → is_playplay_client=True)
    - CS (or "CSM" / "Assigned CS"): CSM name → mapped to email
    - Instagram URL (optional)
    - TikTok URL (optional)

CSM name → email mapping:
    Maud Alexandre      → maud.alexandre@playplay.com
    Ines Bruguier       → ines.bruguier@playplay.com
    Aurore              → aurore@playplay.com
    Amélie Chabrillat   → amelie.chabrillat@playplay.com
    Kenny Badou         → kenny@playplay.com
    Manon Zacarias      → manon.zacarias@playplay.com
"""

import asyncio
import csv
import re
import sys
from pathlib import Path

import asyncpg

DATABASE_URL = "postgresql://carlo.dhalluin@localhost/onda_poc"

CSM_MAP = {
    "maud alexandre": "maud.alexandre@playplay.com",
    "maud": "maud.alexandre@playplay.com",
    "ines bruguier": "ines.bruguier@playplay.com",
    "inès bruguier": "ines.bruguier@playplay.com",
    "ines": "ines.bruguier@playplay.com",
    "aurore": "aurore@playplay.com",
    "amélie chabrillat": "amelie.chabrillat@playplay.com",
    "amelie chabrillat": "amelie.chabrillat@playplay.com",
    "amélie": "amelie.chabrillat@playplay.com",
    "amelie": "amelie.chabrillat@playplay.com",
    "kenny badou": "kenny@playplay.com",
    "kenny": "kenny@playplay.com",
    "manon zacarias": "manon.zacarias@playplay.com",
    "manon": "manon.zacarias@playplay.com",
}


def _find_col(headers: list[str], *candidates: str) -> str | None:
    """Return first header matching any candidate (case-insensitive)."""
    lower_headers = [h.lower().strip() for h in headers]
    for c in candidates:
        c_lower = c.lower()
        if c_lower in lower_headers:
            return headers[lower_headers.index(c_lower)]
    return None


def _normalize_linkedin(url: str) -> str | None:
    url = url.strip()
    if not url or url.startswith("http") and "linkedin.com/search" in url:
        return None  # Skip search URLs
    if not url:
        return None
    # Ensure https
    if not url.startswith("http"):
        url = "https://" + url
    return url


def _csm_email(name_raw: str) -> str | None:
    if not name_raw:
        return None
    return CSM_MAP.get(name_raw.lower().strip())


async def import_csv(csv_path: str) -> None:
    print(f"Reading {csv_path}...")
    conn = await asyncpg.connect(DATABASE_URL)

    try:
        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
            print(f"Columns: {headers}")

            # Detect column names
            col_name = _find_col(headers, "Name", "Nom", "Account")
            col_linkedin = _find_col(headers, "LinkedIn URL", "LinkedIn", "URL", "linkedin_url")
            col_type = _find_col(headers, "Type", "type")
            col_sector = _find_col(headers, "Sector", "Secteur", "sector")
            col_client = _find_col(headers, "Client PP ?", "Client PP", "PlayPlay Client", "is_playplay_client")
            col_cs = _find_col(headers, "CS", "CSM", "Assigned CS", "assigned_cs", "Responsable")
            col_instagram = _find_col(headers, "Instagram URL", "Instagram", "instagram_url")
            col_tiktok = _find_col(headers, "TikTok URL", "TikTok", "tiktok_url")

            print(f"Detected columns: name={col_name}, linkedin={col_linkedin}, type={col_type}, "
                  f"sector={col_sector}, client={col_client}, cs={col_cs}")

            rows = list(reader)

        imported = 0
        skipped = 0

        for row in rows:
            name = (row.get(col_name) or "").strip() if col_name else ""
            linkedin_raw = (row.get(col_linkedin) or "").strip() if col_linkedin else ""
            type_raw = (row.get(col_type) or "company").strip() if col_type else "company"
            sector = (row.get(col_sector) or "").strip() if col_sector else ""
            client_raw = (row.get(col_client) or "").strip() if col_client else ""
            cs_raw = (row.get(col_cs) or "").strip() if col_cs else ""
            instagram_raw = (row.get(col_instagram) or "").strip() if col_instagram else ""
            tiktok_raw = (row.get(col_tiktok) or "").strip() if col_tiktok else ""

            # Skip rows without a name or LinkedIn URL
            if not name and not linkedin_raw:
                skipped += 1
                continue

            linkedin_url = _normalize_linkedin(linkedin_raw)

            # Skip search URLs and rows without any URL
            if not linkedin_url and not instagram_raw and not tiktok_raw:
                print(f"  SKIP (no URL): {name!r}")
                skipped += 1
                continue

            account_type = "person" if type_raw.lower() == "persona" else "company"
            is_client = client_raw.lower() in ("yes", "oui", "true", "1")
            assigned_email = _csm_email(cs_raw)
            instagram_url = instagram_raw if instagram_raw.startswith("http") else None
            tiktok_url = tiktok_raw if tiktok_raw.startswith("http") else None

            if not sector:
                print(f"  SKIP (no sector): {name!r}")
                skipped += 1
                continue

            # Try to find existing row: by linkedin_url first, then by name+sector
            existing_id = None
            if linkedin_url:
                existing_id = await conn.fetchval(
                    "SELECT id FROM watched_accounts WHERE linkedin_url = $1", linkedin_url
                )
            if not existing_id:
                existing_id = await conn.fetchval(
                    "SELECT id FROM watched_accounts WHERE LOWER(name)=LOWER($1) AND sector=$2",
                    name, sector
                )

            if existing_id:
                await conn.execute("""
                    UPDATE watched_accounts SET
                        name = $1,
                        type = $2,
                        linkedin_url = COALESCE($3, linkedin_url),
                        instagram_url = COALESCE($4, instagram_url),
                        tiktok_url = COALESCE($5, tiktok_url),
                        sector = $6,
                        is_playplay_client = $7,
                        assigned_cs_email = $8
                    WHERE id = $9
                """, name, account_type, linkedin_url, instagram_url, tiktok_url,
                sector, is_client, assigned_email, existing_id)
            else:
                await conn.execute("""
                    INSERT INTO watched_accounts
                        (id, name, type, linkedin_url, instagram_url, tiktok_url,
                         sector, is_playplay_client, assigned_cs_email, created_at)
                    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())
                """, name, account_type, linkedin_url, instagram_url, tiktok_url,
                sector, is_client, assigned_email)

            print(f"  OK: {name!r} ({account_type}, {sector}, cs={assigned_email})")
            imported += 1

        print(f"\nDone: {imported} imported/updated, {skipped} skipped.")

    finally:
        await conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/import_accounts.py <path-to-csv>")
        sys.exit(1)
    asyncio.run(import_csv(sys.argv[1]))
