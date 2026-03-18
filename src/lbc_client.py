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


def search() -> dict:
    """Lance la recherche LeBonCoin via le service local."""
    r = httpx.post(f"{_base_url()}/search", timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def fetch_ad(url: str, price_overrides: dict | None = None) -> dict:
    """Extrait une annonce via le service local."""
    payload = {"url": url, "price_overrides": price_overrides}
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
