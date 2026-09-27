"""Configuration module for BHUMI data ingestion pipeline.

Loads configuration from environment variables or .env.local file.
Provides safe access without exposing secret credentials in logs.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


def load_env_file(file_path: Path) -> dict[str, str]:
    """Load key-value pairs from an env file without modifying os.environ."""
    env_vars: dict[str, str] = {}
    if not file_path.exists():
        return env_vars

    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if "=" in stripped:
                key, val = stripped.split("=", 1)
                val = val.strip().strip("'\"")
                env_vars[key.strip()] = val
    return env_vars


def mask_secret(secret: Optional[str]) -> str:
    """Safely mask a secret for logging purposes (e.g. 'eyJ...1234' -> '***1234')."""
    if not secret:
        return "<not set>"
    if len(secret) <= 8:
        return "***"
    return f"***{secret[-4:]}"


@dataclass(frozen=True)
class PipelineConfig:
    """Pipeline runtime configuration."""

    # Supabase (Database & PostGIS)
    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: Optional[str]

    # Copernicus Climate Data Store (ERA5 / ERA5-Land)
    cdsapi_url: Optional[str]
    cdsapi_key: Optional[str]

    # NASA Earthdata (GPM IMERG, SMAP)
    earthdata_username: Optional[str]
    earthdata_password: Optional[str]

    # IMD Pune (Gridded observations - registration required)
    imd_api_key: Optional[str]
    imd_pune_user: Optional[str]

    # Ingestion Parameters & Storage Constraints
    # TECH_STACK.md §3 Recommendation: 12 seasons (2014-2025) occupies ~145 MB,
    # ensuring full India coverage stays within the 500 MB Supabase free budget (~210-215 MB total).
    default_historical_start_year: int = 2014
    default_historical_end_year: int = 2025
    season_days: int = 214  # 1 April to 31 October inclusive
    live_buffer_retention_days: int = 90

    # Networking & Retry Settings
    request_timeout_seconds: int = 30
    max_retries: int = 3
    retry_backoff_factor: float = 1.5
    batch_size: int = 50

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def has_cds(self) -> bool:
        return bool(self.cdsapi_url and self.cdsapi_key)

    @property
    def has_earthdata(self) -> bool:
        return bool(self.earthdata_username and self.earthdata_password)

    @property
    def has_imd(self) -> bool:
        return bool(self.imd_api_key or self.imd_pune_user)

    def summary(self) -> dict[str, str]:
        """Return non-sensitive summary of configured credentials and endpoints."""
        return {
            "supabase_endpoint": self.supabase_url or "<not configured>",
            "supabase_service_key": mask_secret(self.supabase_service_role_key),
            "cds_configured": str(self.has_cds),
            "earthdata_configured": str(self.has_earthdata),
            "imd_configured": str(self.has_imd),
            "historical_archive_window": f"{self.default_historical_start_year}–{self.default_historical_end_year} ({self.default_historical_end_year - self.default_historical_start_year + 1} seasons)",
            "season_days": str(self.season_days),
            "live_buffer_retention_days": str(self.live_buffer_retention_days),
        }


_cached_config: Optional[PipelineConfig] = None


def get_pipeline_config(project_root: Optional[Path] = None) -> PipelineConfig:
    """Retrieve the pipeline configuration, reading .env.local if present."""
    global _cached_config
    if _cached_config is not None:
        return _cached_config

    root = project_root or Path(__file__).resolve().parent.parent.parent
    local_env = load_env_file(root / ".env.local")
    base_env = load_env_file(root / ".env")

    def get_var(name: str, fallback_names: list[str] | None = None) -> Optional[str]:
        # Check os.environ first, then .env.local, then .env
        names = [name] + (fallback_names or [])
        for n in names:
            if n in os.environ and os.environ[n].strip():
                return os.environ[n].strip()
            if n in local_env and local_env[n].strip():
                return local_env[n].strip()
            if n in base_env and base_env[n].strip():
                return base_env[n].strip()
        return None

    supabase_url = get_var("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]) or ""
    service_key = get_var("SUPABASE_SERVICE_ROLE_KEY", ["SUPERBASE_SECRET_KEY"]) or ""
    anon_key = get_var("NEXT_PUBLIC_SUPABASE_ANON_KEY", ["SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"])

    cds_url = get_var("CDSAPI_URL", ["CDS_URL"])
    cds_key = get_var("CDSAPI_KEY", ["CDS_API_KEY"])

    ed_user = get_var("EARTHDATA_USERNAME")
    ed_pass = get_var("EARTHDATA_PASSWORD")

    imd_key = get_var("IMD_API_KEY")
    imd_user = get_var("IMD_PUNE_USER")

    _cached_config = PipelineConfig(
        supabase_url=supabase_url,
        supabase_service_role_key=service_key,
        supabase_anon_key=anon_key,
        cdsapi_url=cds_url,
        cdsapi_key=cds_key,
        earthdata_username=ed_user,
        earthdata_password=ed_pass,
        imd_api_key=imd_key,
        imd_pune_user=imd_user,
    )
    return _cached_config
