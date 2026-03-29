"""
Detection et valorisation des accessoires pour BikeBargain.

Chaque accessoire est categorise et valorise (prix neuf estime en EUR) :
  - protection   : crash bars, protege-mains, protections moteur/carter
  - bagagerie    : top case, valises, sacoche de selle/reservoir
  - confort      : selle, bulle, poignees chauffantes, repose-pieds
  - navigation   : GPS, support telephone
  - eclairage    : phares additionnels, antibrouillards
  - esthetique   : retros, garde-boue, clignotants
  - performance  : echappement, cartographie, filtre
  - autre        : antivol, housse, bequille

Sources prix :
  - Royal Enfield Genuine (pieces-origine-royal-enfield.com, mars 2026)
  - SW-Motech, Givi, SHAD, Acerbis, Hepco & Becker (prix EUR publics)
  - Estimation moyenne quand marque non identifiable
"""

import re

# Taux de depreciation pour estimer la valeur occasion d'un accessoire
# 65% = un accessoire occasion vaut environ 65% de son prix neuf
DEPRECIATION_RATE = 0.65

# ─── CATALOGUE D'ACCESSOIRES ───────────────────────────────────────────────────
# Chaque tuple : (regex, nom, categorie, prix_neuf_eur, groupe_dedup)
#
# Le "groupe_dedup" sert a eviter les doublons : si un pattern specifique
# (ex: "crash bars sw-motech") matche, le pattern generique ("crash bars")
# ne sera pas ajoute car ils partagent le meme groupe.
# Les patterns SPECIFIQUES doivent etre AVANT les GENERIQUES.
#
# Le prix est une estimation moyenne tous fabricants confondus.
# Quand RE genuine existe, c'est le prix de reference.

