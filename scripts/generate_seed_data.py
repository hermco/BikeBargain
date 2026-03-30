"""
Genere les fichiers JSON de seed data pour la migration multi-modele.
Lit les constantes hardcodees actuelles et les exporte en JSON.

Usage:
    source .venv/bin/activate
    python scripts/generate_seed_data.py

Outputs:
    alembic/seed_himalayan_accessories.json  — patterns d'accessoires (80+ entrees)
    alembic/seed_himalayan_data.json         — config, variantes, consommables, patterns
"""

import ast
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# ─── Helpers pour extraire les constantes sans importer les modules ────────────
# src/accessories.py, src/extractor.py et src/crawler.py ont des imports lourds
# (lbc, pydantic-settings) qui exigent une BDD + env vars. On parse l'AST
# pour extraire uniquement les constantes dont on a besoin.


def _extract_constant_from_file(filepath: str, constant_name: str):
    """
    Extrait la valeur d'une constante Python (assignation top-level) depuis
    un fichier source, sans importer le module.

    Supporte ast.Assign (x = ...) et ast.AnnAssign (x: type = ...).
    """
    src = Path(filepath).read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in ast.walk(tree):
        # x = value
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == constant_name:
                    return ast.literal_eval(node.value)
        # x: Type = value
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name) and node.target.id == constant_name:
                if node.value is not None:
                    return ast.literal_eval(node.value)
    raise ValueError(f"Constante '{constant_name}' introuvable dans {filepath}")


# Charger les constantes depuis chaque fichier source
_acc_path = REPO_ROOT / "src" / "accessories.py"
ACCESSORY_PATTERNS = _extract_constant_from_file(_acc_path, "ACCESSORY_PATTERNS")
EXCLUSION_PATTERNS = _extract_constant_from_file(_acc_path, "EXCLUSION_PATTERNS")

_ext_path = REPO_ROOT / "src" / "extractor.py"
NEW_PRICES = _extract_constant_from_file(_ext_path, "NEW_PRICES")
VARIANT_PATTERNS = _extract_constant_from_file(_ext_path, "VARIANT_PATTERNS")

_ana_path = REPO_ROOT / "src" / "analyzer.py"
CONSUMABLES = _extract_constant_from_file(_ana_path, "CONSUMABLES")
WARRANTY_DURATION_YEARS = _extract_constant_from_file(_ana_path, "WARRANTY_DURATION_YEARS")
WARRANTY_VALUE_PER_YEAR = _extract_constant_from_file(_ana_path, "WARRANTY_VALUE_PER_YEAR")
MECHANICAL_WEAR_PER_KM = _extract_constant_from_file(_ana_path, "MECHANICAL_WEAR_PER_KM")
CONDITION_RISK_PER_KM = _extract_constant_from_file(_ana_path, "CONDITION_RISK_PER_KM")
SHORT_TERM_KM_THRESHOLD = _extract_constant_from_file(_ana_path, "SHORT_TERM_KM_THRESHOLD")

# SEARCH_TEXT, SEARCH_CC_MIN, SEARCH_CC_MAX depuis crawler.py
# SEARCH_CATEGORY est lbc.Category.VEHICULES_MOTOS — non-litteral, on skip et on hardcode les valeurs
_cra_path = REPO_ROOT / "src" / "crawler.py"
SEARCH_TEXT = _extract_constant_from_file(_cra_path, "SEARCH_TEXT")
SEARCH_CC_MIN = _extract_constant_from_file(_cra_path, "SEARCH_CC_MIN")
SEARCH_CC_MAX = _extract_constant_from_file(_cra_path, "SEARCH_CC_MAX")

ALEMBIC_DIR = REPO_ROOT / "alembic"

# Mapping variante -> couleur hex (depuis frontend/src/lib/utils.ts variantColor())
VARIANT_COLOR_HEX = {
    "Base": "#d97706",        # amber
    "Pass": "#2563eb",        # blue
    "Summit": "#059669",      # emerald
    "Mana Black": "#6b7280",  # gray
}

