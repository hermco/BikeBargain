"""
Database engine et session management.

PostgreSQL uniquement, via DATABASE_URL (fichier .env ou variable d'environnement).
"""

from pathlib import Path
from datetime import datetime

from sqlmodel import SQLModel, Session, create_engine, select, delete
from sqlalchemy.orm import selectinload

# Import des modeles pour enregistrer les tables dans SQLModel.metadata
from .models import (  # noqa: F401
    Ad, AdAttribute, AdImage, AdAccessory,
    CrawlSession, CrawlSessionAd, AdPriceHistory, AccessoryOverride,
    BikeModel, BikeModelConfig, BikeVariant, BikeConsumable,
    BikeAccessoryPattern, BikeVariantPattern, BikeExclusionPattern,
    BikeNewListingPattern, BikeSearchConfig,
)
from .config import get_settings

PROJECT_ROOT = Path(__file__).resolve().parent.parent

settings = get_settings()


def get_database_url() -> str:
    """Retourne l'URL de la base de donnees (pour Alembic et compatibilite)."""
    return settings.database_url_normalized


engine = create_engine(get_database_url(), echo=settings.debug)


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
    *,
    skip_manual: bool = False,
    ad_ids: list[int] | None = None,
) -> list[dict]:
    """Re-detecte les accessoires en base."""
    from .accessories import detect_accessories

    overrides = get_accessory_overrides(session)

    statement = select(Ad)
    if skip_manual:
        statement = statement.where(Ad.accessories_manual == 0)
    if ad_ids is not None:
        statement = statement.where(Ad.id.in_(ad_ids))

    ads = session.exec(statement.options(selectinload(Ad.accessories))).all()
    results = []

    for ad in ads:
        before = len(ad.accessories)
        detected = detect_accessories(ad.body or "", price_overrides=overrides)

        # Supprimer les anciens
        session.exec(delete(AdAccessory).where(AdAccessory.ad_id == ad.id))
        session.flush()

        # Inserer les nouveaux
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
    return results


def get_accessory_overrides(session: Session, bike_model_id: int) -> dict[str, int]:
    """Retourne les surcharges de prix {group_key: estimated_new_price} pour un modele."""
    overrides = session.exec(
        select(AccessoryOverride).where(AccessoryOverride.bike_model_id == bike_model_id)
    ).all()
    return {o.group_key: o.estimated_new_price for o in overrides}


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


def get_ad_count(session: Session) -> int:
    """Nombre total d'annonces actives (hors superseded)."""
    from sqlalchemy import func
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