ACCESSORY_PATTERNS: list[tuple[str, str, str, int, str]] = [
    # (regex, nom, categorie, prix_neuf_eur, groupe_dedup)

    # ══════════════════════════════════════════════════════════════════════════
    # PROTECTION
    # ══════════════════════════════════════════════════════════════════════════

    # Crash bars / barres de protection
    # NOTE: les crash bars sont de serie sur la Himalayan 450.
    # Seuls les aftermarket avec marque explicite comptent comme accessoire.
    (r"crash\s*bar(re)?[s]?\s*(sw[\s-]*motech|givi|hepco|h&b)",
     "Crash bars SW-Motech/Givi/Hepco", "protection", 200, "crash_bars"),

    # Protege-mains / Pare-mains / Handguards
    (r"(prot[eè]ge[s]?|pare)[\s-]*main[s]?\s*(rally|renforc|alu)",
     "Pare-mains rally aluminium", "protection", 120, "pare_mains"),
    (r"(prot[eè]ge[s]?|pare)[\s-]*main[s]?\s*(re\b|royal\s*enfield|genuine|origine)",
     "Pare-mains Royal Enfield", "protection", 120, "pare_mains"),
    (r"(prot[eè]ge[s]?|pare)[\s-]*main[s]?\s*(acerbis|barkbuster|sw[\s-]*motech|givi)",
     "Pare-mains aftermarket", "protection", 140, "pare_mains"),
    (r"(prot[eè]ge[s]?|pare)[\s-]*main|hand\s*guard",
     "Pare-mains", "protection", 120, "pare_mains"),

    # Sabot moteur / Engine guard / Skid plate
    (r"sabot\s*(moteur\s*)?(rally|renfoc[eé]|alu)\s*(re\b|royal\s*enfield)?",
     "Sabot rally Royal Enfield", "protection", 279, "sabot"),
    (r"sabot\s*(moteur\s*)?(sw[\s-]*motech|givi|acerbis|hepco)",
     "Sabot moteur aftermarket", "protection", 200, "sabot"),
    (r"sabot\s*(moteur|rally)|skid\s*plate|engine\s*guard|prot(ection|[eè]ge)[\s-]*moteur",
     "Sabot moteur", "protection", 200, "sabot"),

    # Protection carter
    (r"prot[eè]ge[\s-]*carter|carter\s*prot",
     "Protege-carter", "protection", 75, "carter"),

    # Protection reservoir
    (r"prot(ection|[eè]ge)[\s-]*(de\s*)?r[eé]servoir|tank\s*pad",
     "Protection reservoir", "protection", 45, "prot_reservoir"),

    # Protection radiateur
    (r"prot(ection|[eè]ge)[\s-]*(de\s*)?radiateur|grille\s*(alu\s*)?(de\s*)?radiateur|radiator\s*guard",
     "Protection radiateur", "protection", 69, "prot_radiateur"),

    # Grille de phare
    (r"grille\s*(de\s*)?phare|prot[eè]ge[s]?[\s-]*phare|headl(amp|ight)\s*(cover|grille|guard)",
     "Grille de phare", "protection", 80, "grille_phare"),

    # Sliders / tampons
    (r"slider[s]?|tampon[s]?\s*(de\s*)?prot",
     "Sliders/tampons de protection", "protection", 60, "sliders"),

    # Protege-leviers
    (r"prot[eè]ge[\s-]*levier",
     "Protege-leviers", "protection", 35, "prot_leviers"),

    # Renfort bequille
    (r"renfort\s*b[eé]quille|[eé]largisseur\s*(de\s*)?b[eé]quille|extension\s*(de\s*)?b[eé]quille|r[eé]hausse(ur)?\s*(de\s*)?b[eé]quille|side\s*stand\s*ext|ryl[\s-]*reo\s*hima",
     "Elargisseur de bequille", "protection", 55, "elargisseur_bequille"),

    # Protection echappement / pot
    (r"prot(ection|[eè]ge)[\s-]*(de\s*)?(pot|[eé]chappement|silencieux)|muffler\s*prot",
     "Protection echappement", "protection", 45, "prot_echappement"),

    # ══════════════════════════════════════════════════════════════════════════
    # BAGAGERIE
    # ══════════════════════════════════════════════════════════════════════════

    # Top case
    (r"top[\s-]*case\s*(alu|aluminium)\s*(re\b|royal\s*enfield|40\s*l)",
     "Top case aluminium 40L RE", "bagagerie", 449, "top_case"),
    (r"(givi\s*)?alaska(\s*trekker)?|top[\s-]*case\s*(monokey\s*)?alaska|giv[\s-]*ala\s*56",
     "Top case Givi Alaska Trekker ALU 56L", "bagagerie", 330, "top_case"),
    (r"top[\s-]*case\s*(alu|aluminium)\s*(sw[\s-]*motech|givi|shad|hepco)",
     "Top case aluminium aftermarket", "bagagerie", 300, "top_case"),
    (r"top[\s-]*case\s*(plastique|\d{2,3}\s*l)",
     "Top case plastique", "bagagerie", 191, "top_case"),
    (r"top[\s-]*case\s*(shad|givi|kappa)",
     "Top case aftermarket", "bagagerie", 200, "top_case"),
    (r"top[\s-]*case",
     "Top case", "bagagerie", 250, "top_case"),

    # Paniers / Valises / Sacoches laterales
    # SHAD TR series (TR30, TR40...) = sacoches laterales semi-rigides + support integre
    (r"shad\s*tr\s*\d+|sacoche[s]?\s*shad\s*tr\s*\d+",
     "Sacoches laterales SHAD TR (paire + support)", "bagagerie", 400, "paniers"),
    # Sacoches/valises laterales avec marque explicite
    (r"(sacoche|valise)[s]?\s*(lat[eé]ral[es]*\s*)?(shad|givi|sw[\s-]*motech|hepco|kappa)",
     "Sacoches laterales aftermarket", "bagagerie", 400, "paniers"),
    (r"(sacoche|valise)[s]?\s*(shad|givi|sw[\s-]*motech|hepco|kappa)",
     "Sacoches laterales aftermarket", "bagagerie", 400, "paniers"),
    # Paniers / Valises aluminium
    (r"(panier|valise)[s]?\s*(alu|aluminium)\s*(re\b|royal\s*enfield)",
     "Paniers aluminium Royal Enfield", "bagagerie", 600, "paniers"),
    (r"(panier|valise)[s]?\s*(alu|aluminium)\s*(sw[\s-]*motech|givi|shad|hepco|trax)",
     "Paniers aluminium aftermarket", "bagagerie", 500, "paniers"),
    (r"(panier|valise)[s]?\s*(alu|aluminium|lat[eé]ral)",
     "Paniers aluminium", "bagagerie", 500, "paniers"),
    (r"valise[s]?\s*(lat[eé]ral|rigide)|bagagerie\s*lat[eé]ral",
     "Valises laterales", "bagagerie", 450, "paniers"),

    # Porte-bagages
    (r"porte[\s-]*bagage[s]?\s*(alu|aluminium)\s*(re\b|royal\s*enfield)",
     "Porte-bagages aluminium RE", "bagagerie", 140, "porte_bagages"),
    (r"porte[\s-]*bagage|support\s*bagage|luggage\s*rack",
     "Porte-bagages", "bagagerie", 140, "porte_bagages"),

    # Platine / support top case
    (r"(givi\s*)?platine\s*monokey\s*(m9a)?|givi\s*m9a|m9a",
     "Platine Givi Monokey M9A", "bagagerie", 90, "platine_tc"),
    (r"platine\s*top[\s-]*case|support\s*top[\s-]*case|top[\s-]*case\s*(rack|support|plate)",
     "Platine top case", "bagagerie", 110, "platine_tc"),

    # Supports lateraux (meme groupe que porte-bagages)
    (r"support[s]?\s*(lat[eé]raux|valise|panier)\s*(re\b|royal\s*enfield|genuine|origine)",
     "Supports valises laterales RE", "bagagerie", 140, "porte_bagages"),
    (r"support[s]?\s*(lat[eé]raux|valise|panier)|pannier\s*(frame|rail|rack)",
     "Supports valises laterales RE", "bagagerie", 140, "porte_bagages"),

    # Support sacoche reservoir
    (r"support\s*(de\s*)?sacoche[s]?\s*(de\s*)?r[eé]servoir|giv[\s-]*bf\s*92|bf\s*92",
     "Support sacoche reservoir Givi BF92", "bagagerie", 40, "support_sacoche_reservoir"),

    # Sacoches
    (r"(givi?\s*)?xs[\s-]*307|giv[\s-]*xs\s*307",
     "Sacoche reservoir Givi XS307 15L", "bagagerie", 115, "sacoche_reservoir"),
    (r"sacoche[s]?\s*(de\s*)?r[eé]servoir|tank\s*bag",
     "Sacoche de reservoir", "bagagerie", 279, "sacoche_reservoir"),
    (r"sacoche[s]?\s*(de\s*)?(selle|cavali[eè]re)|saddle\s*bag",
     "Sacoches de selle", "bagagerie", 149, "sacoche_selle"),
    (r"sacoche[s]?\s*(souple|[eé]tanche|waterproof|soft\s*bag)",
     "Sacoches souples", "bagagerie", 149, "sacoche_souple"),

    # Sac etanche
    (r"sac[s]?\s*([eé]tanche|waterproof|dry\s*bag)",
     "Sac etanche", "bagagerie", 69, "sac_etanche"),

    # ══════════════════════════════════════════════════════════════════════════
    # CONFORT
    # ══════════════════════════════════════════════════════════════════════════

    # Bulle / Pare-brise
    (r"bulle\s*(haute|touring|adventure|haute\s*prot)\s*(re\b|royal\s*enfield)",
     "Bulle touring Royal Enfield", "confort", 119, "bulle"),
    (r"bulle\s*(haute|touring|adventure)?\s*wrs|wrs|pare[\s-]*brise\s*wrs",
     "Bulle/pare-brise WRS", "confort", 115, "bulle"),
    (r"bulle\s*(haute|touring|adventure)\s*(givi|puig|ermax|isotta|mra)",
     "Bulle touring aftermarket", "confort", 130, "bulle"),
    (r"bulle\s*(haute|touring|adventure|haute\s*prot)",
     "Bulle haute/touring", "confort", 119, "bulle"),
    (r"bulle|pare[\s-]*brise|windscreen|windshield",
     "Bulle/pare-brise", "confort", 100, "bulle"),

    # Selle conducteur
    (r"selle\s*(rally|confort)\s*(re\b|royal\s*enfield|genuine|origine)",
     "Selle rally/confort Royal Enfield", "confort", 119, "selle"),
    (r"selle\s*(basse|low\s*rider)\s*(re\b|royal\s*enfield)?",
     "Selle basse (-11mm) RE", "confort", 119, "selle"),
    (r"selle[s]?\s*(rally|confort|basse|chauffante|gel)",
     "Selle confort/rally", "confort", 119, "selle"),

    # Selle passager
    (r"selle[s]?\s*(passager|touring|duo)\s*confort",
     "Selle passager touring RE", "confort", 99, "selle_passager"),

    # Poignees chauffantes
    (r"poign[eé]e[s]?\s*chauffante",
     "Poignees chauffantes", "confort", 130, "poignees_chauffantes"),

    # Repose-pieds
    (r"repose[\s-]*pied[s]?\s*(rally|r[eé]glable|large|off[\s-]*road|alu)",
     "Repose-pieds rally", "confort", 90, "repose_pieds"),

    # Rehausse pontet / guidon
    (r"rehausse[s]?\s*(pontet|guidon)|pontet[s]?\s*(rehausse|surelev)|handlebar\s*(riser|ext)",
     "Rehausse pontet guidon", "confort", 59, "rehausse"),

    # Bequille centrale / atelier
    (r"b[eé]quille\s*(centrale|atelier)|l[eè]ve[\s-]*moto|center\s*stand",
     "Bequille centrale/atelier", "confort", 180, "bequille_centrale"),

    # Guidon
    (r"guidon\s*(rehausse|brace|fatbar)",
     "Guidon rehausse/brace", "confort", 80, "guidon"),

    # Mousse guidon
    (r"mousse\s*(de\s*)?guidon|guidon\s*foam|bar\s*pad",
     "Mousse guidon rally", "confort", 35, "mousse_guidon"),

    # ══════════════════════════════════════════════════════════════════════════
    # NAVIGATION
    # ══════════════════════════════════════════════════════════════════════════

    (r"gps\s*(garmin|zumo|tomtom)",
     "GPS Garmin/TomTom", "navigation", 350, "gps"),
    (r"(?<!support\s)(?<!suport\s)\bgps\b(?!\s*/\s*t[eé]l[eé]phone)(?!\s*/\s*smartphone)",
     "GPS", "navigation", 350, "gps"),
    (r"support\s*(t[eé]l[eé]phone|smartphone|gps)\s*(re\b|royal\s*enfield)",
     "Support telephone/GPS RE", "navigation", 49, "support_tel"),
    (r"quad\s*lock",
     "Support Quad Lock", "navigation", 80, "support_tel"),
    (r"support\s*(t[eé]l[eé]phone|smartphone|gps)",
     "Support telephone/GPS", "navigation", 49, "support_tel"),
    (r"chargeur\s*(usb|sans[\s-]*fil|induction)",
     "Chargeur USB/induction", "navigation", 30, "chargeur"),

    # ══════════════════════════════════════════════════════════════════════════
    # ECLAIRAGE
    # ══════════════════════════════════════════════════════════════════════════

    (r"(phare[s]?|feux?)\s*(additionnel[s]?|auxiliaire[s]?|anti[\s-]*brouillard|longue[\s-]*port[eé]e)[s]?\s*(denali|sw[\s-]*motech)",
     "Phares additionnels Denali/SW-Motech", "eclairage", 380, "phares_add"),
    (r"(phare[s]?|feux?)\s*(additionnel[s]?|auxiliaire[s]?|anti[\s-]*brouillard|longue[\s-]*port[eé]e)[s]?\s*givi",
     "Phares additionnels Givi", "eclairage", 170, "phares_add"),
    (r"(phare[s]?|feux?)\s*(additionnel[s]?|auxiliaire[s]?|anti[\s-]*brouillard|longue[\s-]*port[eé]e)|fog\s*light|aux(iliary)?\s*light",
     "Phares additionnels", "eclairage", 120, "phares_add"),
    (r"rampe\s*(led|lumineuse)|light\s*bar",
     "Rampe LED", "eclairage", 150, "rampe_led"),

    # ══════════════════════════════════════════════════════════════════════════
    # ESTHETIQUE
    # ══════════════════════════════════════════════════════════════════════════

    (r"r[eé]tro(viseur)?[s]?\s*(bar[\s-]*end|embout|alu|touring)\s*(re\b|royal\s*enfield)",
     "Retros touring RE", "esthetique", 69, "retros"),
    (r"r[eé]tro(viseur)?[s]?\s*(bar[\s-]*end|embout|alu|touring)",
     "Retros bar-end", "esthetique", 60, "retros"),
    (r"r[eé]tro(viseur)?[s]?\s*alu",
     "Retros alu", "esthetique", 60, "retros"),
    (r"garde[\s-]*boue\s*(rally|avant\s*haut|haut|court)\s*(re\b|royal\s*enfield)?",
     "Kit garde-boue rally RE", "esthetique", 219, "garde_boue"),
    (r"garde[\s-]*boue\s*(avant|arri[eè]re|rally|haut|additionnel)",
     "Garde-boue additionnel", "esthetique", 80, "garde_boue"),
    (r"clignotant[s]?\s*(led|s[eé]quentiel)",
     "Clignotants LED", "esthetique", 60, "clignotants"),
    (r"saute[\s-]*vent",
     "Saute-vent", "esthetique", 40, "saute_vent"),
    (r"sticker[s]?|autocollant|d[eé]co\s*(r[eé]servoir)?",
     "Stickers/deco", "esthetique", 30, "stickers"),
    (r"bouchon\s*(huile|r[eé]servoir)\s*(alu|cnc)",
     "Bouchon alu CNC", "esthetique", 65, "bouchon_alu"),

    # ══════════════════════════════════════════════════════════════════════════
    # PERFORMANCE
    # ══════════════════════════════════════════════════════════════════════════

    # Echappement
    (r"(ligne|[eé]chappement)\s*(compl[eè]te\s*)?hp\s*corse|hp\s*corse",
     "Echappement HP Corse", "performance", 400, "echappement"),
    (r"(ligne|[eé]chappement)\s*(compl[eè]te\s*)?(akrapovic|arrow|sc[\s-]*project|leo\s*vince)",
     "Echappement premium", "performance", 500, "echappement"),
    (r"(ligne|[eé]chappement)\s*(compl[eè]te\s*)?(ixil|giannelli|mivv|cobra)",
     "Echappement aftermarket", "performance", 350, "echappement"),
    (r"[eé]chappement|silencieux|pot\s*(d\s*[eé]chappement|sport|racing)",
     "Echappement aftermarket", "performance", 350, "echappement"),

    # Filtre a air
    (r"filtre\s*[aà]\s*air\s*(sport|kn|dna|bmc|stage)",
     "Filtre a air sport", "performance", 90, "filtre_air"),

    # Cartographie / reprog
    (r"cartographie|flash\s*ecu|power\s*commander|rapid\s*bike|fuel\s*x",
     "Reprogrammation/cartographie", "performance", 300, "reprog"),

    # Leviers
    (r"levier[s]?\s*(court[s]?|r[eé]glable[s]?|cnc|alu|racing)",
     "Leviers reglables", "performance", 60, "leviers"),

    # Kit chaine
    (r"kit\s*cha[iî]ne|couronne\s*(alu|renforc)|pignon",
     "Kit chaine", "performance", 174, "kit_chaine"),

    # Pneus
    (r"pneu[s]?\s*(neuf|route|trail|offroad|mixte|karoo|anakee|tkc|heidenau|mitas|pirelli|continental|michelin|dunlop|bridgestone)",
     "Pneus specifiques", "performance", 200, "pneus"),

    # ══════════════════════════════════════════════════════════════════════════
    # AUTRE
    # ══════════════════════════════════════════════════════════════════════════

    (r"antivol|bloque[\s-]*disque|u[\s-]*lock",
     "Antivol", "autre", 50, "antivol"),
    (r"alarme",
     "Alarme", "autre", 100, "alarme"),
    (r"housse\s*(de\s*)?(moto|prot)",
     "Housse de protection", "autre", 45, "housse"),
    (r"traceur\s*(gps|moto)|airtag|monimoto",
     "Traceur GPS/antivol", "autre", 150, "traceur"),
    (r"kit\s*(rally|aventure|baroudeur|touring)",
     "Kit rally/aventure", "autre", 400, "kit_rally"),
    (r"b[eé]quille\s*lat[eé]rale\s*(r[eé]glable)?",
     "Bequille laterale", "autre", 30, "bequille_lat"),
]


