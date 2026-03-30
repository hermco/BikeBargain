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


# ─── ZONES D'EXCLUSION ────────────────────────────────────────────────────────
# Patterns qui identifient des sections "services concessionnaire" ou contextes
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


def _clean_text_for_detection(text: str) -> str:
    """Supprime les zones de texte qui decrivent des services garage et normalise."""
    from .catalog import normalize_text
    cleaned = normalize_text(text)
    for pattern in EXCLUSION_PATTERNS:
        cleaned = re.sub(pattern, " ", cleaned)
    return cleaned


def detect_accessories(
    text: str,
    patterns: list[tuple[str, str, str, int, str]] | None = None,
) -> list[dict]:
    """
    Detecte les accessoires mentionnes dans un texte d'annonce.

    Args:
        text: Le body ou la description de l'annonce.
        patterns: Liste de (regex, nom, categorie, prix_neuf, groupe_dedup).
    """
    if not text or not patterns:
        return []

    text_lower = _clean_text_for_detection(text)
    matched_groups: set[str] = set()
    found: list[dict] = []

    for pattern, name, category, price_new, group in patterns:
        if group in matched_groups:
            continue
        if re.search(pattern, text_lower):
            matched_groups.add(group)
            found.append({
                "name": name,
                "category": category,
                "source": "body",
                "estimated_new_price": price_new,
                "estimated_used_price": int(price_new * DEPRECIATION_RATE),
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