# color_map fallback depuis extractor.py _detect_variant() lignes 134-147
# Ces mappings (couleur LBC → variante/couleur/jantes) sont du code inline,
# pas une constante importable. Ils sont ici en dur avec les regexes correspondants.
# NOTE: "noir/black" → Hanle Black avec wheel_type null car indetermine (standard ou tubeless)
COLOR_MAP_FALLBACK = [
    (r"blanc|white",                "Summit", "Kamet White",          "tubeless"),
    (r"noir|black",                 "Summit", "Hanle Black",          None),       # standard ou tubeless selon contexte
    (r"marron|brown",               "Base",   "Kaza Brown",           "standard"),
    (r"bleu|blue",                  "Pass",   "Slate Poppy Blue",     "standard"),
    (r"gris|grey|gray",             "Pass",   None,                   "standard"),  # Salt ou Poppy, indistinguable
    (r"rouge|red",                  "Pass",   "Slate Himalayan Salt", "standard"),
]

# ─── Patterns de detection d'annonce neuve ────────────────────────────────────
# Ces patterns sont specifiques a la Himalayan 450 et detectent des indices
# d'une annonce neuve/concessionnaire dans le texte (titre + body).
#
# Categorie "model_spec" : specs techniques propres a la Himalayan 450
#   → si le texte decrit le moteur, la cylindree, les perfs, c'est probablement
#     une fiche produit / annonce de concessionnaire (pas un vendeur particulier)
# Categorie "dealer" : formules commerciales de concessionnaire
#   → poids double (weight=2.0) car tres fiables
# Categorie "generic" : indicateurs generiques de vehicule neuf
#   → valables tous modeles : "0 km", "jamais circule", "livraison incluse"

NEW_LISTING_PATTERNS = [
    # model_spec — specs moteur Himalayan 450 (moteur Sherpa 452cc)
    (r"moteur\s*sherpa",                                    "model_spec", 1.0),
    (r"sherpa\s*45[02]|sherpa\s*engine",                    "model_spec", 1.0),
    (r"monocylindre\s*45[02]|mono\s*45[02]",               "model_spec", 1.0),
    (r"452\s*cm[3³]|452\s*cc",                              "model_spec", 1.0),
    (r"40\s*(?:cv|ch|hp|kw)[^\d]",                         "model_spec", 1.0),
    (r"8[,.]?000\s*tr",                                     "model_spec", 1.0),
    (r"tripper\s*(navigation|gps)?",                        "model_spec", 1.0),
    (r"google\s*maps\s*(tableau\s*de\s*bord|intégré)",      "model_spec", 1.0),
    (r"abs\s*(double|double\s*canal|bi[\s-]*canal)",        "model_spec", 1.0),
    (r"assist[eé]\s*et\s*(anti[\s-]*patinag|bascul)",       "model_spec", 1.0),
    (r"suspension\s*sherpa|fourche\s*sherpa",               "model_spec", 1.0),
    (r"royal\s*enfield\s*genuine\s*accessories",            "model_spec", 1.0),

    # generic — indicateurs generiques de vehicule neuf ou quasi-neuf
    (r"\b0\s*km\b|\bzero\s*km\b",                          "generic", 1.0),
    (r"jamais\s*(circul[eé]|roul[eé]|immatricul[eé])",     "generic", 1.0),
    (r"neuf[^t]|flambant\s*neuf|tout\s*neuf",              "generic", 1.0),
    (r"v[eé]hicule\s*de\s*d[eé]monstration|demo",         "generic", 0.8),
    (r"livraison\s*(incluse|offerte|possible)",             "generic", 0.8),
    (r"garantie\s*(constructeur|fabricant|neuf)",           "generic", 0.8),
    (r"facture\s*(d['\s]?achat|origine|constructeur)",      "generic", 0.8),
]

STRONG_DEALER_PATTERNS = [
    # dealer — formules très fiables de concessionnaire (weight=2.0)
    (r"concessionnaire\s*agréé|revendeur\s*officiel",       "dealer", 2.0),
    (r"réseau\s*royal\s*enfield|distributeur\s*officiel",   "dealer", 2.0),
    (r"parc\s*(moto|véhicule)[^\n]*disponible[s]?",        "dealer", 2.0),
    (r"stock\s*(disponible|immédiat)|en\s*stock",           "dealer", 2.0),
    (r"essai\s*(gratuit|sur\s*rendez[\s-]*vous)|reprise",   "dealer", 2.0),
]


def generate_accessories() -> list[dict]:
    """Exporte ACCESSORY_PATTERNS en JSON."""
    items = []
    for i, (regex, name, category, price, group) in enumerate(ACCESSORY_PATTERNS):
        items.append({
            "regex_pattern": regex,
            "name": name,
            "category": category,
            "new_price": price,
            "depreciation_rate": 0.65,
            "dedup_group": group if group else None,
            "sort_order": i,
        })
    return items


