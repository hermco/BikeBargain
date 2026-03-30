"""
Database engine et session management.

PostgreSQL uniquement, via DATABASE_URL (fichier .env ou variable d'environnement).
"""

import re
import json
import threading
from pathlib import Path
from datetime import datetime

from sqlmodel import SQLModel, Session, create_engine, select, delete
from sqlalchemy import func
from sqlalchemy.orm import selectinload

# Import des modeles pour enregistrer les tables dans SQLModel.metadata
from .models import (  # noqa: F401
    Ad, AdAttribute, AdImage, AdAccessory,
    CrawlSession, CrawlSessionAd, AdPriceHistory, AccessoryOverride,
    BikeModel, BikeModelConfig, BikeVariant, BikeConsumable,
    BikeAccessoryPattern, BikeVariantPattern, BikeExclusionPattern,
    BikeNewListingPattern, BikeSearchConfig,
    AccessoryCatalogGroup, AccessoryCatalogVariant,
)
from .config import get_settings

PROJECT_ROOT = Path(__file__).resolve().parent.parent

settings = get_settings()


def get_database_url() -> str:
    """Retourne l'URL de la base de donnees (pour Alembic et compatibilite)."""
    return settings.database_url_normalized


engine = create_engine(get_database_url(), echo=settings.debug)


# ─── Catalog cache (thread-safe) ────────────────────────────────────────────
_catalog_cache: list[dict] | None = None
_catalog_cache_lock = threading.Lock()


def get_catalog_groups(session: Session) -> list[dict]:
    """Charge le catalogue depuis la DB (avec cache thread-safe)."""
    global _catalog_cache
    with _catalog_cache_lock:
        if _catalog_cache is not None:
            return _catalog_cache

    groups = session.exec(
        select(AccessoryCatalogGroup)
        .options(selectinload(AccessoryCatalogGroup.variants))
        .order_by(AccessoryCatalogGroup.category)
    ).all()

    result = []
    for g in groups:
        result.append({
            "id": g.id,
            "group_key": g.group_key,
            "model_id": g.model_id,
            "name": g.name,
            "category": g.category,
            "expressions": g.expressions or [],
            "default_price": g.default_price,
            "last_match_count": g.last_match_count,
            "created_at": g.created_at,
            "updated_at": g.updated_at,
            "variants": [
                {
                    "id": v.id,
                    "group_id": v.group_id,
                    "name": v.name,
                    "qualifiers": v.qualifiers or [],
                    "brands": v.brands or [],
                    "product_aliases": v.product_aliases or [],
                    "optional_words": v.optional_words or [],
                    "regex_override": v.regex_override,
                    "estimated_new_price": v.estimated_new_price,
                    "sort_order": v.sort_order,
                    "sort_order_manual": v.sort_order_manual,
                    "notes": v.notes,
                    "created_at": v.created_at,
                    "updated_at": v.updated_at,
                }
                for v in sorted(g.variants, key=lambda v: v.sort_order)
            ],
        })

    with _catalog_cache_lock:
        _catalog_cache = result
    return result


def invalidate_catalog_cache() -> None:
    """Invalide le cache catalogue. Thread-safe."""
    global _catalog_cache
    with _catalog_cache_lock:
        _catalog_cache = None


def get_session():
    """Generateur de session pour FastAPI Depends."""
    with Session(engine) as session:
        yield session


