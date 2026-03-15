#!/usr/bin/env python3
"""
Reset DB and import watched accounts from Notion database.
Wipes all posts, scrape_jobs, and watched_accounts, then inserts fresh data.

Run: python scripts/reset_and_import_notion.py
"""
import asyncio
import asyncpg

DATABASE_URL = "postgresql://carlo.dhalluin@localhost/onda_poc"

# (name, type, linkedin_url, sector, is_playplay_client, assigned_cs_email, company_name)
ACCOUNTS = [
    # ============================================================
    # MAUD ALEXANDRE — BNP Paribas group + TotalEnergies
    # ============================================================
    ("BNP", "company",
     "https://www.linkedin.com/company/bnp-paribas/posts/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Leasing Solutions", "company",
     "https://www.linkedin.com/company/bnp-paribas-leasing-solutions/posts/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Securities Services", "company",
     "https://www.linkedin.com/company/bnpparibassecuritiesservices/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Nickel", "company",
     "https://www.linkedin.com/company/compte-nickel/about/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas CIB", "company",
     "https://www.linkedin.com/company/bnpparibascorporateandinstitutionalbanking/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Cardif", "company",
     "https://www.linkedin.com/company/bnp-paribas-cardif/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Wealth Management HQ", "company",
     "https://www.linkedin.com/company/bnp-paribas-wealth-management/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Asset Management", "company",
     "https://www.linkedin.com/company/bnp-paribas-asset-management/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("Floa", "company",
     "https://www.linkedin.com/company/floa-bank/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Arval", "company",
     "https://www.linkedin.com/company/bnp-paribas-arval/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Personal Investors", "company",
     "https://www.linkedin.com/company/bnp-paribas-personal-investors/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BGL BNP Paribas", "company",
     "https://www.linkedin.com/company/bgl-bnp-paribas/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Personal Finance", "company",
     "https://www.linkedin.com/company/bnp-paribas-personal-finance/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("Portzamparc Groupe BNP Paribas", "company",
     "https://www.linkedin.com/company/portzamparcgroupe-bnpparibas/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Partners for Innovation", "company",
     "https://www.linkedin.com/company/bnp-paribas-partners-for-innovation/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Fortis", "company",
     "https://www.linkedin.com/company/bnpparibasfortis/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("Hutchinson", "company",
     "https://www.linkedin.com/company/hutchinson/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Real Estate", "company",
     "https://www.linkedin.com/company/bnp-paribas-real-estate/",
     "Construction & Real Estate", True, "maud.alexandre@playplay.com", "BNP"),
    ("Act For Impact by BNP Paribas", "company",
     "https://www.linkedin.com/company/act-for-impact-by-bnp-paribas/",
     "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("TotalEnergies", "company",
     "https://www.linkedin.com/company/totalenergies/posts/?feedView=all",
     "Energy & Utilities", True, "maud.alexandre@playplay.com", "TotalEnergies"),
    ("Patrick Pouyanné", "person",
     "https://www.linkedin.com/in/patrickpouyanne/",
     "Energy & Utilities", True, "maud.alexandre@playplay.com", "TotalEnergies"),

    # ============================================================
    # AURORE — AXA, Veolia, SUEZ, bioMérieux, Saint-Gobain group
    # ============================================================
    ("AXA", "company",
     "https://www.linkedin.com/company/axa/",
     "Banque et assurances", True, "aurore@playplay.com", "Axa"),
    ("AXA Partners France", "company",
     "https://www.linkedin.com/showcase/axa-partners-france/",
     "Banque et assurances", True, "aurore@playplay.com", "Axa"),
    ("Veolia", "company",
     "https://www.linkedin.com/company/veolia-environnement/",
     "Energy & Utilities", True, "aurore@playplay.com", "Veolia"),
    ("Veolia France", "company",
     "https://www.linkedin.com/company/veolia-france/",
     "Energy & Utilities", True, "aurore@playplay.com", "Veolia"),
    ("Veolia Water Tech", "company",
     "https://www.linkedin.com/company/veolia-water-tech/",
     "Energy & Utilities", True, "aurore@playplay.com", "Veolia"),
    ("SUEZ", "company",
     "https://www.linkedin.com/company/suez/",
     "Energy & Utilities", True, "aurore@playplay.com", "Suez"),
    ("bioMérieux", "company",
     "https://www.linkedin.com/company/biomerieux/",
     "Healthcare", True, "aurore@playplay.com", "BioMerieux"),
    ("Saint-Gobain", "company",
     "https://www.linkedin.com/company/saint-gobain/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("ISOVER", "company",
     "https://www.linkedin.com/company/isover-france/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Saint-Gobain ADFORS", "company",
     "https://www.linkedin.com/company/saint-gobain-adfors/posts/?feedView=all",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Saint-Gobain Formula", "company",
     "https://www.linkedin.com/company/saint-gobainformula/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Vetrotech", "company",
     "https://www.linkedin.com/company/vetrotech-saint-gobain/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("SEKURIT", "company",
     "https://www.linkedin.com/company/saint-gobain-sekurit/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Point P", "company",
     "https://www.linkedin.com/company/pointp-sgdbf/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("La Plateforme du Bâtiment", "company",
     "https://www.linkedin.com/company/la-plateforme-du-batiment/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("SFIC", "company",
     "https://www.linkedin.com/company/sficfrance/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Asturienne", "company",
     "https://www.linkedin.com/company/asturienne-sgdb-france/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Chryso", "company",
     "https://www.linkedin.com/company/chryso/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Saint-Gobain Tape Solutions", "company",
     "https://www.linkedin.com/company/saint-gobain-tape-solutions/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Saint-Gobain Glass", "company",
     "https://www.linkedin.com/company/saint-gobain-glass/",
     "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),

    # ============================================================
    # KENNY BADOU
    # ============================================================
    ("Marignan", "company",
     "https://www.linkedin.com/company/marignan-immo/posts/?feedView=all",
     "Construction & Real Estate", True, "kenny@playplay.com", "Marignan"),
    ("Agarim", "company",
     "https://www.linkedin.com/company/agarimbienssurs/posts/?feedView=all",
     "Construction & Real Estate", True, "kenny@playplay.com", "Agarim"),
    ("Remake Asset Management", "company",
     "https://www.linkedin.com/company/remake-am/posts/?feedView=all",
     "Services bancaires", True, "kenny@playplay.com", "Remake AM"),
    ("Regie.lu", "company",
     "https://www.linkedin.com/company/regie-lu/posts/?feedView=all",
     "Médias et télécommunications", True, "kenny@playplay.com", "Regie.lu"),
    ("Mastergrid", "company",
     "https://www.linkedin.com/company/mastergrid/",
     "Energy & Utilities", True, "kenny@playplay.com", "Mastergrid"),
    ("Rainbow Partners / Quanteam", "company",
     "https://www.linkedin.com/company/rainbowpartners/posts/?feedView=all",
     "Technologies et services de l'information", True, "kenny@playplay.com", "Rainbow Partners"),

    # ============================================================
    # MANON ZACARIAS
    # ============================================================
    ("FDJ United", "company",
     "https://www.linkedin.com/company/fdjunited/",
     "Salles de jeux d'argent et casinos", True, "manon.zacarias@playplay.com", "FDJ United"),
    ("NHC", "company",
     "https://www.linkedin.com/company/nhc-care/",
     "Services de santé à domicile", True, "manon.zacarias@playplay.com", "NHC"),
    ("Groupe Pochet", "company",
     "https://www.linkedin.com/company/pochet/posts/?feedView=all",
     "Fabrication d'emballages et conteneurs", True, "manon.zacarias@playplay.com", "Groupe Pochet"),
    ("Krys Group", "company",
     "https://www.linkedin.com/company/krys-group/",
     "Commerce de détail", True, "manon.zacarias@playplay.com", "Krys Group"),
    ("Inside Group", "company",
     "https://www.linkedin.com/company/insidegroup/",
     "Technologies et services de l'information", True, "manon.zacarias@playplay.com", "Inside Group"),
    ("Eramet", "company",
     "https://www.linkedin.com/company/eramet/",
     "Exploitation minière", True, "manon.zacarias@playplay.com", "Eramet"),
    ("Groupe Clarins", "company",
     "https://www.linkedin.com/company/groupe-clarins/",
     "Fabrication de parfums et de produits pour la toilette", True, "manon.zacarias@playplay.com", "Groupe Clarins"),
    ("Groupe Inovie", "company",
     "https://www.linkedin.com/company/groupe-inovie/",
     "Hôpitaux et services de santé", True, "manon.zacarias@playplay.com", "Groupe Inovie"),
    ("Sepur", "company",
     "https://www.linkedin.com/company/sepur/",
     "Services de conseil en environnement", True, "manon.zacarias@playplay.com", "Sepur"),
    ("Adisseo", "company",
     "https://www.linkedin.com/company/adisseo/",
     "Fabrication de produits chimiques", True, "manon.zacarias@playplay.com", "Adisseo"),
    ("Haute Autorité de Santé", "company",
     "https://www.linkedin.com/company/haute-autorite-de-sante/",
     "Administration publique", True, "manon.zacarias@playplay.com", "Haute Autorité de Santé"),
    ("Banque de France", "company",
     "https://www.linkedin.com/company/banque-de-france/",
     "Services bancaires", True, "manon.zacarias@playplay.com", "Banque de France"),
    ("Andros", "company",
     "https://www.linkedin.com/company/andros-restauration/",
     "Fabrication de produits alimentaires et boissons", True, "manon.zacarias@playplay.com", "Andros"),
    ("A2MAC1", "company",
     "https://www.linkedin.com/company/a2mac1/",
     "Développement de logiciels", True, "manon.zacarias@playplay.com", "A2MAC1"),
    ("Groupe NGPA", "company",
     "https://www.linkedin.com/company/groupe-ngpa/",
     "Médias et télécommunications", True, "manon.zacarias@playplay.com", "Groupe NGPA"),

    # ============================================================
    # INÈS BRUGUIER (accounts to be confirmed — add via import_accounts.py)
    # ============================================================

    # ============================================================
    # AMÉLIE CHABRILLAT (accounts to be confirmed — add via import_accounts.py)
    # ============================================================
]


async def reset_and_import():
    print("Connecting to DB...")
    conn = await asyncpg.connect(DATABASE_URL)

    try:
        print("\n=== WIPING OLD DATA ===")
        # Delete in dependency order
        r = await conn.execute("DELETE FROM saved_posts")
        print(f"  Deleted saved_posts: {r}")
        r = await conn.execute("DELETE FROM collections")
        print(f"  Deleted collections: {r}")
        r = await conn.execute("DELETE FROM posts")
        print(f"  Deleted posts: {r}")
        r = await conn.execute("DELETE FROM scrape_jobs")
        print(f"  Deleted scrape_jobs: {r}")
        r = await conn.execute("DELETE FROM watched_accounts")
        print(f"  Deleted watched_accounts: {r}")

        print(f"\n=== INSERTING {len(ACCOUNTS)} ACCOUNTS ===")
        for name, acc_type, linkedin_url, sector, is_client, csm_email, company_name in ACCOUNTS:
            await conn.execute("""
                INSERT INTO watched_accounts
                    (id, name, type, linkedin_url, sector, is_playplay_client,
                     assigned_cs_email, company_name, created_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
            """, name, acc_type, linkedin_url, sector, is_client, csm_email, company_name)
            client_tag = " [CLIENT PP]" if is_client else ""
            csm_tag = f" → {csm_email.split('@')[0]}" if csm_email else ""
            print(f"  OK: {name!r} ({acc_type}, {sector}){client_tag}{csm_tag}")

        count = await conn.fetchval("SELECT COUNT(*) FROM watched_accounts")
        print(f"\nDone! {count} accounts in DB.")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(reset_and_import())
