"""
Extraction des donnees d'une annonce LeBonCoin pour la Royal Enfield Himalayan 450.

Utilise la librairie lbc (https://github.com/etienne-hd/lbc) pour interroger l'API LeBonCoin.
"""

import re
import lbc
from typing import Optional

from .accessories import detect_accessories

# ─── Prix neuf de reference (France, mars 2026) ────────────────────────────────

NEW_PRICES: dict[str, dict] = {
    "base_kaza_brown":          {"variant": "Base",       "color": "Kaza Brown",              "wheel_type": "standard", "price": 5890},
    "pass_salt":                {"variant": "Pass",       "color": "Slate Himalayan Salt",    "wheel_type": "standard", "price": 5990},
    "pass_poppy":               {"variant": "Pass",       "color": "Slate Poppy Blue",        "wheel_type": "standard", "price": 5990},
    "summit_hanle_standard":    {"variant": "Summit",     "color": "Hanle Black",             "wheel_type": "standard", "price": 6190},
    "summit_kamet_tubeless":    {"variant": "Summit",     "color": "Kamet White",             "wheel_type": "tubeless", "price": 6440},
    "summit_hanle_tubeless":    {"variant": "Summit",     "color": "Hanle Black",             "wheel_type": "tubeless", "price": 6490},
    "mana_black":               {"variant": "Mana Black", "color": "Mana Black",              "wheel_type": "tubeless", "price": 6590},
}

# Patterns pour detecter la variante/couleur dans le titre ou le body
VARIANT_PATTERNS = [
    (r"mana\s*black",                           "Mana Black", "Mana Black",           "tubeless"),
    (r"kamet\s*white|kamet|blanc\s*kamet",      "Summit",     "Kamet White",          "tubeless"),
    (r"hanle\s*black|hanle|noir\s*hanle",       "Summit",     "Hanle Black",          None),       # standard ou tubeless
    (r"himalayan\s*salt|salt|gris.*rouge",       "Pass",       "Slate Himalayan Salt", "standard"),
    (r"poppy\s*blue|poppy|gris.*bleu",           "Pass",       "Slate Poppy Blue",     "standard"),
    (r"kaza\s*brown|kaza|marron",               "Base",       "Kaza Brown",           "standard"),
]


def extract_ad_id_from_url(url: str) -> Optional[int]:
    """
    Extrait l'ID d'annonce depuis une URL LeBonCoin.

    Supporte :
      - https://www.leboncoin.fr/motos/2849506789.htm
      - https://www.leboncoin.fr/ad/motos/2849506789
      - https://www.leboncoin.fr/2849506789.htm
    """
    match = re.search(r"/(\d{8,12})(?:\.htm)?", url)
    if match:
        return int(match.group(1))
    return None


def _get_attr(ad, key: str) -> Optional[str]:
    """Recupere la valeur d'un attribut LBC par sa cle."""
    if not hasattr(ad, "attributes") or not ad.attributes:
        return None
    for attr in ad.attributes:
        if hasattr(attr, "key") and attr.key == key:
            return getattr(attr, "value", None) or getattr(attr, "value_label", None)
    return None


def _get_attr_label(ad, key: str) -> Optional[str]:
    """Recupere le label d'un attribut LBC par sa cle."""
    if not hasattr(ad, "attributes") or not ad.attributes:
        return None
    for attr in ad.attributes:
        if hasattr(attr, "key") and attr.key == key:
            return getattr(attr, "value_label", None)
    return None


def _raw_attributes(ad) -> list[dict]:
    """Convertit les attributs LBC en liste de dicts serializables."""
    if not hasattr(ad, "attributes") or not ad.attributes:
        return []
    result = []
    for attr in ad.attributes:
        result.append({
            "key": getattr(attr, "key", None),
            "value": getattr(attr, "value", None),
            "value_label": getattr(attr, "value_label", None),
        })
    return result


def _detect_variant(subject: str, body: str, version_attr: str = "", color_attr: str = "") -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Detecte la variante, la couleur et le type de jantes.

    Cherche dans (par ordre de priorite) :
      1. L'attribut LBC u_moto_version (ex: "Himalayan 450 Kamet White (Tubeless)")
      2. Le titre (subject)
      3. Le body

    Returns:
        (variant, color, wheel_type) ou (None, None, None) si non detecte.
    """
    # On cherche d'abord dans version_attr (le plus fiable), puis subject, puis body
    text = f"{version_attr or ''} {subject or ''} {body or ''}".lower()

    for pattern, variant, color, wheel_type in VARIANT_PATTERNS:
        if re.search(pattern, text):
            # Pour Hanle Black, on essaie de detecter tubeless
            if variant == "Summit" and color == "Hanle Black" and wheel_type is None:
                if re.search(r"tubeless|tube[\s-]*less", text):
                    wheel_type = "tubeless"
                else:
                    wheel_type = "standard"
            return variant, color, wheel_type

    # Fallback : essayer de deviner depuis la couleur LBC
    if color_attr:
        color_lower = color_attr.lower()
        color_map = {
            "blanc": ("Summit", "Kamet White", "tubeless"),
            "white": ("Summit", "Kamet White", "tubeless"),
            "noir":  ("Summit", "Hanle Black", None),
            "black": ("Summit", "Hanle Black", None),
            "marron": ("Base", "Kaza Brown", "standard"),
            "brown": ("Base", "Kaza Brown", "standard"),
            "gris":  ("Pass", None, "standard"),  # Salt ou Poppy, impossible a distinguer
            "grey":  ("Pass", None, "standard"),
            "bleu":  ("Pass", "Slate Poppy Blue", "standard"),
            "blue":  ("Pass", "Slate Poppy Blue", "standard"),
            "rouge": ("Pass", "Slate Himalayan Salt", "standard"),
            "red":   ("Pass", "Slate Himalayan Salt", "standard"),
        }
        for keyword, (variant, color, wheel_type) in color_map.items():
            if keyword in color_lower:
                # Detecter tubeless dans tout le texte
                if variant == "Summit" and color == "Hanle Black" and wheel_type is None:
                    if re.search(r"tubeless|tube[\s-]*less", text):
                        wheel_type = "tubeless"
                    else:
                        wheel_type = "standard"
                return variant, color, wheel_type

    return None, None, None


def _estimate_new_price(variant: Optional[str], color: Optional[str], wheel_type: Optional[str]) -> Optional[float]:
    """Estime le prix neuf de reference en fonction de la variante detectee."""
    if not variant:
        return None

    for _key, info in NEW_PRICES.items():
        if info["variant"] == variant and info["color"] == color:
            if info["wheel_type"] == wheel_type:
                return info["price"]

    # Fallback : match sur variant seul
    prices_for_variant = [v["price"] for v in NEW_PRICES.values() if v["variant"] == variant]
    if prices_for_variant:
        return min(prices_for_variant)

    return None


def _parse_location(ad) -> dict:
    """Extrait les informations de localisation d'un objet Ad LBC."""
    loc = {}
    if hasattr(ad, "location") and ad.location:
        location = ad.location
        loc["city"] = getattr(location, "city", None)
        loc["zipcode"] = getattr(location, "zipcode", None)
        loc["department"] = getattr(location, "department_name", None) or getattr(location, "department", None)
        loc["region"] = getattr(location, "region_name", None) or getattr(location, "region", None)
        loc["lat"] = getattr(location, "lat", None)
        loc["lng"] = getattr(location, "lng", None)
    return loc


