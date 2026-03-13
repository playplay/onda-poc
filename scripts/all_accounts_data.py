# ALL accounts from Notion MVP Test Onda database (Casting Communicants COMPANY)
# format: (name, type, linkedin_url, sector, is_playplay_client, assigned_cs_email, company_name)
# Skipped: placeholder pages ("Account 1 Amélie", "Account 1 Ines"), search URLs (Groupe NGPA)
# NOTE: Inès and Amélie have no real accounts yet - only placeholders in Notion.
# CSM user ID mapping:
#   user://571d6a42-... -> maud.alexandre@playplay.com
#   user://2be67a57-... -> ines.bruguier@playplay.com
#   user://e5bd84af-... -> aurore@playplay.com
#   user://7b5f462c-... -> amelie.chabrillat@playplay.com
#   user://9bb4b336-... -> kenny@playplay.com
#   user://6b1c0e56-... -> manon.zacarias@playplay.com

ACCOUNTS = [
    # --- MAUD (maud.alexandre@playplay.com) --- BNP + TotalEnergies ---

    # BNP - Company accounts (Numéro 1-20 confirmed from Notion)
    ("BNP Paribas Leasing Solutions", "company", "https://www.linkedin.com/company/bnp-paribas-leasing-solutions/posts/?feedView=all", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Securities Services", "company", "https://www.linkedin.com/company/bnpparibassecuritiesservices", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Nickel", "company", "https://www.linkedin.com/company/compte-nickel/about/", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas CIB", "company", "https://www.linkedin.com/company/bnpparibascorporateandinstitutionalbanking/", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Cardif", "company", "https://www.linkedin.com/company/bnp-paribas-cardif/", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Wealth Management HQ", "company", "https://www.linkedin.com/company/bnp-paribas-wealth-management", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Asset Management", "company", "https://www.linkedin.com/company/bnp-paribas-asset-management/", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Arval", "company", "https://www.linkedin.com/company/bnp-paribas-arval/", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Personal Investors", "company", "https://www.linkedin.com/company/bnp-paribas-personal-investors/", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Personal Finance", "company", "https://www.linkedin.com/company/bnp-paribas-personal-finance", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BGL BNP Paribas", "company", "https://www.linkedin.com/company/bgl-bnp-paribas/", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("Portzamparc Groupe BNP Paribas", "company", "https://www.linkedin.com/company/portzamparcgroupe-bnpparibas/", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Partners for Innovation", "company", "https://www.linkedin.com/company/bnp-paribas-partners-for-innovation/", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Fortis", "company", "https://www.linkedin.com/company/bnpparibasfortis/", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP", "company", "https://www.linkedin.com/company/bnp-paribas/posts/", "Banque et assurances", True, "maud.alexandre@playplay.com", "BNP"),
    ("BNP Paribas Real Estate", "company", "https://www.linkedin.com/company/bnp-paribas-real-estate/", "Construction & Real Estate", True, "maud.alexandre@playplay.com", "BNP"),

    # TotalEnergies
    ("TotalEnergies", "company", "https://www.linkedin.com/company/totalenergies/posts/?feedView=all", "Energy & Utilities", True, "maud.alexandre@playplay.com", "TotalEnergies"),
    ("Patrick Pouyanné", "persona", "https://www.linkedin.com/in/patrickpouyanne/", "Energy & Utilities", True, "maud.alexandre@playplay.com", "TotalEnergies"),

    # --- AURORE (aurore@playplay.com) --- AXA + Veolia + SUEZ + bioMerieux + Saint-Gobain ---

    # AXA
    ("AXA", "company", "https://www.linkedin.com/company/axa/", "Banque et assurances", True, "aurore@playplay.com", "Axa"),
    ("AXA Partners France", "company", "https://www.linkedin.com/showcase/axa-partners-france/", "Banque et assurances", True, "aurore@playplay.com", "Axa"),

    # Veolia
    ("Veolia", "company", "https://www.linkedin.com/company/veolia-environnement/", "Energy & Utilities", True, "aurore@playplay.com", "Veolia"),
    ("Veolia France", "company", "https://www.linkedin.com/company/veolia-france/", "Energy & Utilities", True, "aurore@playplay.com", "Veolia"),
    ("Veolia Water Tech", "company", "https://www.linkedin.com/company/veolia-water-tech/", "Energy & Utilities", True, "aurore@playplay.com", "Veolia"),

    # SUEZ
    ("SUEZ", "company", "https://www.linkedin.com/company/suez/", "Energy & Utilities", True, "aurore@playplay.com", "Suez"),

    # bioMerieux
    ("bioMérieux", "company", "https://www.linkedin.com/company/biomerieux/", "Healthcare", True, "aurore@playplay.com", "BioMerieux"),

    # Saint-Gobain (confirmed from Notion: Saint-Gobain, ADFORS, Formula, Tape, Glass, SEKURIT, La Plateforme du Bâtiment)
    ("Saint-Gobain", "company", "https://www.linkedin.com/company/saint-gobain/", "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Saint-Gobain ADFORS", "company", "https://www.linkedin.com/company/saint-gobain-adfors/posts/?feedView=all", "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Saint-Gobain Formula", "company", "https://www.linkedin.com/company/saint-gobainformula/", "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Saint-Gobain Tape Solutions", "company", "https://www.linkedin.com/company/saint-gobain-tape-solutions/", "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Saint-Gobain Glass", "company", "https://www.linkedin.com/company/saint-gobain-glass/", "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("SEKURIT", "company", "https://www.linkedin.com/company/saint-gobain-sekurit/", "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("La Plateforme du Bâtiment", "company", "https://www.linkedin.com/company/la-plateforme-du-batiment/", "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    # Additional Saint-Gobain subsidiaries (from prior research, CSM confirmed as Aurore)
    ("ISOVER", "company", "https://www.linkedin.com/company/isover-france/", "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Point P", "company", "https://www.linkedin.com/company/pointp-sgdbf/", "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),
    ("Chryso", "company", "https://www.linkedin.com/company/chryso/", "Construction & Real Estate", True, "aurore@playplay.com", "Saint-Gobain"),

    # --- MANON (manon.zacarias@playplay.com) ---
    # FDJ + NHC + Krys + Pochet + Inside Group + Eramet + Clarins + Inovie + Sepur + Adisseo + HAS + Banque de France + Andros + A2MAC1

    ("FDJ United", "company", "https://www.linkedin.com/company/fdjunited/", "Salles de jeux d'argent et casinos", True, "manon.zacarias@playplay.com", "FDJ United"),
    ("NHC", "company", "https://www.linkedin.com/company/nhc-care/", "Services de santé à domicile", True, "manon.zacarias@playplay.com", "NHC"),
    ("Krys Group", "company", "https://www.linkedin.com/company/krys-group/", "Commerce de détail", True, "manon.zacarias@playplay.com", "Krys Group"),
    ("Groupe Pochet", "company", "https://www.linkedin.com/company/pochet/posts/?feedView=all", "Fabrication d'emballages et conteneurs", True, "manon.zacarias@playplay.com", "Groupe Pochet"),
    ("Inside Group", "company", "https://www.linkedin.com/company/insidegroup/", "Technologies et services de l'information", True, "manon.zacarias@playplay.com", "Inside Group"),
    ("Eramet", "company", "https://www.linkedin.com/company/eramet/", "Exploitation minière", True, "manon.zacarias@playplay.com", "Eramet"),
    ("Groupe Clarins", "company", "https://www.linkedin.com/company/groupe-clarins/", "Fabrication de parfums et de produits pour la toilette", True, "manon.zacarias@playplay.com", "Groupe Clarins"),
    ("Groupe Inovie", "company", "https://www.linkedin.com/company/groupe-inovie/", "Hôpitaux et services de santé", True, "manon.zacarias@playplay.com", "Groupe Inovie"),
    ("Sepur", "company", "https://www.linkedin.com/company/sepur/", "Services de conseil en environnement", True, "manon.zacarias@playplay.com", "Sepur"),
    ("Adisseo", "company", "https://www.linkedin.com/company/adisseo/", "Fabrication de produits chimiques", True, "manon.zacarias@playplay.com", "Adisseo"),
    ("Haute Autorité de Santé", "company", "https://www.linkedin.com/company/haute-autorite-de-sante/", "Administration publique", True, "manon.zacarias@playplay.com", "Hauté Autorité de Santé"),
    ("Banque de France", "company", "https://www.linkedin.com/company/banque-de-france/", "Services bancaires", True, "manon.zacarias@playplay.com", "Banque de France"),
    ("Andros", "company", "https://www.linkedin.com/company/andros-restauration/", "Fabrication de produits alimentaires et boissons", True, "manon.zacarias@playplay.com", "Andros"),
    ("A2MAC1", "company", "https://www.linkedin.com/company/a2mac1/", "Développement de logiciels", True, "manon.zacarias@playplay.com", "A2MAC1"),
    # Groupe NGPA: has only a LinkedIn search URL (not a company page), skipped

    # --- KENNY (kenny@playplay.com) --- Remake + others ---

    ("Remake Asset Management", "company", "https://www.linkedin.com/company/remake-am/posts/?feedView=all", "Services bancaires", True, "kenny@playplay.com", None),
    # Additional Kenny accounts from prior research (not yet confirmed in Notion but were in previous file)
    ("Marignan", "company", "https://www.linkedin.com/company/marignan-immo/posts/?feedView=all", "Construction & Real Estate", True, "kenny@playplay.com", None),
    ("Agarim", "company", "https://www.linkedin.com/company/agarimbienssurs/posts/?feedView=all", "Construction & Real Estate", True, "kenny@playplay.com", None),
    ("Mastergrid", "company", "https://www.linkedin.com/company/mastergrid/", "Energy & Utilities", True, "kenny@playplay.com", None),

    # --- INES (ines.bruguier@playplay.com) --- NO REAL ACCOUNTS YET ---
    # Only "Account 1 Ines" placeholder exists in Notion (no LinkedIn URL, skipped)

    # --- AMELIE (amelie.chabrillat@playplay.com) --- NO REAL ACCOUNTS YET ---
    # Only "Account 1 Amélie" placeholder exists in Notion (no LinkedIn URL, skipped)
]