def run_migrations():
    """Execute les migrations Alembic (alembic upgrade head)."""
    from alembic.config import Config
    from alembic import command

    alembic_cfg = Config(str(PROJECT_ROOT / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")


# ─── CRUD ────────────────────────────────────────────────────────────────────

# Champs de la table ads qu'on peut inserer/mettre a jour depuis un dict
_AD_FIELDS = [
    "id", "url", "subject", "body", "price", "brand", "model",
    "year", "mileage_km", "engine_size_cc", "fuel_type", "color",
    "category_name", "ad_type", "status", "has_phone",
    "city", "zipcode", "department", "region", "lat", "lng",
    "seller_type", "first_publication_date", "expiration_date",
    "variant", "wheel_type", "estimated_new_price",
    "previous_ad_id", "bike_model_id",
]

_SENTINEL = object()


def upsert_ad(session: Session, ad_data: dict, *, auto_commit: bool = True) -> int:
    """Insere ou met a jour une annonce. Retourne l'id.

    Si auto_commit=False, ne commit pas la transaction (utile pour
    regrouper plusieurs operations dans un seul commit).
    """
    now = datetime.now().isoformat()

    existing = session.get(Ad, ad_data["id"])

    if existing:
        for f in _AD_FIELDS:
            if f != "id":
                val = ad_data.get(f, _SENTINEL)
                if val is not _SENTINEL:
                    setattr(existing, f, val)
        existing.updated_at = now
        ad = existing
    else:
        ad_fields = {f: ad_data.get(f) for f in _AD_FIELDS}
        ad_fields["extracted_at"] = now
        ad_fields["updated_at"] = now
        ad = Ad(**ad_fields)
        session.add(ad)
        session.flush()

    # Attributs
    if "attributes" in ad_data:
        _replace_attributes(session, ad.id, ad_data["attributes"])

    # Images
    if "images" in ad_data:
        _replace_images(session, ad.id, ad_data["images"])

    # Accessoires
    if "accessories" in ad_data:
        _replace_accessories(session, ad.id, ad_data["accessories"])

    # Flag for crosscheck if few accessories detected despite long description
    accessories = ad_data.get("accessories", [])
    if len(accessories) < 2 and len(ad.body or "") > 200:
        ad.needs_crosscheck = 1
    else:
        ad.needs_crosscheck = 0

    if auto_commit:
        session.commit()
        session.refresh(ad)
    else:
        session.flush()
    return ad.id


def _replace_attributes(session: Session, ad_id: int, attributes: list[dict]) -> None:
    session.exec(delete(AdAttribute).where(AdAttribute.ad_id == ad_id))
    session.flush()
    for attr in attributes:
        session.add(AdAttribute(
            ad_id=ad_id, key=attr["key"],
            value=attr.get("value"), value_label=attr.get("value_label"),
        ))


def _replace_images(session: Session, ad_id: int, images: list[str]) -> None:
    session.exec(delete(AdImage).where(AdImage.ad_id == ad_id))
    session.flush()
    for i, url in enumerate(images):
        session.add(AdImage(ad_id=ad_id, url=url, position=i))


def _replace_accessories(session: Session, ad_id: int, accessories: list[dict]) -> None:
    session.exec(delete(AdAccessory).where(AdAccessory.ad_id == ad_id))
    session.flush()
    for acc in accessories:
        session.add(AdAccessory(
            ad_id=ad_id, name=acc["name"],
            category=acc.get("category"), source=acc.get("source"),
            estimated_new_price=acc.get("estimated_new_price", 0),
            estimated_used_price=acc.get("estimated_used_price", 0),
        ))


def get_all_ads(session: Session, *, include_superseded: bool = False) -> list[dict]:
    """Retourne toutes les annonces avec leurs accessoires et images."""
    statement = (
        select(Ad)
        .options(selectinload(Ad.accessories), selectinload(Ad.images))
        .order_by(Ad.price)
    )
    if not include_superseded:
        statement = statement.where(Ad.superseded_by == None)  # noqa: E711

    ads = session.exec(statement).all()
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
    return results


def _ad_to_dict(ad: Ad) -> dict:
    """Convertit un Ad en dict (colonnes uniquement, sans relations)."""
    return {c.name: getattr(ad, c.name) for c in Ad.__table__.columns}


def refresh_accessories(
    session: Session,
    bike_model_id: int,
    *,
    skip_manual: bool = False,
    ad_ids: list[int] | None = None,
) -> list[dict]:
    """Re-detecte les accessoires en base via le catalogue DB pour un modele donne."""
    from .accessories import detect_accessories
    from .catalog import build_patterns_from_catalog

    catalog_groups = get_catalog_groups(session)
    patterns = build_patterns_from_catalog(catalog_groups)

    # Pre-charger les patterns d'exclusion pour le modele
    exclusions = get_exclusion_patterns(session, bike_model_id)

    statement = select(Ad).where(Ad.bike_model_id == bike_model_id)
    if skip_manual:
        statement = statement.where(Ad.accessories_manual == 0)
    if ad_ids is not None:
        statement = statement.where(Ad.id.in_(ad_ids))

    ads = session.exec(statement.options(selectinload(Ad.accessories))).all()
    results = []

    for ad in ads:
        before = len(ad.accessories)
        detected = detect_accessories(ad.body or "", patterns=patterns, exclusions=exclusions)

        session.exec(delete(AdAccessory).where(AdAccessory.ad_id == ad.id))
        session.flush()

        for acc in detected:
            session.add(AdAccessory(
                ad_id=ad.id, name=acc["name"],
                category=acc.get("category"), source=acc.get("source"),
                estimated_new_price=acc.get("estimated_new_price", 0),
                estimated_used_price=acc.get("estimated_used_price", 0),
            ))

        results.append({
            "id": ad.id, "city": ad.city,
            "before": before, "after": len(detected),
        })

    session.commit()

    _update_group_match_counts(session, catalog_groups)

    for r in results:
        ad = session.get(Ad, r["id"])
        if not ad:
            continue
        if r["after"] < r["before"]:
            ad.needs_crosscheck = 1
        elif r["after"] >= r["before"] and ad.needs_crosscheck == 1:
            ad.needs_crosscheck = 0
    session.commit()

    return results


def get_accessory_overrides(session: Session, bike_model_id: int) -> dict[str, int]:
    """Retourne les surcharges de prix {group_key: estimated_new_price} pour un modele."""
    overrides = session.exec(
        select(AccessoryOverride).where(AccessoryOverride.bike_model_id == bike_model_id)
    ).all()
    return {o.group_key: o.estimated_new_price for o in overrides}


def _update_group_match_counts(session: Session, catalog_groups: list[dict]) -> None:
    """Met a jour last_match_count de chaque groupe via COUNT SQL sur ad_accessories."""
    variant_to_group: dict[str, str] = {}
    for g in catalog_groups:
        for v in g.get("variants", []):
            variant_to_group[v["name"]] = g["group_key"]

    rows = session.exec(
        select(AdAccessory.name, func.count(AdAccessory.id))
        .group_by(AdAccessory.name)
    ).all()

    group_counts: dict[str, int] = {}
    for name, count in rows:
        gk = variant_to_group.get(name)
        if gk:
            group_counts[gk] = group_counts.get(gk, 0) + count

    for group_data in catalog_groups:
        gk = group_data["group_key"]
        count = group_counts.get(gk, 0)
        group = session.get(AccessoryCatalogGroup, group_data["id"])
        if group:
            group.last_match_count = count

    session.commit()
    invalidate_catalog_cache()


def set_accessory_override(session: Session, bike_model_id: int, group_key: str, estimated_new_price: int) -> None:
    """Enregistre ou met a jour la surcharge de prix d'un groupe d'accessoires."""
    existing = session.get(AccessoryOverride, (bike_model_id, group_key))
    if existing:
        existing.estimated_new_price = estimated_new_price
    else:
        session.add(AccessoryOverride(bike_model_id=bike_model_id, group_key=group_key, estimated_new_price=estimated_new_price))
    session.commit()


def delete_accessory_override(session: Session, bike_model_id: int, group_key: str) -> None:
    """Supprime la surcharge de prix d'un groupe."""
    existing = session.get(AccessoryOverride, (bike_model_id, group_key))
    if existing:
        session.delete(existing)
        session.commit()


# ─── Catalog CRUD ───────────────────────────────────────────────────────────

def create_catalog_group(session: Session, data: dict) -> AccessoryCatalogGroup:
    """Cree un groupe de catalogue."""
    from sqlalchemy.exc import IntegrityError
    from .catalog import normalize_text
    now = datetime.now().isoformat()

    slug = normalize_text(data["name"]).replace(" ", "_").replace("-", "_")
    slug = re.sub(r"[^a-z0-9_]", "", slug)

    group = AccessoryCatalogGroup(
        group_key=slug,
        name=data["name"],
        category=data["category"],
        expressions=data.get("expressions", []),
        default_price=data["default_price"],
        model_id=data.get("model_id"),
        created_at=now,
        updated_at=now,
    )
    session.add(group)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ValueError(f"Un groupe avec la cle « {slug} » existe deja")
    session.refresh(group)
    invalidate_catalog_cache()
    return group


def update_catalog_group(session: Session, group_id: int, data: dict) -> AccessoryCatalogGroup:
    """Met a jour un groupe."""
    group = session.get(AccessoryCatalogGroup, group_id)
    if not group:
        raise ValueError(f"Groupe {group_id} non trouve")

    for field in ("name", "category", "expressions", "default_price"):
        if field in data:
            setattr(group, field, data[field])
    group.updated_at = datetime.now().isoformat()

    session.commit()
    session.refresh(group)
    invalidate_catalog_cache()
    return group


def delete_catalog_group(session: Session, group_id: int) -> None:
    """Supprime un groupe (cascade delete variantes)."""
    group = session.get(AccessoryCatalogGroup, group_id)
    if not group:
        raise ValueError(f"Groupe {group_id} non trouve")
    session.delete(group)
    session.commit()
    invalidate_catalog_cache()


def create_catalog_variant(session: Session, group_id: int, data: dict) -> AccessoryCatalogVariant:
    """Cree une variante dans un groupe."""
    now = datetime.now().isoformat()

    sort_order = data.get("sort_order")
    sort_order_manual = 0
    if sort_order is not None:
        sort_order_manual = 1
    else:
        sort_order = -(
            len(data.get("qualifiers", []))
            + len(data.get("brands", []))
            + len(data.get("product_aliases", []))
        )

    variant = AccessoryCatalogVariant(
        group_id=group_id,
        name=data["name"],
        qualifiers=data.get("qualifiers", []),
        brands=data.get("brands", []),
        product_aliases=data.get("product_aliases", []),
        optional_words=data.get("optional_words", []),
        regex_override=data.get("regex_override"),
        estimated_new_price=data["estimated_new_price"],
        sort_order=sort_order,
        sort_order_manual=sort_order_manual,
        notes=data.get("notes"),
        created_at=now,
        updated_at=now,
    )
    session.add(variant)
    session.commit()
    session.refresh(variant)
    invalidate_catalog_cache()
    return variant


def update_catalog_variant(session: Session, variant_id: int, data: dict) -> AccessoryCatalogVariant:
    """Met a jour une variante."""
    variant = session.get(AccessoryCatalogVariant, variant_id)
    if not variant:
        raise ValueError(f"Variante {variant_id} non trouvee")

    if "name" in data and data["name"] != variant.name:
        refs = session.exec(
            select(func.count()).select_from(AdAccessory).where(AdAccessory.name == variant.name)
        ).one()
        if refs > 0:
            raise ValueError(
                f"Impossible de renommer « {variant.name} » : {refs} annonce(s) la referencent. "
                "Supprimez la variante et recreez-la avec le nouveau nom."
            )

    for field in ("name", "qualifiers", "brands", "product_aliases", "optional_words",
                  "regex_override", "estimated_new_price", "notes"):
        if field in data:
            setattr(variant, field, data[field])

    if "sort_order" in data:
        variant.sort_order = data["sort_order"]
        variant.sort_order_manual = 1
    elif not variant.sort_order_manual:
        variant.sort_order = -(
            len(variant.qualifiers or [])
            + len(variant.brands or [])
            + len(variant.product_aliases or [])
        )

    variant.updated_at = datetime.now().isoformat()
    session.commit()
    session.refresh(variant)
    invalidate_catalog_cache()
    return variant


def delete_catalog_variant(session: Session, variant_id: int) -> int:
    """Supprime une variante. Retourne le nombre de refs ad_accessories."""
    variant = session.get(AccessoryCatalogVariant, variant_id)
    if not variant:
        raise ValueError(f"Variante {variant_id} non trouvee")

    refs = session.exec(
        select(func.count()).select_from(AdAccessory).where(AdAccessory.name == variant.name)
    ).one()

    session.delete(variant)
    session.commit()
    invalidate_catalog_cache()
    return refs


def reset_catalog_to_seed(session: Session) -> None:
    """Reset le catalogue aux valeurs par defaut depuis le seed JSON."""
    seed_file = PROJECT_ROOT / "alembic" / "seed_accessory_catalog.json"
    with open(seed_file) as f:
        data = json.load(f)

    session.exec(delete(AccessoryCatalogVariant))
    session.exec(delete(AccessoryCatalogGroup))
    session.flush()

    now = datetime.now().isoformat()
    for group_data in data["groups"]:
        group = AccessoryCatalogGroup(
            group_key=group_data["group_key"],
            name=group_data["name"],
            category=group_data["category"],
            expressions=group_data["expressions"],
            default_price=group_data["default_price"],
            created_at=now,
            updated_at=now,
        )
        session.add(group)
        session.flush()

        for variant_data in group_data["variants"]:
            session.add(AccessoryCatalogVariant(
                group_id=group.id,
                name=variant_data["name"],
                qualifiers=variant_data.get("qualifiers", []),
                brands=variant_data.get("brands", []),
                product_aliases=variant_data.get("product_aliases", []),
                optional_words=variant_data.get("optional_words", []),
                regex_override=variant_data.get("regex_override"),
                estimated_new_price=variant_data["estimated_new_price"],
                sort_order=variant_data.get("sort_order", 0),
                notes=variant_data.get("notes"),
                created_at=now,
                updated_at=now,
            ))

    session.commit()
    invalidate_catalog_cache()


def export_catalog(session: Session) -> dict:
    """Exporte le catalogue complet en JSON."""
    groups = get_catalog_groups(session)
    export = {"groups": []}
    for g in groups:
        export["groups"].append({
            "group_key": g["group_key"],
            "name": g["name"],
            "category": g["category"],
            "expressions": g["expressions"],
            "default_price": g["default_price"],
            "variants": [
                {
                    "name": v["name"],
                    "qualifiers": v["qualifiers"],
                    "brands": v["brands"],
                    "product_aliases": v["product_aliases"],
                    "optional_words": v["optional_words"],
                    "regex_override": v["regex_override"],
                    "estimated_new_price": v["estimated_new_price"],
                    "sort_order": v["sort_order"],
                    "notes": v["notes"],
                }
                for v in g["variants"]
            ],
        })
    return export


def get_ad_count(session: Session) -> int:
    """Nombre total d'annonces actives (hors superseded)."""
    return session.exec(
        select(func.count()).select_from(Ad).where(Ad.superseded_by == None)  # noqa: E711
    ).one()


# ─── BIKE MODELS ─────────────────────────────────────────────────────────────

def get_bike_models(session: Session) -> list[BikeModel]:
    """Retourne tous les modeles actifs."""
    return session.exec(select(BikeModel).where(BikeModel.active == True)).all()  # noqa: E712


def get_bike_model_by_slug(session: Session, slug: str) -> BikeModel | None:
    """Retourne un modele par son slug."""
    return session.exec(select(BikeModel).where(BikeModel.slug == slug)).first()


def get_bike_model_config(session: Session, bike_model_id: int) -> BikeModelConfig | None:
    """Retourne la config analyseur d'un modele."""
    return session.exec(
        select(BikeModelConfig).where(BikeModelConfig.bike_model_id == bike_model_id)
    ).first()


def get_bike_variants(session: Session, bike_model_id: int) -> list[BikeVariant]:
    """Retourne les variantes d'un modele."""
    return session.exec(
        select(BikeVariant).where(BikeVariant.bike_model_id == bike_model_id)
    ).all()


def get_bike_consumables(session: Session, bike_model_id: int) -> list[BikeConsumable]:
    """Retourne les consommables d'un modele."""
    return session.exec(
        select(BikeConsumable).where(BikeConsumable.bike_model_id == bike_model_id)
    ).all()


def get_accessory_patterns(session: Session, bike_model_id: int) -> list[BikeAccessoryPattern]:
    """Retourne les patterns d'accessoires, ordonnes par sort_order."""
    return session.exec(
        select(BikeAccessoryPattern)
        .where(BikeAccessoryPattern.bike_model_id == bike_model_id)
        .order_by(BikeAccessoryPattern.sort_order)
    ).all()


def get_variant_patterns(session: Session, bike_model_id: int) -> list[BikeVariantPattern]:
    """Retourne les patterns de detection de variante, ordonnes par priorite desc."""
    return session.exec(
        select(BikeVariantPattern)
        .where(BikeVariantPattern.bike_model_id == bike_model_id)
        .order_by(BikeVariantPattern.priority.desc())
    ).all()


def get_exclusion_patterns(session: Session, bike_model_id: int) -> list[BikeExclusionPattern]:
    """Retourne les patterns d'exclusion."""
    return session.exec(
        select(BikeExclusionPattern).where(BikeExclusionPattern.bike_model_id == bike_model_id)
    ).all()


def get_new_listing_patterns(session: Session, bike_model_id: int) -> list[BikeNewListingPattern]:
    """Retourne les patterns de detection de nouvelles annonces."""
    return session.exec(
        select(BikeNewListingPattern).where(BikeNewListingPattern.bike_model_id == bike_model_id)
    ).all()


def get_search_configs(session: Session, bike_model_id: int) -> list[BikeSearchConfig]:
    """Retourne les configs de recherche."""
    return session.exec(
        select(BikeSearchConfig).where(BikeSearchConfig.bike_model_id == bike_model_id)
    ).all()
