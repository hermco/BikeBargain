"""
Extraction des donnees d'une annonce LeBonCoin pour BikeBargain.

Utilise la librairie lbc (https://github.com/etienne-hd/lbc) pour interroger l'API LeBonCoin.
Les patterns de detection (variante, couleur, type de jantes) et les prix de reference
sont charges depuis la base de donnees en fonction du modele de moto.
"""

import re
from urllib.parse import urlparse

import lbc
from typing import Optional

from .accessories import detect_accessories
from .config import get_settings


def get_lbc_client() -> lbc.Client:
    """Cree un client LBC avec proxy residentiel si configure."""
    proxy_url = get_settings().lbc_proxy_url
    if not proxy_url:
        return lbc.Client()
    parsed = urlparse(proxy_url)
    if not parsed.hostname or not parsed.port:
        raise ValueError("LBC_PROXY_URL invalide (hostname/port manquant)")
    proxy = lbc.Proxy(
        host=parsed.hostname,
        port=parsed.port,
        username=parsed.username,
        password=parsed.password,
        scheme=parsed.scheme or "http",
    )
    return lbc.Client(proxy=proxy)


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


def _detect_variant(subject: str, body: str, attributes, bike_model_id: int, session) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Detecte la variante, la couleur et le type de jantes.

    Charge les patterns de detection depuis la DB (table bike_variant_patterns)
    et les applique dans l'ordre de priorite decroissante.

    Le texte combine : version LBC + titre + body.
    Les fallbacks couleur LBC sont integres comme patterns de basse priorite en DB.

    Args:
        subject: Titre de l'annonce.
        body: Corps de l'annonce.
        attributes: Attributs bruts LBC (objet ad).
        bike_model_id: ID du modele de moto.
        session: SQLModel session.

    Returns:
        (variant, color, wheel_type) ou (None, None, None) si non detecte.
    """
    from .database import get_variant_patterns

    patterns = get_variant_patterns(session, bike_model_id)

    # Recuperer les attributs LBC pertinents
    version_attr = ""
    color_attr = ""
    if hasattr(attributes, "attributes") and attributes.attributes:
        # L'objet ad complet est passe
        version_attr = _get_attr(attributes, "u_moto_version") or ""
        color_attr = _get_attr_label(attributes, "vehicule_color") or _get_attr(attributes, "vehicule_color") or ""
    elif isinstance(attributes, str):
        # Ancien format : version_attr en string directement
        version_attr = attributes

    combined = f"{version_attr} {subject or ''} {body or ''} {color_attr}".lower()

    for p in patterns:  # Deja trie par priorite desc
        if re.search(p.regex_pattern, combined, re.IGNORECASE):
            wheel_type = p.matched_wheel_type
            # Pour les patterns sans wheel_type explicite, detecter tubeless dans le texte
            if wheel_type is None:
                if re.search(r"tubeless|tube[\s-]*less", combined):
                    wheel_type = "tubeless"
                else:
                    wheel_type = "standard"
            return (p.matched_variant, p.matched_color, wheel_type)

    return (None, None, None)


def _estimate_new_price(bike_model_id: int, variant: Optional[str], color: Optional[str],
                        wheel_type: Optional[str], session) -> Optional[float]:
    """Estime le prix neuf de reference en fonction de la variante detectee.

    Charge les variantes depuis la DB (table bike_variants).
    """
    if not variant:
        return None

    from .database import get_bike_variants
    variants = get_bike_variants(session, bike_model_id)

    wt = wheel_type or "default"

    # Match exact : variant + color + wheel_type
    for v in variants:
        if v.variant_name == variant and v.color == color and v.wheel_type == wt:
            return v.new_price

    # Fallback : match sur variant seul (prix min)
    prices_for_variant = [v.new_price for v in variants if v.variant_name == variant]
    if prices_for_variant:
        return min(prices_for_variant)

    return None


# ─── Detection annonce neuve concessionnaire ────────────────────────────────

# Patterns indiquant une annonce neuve par concessionnaire
# Utilises avec seller_type == "pro" comme condition necessaire
NEW_LISTING_PATTERNS = [
    r"frais\s+de\s+mise\s+[aà]\s+la\s+route",
    r"frais\s+d['\u2019]immatriculation",
    r"hors\s+frais",
    r"remise\s+promo",
    r"disponible\s+[aà]\s+l['\u2019]essai",
    r"garantie\s+\d+\s+ans?\s+pi[eè]ces",
    r"garantie\s+constructeur",
    r"refroidissement\s+liquide\s+40\s*cv",
    r"moteur\s+sherpa\s+450",
    r"monocylindre\s+452",
    r"40\s*cv.*8000\s*tr",
    r"ttc\b",
]

# Patterns forts : suffisent seuls pour flagger sans seller_type == "pro"
# (seuls les concessionnaires font des promos avec montant ou se declarent)
STRONG_DEALER_PATTERNS = [
    r"concessionnaire",
    r"\d+\s*[€e]\s*de\s*remise",          # "450€ de remise"
    r"remise\s*(?:de\s*)?\d+\s*[€e]",     # "remise de 450€", "remise 450€"
    r"promo.*\d+\s*[€e]",                  # "promo ... 450€"
    r"\d+\s*[€e].*promo",                  # "450€ ... promo"
]


def _has_strong_dealer_signal(text: str) -> bool:
    """Verifie si le texte contient un signal fort de concessionnaire."""
    for pattern in STRONG_DEALER_PATTERNS:
        if re.search(pattern, text):
            return True
    return False


def detect_new_listing(
    seller_type: str | None = None,
    price: float | None = None,
    mileage_km: int | None = None,
    subject: str | None = None,
    body: str | None = None,
    variant: str | None = None,
    color: str | None = None,
    wheel_type: str | None = None,
) -> bool:
    """
    Detecte si une annonce est une moto neuve vendue par concessionnaire.

    Deux chemins de detection :
    1. seller_type == "pro" + au moins un signal (prix neuf, km ~0, patterns texte)
    2. Signal fort autonome (promo avec montant, mot "concessionnaire") — bypass seller_type
    """
    text = f"{subject or ''} {body or ''}".lower()
    is_pro = seller_type and seller_type.lower() in ("pro", "professional")

    # Chemin 1 : signal fort dans le texte — flag directement
    if _has_strong_dealer_signal(text):
        return True

    # Chemin 2 : seller_type "pro" + signal confirmant
    if not is_pro:
        return False

    # Signal : prix proche du neuf
    if price is not None:
        estimated_new = _estimate_new_price(variant, color, wheel_type)
        if estimated_new is not None and abs(price - estimated_new) / estimated_new <= 0.05:
            return True
        all_prices = [v["price"] for v in NEW_PRICES.values()]
        if any(abs(price - p) / p <= 0.05 for p in all_prices):
            return True

    # Signal : km nul ou quasi-nul
    if mileage_km is not None and mileage_km < 100:
        return True

    # Signal : patterns texte standard
    for pattern in NEW_LISTING_PATTERNS:
        if re.search(pattern, text):
            return True

    return False


def detect_new_listing_light(
    subject: str | None = None,
    price: float | None = None,
    seller_type: str | None = None,
) -> bool:
    """
    Version legere pour les resultats de recherche (pas de body/km).

    Signal fort dans le subject = flag directement.
    Sinon : seller_type "pro" + signal (prix neuf ou patterns subject).
    """
    text = (subject or "").lower()

    # Signal fort : flag directement
    if _has_strong_dealer_signal(text):
        return True

    # Sinon, besoin de seller_type "pro"
    if not seller_type or seller_type.lower() not in ("pro", "professional"):
        return False

    if price is not None:
        all_prices = [v["price"] for v in NEW_PRICES.values()]
        if any(abs(price - p) / p <= 0.05 for p in all_prices):
            return True

    for pattern in NEW_LISTING_PATTERNS:
        if re.search(pattern, text):
            return True

    return False


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


def detect_new_listing(*, seller_type, price, mileage_km, subject, body,
                       variant, color, wheel_type, bike_model_id, session) -> bool:
    """
    Detection complete d'une annonce neuve de concessionnaire.

    Combine plusieurs signaux :
      - Type de vendeur (pro)
      - Kilometrage bas (< 100 km)
      - Prix proche du neuf
      - Patterns textuels (model_spec, generic, dealer)

    Args:
        seller_type: Type vendeur LBC (pro/private).
        price: Prix affiche.
        mileage_km: Kilometrage.
        subject: Titre de l'annonce.
        body: Corps de l'annonce.
        variant: Variante detectee.
        color: Couleur detectee.
        wheel_type: Type de jantes.
        bike_model_id: ID du modele.
        session: SQLModel session.

    Returns:
        True si l'annonce est probablement une moto neuve de concessionnaire.
    """
    from .database import get_new_listing_patterns, get_bike_variants

    score = 0.0

    # Signal vendeur pro
    if seller_type and seller_type.lower() == "pro":
        score += 2.0

    # Signal kilometrage quasi-neuf
    if mileage_km is not None and mileage_km <= 100:
        score += 2.0
    elif mileage_km is not None and mileage_km <= 500:
        score += 1.0

    # Signal prix proche du neuf (dans les 5% du prix catalogue)
    if price and variant:
        variants = get_bike_variants(session, bike_model_id)
        catalog_prices = [v.new_price for v in variants]
        if catalog_prices:
            min_catalog = min(catalog_prices)
            max_catalog = max(catalog_prices)
            if min_catalog * 0.95 <= price <= max_catalog * 1.05:
                score += 1.5

    # Patterns textuels
    combined_text = f"{subject or ''} {body or ''}".lower()
    nl_patterns = get_new_listing_patterns(session, bike_model_id)
    for p in nl_patterns:
        if re.search(p.regex_pattern, combined_text, re.IGNORECASE):
            score += p.weight

    # Seuil de decision
    return score >= 3.0


def detect_new_listing_light(subject, price, seller_type, catalog_prices: list[int] | None = None) -> bool:
    """
    Detection legere d'une annonce neuve (pour la page de crawl, sans body).

    Utilise uniquement le titre, le prix et le type de vendeur.

    Args:
        subject: Titre de l'annonce.
        price: Prix affiche.
        seller_type: Type vendeur LBC.
        catalog_prices: Liste des prix catalogue. Si None, pas de check prix.

    Returns:
        True si l'annonce est probablement neuve.
    """
    score = 0.0

    # Vendeur pro
    if seller_type and str(seller_type).lower() == "pro":
        score += 2.0

    # Prix dans la fourchette neuf
    if price and catalog_prices:
        min_catalog = min(catalog_prices)
        max_catalog = max(catalog_prices)
        if min_catalog * 0.95 <= price <= max_catalog * 1.05:
            score += 1.5

    # Patterns titre generiques
    title_lower = (subject or "").lower()
    if re.search(r"\b0\s*km\b|\bzero\s*km\b", title_lower):
        score += 1.5
    if re.search(r"neuf[^t]|flambant\s*neuf", title_lower):
        score += 1.0

    return score >= 3.0


def fetch_ad(url: str, bike_model_id: int, session, *,
             client: Optional[lbc.Client] = None,
             price_overrides: Optional[dict] = None) -> dict:
    """
    Recupere une annonce LeBonCoin et la transforme en dict pret pour la BDD.

    Args:
        url: URL LeBonCoin de l'annonce.
        bike_model_id: ID du modele de moto.
        session: SQLModel session.
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
        client = get_lbc_client()

    ad = client.get_ad(ad_id)

    subject = getattr(ad, "subject", None) or ""
    body = getattr(ad, "body", None) or ""

    # Detection de la variante (priorite: version > titre > body > couleur)
    variant, color, wheel_type = _detect_variant(subject, body, ad, bike_model_id, session)

    # Prix neuf estime
    estimated_new_price = _estimate_new_price(bike_model_id, variant, color, wheel_type, session)

    # Detection des accessoires depuis le body
    accessories = detect_accessories(body, bike_model_id, session, price_overrides=price_overrides)

    # Localisation
    location = _parse_location(ad)

    # Attributs LBC enrichis
    color_attr = _get_attr_label(ad, "vehicule_color") or _get_attr(ad, "vehicule_color") or ""
    cubic_attr = _get_attr(ad, "cubic_capacity") or ""

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
        # Analyse
        "variant": variant,
        "wheel_type": wheel_type,
        "estimated_new_price": estimated_new_price,
        "bike_model_id": bike_model_id,
        # Listes
        "attributes": _raw_attributes(ad),
        "images": _parse_images(ad),
        "accessories": accessories,
    }

    return ad_data
