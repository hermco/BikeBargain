"""SQLModel models pour les annonces Himalayan 450."""

from datetime import datetime

from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import UniqueConstraint, Column, BigInteger, Integer, Float, ForeignKey


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
    sold: int = Field(default=0, index=True)
    previous_ad_id: int | None = Field(default=None, sa_column=Column(BigInteger))
    superseded_by: int | None = Field(default=None, sa_column=Column(BigInteger, index=True))

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


# ─── Accessory Overrides ────────────────────────────────────────────────────

class AccessoryOverride(SQLModel, table=True):
    __tablename__ = "accessory_overrides"

    group_key: str = Field(primary_key=True)
    estimated_new_price: int
