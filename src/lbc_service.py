"""
Micro-service LBC local.

Tourne sur la machine de l'utilisateur (IP residentielle) et expose
3 endpoints de scraping LeBonCoin. Le backend principal (Railway)
delegue les appels LBC ici.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from lbc.exceptions import NotFoundError

app = FastAPI(title="LBC Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    keyword: str = "Himalayan"
    min_cc: int | None = None
    max_cc: int | None = None
    locations: list[str] | None = None
    owner_type: str | None = None
    price_min: int | None = None
    price_max: int | None = None
    sort: str | None = None
    search_in_title_only: bool = False


class FetchAdRequest(BaseModel):
    url: str
    price_overrides: dict | None = None


class CheckAdRequest(BaseModel):
    ad_id: int


class CheckAdsRequest(BaseModel):
    ad_ids: list[int]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/search")
def search(req: SearchRequest):
    """Lance la recherche LeBonCoin et retourne les resultats bruts."""
    from .crawler import search_all_ads

    try:
        return search_all_ads(
            keyword=req.keyword,
            min_cc=req.min_cc,
            max_cc=req.max_cc,
            locations=req.locations,
            owner_type=req.owner_type,
            price_min=req.price_min,
            price_max=req.price_max,
            sort=req.sort,
            search_in_title_only=req.search_in_title_only,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur recherche LeBonCoin : {e}")


@app.post("/fetch-ad")
def fetch_ad_endpoint(req: FetchAdRequest):
    """Extrait une annonce complete depuis LeBonCoin."""
    from .extractor import fetch_ad, get_lbc_client

    try:
        client = get_lbc_client()
        ad_data = fetch_ad(req.url, client=client, price_overrides=req.price_overrides)
        return ad_data
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur extraction : {e}")


@app.post("/check-ad")
def check_ad(req: CheckAdRequest):
    """Verifie si une annonce est encore en ligne."""
    from .extractor import get_lbc_client

    client = get_lbc_client()
    try:
        lbc_ad = client.get_ad(req.ad_id)
        status = getattr(lbc_ad, "status", None)
        if status and status not in ("active",):
            return {"ad_id": req.ad_id, "online": False, "reason": f"status={status}"}
        return {"ad_id": req.ad_id, "online": True}
    except NotFoundError:
        return {"ad_id": req.ad_id, "online": False, "reason": "inaccessible"}
    except Exception as e:
        return {"ad_id": req.ad_id, "online": None, "reason": "error", "error": str(e)}


@app.post("/check-ads")
def check_ads(req: CheckAdsRequest):
    """Verifie plusieurs annonces en batch."""
    from .extractor import get_lbc_client

    client = get_lbc_client()
    results = []
    for ad_id in req.ad_ids:
        try:
            lbc_ad = client.get_ad(ad_id)
            status = getattr(lbc_ad, "status", None)
            if status and status not in ("active",):
                results.append({"ad_id": ad_id, "online": False, "reason": f"status={status}"})
            else:
                results.append({"ad_id": ad_id, "online": True})
        except NotFoundError:
            results.append({"ad_id": ad_id, "online": False, "reason": "inaccessible"})
        except Exception as e:
            results.append({"ad_id": ad_id, "online": None, "reason": "error", "error": str(e)})
    return {"results": results}


@app.post("/check-prices")
def check_prices(req: CheckAdsRequest):
    """Recupere le prix actuel de chaque annonce."""
    from .extractor import get_lbc_client

    client = get_lbc_client()
    results = []
    for ad_id in req.ad_ids:
        try:
            lbc_ad = client.get_ad(ad_id)
            status = getattr(lbc_ad, "status", None)
            if status and status not in ("active",):
                results.append({"ad_id": ad_id, "online": False, "price": None})
            else:
                price = getattr(lbc_ad, "price", None)
                results.append({"ad_id": ad_id, "online": True, "price": price})
        except Exception:
            results.append({"ad_id": ad_id, "online": False, "price": None})
    return {"results": results}
