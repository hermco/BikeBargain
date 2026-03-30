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

Les patterns d'accessoires, les patterns d'exclusion et le taux de depreciation
sont charges depuis la base de donnees (tables bike_accessory_patterns et
bike_exclusion_patterns) en fonction du modele de moto.
"""

import re


def _clean_text_for_detection(text: str, exclusions: list | None = None) -> str:
    """Supprime les zones de texte qui decrivent des services garage.

    Args:
        text: Texte brut de l'annonce.
        exclusions: Liste d'objets BikeExclusionPattern avec .regex_pattern,
            ou None pour ne rien exclure.
    """
    cleaned = text.lower()
    if exclusions:
        for exc in exclusions:
            cleaned = re.sub(exc.regex_pattern, " ", cleaned)
    return cleaned


def detect_accessories(
    text: str,
    bike_model_id: int,
    session,
    *,
    patterns: list | None = None,
    exclusions: list | None = None,
    price_overrides: dict[str, int] | None = None,
) -> list[dict]:
    """
    Detecte les accessoires mentionnes dans un texte d'annonce.

    La deduplication se fait par GROUPE : si un pattern specifique
    (ex: "Crash bars SW-Motech") matche, le pattern generique ("Crash bars")
    du meme groupe est ignore.

    Les zones de texte decrivant des services garage (ex: "Service rapide :
    pneumatique, kit chaine, vidange") sont exclues avant la detection.

    Args:
        text: Le body ou la description de l'annonce.
        bike_model_id: ID du modele de moto (pour charger les patterns).
        session: SQLModel session.
        patterns: Liste optionnelle de BikeAccessoryPattern pre-charges.
            Si None, charge depuis la DB.
        exclusions: Liste optionnelle de BikeExclusionPattern pre-charges.
            Si None, charge depuis la DB.
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

    # Charger les patterns depuis la DB si non fournis
    if patterns is None:
        from .database import get_accessory_patterns
        patterns = get_accessory_patterns(session, bike_model_id)
    if exclusions is None:
        from .database import get_exclusion_patterns
        exclusions = get_exclusion_patterns(session, bike_model_id)

    overrides = price_overrides or {}
    text_lower = _clean_text_for_detection(text, exclusions)
    matched_groups: set[str] = set()
    found: list[dict] = []

    for pattern in patterns:
        group = pattern.dedup_group
        if group and group in matched_groups:
            continue  # Ce groupe a deja ete matche par un pattern plus specifique
        if re.search(pattern.regex_pattern, text_lower):
            if group:
                matched_groups.add(group)
            effective_price = overrides.get(group, pattern.new_price) if group else pattern.new_price
            depreciation_rate = pattern.depreciation_rate
            found.append({
                "name": pattern.name,
                "category": pattern.category,
                "source": "body",
                "estimated_new_price": effective_price,
                "estimated_used_price": int(effective_price * depreciation_rate),
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
