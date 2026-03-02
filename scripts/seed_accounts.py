"""
Script pour insérer les comptes du tableau Casting communicants dans la base Onda.
Utilise l'API locale (si dispo) ou insère directement en DB.
"""

import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from psycopg2.extras import execute_values

POSTGRES_URL = os.environ["POSTGRES_URL"]

# Données extraites du tableau (nom, linkedin_url, secteur, type, company_name, is_playplay_client)
ACCOUNTS = [
    # ── Construction & Real Estate ──────────────────────────────────────────
    ("BNP Paribas Real Estate",         "https://www.linkedin.com/company/bnp-paribas-real-estate/",   "Construction & Real Estate", "company", None,                               True),
    ("Groupe Habitat en Région",         "https://www.linkedin.com/company/habitat-en-r%C3%A9gion/",    "Construction & Real Estate", "company", None,                               True),
    ("Cromology",                        "https://www.linkedin.com/company/cromology/",                  "Construction & Real Estate", "company", None,                               True),
    ("Constructys",                      "https://www.linkedin.com/company/constructys/",                "Construction & Real Estate", "company", None,                               True),
    ("Kaufman & Broad",                  "https://www.linkedin.com/company/kaufman-and-broad/",          "Construction & Real Estate", "company", None,                               True),
    ("Saint Gobain",                     "https://www.linkedin.com/company/saint-gobain/",               "Construction & Real Estate", "company", None,                               False),
    ("Nexity",                           "https://www.linkedin.com/company/nexity/",                     "Construction & Real Estate", "company", None,                               False),
    ("Fédération française du bâtiment", "https://www.linkedin.com/company/federation-francaise-du-batiment/", "Construction & Real Estate", "company", None,                        False),
    # Personas Construction
    ("Benoit Bazin",                     "https://fr.linkedin.com/in/benoit-bazin-60723b119",            "Construction & Real Estate", "person",  "Saint Gobain",                    False),
    ("Claire Garnier",                   "https://www.linkedin.com/in/claire-garnier-29594722/",         "Construction & Real Estate", "person",  "Saint Gobain",                    False),
    ("Véronique Bédague",                "https://www.linkedin.com/in/v%C3%A9ronique-b%C3%A9dague-5b54713a/", "Construction & Real Estate", "person", "Nexity",                     False),
    ("Nordine Hachemi",                  "https://www.linkedin.com/in/nordine-hachemi-80a800199/",       "Construction & Real Estate", "person",  "Kaufman & Broad",                 True),
    ("Olivier Salleron",                 "https://www.linkedin.com/in/olivier-salleron-1275b5137/",      "Construction & Real Estate", "person",  "Fédération française du bâtiment", False),

    # ── Energy & Utilities ──────────────────────────────────────────────────
    ("Vinci Energies",                   "https://www.linkedin.com/company/vinci-energies/",             "Energy & Utilities",         "company", None,                               True),
    ("TotalEnergies",                    "https://www.linkedin.com/company/totalenergies/",               "Energy & Utilities",         "company", None,                               True),
    ("FirstEnergy",                      "https://www.linkedin.com/company/firstenergy-corp/",            "Energy & Utilities",         "company", None,                               True),
    ("Dalkia",                           "https://www.linkedin.com/company/dalkia/",                      "Energy & Utilities",         "company", None,                               True),
    ("Glencore",                         "https://www.linkedin.com/company/glencore/",                    "Energy & Utilities",         "company", None,                               True),
    ("EDF",                              "https://www.linkedin.com/company/edf/",                         "Energy & Utilities",         "company", None,                               True),
    ("Equans",                           "https://www.linkedin.com/company/equans/",                      "Energy & Utilities",         "company", None,                               True),
    ("Schneider Electric",               "https://www.linkedin.com/company/schneider-electric/",          "Energy & Utilities",         "company", None,                               True),
    ("Air Liquide",                      "https://www.linkedin.com/company/airliquide/",                  "Energy & Utilities",         "company", None,                               True),
    ("Enedis",                           "https://www.linkedin.com/company/enedis/",                      "Energy & Utilities",         "company", None,                               True),
    ("Engie Belgium",                    "https://www.linkedin.com/company/engie-belgium/",               "Energy & Utilities",         "company", None,                               True),
    ("Technip Energies",                 "https://www.linkedin.com/company/technip-energies/",            "Energy & Utilities",         "company", None,                               True),
    ("Framatome",                        "https://www.linkedin.com/company/framatome/",                   "Energy & Utilities",         "company", None,                               True),
    ("Engie Solutions",                  "https://www.linkedin.com/company/engie-solutions/",             "Energy & Utilities",         "company", None,                               True),
    ("Suez",                             "https://www.linkedin.com/company/suez/",                        "Energy & Utilities",         "company", None,                               True),
    # Personas Energy
    ("Catherine Lescure",                "https://www.linkedin.com/in/catherine-lescure-467aa735/",      "Energy & Utilities",         "person",  None,                               False),
    ("Patrick Pouyanné",                 "https://www.linkedin.com/in/patrickpouyanne/",                  "Energy & Utilities",         "person",  None,                               True),

    # ── Banques et assurances ───────────────────────────────────────────────
    ("Mounir Laggoune",                  "https://www.linkedin.com/in/mounirlaggoune/",                   "Banques et assurances",      "person",  None,                               False),
]


def main():
    conn = psycopg2.connect(POSTGRES_URL)
    cur = conn.cursor()

    # Récupère les linkedin_url existantes pour éviter les doublons
    cur.execute("SELECT linkedin_url FROM watched_accounts")
    existing_urls = {row[0] for row in cur.fetchall()}

    now = datetime.now(timezone.utc)
    inserted = 0
    skipped = 0

    rows = []
    for name, url, sector, acc_type, company_name, is_pp in ACCOUNTS:
        if url in existing_urls:
            print(f"  SKIP (existe déjà) : {name}")
            skipped += 1
            continue
        rows.append((
            str(uuid.uuid4()),
            name,
            acc_type,
            url,
            sector,
            company_name,
            is_pp,
            now,
        ))

    if rows:
        execute_values(
            cur,
            """
            INSERT INTO watched_accounts (id, name, type, linkedin_url, sector, company_name, is_playplay_client, created_at)
            VALUES %s
            """,
            rows,
        )
        conn.commit()
        inserted = len(rows)

    cur.close()
    conn.close()

    print(f"\n✓ {inserted} compte(s) inséré(s), {skipped} ignoré(s) (déjà présents).")


if __name__ == "__main__":
    main()
