"""
API REST FastAPI pour BikeBargain.

Endpoints scopes par modele de moto : /api/bike-models/{slug}/...
Aliases de compatibilite pour les anciennes routes (fonctionne si un seul modele actif).
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
    BikeModel, BikeModelConfig, BikeVariant, BikeAccessoryPattern,
)
from .database import (
    get_session, run_migrations, upsert_ad, get_all_ads, get_ad_count,
    get_accessory_overrides, set_accessory_override, delete_accessory_override,
    refresh_accessories, _ad_to_dict, _replace_accessories,
    get_bike_models, get_bike_model_by_slug, get_bike_model_config,
    get_bike_variants, get_accessory_patterns, get_exclusion_patterns,
    get_search_configs, get_new_listing_patterns, get_bike_consumables,
)
from lbc.exceptions import NotFoundError

from .analyzer import rank_ads
from .accessories import estimate_total_accessories_value
from .extractor import detect_new_listing_light, detect_new_listing
from .config import get_settings

settings = get_settings()

app = FastAPI(
    title="BikeBargain API",
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


# ─── Shared dependency ──────────────────────────────────────────────────────

def resolve_bike_model(slug: str, session: Session = Depends(get_session)) -> BikeModel:
    """Resout un slug en BikeModel ou leve 404."""
    model = get_bike_model_by_slug(session, slug)
    if not model:
        raise HTTPException(status_code=404, detail=f"Modèle '{slug}' non trouvé")
    return model


def _resolve_single_model(session: Session) -> BikeModel:
    """Retourne l'unique modele actif ou leve une erreur."""
    models = get_bike_models(session)
    if len(models) != 1:
        raise HTTPException(
            status_code=400,
            detail="Plusieurs modèles actifs — utilisez /api/bike-models/{slug}/...",
        )
    return models[0]


# ─── Schemas ─────────────────────────────────────────────────────────────────

class AddAdRequest(BaseModel):
    url: str


class AdPayload(BaseModel):
    id: int  # LeBonCoin ID
    url: str | None = None
    subject: str | None = None
    body: str | None = None
    price: float | None = None
    brand: str | None = None
    model: str | None = None
    year: int | None = None
    mileage_km: int | None = None
    engine_size_cc: int | None = None
    fuel_type: str | None = None
    color: str | None = None
    category_name: str | None = None
    ad_type: str | None = None
    status: str | None = None
    has_phone: int | None = None
    city: str | None = None
    zipcode: str | None = None
    department: str | None = None
    region: str | None = None
    lat: float | None = None
    lng: float | None = None
    seller_type: str | None = None
    first_publication_date: str | None = None
    expiration_date: str | None = None
    variant: str | None = None
    wheel_type: str | None = None
    estimated_new_price: float | None = None
    previous_ad_id: int | None = None
    # Related data (not in _AD_FIELDS but consumed by upsert_ad)
    attributes: list[dict] | None = None
    images: list[str] | None = None
    accessories: list[dict] | None = None


class ConfirmAdRequest(BaseModel):
    ad_data: AdPayload


class UpdateAdRequest(BaseModel):
    color: str | None = None
    variant: str | None = None
    wheel_type: str | None = None
    accessories: list[dict] | None = None
    sold: int | None = None


class MergeAdRequest(BaseModel):
    new_ad_data: AdPayload
    old_ad_id: int


class ConfirmPriceRequest(BaseModel):
    new_price: float


class UpdateCatalogPriceRequest(BaseModel):
    estimated_new_price: int


class ExtractRequest(BaseModel):
    ad_id: int
    url: str


class UpdateCrawlAdAction(BaseModel):
    action: str


# ─── Bike Model Endpoints ───────────────────────────────────────────────────

@app.get("/api/bike-models")
def list_bike_models(session: Session = Depends(get_session)):
    """Liste les modeles actifs avec stats resumees."""
    models = get_bike_models(session)

    # Stats agregees par modele en une seule requete
    stats_rows = session.exec(
        select(
            Ad.bike_model_id,
            func.count(Ad.id),
            func.min(Ad.price),
            func.max(Ad.price),
        )
        .where(Ad.superseded_by == None)  # noqa: E711
        .group_by(Ad.bike_model_id)
    ).all()
    stats_by_model = {row[0]: {"count": row[1], "min_price": row[2], "max_price": row[3]} for row in stats_rows}

    results = []
    for m in models:
        s = stats_by_model.get(m.id, {"count": 0, "min_price": None, "max_price": None})
        results.append({
            "id": m.id,
            "slug": m.slug,
            "brand": m.brand,
            "name": m.name,
            "engine_cc": m.engine_cc,
            "image_url": m.image_url,
            "active": m.active,
            "ad_count": s["count"],
            "min_price": s["min_price"],
            "max_price": s["max_price"],
        })
    return results


