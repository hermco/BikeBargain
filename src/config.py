"""
Configuration centralisee via pydantic-settings.

Hierarchie de chargement (priorite decroissante) :
  1. Variables d'environnement systeme
  2. Fichier .env (racine du projet)
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Environnement
    app_env: Literal["local", "production"] = "local"

    # Base de donnees (obligatoire)
    database_url: str

    # API
    debug: bool = False
    cors_origin_regex: str = r"http://localhost:\d+"

    @property
    def database_url_normalized(self) -> str:
        """Normalise postgres:// en postgresql:// (Heroku/Render)."""
        return self.database_url.replace("postgres://", "postgresql://", 1)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