def _parse_images(ad) -> list[str]:
    """Extrait les URLs des images."""
    if hasattr(ad, "images") and ad.images:
        if isinstance(ad.images, dict):
            urls = ad.images.get("urls", []) or ad.images.get("small_url", [])
            if isinstance(urls, str):
                return [urls]
            return list(urls) if urls else []
        if isinstance(ad.images, list):
            return [str(img) for img in ad.images]
    return []


def _safe_int(val) -> Optional[int]:
    """Convertit en int si possible."""
    if val is None:
        return None
    try:
        return int(str(val).replace(" ", "").replace("km", "").replace("cc", ""))
    except (ValueError, TypeError):
        return None


def fetch_ad(url: str, client: Optional[lbc.Client] = None, price_overrides: Optional[dict] = None) -> dict:
    """
    Recupere une annonce LeBonCoin et la transforme en dict pret pour la BDD.

    Args:
        url: URL LeBonCoin de l'annonce.
        client: Client lbc optionnel (en cree un par defaut).
        price_overrides: Surcharges de prix accessoires {group: prix_neuf}.

    Returns:
        Dict avec toutes les donnees extraites, pret pour upsert_ad().

    Raises:
        ValueError: si l'URL est invalide ou l'annonce introuvable.
    """
    ad_id = extract_ad_id_from_url(url)
    if not ad_id:
        raise ValueError(f"Impossible d'extraire l'ID depuis l'URL : {url}")

    if client is None:
        client = lbc.Client()

    ad = client.get_ad(ad_id)

    subject = getattr(ad, "subject", None) or ""
    body = getattr(ad, "body", None) or ""

    # Attributs LBC enrichis
    version_attr = _get_attr(ad, "u_moto_version") or ""
    color_attr = _get_attr_label(ad, "vehicule_color") or _get_attr(ad, "vehicule_color") or ""
    cubic_attr = _get_attr(ad, "cubic_capacity") or ""

    # Detection de la variante Himalayan (priorite: version > titre > body > couleur)
    variant, color, wheel_type = _detect_variant(subject, body, version_attr, color_attr)

    # Prix neuf estime
    estimated_new_price = _estimate_new_price(variant, color, wheel_type)

    # Detection des accessoires depuis le body
    accessories = detect_accessories(body, price_overrides=price_overrides)

    # Localisation
    location = _parse_location(ad)

    # Cylindree : depuis cubic_capacity ou engine_size
    engine_cc = _safe_int(cubic_attr) or _safe_int(_get_attr(ad, "engine_size"))

    # Construction du dict final
    ad_data = {
        "id": ad.id,
        "url": getattr(ad, "url", url),
        "subject": subject,
        "body": body,
        "price": getattr(ad, "price", None),
        "brand": getattr(ad, "brand", None) or _get_attr(ad, "brand"),
        "model": _get_attr(ad, "model") or _get_attr_label(ad, "model"),
        "year": _safe_int(_get_attr(ad, "regdate")),
        "mileage_km": _safe_int(_get_attr(ad, "mileage")),
        "engine_size_cc": engine_cc,
        "fuel_type": _get_attr_label(ad, "fuel") or _get_attr(ad, "fuel"),
        "color": color or color_attr or _get_attr_label(ad, "color") or _get_attr(ad, "color"),
        "category_name": getattr(ad, "category_name", None),
        "ad_type": getattr(ad, "ad_type", None),
        "status": getattr(ad, "status", None),
        "has_phone": 1 if getattr(ad, "has_phone", False) else 0,
        # Localisation
        **location,
        # Vendeur
        "seller_type": _get_attr(ad, "owner_type"),
        # Dates
        "first_publication_date": getattr(ad, "first_publication_date", None),
        "expiration_date": getattr(ad, "expiration_date", None),
        # Analyse Himalayan
        "variant": variant,
        "wheel_type": wheel_type,
        "estimated_new_price": estimated_new_price,
        # Listes
        "attributes": _raw_attributes(ad),
        "images": _parse_images(ad),
        "accessories": accessories,
    }

    return ad_data