@app.get("/api/bike-models/{slug}")
def get_bike_model(slug: str, session: Session = Depends(get_session)):
    """Detail d'un modele avec sa config."""
    model = get_bike_model_by_slug(session, slug)
    if not model:
        raise HTTPException(status_code=404, detail=f"Modèle '{slug}' non trouvé")

    config = get_bike_model_config(session, model.id)
    return {
        "id": model.id,
        "slug": model.slug,
        "brand": model.brand,
        "name": model.name,
        "engine_cc": model.engine_cc,
        "image_url": model.image_url,
        "active": model.active,
        "created_at": model.created_at,
        "config": {
            "warranty_years": config.warranty_years,
            "warranty_value_per_year": config.warranty_value_per_year,
            "mechanical_wear_per_km": config.mechanical_wear_per_km,
            "condition_risk_per_km": config.condition_risk_per_km,
            "short_term_km_threshold": config.short_term_km_threshold,
        } if config else None,
    }


@app.get("/api/bike-models/{slug}/variants")
def get_model_variants(slug: str, session: Session = Depends(get_session)):
    """Catalogue des variantes d'un modele."""
    model = resolve_bike_model(slug, session)
    variants = get_bike_variants(session, model.id)
    return [
        {
            "id": v.id,
            "variant_name": v.variant_name,
            "color": v.color,
            "wheel_type": v.wheel_type,
            "new_price": v.new_price,
            "color_hex": v.color_hex,
        }
        for v in variants
    ]


@app.get("/api/bike-models/{slug}/accessories")
def get_model_accessories(slug: str, session: Session = Depends(get_session)):
    """Patterns d'accessoires d'un modele."""
    model = resolve_bike_model(slug, session)
    patterns = get_accessory_patterns(session, model.id)

    seen_groups: set[str] = set()
    result = []
    for p in patterns:
        group = p.dedup_group
        if group and group in seen_groups:
            continue
        if group:
            seen_groups.add(group)
        result.append({
            "id": p.id,
            "name": p.name,
            "category": p.category,
            "regex_pattern": p.regex_pattern,
            "new_price": p.new_price,
            "depreciation_rate": p.depreciation_rate,
            "dedup_group": p.dedup_group,
            "sort_order": p.sort_order,
        })
    return result


@app.get("/api/ads/{ad_id}/model-slug")
def get_ad_model_slug(ad_id: int, session: Session = Depends(get_session)):
    """Retourne le slug du modele d'une annonce (pour redirections frontend)."""
    ad = session.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")
    if not ad.bike_model_id:
        return {"ad_id": ad_id, "slug": None}
    model = session.get(BikeModel, ad.bike_model_id)
    return {"ad_id": ad_id, "slug": model.slug if model else None}


@app.post("/api/bike-models/import")
def import_bike_model(session: Session = Depends(get_session)):
    """Placeholder: Import en masse d'un modele."""
    raise HTTPException(status_code=501, detail="Pas encore implémenté")


@app.post("/api/bike-models/{slug}/clone")
def clone_bike_model(slug: str, session: Session = Depends(get_session)):
    """Placeholder: Cloner un modele existant."""
    raise HTTPException(status_code=501, detail="Pas encore implémenté")


# ─── Model-scoped Ad Endpoints ──────────────────────────────────────────────