def generate_data() -> dict:
    """Exporte tout le reste (config, variantes, consommables, patterns) en un seul JSON."""

    # Config analyseur
    config = {
        "warranty_years": WARRANTY_DURATION_YEARS,
        "warranty_value_per_year": WARRANTY_VALUE_PER_YEAR,
        "mechanical_wear_per_km": MECHANICAL_WEAR_PER_KM,
        "condition_risk_per_km": CONDITION_RISK_PER_KM,
        "short_term_km_threshold": SHORT_TERM_KM_THRESHOLD,
    }

    # Variantes (depuis NEW_PRICES)
    variants = []
    for _key, val in NEW_PRICES.items():
        variants.append({
            "variant_name": val["variant"],
            "color": val["color"],
            "wheel_type": val.get("wheel_type", "standard"),
            "new_price": val["price"],
            "color_hex": VARIANT_COLOR_HEX.get(val["variant"]),
        })

    # Consommables — CONSUMABLES est une liste de tuples (nom, cout_garage, duree_vie_km)
    consumables = []
    for nom, cout_garage, duree_vie_km in CONSUMABLES:
        consumables.append({
            "name": nom,
            "cost_eur": cout_garage,
            "life_km": duree_vie_km,
        })

    # Variant patterns (depuis VARIANT_PATTERNS) — priorite haute (100 → 95)
    variant_patterns = []
    for i, (regex, variant, color, wheel_type) in enumerate(VARIANT_PATTERNS):
        variant_patterns.append({
            "regex_pattern": regex,
            "matched_variant": variant,
            "matched_color": color,
            "matched_wheel_type": wheel_type,
            "priority": 100 - i,  # Premier pattern = priorite la plus haute
        })

    # color_map fallback comme variant patterns de basse priorite (10 → 5)
    for i, (regex, variant, color, wheel_type) in enumerate(COLOR_MAP_FALLBACK):
        variant_patterns.append({
            "regex_pattern": regex,
            "matched_variant": variant,
            "matched_color": color,
            "matched_wheel_type": wheel_type,
            "priority": 10 - i,  # Priorite basse — fallback couleur LBC
        })

    # New listing patterns (model_spec + generic + dealer)
    new_listing_patterns = []
    for regex, category, weight in NEW_LISTING_PATTERNS:
        new_listing_patterns.append({
            "regex_pattern": regex,
            "category": category,
            "weight": weight,
        })
    for regex, category, weight in STRONG_DEALER_PATTERNS:
        new_listing_patterns.append({
            "regex_pattern": regex,
            "category": category,
            "weight": weight,
        })

    # Exclusion patterns
    exclusion_patterns = [{"regex_pattern": p} for p in EXCLUSION_PATTERNS]

    # Search config (un seul mot-cle pour la Himalayan 450)
    search_configs = [{
        "keyword": SEARCH_TEXT,
        "min_cc": SEARCH_CC_MIN,
        "max_cc": SEARCH_CC_MAX,
    }]

    return {
        "config": config,
        "variants": variants,
        "consumables": consumables,
        "variant_patterns": variant_patterns,
        "new_listing_patterns": new_listing_patterns,
        "exclusion_patterns": exclusion_patterns,
        "search_configs": search_configs,
    }


if __name__ == "__main__":
    ALEMBIC_DIR.mkdir(parents=True, exist_ok=True)

    accessories = generate_accessories()
    acc_path = ALEMBIC_DIR / "seed_himalayan_accessories.json"
    with open(acc_path, "w", encoding="utf-8") as f:
        json.dump(accessories, f, indent=2, ensure_ascii=False)
    print(f"Ecrit {len(accessories)} accessory patterns → {acc_path}")

    data = generate_data()
    data_path = ALEMBIC_DIR / "seed_himalayan_data.json"
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(
        f"Ecrit seed data → {data_path}\n"
        f"  config              : {len(data['config'])} cles\n"
        f"  variants            : {len(data['variants'])}\n"
        f"  consumables         : {len(data['consumables'])}\n"
        f"  variant_patterns    : {len(data['variant_patterns'])}\n"
        f"  new_listing_patterns: {len(data['new_listing_patterns'])}\n"
        f"  exclusion_patterns  : {len(data['exclusion_patterns'])}\n"
        f"  search_configs      : {len(data['search_configs'])}"
    )