# ─── ZONES D'EXCLUSION ────────────────────────────────────────────────────────
# Patterns qui identifient des sections "services concessionnaire" ou contextes
# ou les mots-cles d'accessoires ne designent pas un equipement de la moto.
# On supprime ces zones du texte avant la detection.
EXCLUSION_PATTERNS: list[str] = [
    # Listes de services garage/concessionnaire entre parentheses
    r"\((?:[^)]*(?:pneumatique|vidange|service|atelier|réparation|entretien)[^)]*)\)",
    # Phrases "service rapide ..." jusqu'a fin de ligne
    r"service[s]?\s*(rapide|moto|atelier)[^\n]*",
    # Phrases "atelier de ..." jusqu'a fin de ligne
    r"atelier\s*(de\s*)?(réparation|entretien|mécanique)[^\n]*",
]


def _clean_text_for_detection(text: str) -> str:
    """Supprime les zones de texte qui decrivent des services garage."""
    cleaned = text.lower()
    for pattern in EXCLUSION_PATTERNS:
        cleaned = re.sub(pattern, " ", cleaned)
    return cleaned


def detect_accessories(text: str, price_overrides: dict[str, int] | None = None) -> list[dict]:
    """
    Detecte les accessoires mentionnes dans un texte d'annonce.

    La deduplication se fait par GROUPE : si un pattern specifique
    (ex: "Crash bars SW-Motech") matche, le pattern generique ("Crash bars")
    du meme groupe est ignore.

    Les zones de texte decrivant des services garage (ex: "Service rapide :
    pneumatique, kit chaine, vidange") sont exclues avant la detection.

    Args:
        text: Le body ou la description de l'annonce.
        price_overrides: Dict optionnel {group_key: prix_neuf} pour surcharger
            les prix par defaut du catalogue.

    Returns:
        Liste de dicts :
        {
            "name": str,
            "category": str,
            "source": "body",
            "estimated_new_price": int,
            "estimated_used_price": int,
        }
    """
    if not text:
        return []

    overrides = price_overrides or {}
    text_lower = _clean_text_for_detection(text)
    matched_groups: set[str] = set()
    found: list[dict] = []

    for pattern, name, category, price_new, group in ACCESSORY_PATTERNS:
        if group in matched_groups:
            continue  # Ce groupe a deja ete matche par un pattern plus specifique
        if re.search(pattern, text_lower):
            matched_groups.add(group)
            effective_price = overrides.get(group, price_new)
            found.append({
                "name": name,
                "category": category,
                "source": "body",
                "estimated_new_price": effective_price,
                "estimated_used_price": int(effective_price * DEPRECIATION_RATE),
            })

    return found


def estimate_total_accessories_value(accessories: list[dict]) -> dict:
    """
    Calcule la valeur totale des accessoires detectes.

    Returns:
        {
            "total_new_price": int,      # valeur totale neuf
            "total_used_price": int,     # valeur totale occasion estimee
            "count": int,                # nombre d'accessoires
            "by_category": {             # ventilation par categorie
                "protection": {"count": int, "new": int, "used": int},
                ...
            }
        }
    """
    result = {
        "total_new_price": 0,
        "total_used_price": 0,
        "count": len(accessories),
        "by_category": {},
    }

    for acc in accessories:
        cat = acc.get("category", "autre")
        new_price = acc.get("estimated_new_price", 0)
        used_price = acc.get("estimated_used_price", 0)

        result["total_new_price"] += new_price
        result["total_used_price"] += used_price

        if cat not in result["by_category"]:
            result["by_category"][cat] = {"count": 0, "new": 0, "used": 0}
        result["by_category"][cat]["count"] += 1
        result["by_category"][cat]["new"] += new_price
        result["by_category"][cat]["used"] += used_price

    return result