@app.get("/api/bike-models/{slug}/ads")
def list_ads_scoped(
    slug: str,
    variant: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    model = resolve_bike_model(slug, session)

    conditions = [
        Ad.superseded_by == None,  # noqa: E711
        Ad.bike_model_id == model.id,
    ]
    if variant:
        conditions.append(Ad.variant == variant)
    if min_price is not None:
        conditions.append(Ad.price >= min_price)
    if max_price is not None:
        conditions.append(Ad.price <= max_price)

    count_stmt = select(func.count()).select_from(Ad).where(*conditions)
    total = session.exec(count_stmt).one()

    stmt = (
        select(Ad)
        .options(selectinload(Ad.accessories), selectinload(Ad.images))
        .where(*conditions)
        .order_by(Ad.price)
        .offset(offset)
        .limit(limit)
    )
    ads = session.exec(stmt).all()

    results = []
    for ad in ads:
        d = _ad_to_dict(ad)
        d["accessories"] = [
            {"name": a.name, "category": a.category, "source": a.source,
             "estimated_new_price": a.estimated_new_price, "estimated_used_price": a.estimated_used_price}
            for a in ad.accessories
        ]
        d["images"] = [img.url for img in sorted(ad.images, key=lambda x: x.position)]
        results.append(d)

    return {"total": total, "ads": results}


@app.get("/api/bike-models/{slug}/ads/{ad_id}")
def get_ad_scoped(slug: str, ad_id: int, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    ad = session.get(Ad, ad_id)
    if not ad or ad.bike_model_id != model.id:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")

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


@app.post("/api/bike-models/{slug}/ads/preview")
def preview_ad_scoped(slug: str, req: AddAdRequest, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    overrides = get_accessory_overrides(session, model.id)

    try:
        if settings.lbc_service_url:
            from . import lbc_client
            ad_data = lbc_client.fetch_ad(req.url, price_overrides=overrides)
        else:
            from .extractor import fetch_ad, get_lbc_client
            client = get_lbc_client()
            ad_data = fetch_ad(req.url, model.id, session, client=client, price_overrides=overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur extraction : {e}")

    return ad_data


@app.post("/api/bike-models/{slug}/ads/confirm")
def confirm_ad_scoped(slug: str, req: ConfirmAdRequest, session: Session = Depends(get_session)):
    from .extractor import _estimate_new_price

    model = resolve_bike_model(slug, session)
    ad_data = req.ad_data.model_dump(exclude_unset=True)
    ad_data["bike_model_id"] = model.id

    new_price = _estimate_new_price(
        model.id, ad_data.get("variant"), ad_data.get("color"), ad_data.get("wheel_type"), session
    )
    if new_price:
        ad_data["estimated_new_price"] = new_price

    ad_id = upsert_ad(session, ad_data)
    return {"id": ad_id, "subject": ad_data.get("subject"), "price": ad_data.get("price")}


@app.post("/api/bike-models/{slug}/ads")
def add_ad_scoped(slug: str, req: AddAdRequest, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    overrides = get_accessory_overrides(session, model.id)

    try:
        if settings.lbc_service_url:
            from . import lbc_client
            ad_data = lbc_client.fetch_ad(req.url, price_overrides=overrides)
        else:
            from .extractor import fetch_ad, get_lbc_client
            client = get_lbc_client()
            ad_data = fetch_ad(req.url, model.id, session, client=client, price_overrides=overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur extraction : {e}")

    ad_data["bike_model_id"] = model.id
    ad_id = upsert_ad(session, ad_data)
    return {"id": ad_id, "subject": ad_data.get("subject"), "price": ad_data.get("price")}


@app.delete("/api/bike-models/{slug}/ads/{ad_id}")
def delete_ad_scoped(slug: str, ad_id: int, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    ad = session.get(Ad, ad_id)
    if not ad or ad.bike_model_id != model.id:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")
    session.delete(ad)
    session.commit()
    return {"deleted": ad_id}


@app.patch("/api/bike-models/{slug}/ads/{ad_id}")
def update_ad_scoped(slug: str, ad_id: int, req: UpdateAdRequest, session: Session = Depends(get_session)):
    from .extractor import _estimate_new_price

    model = resolve_bike_model(slug, session)
    ad = session.get(Ad, ad_id)
    if not ad or ad.bike_model_id != model.id:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")

    if req.color is not None:
        ad.color = req.color
    if req.variant is not None:
        ad.variant = req.variant
    if req.wheel_type is not None:
        ad.wheel_type = req.wheel_type
    if req.sold is not None:
        ad.sold = req.sold

    if req.variant is not None or req.color is not None or req.wheel_type is not None:
        new_price = _estimate_new_price(model.id, ad.variant, ad.color, ad.wheel_type, session)
        if new_price:
            ad.estimated_new_price = new_price

    ad.updated_at = datetime.now().isoformat()

    if req.accessories is not None:
        _replace_accessories(session, ad_id, req.accessories)
        ad.accessories_manual = 1

    session.commit()
    return {"updated": ad_id}


# ─── Model-scoped Merge / Price History ─────────────────────────────────────

@app.post("/api/bike-models/{slug}/ads/merge")
def merge_ad_scoped(slug: str, req: MergeAdRequest, session: Session = Depends(get_session)):
    from .extractor import _estimate_new_price

    model = resolve_bike_model(slug, session)

    old_ad = session.get(Ad, req.old_ad_id)
    if not old_ad:
        raise HTTPException(status_code=404, detail="Ancienne annonce non trouvée")

    new_data = req.new_ad_data.model_dump(exclude_unset=True)
    new_data["bike_model_id"] = model.id

    new_id = new_data["id"]
    old_price = old_ad.price or 0
    new_price_val = new_data.get("price") or 0

    estimated = _estimate_new_price(
        model.id, new_data.get("variant"), new_data.get("color"), new_data.get("wheel_type"), session
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


@app.get("/api/bike-models/{slug}/ads/{ad_id}/price-history")
def get_price_history_scoped(slug: str, ad_id: int, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    ad = session.get(Ad, ad_id)
    if not ad or ad.bike_model_id != model.id:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")

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


@app.post("/api/bike-models/{slug}/ads/{ad_id}/confirm-price")
def confirm_price_scoped(slug: str, ad_id: int, req: ConfirmPriceRequest, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    ad = session.get(Ad, ad_id)
    if not ad or ad.bike_model_id != model.id:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")

    old_price = ad.price or 0
    new_price = req.new_price
    if old_price == new_price:
        return {"id": ad_id, "price_delta": 0, "message": "Prix inchangé"}

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


# ─── Model-scoped Accessory Catalog ─────────────────────────────────────────

@app.get("/api/bike-models/{slug}/accessory-catalog")
def get_accessory_catalog_scoped(slug: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    overrides = get_accessory_overrides(session, model.id)
    patterns = get_accessory_patterns(session, model.id)

    seen_groups: set[str] = set()
    catalog = []
    for p in patterns:
        group = p.dedup_group
        if group and group in seen_groups:
            continue
        if group:
            seen_groups.add(group)
        effective_price = overrides.get(group, p.new_price) if group else p.new_price
        catalog.append({
            "name": p.name,
            "category": p.category,
            "estimated_new_price": effective_price,
            "default_new_price": p.new_price,
            "estimated_used_price": int(effective_price * p.depreciation_rate),
            "group": group or p.name,
            "has_override": (group in overrides) if group else False,
        })
    return catalog


@app.patch("/api/bike-models/{slug}/accessory-catalog/{group}")
def update_catalog_price_scoped(slug: str, group: str, req: UpdateCatalogPriceRequest, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    patterns = get_accessory_patterns(session, model.id)
    valid_groups = {p.dedup_group for p in patterns if p.dedup_group}
    if group not in valid_groups:
        raise HTTPException(status_code=404, detail=f"Groupe '{group}' inconnu")

    set_accessory_override(session, model.id, group, req.estimated_new_price)
    results = refresh_accessories(session, model.id)
    return {"group": group, "estimated_new_price": req.estimated_new_price, "ads_refreshed": len(results)}


@app.delete("/api/bike-models/{slug}/accessory-catalog/{group}/override")
def reset_catalog_price_scoped(slug: str, group: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    patterns = get_accessory_patterns(session, model.id)
    valid_groups = {p.dedup_group for p in patterns if p.dedup_group}
    if group not in valid_groups:
        raise HTTPException(status_code=404, detail=f"Groupe '{group}' inconnu")

    delete_accessory_override(session, model.id, group)
    results = refresh_accessories(session, model.id)
    return {"group": group, "reset": True, "ads_refreshed": len(results)}


@app.post("/api/bike-models/{slug}/accessories/refresh")
def refresh_all_accessories_scoped(slug: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    skipped = session.exec(
        select(func.count()).select_from(Ad)
        .where(Ad.bike_model_id == model.id, Ad.accessories_manual == 1)
    ).one()
    results = refresh_accessories(session, model.id, skip_manual=True)
    return {
        "ads_refreshed": len(results),
        "ads_skipped_manual": skipped,
        "details": results,
    }


@app.post("/api/bike-models/{slug}/ads/{ad_id}/refresh-accessories")
def refresh_ad_accessories_scoped(slug: str, ad_id: int, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    ad = session.get(Ad, ad_id)
    if not ad or ad.bike_model_id != model.id:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")

    ad.accessories_manual = 0
    session.commit()

    results = refresh_accessories(session, model.id, ad_ids=[ad_id])
    detail = results[0] if results else {"id": ad_id, "before": 0, "after": 0}
    return detail


# ─── Model-scoped Check Online / Check Prices ───────────────────────────────

@app.post("/api/bike-models/{slug}/ads/check-online")
def check_ads_online_scoped(slug: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    ads = session.exec(
        select(Ad).where(Ad.sold == 0, Ad.bike_model_id == model.id)
    ).all()
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


@app.post("/api/bike-models/{slug}/ads/{ad_id}/check-online")
def check_ad_online_scoped(slug: str, ad_id: int, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    ad = session.get(Ad, ad_id)
    if not ad or ad.bike_model_id != model.id:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")

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


@app.post("/api/bike-models/{slug}/ads/check-prices")
def check_prices_scoped(slug: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    ads = session.exec(
        select(Ad).where(Ad.sold == 0, Ad.bike_model_id == model.id)
    ).all()
    if not ads:
        return {"price_changes": [], "checked_count": 0, "unchanged_count": 0}

    # Charger les configs de recherche du modele
    search_cfgs = get_search_configs(session, model.id)

    all_search_results = []
    for cfg in search_cfgs:
        if settings.lbc_service_url:
            from . import lbc_client
            r = lbc_client.search(keyword=cfg.keyword, min_cc=cfg.min_cc, max_cc=cfg.max_cc)
        else:
            from .crawler import search_all_ads
            r = search_all_ads(keyword=cfg.keyword, min_cc=cfg.min_cc, max_cc=cfg.max_cc)
        all_search_results.extend(r.get("ads", []))

    # Fallback si aucune config de recherche
    if not search_cfgs:
        if settings.lbc_service_url:
            from . import lbc_client
            r = lbc_client.search()
        else:
            from .crawler import search_all_ads
            r = search_all_ads()
        all_search_results.extend(r.get("ads", []))

    lbc_prices = {ad_data["id"]: ad_data.get("price") for ad_data in all_search_results}

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


# ─── Model-scoped Stats / Rankings ──────────────────────────────────────────

@app.get("/api/bike-models/{slug}/stats")
def get_stats_scoped(slug: str, session: Session = Depends(get_session)):
    import statistics as stats_mod

    model = resolve_bike_model(slug, session)

    base_conditions = [Ad.superseded_by == None, Ad.bike_model_id == model.id]  # noqa: E711

    price_row = session.exec(
        select(
            func.count(Ad.id),
            func.count(Ad.price),
            func.min(Ad.price),
            func.max(Ad.price),
            func.avg(Ad.price),
        ).where(*base_conditions)
    ).one()
    total_count, price_count, price_min, price_max, price_avg = price_row

    prices = sorted([
        p for p in session.exec(
            select(Ad.price).where(*base_conditions, Ad.price != None)  # noqa: E711
        ).all()
        if p is not None
    ])
    price_median = stats_mod.median(prices) if prices else None

    km_row = session.exec(
        select(
            func.min(Ad.mileage_km),
            func.max(Ad.mileage_km),
            func.avg(Ad.mileage_km),
        ).where(*base_conditions, Ad.mileage_km != None)  # noqa: E711
    ).one()
    km_min, km_max, km_avg = km_row

    kms = sorted([
        k for k in session.exec(
            select(Ad.mileage_km).where(*base_conditions, Ad.mileage_km != None)  # noqa: E711
        ).all()
    ])

    year_row = session.exec(
        select(func.min(Ad.year), func.max(Ad.year))
        .where(*base_conditions, Ad.year != None)  # noqa: E711
    ).one()
    year_min, year_max = year_row

    variant_rows = session.exec(
        select(
            func.coalesce(Ad.variant, "Non detectee"),
            func.count(Ad.id),
        ).where(*base_conditions)
        .group_by(func.coalesce(Ad.variant, "Non detectee"))
    ).all()

    dept_rows = session.exec(
        select(
            func.coalesce(Ad.department, "Inconnu"),
            func.count(Ad.id),
        ).where(*base_conditions)
        .group_by(func.coalesce(Ad.department, "Inconnu"))
        .order_by(func.count(Ad.id).desc())
        .limit(15)
    ).all()

    acc_rows = session.exec(
        select(AdAccessory.name, func.count(AdAccessory.id))
        .join(Ad, AdAccessory.ad_id == Ad.id)
        .where(*base_conditions)
        .group_by(AdAccessory.name)
        .order_by(func.count(AdAccessory.id).desc())
        .limit(15)
    ).all()

    top_accessories = [
        {"name": name, "count": count, "pct": round(count / total_count * 100, 1) if total_count else 0}
        for name, count in acc_rows
    ]

    return {
        "count": total_count,
        "price": {
            "min": price_min,
            "max": price_max,
            "mean": round(float(price_avg), 0) if price_avg is not None else None,
            "median": price_median,
        },
        "mileage": {
            "min": km_min,
            "max": km_max,
            "mean": round(float(km_avg), 0) if km_avg is not None else None,
        },
        "years": {"min": year_min, "max": year_max},
        "variants": [{"name": v, "count": c} for v, c in sorted(variant_rows, key=lambda x: -x[1])],
        "departments": [{"name": d, "count": c} for d, c in dept_rows],
        "top_accessories": top_accessories,
        "prices_list": prices,
        "mileages_list": kms,
    }


@app.get("/api/bike-models/{slug}/rankings")
def get_rankings_scoped(slug: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    return rank_ads(model.id, session)


# ─── Model-scoped Crawl ─────────────────────────────────────────────────────

@app.get("/api/bike-models/{slug}/crawl/search")
def crawl_search_scoped(slug: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)

    # Charger les configs de recherche du modele
    search_cfgs = get_search_configs(session, model.id)

    # Charger les prix catalogue pour la detection d'annonces neuves
    variants = get_bike_variants(session, model.id)
    catalog_prices = [v.new_price for v in variants] if variants else None

    all_results_ads = []
    try:
        for cfg in search_cfgs:
            if settings.lbc_service_url:
                from . import lbc_client
                r = lbc_client.search(keyword=cfg.keyword, min_cc=cfg.min_cc, max_cc=cfg.max_cc)
            else:
                from .crawler import search_all_ads
                r = search_all_ads(keyword=cfg.keyword, min_cc=cfg.min_cc, max_cc=cfg.max_cc)
            all_results_ads.extend(r.get("ads", []))

        # Fallback si aucune config
        if not search_cfgs:
            if settings.lbc_service_url:
                from . import lbc_client
                r = lbc_client.search()
            else:
                from .crawler import search_all_ads
                r = search_all_ads()
            all_results_ads.extend(r.get("ads", []))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur recherche LeBonCoin : {e}")

    # Deduplication par ID (plusieurs configs peuvent ramener les memes annonces)
    seen_ids = set()
    unique_ads = []
    for ad in all_results_ads:
        if ad["id"] not in seen_ids:
            seen_ids.add(ad["id"])
            unique_ads.append(ad)
    results = {"ads": unique_ads, "total": len(unique_ads)}

    existing_ids = {
        row for row in session.exec(select(Ad.id)).all()
    }

    superseded_ids = {
        row for row in session.exec(
            select(Ad.previous_ad_id).where(Ad.previous_ad_id.is_not(None))
        ).all()
    }

    # Annonces du meme modele pour la detection de reposts
    db_ads = session.exec(select(Ad).where(Ad.bike_model_id == model.id)).all()
    db_ads_data = [
        {"id": a.id, "city": a.city, "department": a.department,
         "price": a.price, "subject": a.subject, "sold": a.sold}
        for a in db_ads
        if a.id not in superseded_ids
    ]

    db_prices = {a.id: a.price for a in db_ads}

    for ad in results["ads"]:
        ad["exists_in_db"] = ad["id"] in existing_ids
        ad["possible_repost_of"] = None
        ad["price_changed"] = False
        ad["current_db_price"] = None
        ad["price_delta"] = None

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

    # CRITICAL: Ne clore que les sessions actives de CE modele
    active_sessions = session.exec(
        select(CrawlSession).where(
            CrawlSession.status == "active",
            CrawlSession.bike_model_id == model.id,
        )
    ).all()
    for s in active_sessions:
        s.status = "done"

    crawl_session = CrawlSession(status="active", total_ads=len(results["ads"]), bike_model_id=model.id)
    session.add(crawl_session)
    session.flush()

    for i, ad in enumerate(results["ads"]):
        is_new = detect_new_listing_light(
            subject=ad.get("subject"),
            price=ad.get("price"),
            seller_type=ad.get("seller_type"),
            catalog_prices=catalog_prices,
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


@app.get("/api/bike-models/{slug}/crawl/sessions/active")
def get_active_crawl_session_scoped(slug: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)

    crawl_session = session.exec(
        select(CrawlSession)
        .where(CrawlSession.status == "active", CrawlSession.bike_model_id == model.id)
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


@app.patch("/api/bike-models/{slug}/crawl/sessions/{session_id}/ads/{ad_id}")
def update_crawl_session_ad_scoped(slug: str, session_id: int, ad_id: int, req: UpdateCrawlAdAction, session: Session = Depends(get_session)):
    resolve_bike_model(slug, session)  # Validate slug

    if req.action not in ('confirmed', 'skipped', 'error'):
        raise HTTPException(status_code=400, detail="Action invalide")

    crawl_ad = session.exec(
        select(CrawlSessionAd)
        .where(CrawlSessionAd.session_id == session_id, CrawlSessionAd.ad_id == ad_id)
    ).first()
    if crawl_ad:
        crawl_ad.action = req.action

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


@app.delete("/api/bike-models/{slug}/crawl/sessions/{session_id}")
def close_crawl_session_scoped(slug: str, session_id: int, session: Session = Depends(get_session)):
    resolve_bike_model(slug, session)  # Validate slug
    cs = session.get(CrawlSession, session_id)
    if cs:
        cs.status = "done"
        session.commit()
    return {"closed": session_id}


@app.delete("/api/bike-models/{slug}/crawl/sessions/{session_id}/ads/{ad_id}")
def remove_crawl_session_ad_scoped(slug: str, session_id: int, ad_id: int, session: Session = Depends(get_session)):
    resolve_bike_model(slug, session)  # Validate slug

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


@app.post("/api/bike-models/{slug}/crawl/extract")
def crawl_extract_scoped(slug: str, req: ExtractRequest, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    overrides = get_accessory_overrides(session, model.id)

    try:
        if settings.lbc_service_url:
            from . import lbc_client
            ad_data = lbc_client.fetch_ad(req.url, price_overrides=overrides)
        else:
            from .extractor import fetch_ad, get_lbc_client
            client = get_lbc_client()
            ad_data = fetch_ad(req.url, model.id, session, client=client, price_overrides=overrides)
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

    potential_duplicates = _find_potential_duplicates(session, ad_data, req.ad_id, model.id)

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
        bike_model_id=model.id,
        session=session,
    )

    # Mettre a jour le CrawlSessionAd
    active_cs = session.exec(
        select(CrawlSession).where(
            CrawlSession.status == "active",
            CrawlSession.bike_model_id == model.id,
        )
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


# ─── Model-scoped Export ────────────────────────────────────────────────────

@app.get("/api/bike-models/{slug}/export")
def export_csv_scoped(slug: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)

    # Charger les annonces du modele
    statement = (
        select(Ad)
        .options(selectinload(Ad.accessories), selectinload(Ad.images))
        .where(Ad.bike_model_id == model.id, Ad.superseded_by == None)  # noqa: E711
        .order_by(Ad.price)
    )
    ads_orm = session.exec(statement).all()

    ads = []
    for ad in ads_orm:
        d = _ad_to_dict(ad)
        d["accessories"] = [
            {"name": a.name, "category": a.category, "source": a.source,
             "estimated_new_price": a.estimated_new_price, "estimated_used_price": a.estimated_used_price}
            for a in ad.accessories
        ]
        d["images"] = [img.url for img in sorted(ad.images, key=lambda x: x.position)]
        ads.append(d)

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
        headers={"Content-Disposition": f"attachment; filename=export_{slug}.csv"},
    )


# ─── Duplicate Detection (scoped by model) ──────────────────────────────────

def _extract_significant_words(text: str, min_len: int = 4, extra_stopwords: set[str] | None = None) -> set[str]:
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
    if extra_stopwords:
        stopwords |= extra_stopwords
    return {w for w in words if len(w) >= min_len and w not in stopwords}


def _find_potential_duplicates(session: Session, ad_data: dict, exclude_id: int, bike_model_id: int) -> list[dict]:
    new_price = ad_data.get("price") or 0
    new_city = (ad_data.get("city") or "").lower().strip()

    if not new_city:
        return []

    # Pre-filtre SQL : meme ville + prix ±15% + meme modele
    city_conditions = [
        Ad.id != exclude_id,
        func.lower(Ad.city) == new_city,
        Ad.bike_model_id == bike_model_id,
    ]
    if new_price:
        city_conditions.append(Ad.price >= new_price * 0.85)
        city_conditions.append(Ad.price <= new_price * 1.15)
    ads = session.exec(select(Ad).where(*city_conditions)).all()

    if not ads:
        return []

    # Charger les mots-cles dynamiques du modele pour les stopwords
    model = session.get(BikeModel, bike_model_id)
    extra_stops = set()
    if model:
        for word in (model.brand or "").lower().split():
            if len(word) >= 3:
                extra_stops.add(word)
        for word in (model.name or "").lower().split():
            if len(word) >= 3:
                extra_stops.add(word)

    candidate_ids = [ad.id for ad in ads]
    candidate_accs = session.exec(
        select(AdAccessory).where(AdAccessory.ad_id.in_(candidate_ids))
    ).all()
    acc_by_ad: dict[int, set[str]] = {}
    for a in candidate_accs:
        acc_by_ad.setdefault(a.ad_id, set()).add(a.name)
    new_color = (ad_data.get("color") or "").lower()
    new_km = ad_data.get("mileage_km") or 0
    new_acc_names = {a["name"] for a in ad_data.get("accessories", [])}
    new_body_words = _extract_significant_words(ad_data.get("body") or "", extra_stopwords=extra_stops)

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
            db_body_words = _extract_significant_words(ad.body or "", extra_stopwords=extra_stops)
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


# ═══════════════════════════════════════════════════════════════════════════════
# Backward-compatible route aliases
#
# Ces routes fonctionnent quand un seul modele actif existe.
# Si plusieurs modeles sont actifs, elles renvoient 400 avec un message
# invitant a utiliser /api/bike-models/{slug}/...
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/ads")
def list_ads_compat(
    variant: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    model = _resolve_single_model(session)
    return list_ads_scoped(model.slug, variant, min_price, max_price, limit, offset, session)


@app.get("/api/ads/{ad_id}")
def get_ad_compat(ad_id: int, session: Session = Depends(get_session)):
    ad = session.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")

    # Route non scopee : pas de check bike_model_id
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
def preview_ad_compat(req: AddAdRequest, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return preview_ad_scoped(model.slug, req, session)


@app.post("/api/ads/confirm")
def confirm_ad_compat(req: ConfirmAdRequest, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return confirm_ad_scoped(model.slug, req, session)


@app.post("/api/ads")
def add_ad_compat(req: AddAdRequest, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return add_ad_scoped(model.slug, req, session)


@app.delete("/api/ads/{ad_id}")
def delete_ad_compat(ad_id: int, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return delete_ad_scoped(model.slug, ad_id, session)


@app.patch("/api/ads/{ad_id}")
def update_ad_compat(ad_id: int, req: UpdateAdRequest, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return update_ad_scoped(model.slug, ad_id, req, session)


@app.post("/api/ads/merge")
def merge_ad_compat(req: MergeAdRequest, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return merge_ad_scoped(model.slug, req, session)


@app.get("/api/ads/{ad_id}/price-history")
def get_price_history_compat(ad_id: int, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return get_price_history_scoped(model.slug, ad_id, session)


@app.post("/api/ads/{ad_id}/confirm-price")
def confirm_price_compat(ad_id: int, req: ConfirmPriceRequest, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return confirm_price_scoped(model.slug, ad_id, req, session)


@app.get("/api/accessory-catalog")
def get_accessory_catalog_compat(session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return get_accessory_catalog_scoped(model.slug, session)


@app.patch("/api/accessory-catalog/{group}")
def update_catalog_price_compat(group: str, req: UpdateCatalogPriceRequest, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return update_catalog_price_scoped(model.slug, group, req, session)


@app.delete("/api/accessory-catalog/{group}/override")
def reset_catalog_price_compat(group: str, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return reset_catalog_price_scoped(model.slug, group, session)


@app.post("/api/accessories/refresh")
def refresh_all_accessories_compat(session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return refresh_all_accessories_scoped(model.slug, session)


@app.post("/api/ads/{ad_id}/refresh-accessories")
def refresh_ad_accessories_compat(ad_id: int, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return refresh_ad_accessories_scoped(model.slug, ad_id, session)


@app.post("/api/ads/check-online")
def check_ads_online_compat(session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return check_ads_online_scoped(model.slug, session)


@app.post("/api/ads/{ad_id}/check-online")
def check_ad_online_compat(ad_id: int, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return check_ad_online_scoped(model.slug, ad_id, session)


@app.post("/api/ads/check-prices")
def check_prices_compat(session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return check_prices_scoped(model.slug, session)


@app.get("/api/stats")
def get_stats_compat(session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return get_stats_scoped(model.slug, session)


@app.get("/api/rankings")
def get_rankings_compat(session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return get_rankings_scoped(model.slug, session)


@app.get("/api/crawl/search")
def crawl_search_compat(session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return crawl_search_scoped(model.slug, session)


@app.get("/api/crawl/sessions/active")
def get_active_crawl_session_compat(session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return get_active_crawl_session_scoped(model.slug, session)


@app.patch("/api/crawl/sessions/{session_id}/ads/{ad_id}")
def update_crawl_session_ad_compat(session_id: int, ad_id: int, req: UpdateCrawlAdAction, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return update_crawl_session_ad_scoped(model.slug, session_id, ad_id, req, session)


@app.delete("/api/crawl/sessions/{session_id}")
def close_crawl_session_compat(session_id: int, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return close_crawl_session_scoped(model.slug, session_id, session)


@app.delete("/api/crawl/sessions/{session_id}/ads/{ad_id}")
def remove_crawl_session_ad_compat(session_id: int, ad_id: int, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return remove_crawl_session_ad_scoped(model.slug, session_id, ad_id, session)


@app.post("/api/crawl/extract")
def crawl_extract_compat(req: ExtractRequest, session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return crawl_extract_scoped(model.slug, req, session)


@app.get("/api/export")
def export_csv_compat(session: Session = Depends(get_session)):
    model = _resolve_single_model(session)
    return export_csv_scoped(model.slug, session)
