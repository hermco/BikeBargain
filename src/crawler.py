"""
Crawling des annonces LeBonCoin pour la Royal Enfield Himalayan 450.

Recherche avec criteres fixes :
  - Categorie : motos
  - Cylindree minimum : 420 cm3
  - Mot-cle : "Himalayan"
  - Toute la France
"""

import time

import lbc


# Criteres de recherche fixes
SEARCH_TEXT = "Himalayan"
SEARCH_CATEGORY = lbc.Category.VEHICULES_MOTOS
SEARCH_CC_MIN = 420
SEARCH_CC_MAX = 99999  # pas de max
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


def search_all_ads() -> dict:
    """
    Lance la recherche sur toutes les pages et retourne tous les resultats.

    Utilise un seul client (meme session/cookies) et respecte un delai
    entre les pages pour eviter le blocage DataDome.

    Returns:
        dict avec total et liste complete d'annonces legeres.
    """
    client = lbc.Client()

    # Premiere page
    results = client.search(
        text=SEARCH_TEXT,
        category=SEARCH_CATEGORY,
        cubic_capacity=(SEARCH_CC_MIN, SEARCH_CC_MAX),
        limit=RESULTS_PER_PAGE,
        page=1,
    )

    all_ads = _parse_search_ads(results)
    total = results.total
    max_pages = results.max_pages

    # Pages suivantes avec delai
    for p in range(2, max_pages + 1):
        time.sleep(PAGE_DELAY)
        page_results = client.search(
            text=SEARCH_TEXT,
            category=SEARCH_CATEGORY,
            cubic_capacity=(SEARCH_CC_MIN, SEARCH_CC_MAX),
            limit=RESULTS_PER_PAGE,
            page=p,
        )
        all_ads.extend(_parse_search_ads(page_results))

    return {
        "total": total,
        "ads": all_ads,
    }
