"""
Client HTTP pour appeler le service LBC local depuis l'API principale (Railway).

Utilise httpx en synchrone. Chaque fonction correspond a un endpoint du service LBC.
"""

import httpx

from .config import get_settings

# Timeout genereux : le scraping LBC peut prendre du temps (pagination, retries)
TIMEOUT = httpx.Timeout(120.0, connect=10.0)


def _base_url() -> str:
    url = get_settings().lbc_service_url
    if not url:
        raise RuntimeError("LBC_SERVICE_URL non configure")
    return url.rstrip("/")


def search(
    keyword: str = "Himalayan",
    min_cc: int | None = None,
    max_cc: int | None = None,
    locations: list[str] | None = None,
    owner_type: str | None = None,
    price_min: int | None = None,
    price_max: int | None = None,
    sort: str | None = None,
    search_in_title_only: bool = False,
) -> dict:
    """Lance la recherche LeBonCoin via le service local."""
    payload: dict = {"keyword": keyword, "search_in_title_only": search_in_title_only}
    if min_cc is not None:
        payload["min_cc"] = min_cc
    if max_cc is not None:
        payload["max_cc"] = max_cc
    if locations:
        payload["locations"] = locations
    if owner_type:
        payload["owner_type"] = owner_type
    if price_min is not None:
        payload["price_min"] = price_min
    if price_max is not None:
        payload["price_max"] = price_max
    if sort:
        payload["sort"] = sort
    r = httpx.post(f"{_base_url()}/search", json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def fetch_ad(url: str) -> dict:
    """Extrait une annonce via le service local."""
    payload = {"url": url}
    r = httpx.post(f"{_base_url()}/fetch-ad", json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def check_ad(ad_id: int) -> dict:
    """Verifie si une annonce est en ligne via le service local."""
    r = httpx.post(f"{_base_url()}/check-ad", json={"ad_id": ad_id}, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def check_ads(ad_ids: list[int]) -> list[dict]:
    """Verifie plusieurs annonces via le service local."""
    r = httpx.post(f"{_base_url()}/check-ads", json={"ad_ids": ad_ids}, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()["results"]


def check_prices(ad_ids: list[int]) -> list[dict]:
    """Recupere les prix actuels via le service local."""
    r = httpx.post(f"{_base_url()}/check-prices", json={"ad_ids": ad_ids}, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()["results"]
