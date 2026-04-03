"""SQLModel models pour BikeBargain."""

from datetime import datetime

from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import UniqueConstraint, PrimaryKeyConstraint, Column, BigInteger, Integer, Float, ForeignKey, String, JSON, Text


# ─── Bike Models ─────────────────────────────────────────────────────────────

class BikeModel(SQLModel, table=True):
    __tablename__ = "bike_models"

    id: int | None = Field(default=None, primary_key=True)
    slug: str = Field(unique=True, index=True)
    brand: str
    name: str
    engine_cc: int
    image_url: str | None = None
    active: bool = Field(default=True)
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    # Relationships
    config: "BikeModelConfig" = Relationship(
        back_populates="bike_model",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "uselist": False},
    )
    variants: list["BikeVariant"] = Relationship(
        back_populates="bike_model",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    consumables: list["BikeConsumable"] = Relationship(
        back_populates="bike_model",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    accessory_patterns: list["BikeAccessoryPattern"] = Relationship(
        back_populates="bike_model",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    variant_patterns: list["BikeVariantPattern"] = Relationship(
        back_populates="bike_model",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    new_listing_patterns: list["BikeNewListingPattern"] = Relationship(
        back_populates="bike_model",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    exclusion_patterns: list["BikeExclusionPattern"] = Relationship(
        back_populates="bike_model",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    search_configs: list["BikeSearchConfig"] = Relationship(
        back_populates="bike_model",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    title_filters: list["BikeTitleFilter"] = Relationship(
        back_populates="bike_model",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class BikeModelConfig(SQLModel, table=True):
    __tablename__ = "bike_model_configs"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), unique=True, nullable=False),
    )
    warranty_years: int
    warranty_value_per_year: int
    mechanical_wear_per_km: float
    condition_risk_per_km: float
    short_term_km_threshold: int

    bike_model: BikeModel | None = Relationship(back_populates="config")


class BikeVariant(SQLModel, table=True):
    __tablename__ = "bike_variants"
    __table_args__ = (UniqueConstraint("bike_model_id", "color", "wheel_type"),)

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    variant_name: str | None = None
    color: str
    wheel_type: str = Field(default="default")
    new_price: int
    color_hex: str | None = None

    bike_model: BikeModel | None = Relationship(back_populates="variants")


class BikeConsumable(SQLModel, table=True):
    __tablename__ = "bike_consumables"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    name: str
    cost_eur: int
    life_km: int

    bike_model: BikeModel | None = Relationship(back_populates="consumables")


class BikeAccessoryPattern(SQLModel, table=True):
    __tablename__ = "bike_accessory_patterns"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    regex_pattern: str
    name: str
    category: str
    new_price: int
    depreciation_rate: float = Field(default=0.65)
    dedup_group: str | None = None
    sort_order: int = Field(default=0)

    bike_model: BikeModel | None = Relationship(back_populates="accessory_patterns")


class BikeVariantPattern(SQLModel, table=True):
    __tablename__ = "bike_variant_patterns"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    regex_pattern: str
    matched_variant: str | None = None
    matched_color: str | None = None
    matched_wheel_type: str | None = None
    priority: int = Field(default=0)

    bike_model: BikeModel | None = Relationship(back_populates="variant_patterns")


class BikeNewListingPattern(SQLModel, table=True):
    __tablename__ = "bike_new_listing_patterns"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    regex_pattern: str
    category: str
    weight: float = Field(default=1.0)

    bike_model: BikeModel | None = Relationship(back_populates="new_listing_patterns")


class BikeExclusionPattern(SQLModel, table=True):
    __tablename__ = "bike_exclusion_patterns"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    regex_pattern: str

    bike_model: BikeModel | None = Relationship(back_populates="exclusion_patterns")


class BikeSearchConfig(SQLModel, table=True):
    __tablename__ = "bike_search_configs"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    keyword: str
    min_cc: int | None = None
    max_cc: int | None = None
    locations: list[str] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    owner_type: str | None = None
    price_min: int | None = None
    price_max: int | None = None
    sort: str | None = None
    search_in_title_only: bool = Field(default=False)

    bike_model: BikeModel | None = Relationship(back_populates="search_configs")


class BikeTitleFilter(SQLModel, table=True):
    __tablename__ = "bike_title_filters"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    filter_type: str  # "include" ou "exclude"
    regex_pattern: str
    description: str | None = None

    bike_model: BikeModel | None = Relationship(back_populates="title_filters")


# ─── Ads ─────────────────────────────────────────────────────────────────────

class Ad(SQLModel, table=True):
    __tablename__ = "ads"

    id: int = Field(sa_column=Column(BigInteger, primary_key=True))  # LeBonCoin ID
    url: str = Field(unique=True)
    subject: str | None = None
    body: str | None = None
    price: float | None = Field(default=None, index=True)
    brand: str | None = None
    model: str | None = None
    year: int | None = Field(default=None, index=True)
    mileage_km: int | None = Field(default=None, index=True)
    engine_size_cc: int | None = None
    fuel_type: str | None = None
    color: str | None = None
    category_name: str | None = None
    ad_type: str | None = None
    status: str | None = None
    has_phone: int = Field(default=0)
    city: str | None = None
    zipcode: str | None = None
    department: str | None = Field(default=None, index=True)
    region: str | None = None
    lat: float | None = None
    lng: float | None = None
    seller_type: str | None = None
    first_publication_date: str | None = None
    expiration_date: str | None = None
    variant: str | None = Field(default=None, index=True)
    wheel_type: str | None = None
    estimated_new_price: float | None = None
    extracted_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    accessories_manual: int = Field(default=0)
    listing_status: str = Field(default="online", index=True)  # "online", "paused", "sold"
    previous_ad_id: int | None = Field(default=None, sa_column=Column(BigInteger))
    superseded_by: int | None = Field(default=None, sa_column=Column(BigInteger, index=True))
    bike_model_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("bike_models.id"), index=True))
    needs_crosscheck: int = Field(default=0)

    # Relationships
    attributes: list["AdAttribute"] = Relationship(
        back_populates="ad",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    images: list["AdImage"] = Relationship(
        back_populates="ad",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    accessories: list["AdAccessory"] = Relationship(
        back_populates="ad",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    price_history: list["AdPriceHistory"] = Relationship(
        back_populates="ad",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    status_history: list["AdStatusHistory"] = Relationship(
        back_populates="ad",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class AdAttribute(SQLModel, table=True):
    __tablename__ = "ad_attributes"
    __table_args__ = (UniqueConstraint("ad_id", "key"),)

    id: int | None = Field(default=None, primary_key=True)
    ad_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("ads.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    key: str
    value: str | None = None
    value_label: str | None = None

    ad: Ad | None = Relationship(back_populates="attributes")


class AdImage(SQLModel, table=True):
    __tablename__ = "ad_images"

    id: int | None = Field(default=None, primary_key=True)
    ad_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("ads.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    url: str
    position: int = Field(default=0)

    ad: Ad | None = Relationship(back_populates="images")


class AdAccessory(SQLModel, table=True):
    __tablename__ = "ad_accessories"
    __table_args__ = (UniqueConstraint("ad_id", "name"),)

    id: int | None = Field(default=None, primary_key=True)
    ad_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("ads.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    name: str
    category: str | None = None
    source: str | None = None
    estimated_new_price: int = Field(default=0)
    estimated_used_price: int = Field(default=0)

    ad: Ad | None = Relationship(back_populates="accessories")


# ─── Crawl ───────────────────────────────────────────────────────────────────

class CrawlSession(SQLModel, table=True):
    __tablename__ = "crawl_sessions"

    id: int | None = Field(default=None, primary_key=True)
    status: str = Field(default="active")
    total_ads: int = Field(default=0)
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    bike_model_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("bike_models.id"), index=True))

    session_ads: list["CrawlSessionAd"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class CrawlSessionAd(SQLModel, table=True):
    __tablename__ = "crawl_session_ads"
    __table_args__ = (UniqueConstraint("session_id", "ad_id"),)

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(
        sa_column=Column(Integer, ForeignKey("crawl_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    ad_id: int = Field(sa_column=Column(BigInteger, nullable=False))
    url: str
    subject: str | None = None
    price: float | None = None
    city: str | None = None
    department: str | None = None
    thumbnail: str | None = None
    exists_in_db: int = Field(default=0)
    action: str = Field(default="pending")
    position: int = Field(default=0)
    is_new_listing: int = Field(default=0)
    is_irrelevant: int = Field(default=0)

    session: CrawlSession | None = Relationship(back_populates="session_ads")


# ─── Price History ───────────────────────────────────────────────────────────

class AdPriceHistory(SQLModel, table=True):
    __tablename__ = "ad_price_history"

    id: int | None = Field(default=None, primary_key=True)
    ad_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("ads.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    previous_ad_id: int | None = Field(default=None, sa_column=Column(BigInteger))
    price: float
    source: str
    note: str | None = None
    recorded_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    ad: Ad | None = Relationship(back_populates="price_history")


class AdStatusHistory(SQLModel, table=True):
    __tablename__ = "ad_status_history"

    id: int | None = Field(default=None, primary_key=True)
    ad_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("ads.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    old_status: str
    new_status: str
    reason: str | None = None
    changed_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    ad: Ad | None = Relationship(back_populates="status_history")


class AccessoryOverride(SQLModel, table=True):
    __tablename__ = "accessory_overrides"
    __table_args__ = (PrimaryKeyConstraint("bike_model_id", "group_key"),)

    bike_model_id: int = Field(default=0)
    group_key: str
    estimated_new_price: int


# ─── Accessory Catalog ──────────────────────────────────────────────────────

class AccessoryCatalogGroup(SQLModel, table=True):
    __tablename__ = "accessory_catalog_groups"

    id: int | None = Field(default=None, primary_key=True)
    group_key: str = Field(unique=True, nullable=False)
    model_id: int | None = Field(default=None)  # FK future vers bike_models
    name: str = Field(nullable=False)
    category: str = Field(nullable=False)  # protection, bagagerie, confort, navigation, eclairage, esthetique, performance, autre
    expressions: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))
    default_price: int = Field(nullable=False)
    last_match_count: int = Field(default=0)
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    variants: list["AccessoryCatalogVariant"] = Relationship(
        back_populates="group",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "AccessoryCatalogVariant.sort_order"},
    )


class AccessoryCatalogVariant(SQLModel, table=True):
    __tablename__ = "accessory_catalog_variants"
    __table_args__ = (UniqueConstraint("group_id", "name"),)

    id: int | None = Field(default=None, primary_key=True)
    group_id: int = Field(
        sa_column=Column(Integer, ForeignKey("accessory_catalog_groups.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    name: str = Field(nullable=False)
    qualifiers: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))
    brands: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))
    product_aliases: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))
    optional_words: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))
    regex_override: str | None = Field(default=None, sa_column=Column(Text))
    estimated_new_price: int = Field(nullable=False)
    sort_order: int = Field(default=0)
    sort_order_manual: int = Field(default=0)  # 1 if user overrode sort_order
    notes: str | None = Field(default=None, sa_column=Column(Text))
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    group: AccessoryCatalogGroup | None = Relationship(back_populates="variants")
