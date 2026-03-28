"""
API REST FastAPI pour le frontend Himalayan 450 Analyzer.

Expose les fonctions existantes (database, extractor, analyzer) via des endpoints JSON.
"""

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy import func
from sqlalchemy.orm import selectinload

from .models import (
    Ad, AdAttribute, AdImage, AdAccessory,
    CrawlSession, CrawlSessionAd, AdPriceHistory, AccessoryOverride,
)
from .database import (
    get_session, run_migrations, upsert_ad, get_all_ads, get_ad_count,
    get_accessory_overrides, set_accessory_override, delete_accessory_override,
    refresh_accessories, _ad_to_dict, _replace_accessories,
)
from lbc.exceptions import NotFoundError

from .analyzer import rank_ads
from .accessories import estimate_total_accessories_value, ACCESSORY_PATTERNS, DEPRECIATION_RATE
from .extractor import detect_new_listing_light, detect_new_listing
from .config import get_settings

settings = get_settings()

app = FastAPI(
    title="Himalayan 450 Analyzer API",
    debug=settings.debug,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # En production (Railway), les migrations sont lancees par le startCommand
    # avant uvicorn. En dev local, on les lance au startup.
    if settings.app_env != "production":
        run_migrations()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class AddAdRequest(BaseModel):
    url: str


class ConfirmAdRequest(BaseModel):
    ad_data: dict


class UpdateAdRequest(BaseModel):
    color: str | None = None
    variant: str | None = None
    wheel_type: str | None = None
    accessories: list[dict] | None = None
    sold: int | None = None


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/api/ads")
def list_ads(
    variant: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    ads = get_all_ads(session)

    if variant:
        ads = [a for a in ads if a.get("variant") == variant]
    if min_price is not None:
        ads = [a for a in ads if (a.get("price") or 0) >= min_price]
    if max_price is not None:
        ads = [a for a in ads if (a.get("price") or 0) <= max_price]

    total = len(ads)
    ads = ads[offset:offset + limit]
    return {"total": total, "ads": ads}


@app.get("/api/ads/{ad_id}")
def get_ad(ad_id: int, session: Session = Depends(get_session)):
    ad = session.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    result = _ad_to_dict(ad)

    result["accessories"] = [
        {"name": a.name, "category": a.category, "source": a.source,
         "estimated_new_price": a.estimated_new_price, "estimated_used_price": a.estimated_used_price}
        for a in session.exec(
            select(AdAccessory).where(AdAccessory.ad_id == ad_id).order_by(AdAccessory.category, AdAccessory.name)
        ).all()
    ]

    result["images"] = [
        img.url for img in session.exec(
            select(AdImage).where(AdImage.ad_id == ad_id).order_by(AdImage.position)
        ).all()
    ]

    result["attributes"] = [
        {"key": a.key, "value": a.value, "value_label": a.value_label}
        for a in session.exec(
            select(AdAttribute).where(AdAttribute.ad_id == ad_id).order_by(AdAttribute.key)
        ).all()
    ]

    return result


@app.post("/api/ads/preview")
def preview_ad(req: AddAdRequest, session: Session = Depends(get_session)):
    overrides = get_accessory_overrides(session)

    try:
        if settings.lbc_service_url:
            from . import lbc_client
            ad_data = lbc_client.fetch_ad(req.url, price_overrides=overrides)
        else:
            from .extractor import fetch_ad, get_lbc_client
            client = get_lbc_client()
            ad_data = fetch_ad(req.url, client=client, price_overrides=overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur extraction : {e}")

    return ad_data


@app.post("/api/ads/confirm")
def confirm_ad(req: ConfirmAdRequest, session: Session = Depends(get_session)):
    from .extractor import _estimate_new_price

    ad_data = req.ad_data
    if not ad_data.get("id"):
        raise HTTPException(status_code=400, detail="Donnees d'annonce invalides (id manquant)")

    new_price = _estimate_new_price(
        ad_data.get("variant"), ad_data.get("color"), ad_data.get("wheel_type")
    )
    if new_price:
        ad_data["estimated_new_price"] = new_price

    ad_id = upsert_ad(session, ad_data)
    return {"id": ad_id, "subject": ad_data.get("subject"), "price": ad_data.get("price")}


@app.post("/api/ads")
def add_ad(req: AddAdRequest, session: Session = Depends(get_session)):
    overrides = get_accessory_overrides(session)

    try:
        if settings.lbc_service_url:
            from . import lbc_client
            ad_data = lbc_client.fetch_ad(req.url, price_overrides=overrides)
        else:
            from .extractor import fetch_ad, get_lbc_client
            client = get_lbc_client()
            ad_data = fetch_ad(req.url, client=client, price_overrides=overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur extraction : {e}")

    ad_id = upsert_ad(session, ad_data)
    return {"id": ad_id, "subject": ad_data.get("subject"), "price": ad_data.get("price")}


@app.delete("/api/ads/{ad_id}")
def delete_ad(ad_id: int, session: Session = Depends(get_session)):
    ad = session.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    session.delete(ad)
    session.commit()
    return {"deleted": ad_id}


@app.patch("/api/ads/{ad_id}")
def update_ad(ad_id: int, req: UpdateAdRequest, session: Session = Depends(get_session)):
    from .extractor import _estimate_new_price

    ad = session.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    if req.color is not None:
        ad.color = req.color
    if req.variant is not None:
        ad.variant = req.variant
    if req.wheel_type is not None:
        ad.wheel_type = req.wheel_type
    if req.sold is not None:
        ad.sold = req.sold

    # Recalculer le prix neuf si variante/couleur/jantes modifiees
    if req.variant is not None or req.color is not None or req.wheel_type is not None:
        new_price = _estimate_new_price(
            ad.variant, ad.color, ad.wheel_type
        )
        if new_price:
            ad.estimated_new_price = new_price

    ad.updated_at = datetime.now().isoformat()

    # Mise a jour des accessoires
    if req.accessories is not None:
        _replace_accessories(session, ad_id, req.accessories)
        ad.accessories_manual = 1

    session.commit()
    return {"updated": ad_id}


# ─── Merge / Price History ──────────────────────────────────────────────────

class MergeAdRequest(BaseModel):
    new_ad_data: dict
    old_ad_id: int


@app.post("/api/ads/merge")
def merge_ad(req: MergeAdRequest, session: Session = Depends(get_session)):
    from .extractor import _estimate_new_price

    old_ad = session.get(Ad, req.old_ad_id)
    if not old_ad:
        raise HTTPException(status_code=404, detail="Ancienne annonce non trouvee")

    new_data = req.new_ad_data
    if not new_data.get("id"):
        raise HTTPException(status_code=400, detail="Donnees d'annonce invalides (id manquant)")

    new_id = new_data["id"]
    old_price = old_ad.price or 0
    new_price_val = new_data.get("price") or 0

    estimated = _estimate_new_price(
        new_data.get("variant"), new_data.get("color"), new_data.get("wheel_type")
    )
    if estimated:
        new_data["estimated_new_price"] = estimated

    new_data["previous_ad_id"] = req.old_ad_id
    ad_id = upsert_ad(session, new_data, auto_commit=False)

    # Historique de prix
    old_history = session.exec(
        select(AdPriceHistory).where(AdPriceHistory.ad_id == req.old_ad_id)
    ).all()

    old_pub_date = old_ad.first_publication_date or old_ad.extracted_at
    new_pub_date = new_data.get("first_publication_date") or new_data.get("extracted_at")

    if old_history:
        for h in old_history:
            session.add(AdPriceHistory(
                ad_id=ad_id, previous_ad_id=h.previous_ad_id,
                price=h.price, source=h.source, note=h.note, recorded_at=h.recorded_at,
            ))
    elif old_price:
        session.add(AdPriceHistory(
            ad_id=ad_id, previous_ad_id=None,
            price=old_price, source="initial",
            note=f"Annonce #{req.old_ad_id}", recorded_at=old_pub_date or "",
        ))

    # Enregistrer le nouveau prix (repost)
    price_delta = int(new_price_val - old_price) if (old_price and new_price_val) else 0
    note = f"Annonce #{new_id}"
    if price_delta < 0:
        note += f" — baisse de {abs(price_delta)}€ vs #{req.old_ad_id}"
    elif price_delta > 0:
        note += f" — hausse de {price_delta}€ vs #{req.old_ad_id}"
    else:
        note += f" — meme prix que #{req.old_ad_id}"

    session.add(AdPriceHistory(
        ad_id=ad_id, previous_ad_id=req.old_ad_id,
        price=new_price_val, source="repost",
        note=note, recorded_at=new_pub_date or "",
    ))

    # Marquer l'ancienne annonce comme vendue et superseded
    old_ad.sold = 1
    old_ad.superseded_by = ad_id
    old_ad.updated_at = datetime.now().isoformat()

    session.commit()

    return {
        "id": ad_id,
        "old_ad_id": req.old_ad_id,
        "price_delta": price_delta,
        "subject": new_data.get("subject"),
    }


@app.get("/api/ads/{ad_id}/price-history")
def get_price_history(ad_id: int, session: Session = Depends(get_session)):
    ad = session.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    history = [
        {"id": h.id, "ad_id": h.ad_id, "previous_ad_id": h.previous_ad_id,
         "price": h.price, "source": h.source, "note": h.note, "recorded_at": h.recorded_at}
        for h in session.exec(
            select(AdPriceHistory).where(AdPriceHistory.ad_id == ad_id).order_by(AdPriceHistory.recorded_at)
        ).all()
    ]

    return {
        "ad_id": ad_id,
        "current_price": ad.price,
        "previous_ad_id": ad.previous_ad_id,
        "history": history,
    }


class ConfirmPriceRequest(BaseModel):
    new_price: float


@app.post("/api/ads/{ad_id}/confirm-price")
def confirm_price(ad_id: int, req: ConfirmPriceRequest, session: Session = Depends(get_session)):
    ad = session.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    old_price = ad.price or 0
    new_price = req.new_price
    if old_price == new_price:
        return {"id": ad_id, "price_delta": 0, "message": "Prix inchange"}

    # Creer l'entree initiale si aucun historique n'existe
    existing_history = session.exec(
        select(AdPriceHistory).where(AdPriceHistory.ad_id == ad_id)
    ).first()

    if not existing_history:
        session.add(AdPriceHistory(
            ad_id=ad_id,
            price=old_price,
            source="initial",
            note=f"Annonce #{ad_id}",
            recorded_at=ad.first_publication_date or ad.extracted_at or "",
        ))

    # Enregistrer le changement de prix
    price_delta = int(new_price - old_price)
    if price_delta < 0:
        note = f"Baisse de {abs(price_delta)}€"
    else:
        note = f"Hausse de {price_delta}€"

    session.add(AdPriceHistory(
        ad_id=ad_id,
        price=new_price,
        source="price_update",
        note=note,
        recorded_at=datetime.now().isoformat(),
    ))

    ad.price = new_price
    ad.updated_at = datetime.now().isoformat()
    session.commit()

    return {"id": ad_id, "price_delta": price_delta, "new_price": new_price}


@app.get("/api/accessory-catalog")
def get_accessory_catalog(session: Session = Depends(get_session)):
    overrides = get_accessory_overrides(session)

    seen_groups: set[str] = set()
    catalog = []
    for _pattern, name, category, price_new, group in ACCESSORY_PATTERNS:
        if group not in seen_groups:
            seen_groups.add(group)
            effective_price = overrides.get(group, price_new)
            catalog.append({
                "name": name,
                "category": category,
                "estimated_new_price": effective_price,
                "default_new_price": price_new,
                "estimated_used_price": int(effective_price * DEPRECIATION_RATE),
                "group": group,
                "has_override": group in overrides,
            })
    return catalog


class UpdateCatalogPriceRequest(BaseModel):
    estimated_new_price: int


@app.patch("/api/accessory-catalog/{group}")
def update_catalog_price(group: str, req: UpdateCatalogPriceRequest, session: Session = Depends(get_session)):
    valid_groups = {g for _, _, _, _, g in ACCESSORY_PATTERNS}
    if group not in valid_groups:
        raise HTTPException(status_code=404, detail=f"Groupe '{group}' inconnu")

    set_accessory_override(session, group, req.estimated_new_price)
    results = refresh_accessories(session)
    return {"group": group, "estimated_new_price": req.estimated_new_price, "ads_refreshed": len(results)}


@app.delete("/api/accessory-catalog/{group}/override")
def reset_catalog_price(group: str, session: Session = Depends(get_session)):
    valid_groups = {g for _, _, _, _, g in ACCESSORY_PATTERNS}
    if group not in valid_groups:
        raise HTTPException(status_code=404, detail=f"Groupe '{group}' inconnu")

    delete_accessory_override(session, group)
    results = refresh_accessories(session)
    return {"group": group, "reset": True, "ads_refreshed": len(results)}


@app.post("/api/accessories/refresh")
def refresh_all_accessories(session: Session = Depends(get_session)):
    skipped = session.exec(
        select(func.count()).select_from(Ad).where(Ad.accessories_manual == 1)
    ).one()
    results = refresh_accessories(session, skip_manual=True)
    return {
        "ads_refreshed": len(results),
        "ads_skipped_manual": skipped,
        "details": results,
    }


@app.post("/api/ads/{ad_id}/refresh-accessories")
def refresh_ad_accessories(ad_id: int, session: Session = Depends(get_session)):
    ad = session.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    ad.accessories_manual = 0
    session.commit()

    results = refresh_accessories(session, ad_ids=[ad_id])
    detail = results[0] if results else {"id": ad_id, "before": 0, "after": 0}
    return detail


@app.post("/api/ads/check-online")
def check_ads_online(session: Session = Depends(get_session)):
    ads = session.exec(select(Ad).where(Ad.sold == 0)).all()
    results = []

    if settings.lbc_service_url:
        from . import lbc_client
        lbc_results = lbc_client.check_ads([ad.id for ad in ads])
        ads_by_id = {ad.id: ad for ad in ads}
        for r in lbc_results:
            ad = ads_by_id[r["ad_id"]]
            if not r["online"]:
                ad.sold = 1
                ad.updated_at = datetime.now().isoformat()
                results.append({"id": r["ad_id"], "sold": True, "reason": r.get("reason", "")})
            else:
                results.append({"id": r["ad_id"], "sold": False})
    else:
        from .extractor import get_lbc_client
        client = get_lbc_client()
        for ad in ads:
            try:
                lbc_ad = client.get_ad(ad.id)
                ad_status = getattr(lbc_ad, "status", None)
                if ad_status and ad_status not in ("active",):
                    ad.sold = 1
                    ad.updated_at = datetime.now().isoformat()
                    results.append({"id": ad.id, "sold": True, "reason": f"status={ad_status}"})
                else:
                    results.append({"id": ad.id, "sold": False})
            except NotFoundError:
                ad.sold = 1
                ad.updated_at = datetime.now().isoformat()
                results.append({"id": ad.id, "sold": True, "reason": "inaccessible"})
            except Exception as e:
                results.append({"id": ad.id, "sold": False, "reason": "error", "error": str(e)})

    session.commit()
    newly_sold = sum(1 for r in results if r["sold"])
    return {"checked": len(results), "newly_sold": newly_sold, "details": results}


@app.post("/api/ads/{ad_id}/check-online")
def check_ad_online(ad_id: int, session: Session = Depends(get_session)):
    ad = session.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    if settings.lbc_service_url:
        from . import lbc_client
        r = lbc_client.check_ad(ad_id)
        if not r["online"]:
            ad.sold = 1
            ad.updated_at = datetime.now().isoformat()
            session.commit()
            return {"id": ad_id, "sold": True, "reason": r.get("reason", "")}
        return {"id": ad_id, "sold": False}
    else:
        from .extractor import get_lbc_client
        client = get_lbc_client()
        try:
            lbc_ad = client.get_ad(ad_id)
            ad_status = getattr(lbc_ad, "status", None)
            if ad_status and ad_status not in ("active",):
                ad.sold = 1
                ad.updated_at = datetime.now().isoformat()
                session.commit()
                return {"id": ad_id, "sold": True, "reason": f"status={ad_status}"}
            return {"id": ad_id, "sold": False}
        except NotFoundError:
            ad.sold = 1
            ad.updated_at = datetime.now().isoformat()
            session.commit()
            return {"id": ad_id, "sold": True, "reason": "inaccessible"}
        except Exception as e:
            return {"id": ad_id, "sold": False, "reason": "error", "error": str(e)}


@app.post("/api/ads/check-prices")
def check_prices(session: Session = Depends(get_session)):
    ads = session.exec(select(Ad).where(Ad.sold == 0)).all()
    if not ads:
        return {"price_changes": [], "checked_count": 0, "unchanged_count": 0}

    # Un seul appel search au lieu de N appels get_ad individuels
    if settings.lbc_service_url:
        from . import lbc_client
        search_results = lbc_client.search()
    else:
        from .crawler import search_all_ads
        search_results = search_all_ads()

    # Indexer les prix LBC par ID
    lbc_prices = {ad_data["id"]: ad_data.get("price") for ad_data in search_results.get("ads", [])}

    price_changes = []
    for ad in ads:
        lbc_price = lbc_prices.get(ad.id)
        if lbc_price is not None and ad.price is not None and lbc_price != ad.price:
            price_changes.append({
                "id": ad.id,
                "subject": ad.subject,
                "current_price": ad.price,
                "new_price": lbc_price,
                "price_delta": int(lbc_price - ad.price),
                "city": ad.city,
                "department": ad.department,
                "url": ad.url,
            })

    return {
        "price_changes": price_changes,
        "checked_count": len(ads),
        "unchanged_count": len(ads) - len(price_changes),
    }


@app.get("/api/stats")
def get_stats(session: Session = Depends(get_session)):
    ads = get_all_ads(session)

    prices = [a["price"] for a in ads if a["price"] is not None]
    kms = [a["mileage_km"] for a in ads if a["mileage_km"] is not None]
    years = [a["year"] for a in ads if a["year"] is not None]

    variants = {}
    for a in ads:
        v = a.get("variant") or "Non detectee"
        variants[v] = variants.get(v, 0) + 1

    depts = {}
    for a in ads:
        d = a.get("department") or "Inconnu"
        depts[d] = depts.get(d, 0) + 1

    all_acc = {}
    for a in ads:
        for acc in a.get("accessories", []):
            name = acc["name"]
            all_acc[name] = all_acc.get(name, 0) + 1

    top_accessories = [
        {"name": name, "count": count, "pct": round(count / len(ads) * 100, 1) if ads else 0}
        for name, count in sorted(all_acc.items(), key=lambda x: -x[1])[:15]
    ]

    sorted_prices = sorted(prices) if prices else []

    return {
        "count": len(ads),
        "price": {
            "min": min(prices) if prices else None,
            "max": max(prices) if prices else None,
            "mean": round(sum(prices) / len(prices), 0) if prices else None,
            "median": sorted_prices[len(sorted_prices) // 2] if sorted_prices else None,
        },
        "mileage": {
            "min": min(kms) if kms else None,
            "max": max(kms) if kms else None,
            "mean": round(sum(kms) / len(kms), 0) if kms else None,
        },
        "years": {"min": min(years) if years else None, "max": max(years) if years else None},
        "variants": [{"name": v, "count": c} for v, c in sorted(variants.items(), key=lambda x: -x[1])],
        "departments": [{"name": d, "count": c} for d, c in sorted(depts.items(), key=lambda x: -x[1])[:15]],
        "top_accessories": top_accessories,
        "prices_list": sorted_prices,
        "mileages_list": sorted(kms) if kms else [],
    }


@app.get("/api/rankings")
def get_rankings(session: Session = Depends(get_session)):
    return rank_ads(session)


# ─── Crawl ──────────────────────────────────────────────────────────────────

class ExtractRequest(BaseModel):
    ad_id: int
    url: str


@app.get("/api/crawl/search")
def crawl_search(session: Session = Depends(get_session)):
    try:
        if settings.lbc_service_url:
            from . import lbc_client
            results = lbc_client.search()
        else:
            from .crawler import search_all_ads
            results = search_all_ads()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur recherche LeBonCoin : {e}")

    existing_ids = {
        row for row in session.exec(select(Ad.id)).all()
    }

    # Annonces qui ont ete remplacees par un repost connu (previous_ad_id pointe vers elles)
    superseded_ids = {
        row for row in session.exec(
            select(Ad.previous_ad_id).where(Ad.previous_ad_id.is_not(None))
        ).all()
    }

    db_ads = session.exec(select(Ad)).all()
    db_ads_data = [
        {"id": a.id, "city": a.city, "department": a.department,
         "price": a.price, "subject": a.subject, "sold": a.sold}
        for a in db_ads
        if a.id not in superseded_ids
    ]

    # Index des prix en base pour detecter les changements
    db_prices = {a.id: a.price for a in db_ads}

    for ad in results["ads"]:
        ad["exists_in_db"] = ad["id"] in existing_ids
        ad["possible_repost_of"] = None
        ad["price_changed"] = False
        ad["current_db_price"] = None
        ad["price_delta"] = None

        # Detecter les changements de prix sur les annonces deja en base
        if ad["id"] in existing_ids:
            db_price = db_prices.get(ad["id"])
            ad_price = ad.get("price")
            if db_price is not None and ad_price is not None and db_price != ad_price:
                ad["price_changed"] = True
                ad["current_db_price"] = db_price
                ad["price_delta"] = int(ad_price - db_price)

        if ad["id"] not in existing_ids:
            new_city = (ad.get("city") or "").lower().strip()
            new_price = ad.get("price") or 0
            best_match = None
            best_score = 0
            for db_ad in db_ads_data:
                s_city = (db_ad.get("city") or "").lower().strip()
                if not (s_city and new_city and s_city == new_city):
                    continue
                s_price = db_ad.get("price") or 0
                if not (new_price and s_price):
                    continue
                ratio = abs(new_price - s_price) / max(new_price, s_price)
                if ratio > 0.15:
                    continue
                score = 55
                if db_ad.get("sold"):
                    score += 15
                if score > best_score:
                    best_score = score
                    price_delta = int(new_price - s_price)
                    best_match = {
                        "id": db_ad["id"],
                        "subject": db_ad.get("subject"),
                        "price": db_ad.get("price"),
                        "city": db_ad.get("city"),
                        "sold": bool(db_ad.get("sold", 0)),
                        "price_delta": price_delta,
                    }
            if best_match:
                ad["possible_repost_of"] = best_match

    # Clore les sessions actives precedentes
    active_sessions = session.exec(
        select(CrawlSession).where(CrawlSession.status == "active")
    ).all()
    for s in active_sessions:
        s.status = "done"

    # Creer une nouvelle session
    crawl_session = CrawlSession(status="active", total_ads=len(results["ads"]))
    session.add(crawl_session)
    session.flush()

    for i, ad in enumerate(results["ads"]):
        is_new = detect_new_listing_light(
            subject=ad.get("subject"),
            price=ad.get("price"),
            seller_type=ad.get("seller_type"),
        )
        ad["is_new_listing"] = is_new
        session.add(CrawlSessionAd(
            session_id=crawl_session.id, ad_id=ad["id"], url=ad["url"],
            subject=ad.get("subject"), price=ad.get("price"),
            city=ad.get("city"), department=ad.get("department"),
            thumbnail=ad.get("thumbnail"),
            exists_in_db=1 if ad.get("exists_in_db") else 0,
            position=i,
            is_new_listing=1 if is_new else 0,
        ))

    session.commit()
    return {**results, "session_id": crawl_session.id}


@app.get("/api/crawl/sessions/active")
def get_active_crawl_session(session: Session = Depends(get_session)):
    crawl_session = session.exec(
        select(CrawlSession)
        .where(CrawlSession.status == "active")
        .order_by(CrawlSession.created_at.desc())
    ).first()

    if not crawl_session:
        return None

    existing_ids = {ad.id for ad in session.exec(select(Ad.id)).all()}

    rows = session.exec(
        select(CrawlSessionAd)
        .where(CrawlSessionAd.session_id == crawl_session.id)
        .order_by(CrawlSessionAd.position)
    ).all()

    ads = []
    for row in rows:
        ads.append({
            "id": row.ad_id,
            "url": row.url,
            "subject": row.subject,
            "price": row.price,
            "city": row.city,
            "department": row.department,
            "thumbnail": row.thumbnail,
            "exists_in_db": row.ad_id in existing_ids,
            "action": row.action,
            "is_new_listing": bool(row.is_new_listing),
        })

    return {
        "session_id": crawl_session.id,
        "status": crawl_session.status,
        "total_ads": crawl_session.total_ads,
        "created_at": crawl_session.created_at,
        "ads": ads,
    }


class UpdateCrawlAdAction(BaseModel):
    action: str


@app.patch("/api/crawl/sessions/{session_id}/ads/{ad_id}")
def update_crawl_session_ad(session_id: int, ad_id: int, req: UpdateCrawlAdAction, session: Session = Depends(get_session)):
    if req.action not in ('confirmed', 'skipped', 'error'):
        raise HTTPException(status_code=400, detail="Action invalide")

    crawl_ad = session.exec(
        select(CrawlSessionAd)
        .where(CrawlSessionAd.session_id == session_id, CrawlSessionAd.ad_id == ad_id)
    ).first()
    if crawl_ad:
        crawl_ad.action = req.action

    # Verifier si toutes les annonces sont traitees
    pending = session.exec(
        select(func.count()).select_from(CrawlSessionAd)
        .where(CrawlSessionAd.session_id == session_id, CrawlSessionAd.action == "pending")
    ).one()

    if pending == 0:
        cs = session.get(CrawlSession, session_id)
        if cs:
            cs.status = "done"

    session.commit()
    return {"updated": True}


@app.delete("/api/crawl/sessions/{session_id}")
def close_crawl_session(session_id: int, session: Session = Depends(get_session)):
    cs = session.get(CrawlSession, session_id)
    if cs:
        cs.status = "done"
        session.commit()
    return {"closed": session_id}


@app.delete("/api/crawl/sessions/{session_id}/ads/{ad_id}")
def remove_crawl_session_ad(session_id: int, ad_id: int, session: Session = Depends(get_session)):
    crawl_ad = session.exec(
        select(CrawlSessionAd)
        .where(CrawlSessionAd.session_id == session_id, CrawlSessionAd.ad_id == ad_id)
    ).first()
    if crawl_ad:
        session.delete(crawl_ad)

    remaining = session.exec(
        select(func.count()).select_from(CrawlSessionAd)
        .where(CrawlSessionAd.session_id == session_id)
    ).one()

    cs = session.get(CrawlSession, session_id)
    if cs:
        cs.total_ads = remaining

    session.commit()
    return {"removed": ad_id}


def _extract_significant_words(text: str, min_len: int = 4) -> set[str]:
    import re
    if not text:
        return set()
    words = re.findall(r'[a-zà-ÿ0-9]+', text.lower())
    stopwords = {
        "dans", "avec", "pour", "plus", "tres", "tout", "aussi", "bien",
        "mais", "comme", "cette", "sont", "sera", "moto", "vente", "etat",
        "royal", "enfield", "himalayan", "annonce", "vends", "bonjour",
        "merci", "prix", "euros", "cause", "neuf", "neuve", "occasion",
        "kilometres", "premiere", "main", "excellent", "parfait",
    }
    return {w for w in words if len(w) >= min_len and w not in stopwords}


def _find_potential_duplicates(session: Session, ad_data: dict, exclude_id: int) -> list[dict]:
    # Exclure les annonces remplacees par un repost connu
    superseded_ids = {
        row for row in session.exec(
            select(Ad.previous_ad_id).where(Ad.previous_ad_id.is_not(None))
        ).all()
    }
    ads = [
        a for a in session.exec(select(Ad).where(Ad.id != exclude_id)).all()
        if a.id not in superseded_ids
    ]

    all_accs = session.exec(select(AdAccessory)).all()
    acc_by_ad: dict[int, set[str]] = {}
    for a in all_accs:
        acc_by_ad.setdefault(a.ad_id, set()).add(a.name)

    new_price = ad_data.get("price") or 0
    new_city = (ad_data.get("city") or "").lower().strip()
    new_color = (ad_data.get("color") or "").lower()
    new_km = ad_data.get("mileage_km") or 0
    new_acc_names = {a["name"] for a in ad_data.get("accessories", [])}
    new_body_words = _extract_significant_words(ad_data.get("body") or "")

    candidates = []

    for ad in ads:
        score = 0
        reasons = []

        db_city = (ad.city or "").lower().strip()
        if not (db_city and new_city and db_city == new_city):
            continue
        score += 35
        reasons.append(f"meme ville ({ad.city})")

        db_price = ad.price or 0
        if new_price and db_price:
            ratio = abs(new_price - db_price) / max(new_price, db_price)
            if ratio <= 0.15:
                score += 20
                delta = int(new_price - db_price)
                if delta < 0:
                    reasons.append(f"prix baisse ({int(db_price)}€ → {int(new_price)}€, {delta}€)")
                elif delta > 0:
                    reasons.append(f"prix hausse ({int(db_price)}€ → {int(new_price)}€, +{delta}€)")
                else:
                    reasons.append(f"meme prix ({int(db_price)}€)")
                if ratio <= 0.05:
                    score += 10
            else:
                continue

        if new_body_words:
            db_body_words = _extract_significant_words(ad.body or "")
            if db_body_words:
                common_words = new_body_words & db_body_words
                union_words = new_body_words | db_body_words
                if union_words:
                    word_jaccard = len(common_words) / len(union_words)
                    if word_jaccard >= 0.3:
                        score += 25
                        reasons.append(f"description similaire ({int(word_jaccard*100)}% mots communs)")
                        if word_jaccard >= 0.5:
                            score += 10

        db_acc_names = acc_by_ad.get(ad.id, set())
        if new_acc_names and db_acc_names:
            common = new_acc_names & db_acc_names
            union = new_acc_names | db_acc_names
            if union:
                jaccard = len(common) / len(union)
                if jaccard >= 0.5:
                    score += 20
                    reasons.append(f"accessoires similaires ({len(common)}/{len(union)})")
                    if jaccard >= 0.75:
                        score += 10

        db_km = ad.mileage_km or 0
        if new_km and db_km:
            km_diff = abs(new_km - db_km)
            if km_diff <= 1000:
                score += 15
                reasons.append(f"km similaire ({db_km} vs {new_km})")

        db_color = (ad.color or "").lower()
        if new_color and db_color and new_color == db_color:
            score += 5
            reasons.append("meme couleur")

        if ad.sold:
            score += 10
            reasons.append("annonce en base marquee vendue")

        if score >= 80:
            price_delta = None
            if new_price and db_price:
                price_delta = int(new_price - db_price)

            candidates.append({
                "id": ad.id,
                "url": ad.url or "",
                "subject": ad.subject or "",
                "price": ad.price,
                "city": ad.city,
                "department": ad.department,
                "variant": ad.variant,
                "color": ad.color,
                "sold": bool(ad.sold),
                "mileage_km": ad.mileage_km,
                "score": score,
                "reasons": reasons,
                "price_delta": price_delta,
            })

    candidates.sort(key=lambda x: (
        -x["score"],
        0 if not x["sold"] else 1,
        abs(x.get("price_delta") or 999999),
    ))
    return candidates[:3]


@app.post("/api/crawl/extract")
def crawl_extract(req: ExtractRequest, session: Session = Depends(get_session)):
    overrides = get_accessory_overrides(session)

    try:
        if settings.lbc_service_url:
            from . import lbc_client
            ad_data = lbc_client.fetch_ad(req.url, price_overrides=overrides)
        else:
            from .extractor import fetch_ad, get_lbc_client
            client = get_lbc_client()
            ad_data = fetch_ad(req.url, client=client, price_overrides=overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur extraction : {e}")

    existing = session.get(Ad, req.ad_id)
    existing_data = None
    diffs = []

    if existing:
        existing_data = _ad_to_dict(existing)
        existing_data["accessories"] = [
            {"name": a.name, "category": a.category, "source": a.source,
             "estimated_new_price": a.estimated_new_price, "estimated_used_price": a.estimated_used_price}
            for a in session.exec(
                select(AdAccessory).where(AdAccessory.ad_id == req.ad_id)
                .order_by(AdAccessory.category, AdAccessory.name)
            ).all()
        ]

        compare_fields = [
            ("price", "Prix"), ("year", "Annee"), ("mileage_km", "Kilometrage"),
            ("variant", "Variante"), ("color", "Couleur"), ("wheel_type", "Jantes"),
            ("city", "Ville"), ("department", "Departement"), ("seller_type", "Vendeur"),
            ("estimated_new_price", "Prix neuf ref."),
        ]

        for field, label in compare_fields:
            old_val = existing_data.get(field)
            new_val = ad_data.get(field)
            if old_val != new_val:
                diffs.append({"field": field, "label": label, "old": old_val, "new": new_val})

        old_acc_names = sorted([a["name"] for a in existing_data.get("accessories", [])])
        new_acc_names = sorted([a["name"] for a in ad_data.get("accessories", [])])
        if old_acc_names != new_acc_names:
            added = [n for n in new_acc_names if n not in old_acc_names]
            removed = [n for n in old_acc_names if n not in new_acc_names]
            diffs.append({
                "field": "accessories", "label": "Accessoires",
                "old": f"{len(old_acc_names)} accessoires",
                "new": f"{len(new_acc_names)} accessoires",
                "added": added, "removed": removed,
            })

    potential_duplicates = _find_potential_duplicates(session, ad_data, req.ad_id)

    # Detection complete annonce neuve concessionnaire
    is_new = detect_new_listing(
        seller_type=ad_data.get("seller_type"),
        price=ad_data.get("price"),
        mileage_km=ad_data.get("mileage_km"),
        subject=ad_data.get("subject"),
        body=ad_data.get("body"),
        variant=ad_data.get("variant"),
        color=ad_data.get("color"),
        wheel_type=ad_data.get("wheel_type"),
    )

    # Mettre a jour le CrawlSessionAd
    active_cs = session.exec(
        select(CrawlSession).where(CrawlSession.status == "active")
        .order_by(CrawlSession.created_at.desc())
    ).first()
    if active_cs:
        crawl_ad = session.exec(
            select(CrawlSessionAd)
            .where(CrawlSessionAd.session_id == active_cs.id, CrawlSessionAd.ad_id == req.ad_id)
        ).first()
        if crawl_ad:
            crawl_ad.is_new_listing = 1 if is_new else 0
            session.add(crawl_ad)
            session.commit()

    return {
        "ad_data": ad_data,
        "exists_in_db": existing is not None,
        "existing": existing_data,
        "diffs": diffs,
        "potential_duplicates": potential_duplicates,
        "is_new_listing": is_new,
    }


@app.get("/api/export")
def export_csv(session: Session = Depends(get_session)):
    ads = get_all_ads(session)

    output = io.StringIO()
    fieldnames = [
        "id", "url", "subject", "price", "year", "mileage_km",
        "color", "variant", "wheel_type", "estimated_new_price",
        "city", "department", "seller_type", "nb_accessories",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=";")
    writer.writeheader()

    for ad in ads:
        writer.writerow({
            "id": ad["id"], "url": ad["url"], "subject": ad["subject"],
            "price": ad["price"], "year": ad.get("year"),
            "mileage_km": ad.get("mileage_km"), "color": ad.get("color"),
            "variant": ad.get("variant"), "wheel_type": ad.get("wheel_type"),
            "estimated_new_price": ad.get("estimated_new_price"),
            "city": ad.get("city"), "department": ad.get("department"),
            "seller_type": ad.get("seller_type"),
            "nb_accessories": len(ad.get("accessories", [])),
        })

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export_annonces.csv"},
    )
