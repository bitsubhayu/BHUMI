"""Geospatial processing and gridded-to-block mapping foundation.

Maps continuous meteorological grids (0.05° CHIRPS, 0.1° GPM, 0.25° GFS/ERA5)
onto administrative block centroids and boundaries.

ARCHITECTURAL PRINCIPLE:
Panchayat-level records are NEVER stored permanently in database tables.
Panchayat values are computed strictly on-demand at serve-time from parent block data
combined with high-resolution static terrain features (elevation/slope BCSD lapse-rate).
"""

from __future__ import annotations

import math
from typing import Any, Sequence


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in kilometers."""
    r = 6371.0  # Earth radius in km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def find_nearest_grid_index(
    lat: float,
    lon: float,
    grid_lats: Sequence[float],
    grid_lons: Sequence[float],
) -> tuple[int, int]:
    """Find nearest (row, col) grid index for a given latitude and longitude."""
    best_lat_idx = min(range(len(grid_lats)), key=lambda i: abs(grid_lats[i] - lat))
    best_lon_idx = min(range(len(grid_lons)), key=lambda j: abs(grid_lons[j] - lon))
    return best_lat_idx, best_lon_idx


def map_gridded_to_blocks(
    blocks: list[dict[str, Any]],
    grid_values: list[list[float]],
    grid_lats: Sequence[float],
    grid_lons: Sequence[float],
    field_name: str,
) -> list[dict[str, Any]]:
    """Extract gridded values at each block centroid."""
    mapped: list[dict[str, Any]] = []

    for block in blocks:
        lat = float(block["centroid_lat"])
        lon = float(block["centroid_lon"])
        i, j = find_nearest_grid_index(lat, lon, grid_lats, grid_lons)
        val = grid_values[i][j]

        mapped.append({
            "block_id": block["block_id"],
            field_name: val,
            "centroid_lat": lat,
            "centroid_lon": lon,
        })

    return mapped


def assert_no_panchayat_storage(table_name: str) -> None:
    """Enforce architectural ban on permanent panchayat storage."""
    if "panchayat" in table_name.lower():
        raise RuntimeError(
            f"Architectural Violation: Attempted to write to table '{table_name}'. "
            "TECH_STACK.md §3 strictly bans permanent panchayat storage to protect the 500 MB quota."
        )
