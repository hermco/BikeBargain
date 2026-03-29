"""
Crawling des annonces LeBonCoin.

Recherche avec criteres parametrables :
  - Categorie : motos
  - Cylindree minimum/maximum optionnels
  - Mot-cle configurable
  - Toute la France
"""

import time

import lbc


SEARCH_CATEGORY = lbc.Category.VEHICULES_MOTOS
RESULTS_PER_PAGE = 35

# Delai entre les requetes de pagination (secondes)
PAGE_DELAY = 3


def _parse_search_ads(results) -> list[dict]:
    """Transforme les resultats de recherche en liste de dicts legers."""
    ads = []
    for ad in results.ads:
        # Extraire miniature
        thumbnail = None
        if hasattr(ad, "images") and ad.images:
            if isinstance(ad.images, dict):
                urls = ad.images.get("small_url") or ad.images.get("urls") or []
                if isinstance(urls, str):
                    thumbnail = urls
                elif isinstance(urls, list) and urls:
                    thumbnail = urls[0]
            elif isinstance(ad.images, list) and ad.images:
                thumbnail = str(ad.images[0])

        # Localisation
        city = None
        department = None
        if hasattr(ad, "location") and ad.location:
            city = getattr(ad.location, "city", None)
            department = getattr(ad.location, "department_name", None) or getattr(ad.location, "department", None)

        ads.append({
            "id": ad.id,
            "url": getattr(ad, "url", f"https://www.leboncoin.fr/ad/motos/{ad.id}"),
            "subject": getattr(ad, "subject", None),
            "price": getattr(ad, "price", None),
            "city": city,
            "department": department,
            "thumbnail": thumbnail,
        })

    return ads


def search_all_ads(keyword: str = "Himalayan", min_cc: int | None = None, max_cc: int | None = None) -> dict:
    """
    Lance la recherche sur toutes les pages et retourne tous les resultats.

    Utilise un seul client (meme session/cookies) et respecte un delai
    entre les pages pour eviter le blocage DataDome.

    Args:
        keyword: Mot-cle de recherche.
        min_cc: Cylindree minimum (optionnel, pas de filtre si None).
        max_cc: Cylindree maximum (optionnel, pas de filtre si None).

    Returns:
        dict avec total et liste complete d'annonces legeres.
    """
    from .extractor import get_lbc_client
    client = get_lbc_client()

    # Construire les kwargs de recherche
    search_kwargs = {
        "text": keyword,
        "category": SEARCH_CATEGORY,
        "limit": RESULTS_PER_PAGE,
        "page": 1,
    }
    if min_cc is not None or max_cc is not None:
        cc_min = min_cc or 0
        cc_max = max_cc or 99999
        search_kwargs["cubic_capacity"] = (cc_min, cc_max)

    # Premiere page
    results = client.search(**search_kwargs)

    all_ads = _parse_search_ads(results)
    total = results.total
    max_pages = results.max_pages

    # Pages suivantes avec delai
    for p in range(2, max_pages + 1):
        time.sleep(PAGE_DELAY)
        search_kwargs["page"] = p
        page_results = client.search(**search_kwargs)
        all_ads.extend(_parse_search_ads(page_results))

    return {
        "total": total,
        "ads": all_ads,
    }
