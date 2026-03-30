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

Les patterns d'accessoires sont compiles depuis le catalogue DB (AccessoryCatalogGroup/
AccessoryCatalogVariant) par catalog.py. Les patterns d'exclusion sont charges depuis
la base de donnees (table bike_exclusion_patterns) en fonction du modele de moto.
"""

import re

DEPRECIATION_RATE = 0.65

# ─── ZONES D'EXCLUSION ────────────────────────────────────────────────────────
# Fallback patterns qui identifient des sections "services concessionnaire" ou contextes
# ou les mots-cles d'accessoires ne designent pas un equipement de la moto.
# On supprime ces zones du texte avant la detection.
EXCLUSION_PATTERNS: list[str] = [
    # Listes de services garage/concessionnaire entre parentheses
    r"\((?:[^)]*(?:pneumatique|vidange|service|atelier|reparation|entretien)[^)]*)\)",
    # Phrases "service rapide ..." jusqu'a fin de ligne
    r"service[s]?\s*(rapide|moto|atelier)[^\n]*",
    # Phrases "atelier de ..." jusqu'a fin de ligne
    r"atelier\s*(de\s*)?(reparation|entretien|mecanique)[^\n]*",
]


def _clean_text_for_detection(text: str, exclusions: list | None = None) -> str:
    """Supprime les zones de texte qui decrivent des services garage et normalise.

    Args:
        text: Texte brut de l'annonce.
        exclusions: Liste d'objets BikeExclusionPattern avec .regex_pattern,
            ou None pour utiliser les patterns par defaut.
    """
    from .catalog import normalize_text
    cleaned = normalize_text(text)
    if exclusions:
        for exc in exclusions:
            cleaned = re.sub(exc.regex_pattern, " ", cleaned)
    else:
        for pattern in EXCLUSION_PATTERNS:
            cleaned = re.sub(pattern, " ", cleaned)
    return cleaned


def _extend_past_parenthetical(text: str, end: int) -> int:
    """Etend un span au-dela du contenu parenthetique qui suit immediatement le match."""
    lookahead = text[end:end + 4]
    paren_pos = lookahead.find('(')
    if paren_pos < 0:
        return end
    depth = 1
    pos = end + paren_pos + 1
    while pos < len(text) and depth > 0:
        if text[pos] == '(':
            depth += 1
        elif text[pos] == ')':
            depth -= 1
        pos += 1
    return pos


def detect_accessories(
    text: str,
    patterns: list[tuple[str, str, str, int, str]] | None = None,
    *,
    exclusions: list | None = None,
) -> list[dict]:
    """
    Detecte les accessoires mentionnes dans un texte d'annonce.

    Args:
        text: Le body ou la description de l'annonce.
        patterns: Liste de (regex, nom, categorie, prix_neuf, groupe_dedup)
            produite par catalog.build_patterns_from_catalog().
        exclusions: Liste optionnelle de BikeExclusionPattern pre-charges.
            Si None, utilise les EXCLUSION_PATTERNS par defaut.

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
    if not text or not patterns:
        return []

    text_lower = _clean_text_for_detection(text, exclusions)
    matched_groups: set[str] = set()

    # Phase 1: collect first match per group (group dedup)
    candidates: list[tuple[int, int, dict]] = []
    for pattern, name, category, price_new, group in patterns:
        if group in matched_groups:
            continue
        m = re.search(pattern, text_lower)
        if not m:
            continue
        matched_groups.add(group)
        candidates.append((m.start(), m.end(), {
            "name": name,
            "category": category,
            "source": "body",
            "estimated_new_price": price_new,
            "estimated_used_price": int(price_new * DEPRECIATION_RATE),
        }))

    # Phase 1.5: extend spans to cover trailing parenthetical context.
    # Prevents sub-features in parentheses from counting as separate accessories
    # (e.g., "CarPlay (avec cameras, module GPS)" should not also detect GPS).
    candidates = [
        (_start, _extend_past_parenthetical(text_lower, _end), _acc)
        for _start, _end, _acc in candidates
    ]

    # Phase 2: resolve overlapping spans — longest match wins.
    # Ties broken by earliest start (captures more leading context like "rehausse").
    candidates.sort(key=lambda c: (-(c[1] - c[0]), c[0]))
    kept_spans: list[tuple[int, int]] = []
    found: list[dict] = []
    for start, end, accessory in candidates:
        if any(s <= start < e or s < end <= e for s, e in kept_spans):
            continue
        kept_spans.append((start, end))
        found.append(accessory)

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
