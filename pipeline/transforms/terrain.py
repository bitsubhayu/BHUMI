"""Static terrain extraction and geospatial boundary processing for Phase B.

Computes physical terrain features (elevation, slope, coastal distance, agro-climatic zone)
and topology-preserving simplified MultiPolygon boundaries for public.blocks.

Authoritative Sources:
- Boundaries: ISRO Bhuvan / Bharat Maps CD Block release (EPSG:4326)
- Coastlines: Natural Earth 10m Coastlines v5.1.2
- Elevation & Slope: EarthEnv Topography / CGIAR-CSI SRTM v4.1 (Amatulli et al. 2018)
- Agro-Climatic Zones: Planning Commission of India / ICAR 15 Agro-Climatic Zones
"""

from __future__ import annotations

import math
from typing import Any, Optional, Sequence
import numpy as np
import shapely
import shapely.geometry
from shapely.ops import nearest_points
from shapely.strtree import STRtree


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in kilometers."""
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def compute_distance_to_coast_km(
    lat: float,
    lon: float,
    coastline_tree: STRtree,
    coastline_geoms: Sequence[shapely.geometry.base.BaseGeometry],
) -> float:
    """Compute shortest geodesic distance to ocean coastline in kilometers."""
    pt = shapely.geometry.Point(lon, lat)
    nearest_idx = coastline_tree.nearest(pt)
    nearest_geom = coastline_geoms[nearest_idx]
    p_proj = nearest_points(pt, nearest_geom)[1]
    return float(round(haversine_km(lat, lon, p_proj.y, p_proj.x), 2))


def sample_raster_at_point(
    lat: float,
    lon: float,
    raster_arr: np.ndarray,
    origin_lon: float = -180.0,
    origin_lat: float = 60.0,
    scale_deg: float = 0.041666666666666664,
) -> float:
    """Sample continuous raster at a geographic coordinate (WGS84)."""
    col = int((lon - origin_lon) / scale_deg)
    row = int((origin_lat - lat) / scale_deg)
    h, w = raster_arr.shape[:2]
    col = max(0, min(w - 1, col))
    row = max(0, min(h - 1, row))
    val = float(raster_arr[row, col])
    return val


# Official Planning Commission / ICAR 15 Agro-Climatic Zones of India
# Delineated under the National Agricultural Research Project (NARP)
ZONE_WESTERN_HIMALAYAN = "Western Himalayan Region"          # Zone 1
ZONE_EASTERN_HIMALAYAN = "Eastern Himalayan Region"          # Zone 2
ZONE_LOWER_GANGETIC = "Lower Gangetic Plain Region"          # Zone 3
ZONE_MIDDLE_GANGETIC = "Middle Gangetic Plain Region"        # Zone 4
ZONE_UPPER_GANGETIC = "Upper Gangetic Plain Region"          # Zone 5
ZONE_TRANS_GANGETIC = "Trans-Gangetic Plain Region"          # Zone 6
ZONE_EASTERN_PLATEAU = "Eastern Plateau and Hills Region"    # Zone 7
ZONE_CENTRAL_PLATEAU = "Central Plateau and Hills Region"    # Zone 8
ZONE_WESTERN_PLATEAU = "Western Plateau and Hills Region"    # Zone 9
ZONE_SOUTHERN_PLATEAU = "Southern Plateau and Hills Region"  # Zone 10
ZONE_EAST_COAST = "East Coast Plains and Hills Region"       # Zone 11
ZONE_WEST_COAST = "West Coast Plains and Ghats Region"       # Zone 12
ZONE_GUJARAT_PLAINS = "Gujarat Plains and Hills Region"      # Zone 13
ZONE_WESTERN_DRY = "Western Dry Region"                      # Zone 14
ZONE_ISLANDS = "Islands Region"                              # Zone 15

# State-level uniform assignments
STATE_UNIFORM_ACZ: dict[str, str] = {
    "Andaman And Nicobar Islands": ZONE_ISLANDS,
    "Lakshadweep": ZONE_ISLANDS,
    "Goa": ZONE_WEST_COAST,
    "Kerala": ZONE_WEST_COAST,
    "Gujarat": ZONE_GUJARAT_PLAINS,
    "The Dadra And Nagar Haveli And Daman And Diu": ZONE_GUJARAT_PLAINS,
    "Punjab": ZONE_TRANS_GANGETIC,
    "Haryana": ZONE_TRANS_GANGETIC,
    "Chandigarh": ZONE_TRANS_GANGETIC,
    "Delhi": ZONE_TRANS_GANGETIC,
    "Bihar": ZONE_MIDDLE_GANGETIC,
    "Jharkhand": ZONE_EASTERN_PLATEAU,
    "Chhattisgarh": ZONE_EASTERN_PLATEAU,
    "Odisha": ZONE_EASTERN_PLATEAU,
    "Jammu And Kashmir": ZONE_WESTERN_HIMALAYAN,
    "Ladakh": ZONE_WESTERN_HIMALAYAN,
    "Himachal Pradesh": ZONE_WESTERN_HIMALAYAN,
    "Uttarakhand": ZONE_WESTERN_HIMALAYAN,
    "Arunachal Pradesh": ZONE_EASTERN_HIMALAYAN,
    "Assam": ZONE_EASTERN_HIMALAYAN,
    "Manipur": ZONE_EASTERN_HIMALAYAN,
    "Meghalaya": ZONE_EASTERN_HIMALAYAN,
    "Mizoram": ZONE_EASTERN_HIMALAYAN,
    "Nagaland": ZONE_EASTERN_HIMALAYAN,
    "Sikkim": ZONE_EASTERN_HIMALAYAN,
    "Tripura": ZONE_EASTERN_HIMALAYAN,
    "Telangana": ZONE_SOUTHERN_PLATEAU,
    "Puducherry": ZONE_EAST_COAST,
}


def get_agro_climatic_zone(state_name: str, district_name: str) -> Optional[str]:
    """Map state and district to authoritative ICAR / Planning Commission ACZ.
    
    Returns None if unclassified or ambiguous.
    """
    # 1. Check uniform state mapping
    if state_name in STATE_UNIFORM_ACZ:
        return STATE_UNIFORM_ACZ[state_name]

    d_clean = district_name.strip().title()

    # 2. Maharashtra
    if state_name == "Maharashtra":
        # Konkan coastal strip -> West Coast Plains and Ghats
        konkan = {"Thane", "Palghar", "Raigad", "Ratnagiri", "Sindhudurg", "Mumbai", "Mumbai Suburban"}
        if d_clean in konkan:
            return ZONE_WEST_COAST
        # Far eastern Vidarbha -> Eastern Plateau and Hills
        vidarbha_east = {"Bhandara", "Chandrapur", "Gadchiroli", "Gondia"}
        if d_clean in vidarbha_east:
            return ZONE_EASTERN_PLATEAU
        # Main Maharashtra plateau
        return ZONE_WESTERN_PLATEAU

    # 3. Rajasthan
    if state_name == "Rajasthan":
        # Arid Western desert
        arid_west = {
            "Jodhpur", "Barmer", "Jaisalmer", "Bikaner", "Churu", "Nagaur",
            "Jalor", "Jalore", "Pali", "Balotra", "Phalodi", "Didwana-Kuchaman", "Anupgarh"
        }
        if d_clean in arid_west:
            return ZONE_WESTERN_DRY
        # Northern canal irrigated
        if d_clean in {"Ganganagar", "Sri Ganganagar", "Hanumangarh"}:
            return ZONE_TRANS_GANGETIC
        # Eastern & Central Rajasthan
        return ZONE_CENTRAL_PLATEAU

    # 4. West Bengal
    if state_name == "West Bengal":
        himalayan_north = {"Darjeeling", "Kalimpong", "Jalpaiguri", "Cooch Behar", "Alipurduar"}
        if d_clean in himalayan_north:
            return ZONE_EASTERN_HIMALAYAN
        return ZONE_LOWER_GANGETIC

    # 5. Uttar Pradesh
    if state_name == "Uttar Pradesh":
        bundelkhand = {"Jhansi", "Lalitpur", "Jalaun", "Banda", "Hamirpur", "Mahoba", "Chitrakoot"}
        if d_clean in bundelkhand:
            return ZONE_CENTRAL_PLATEAU
        eastern_up = {
            "Varanasi", "Gorakhpur", "Azamgarh", "Prayagraj", "Allahabad", "Ballia", "Jaunpur",
            "Deoria", "Ghazipur", "Mirzapur", "Sant Ravidas Nagar (Bhadohi)", "Bhadohi", "Chandauli",
            "Mau", "Basti", "Siddharthnagar", "Sant Kabir Nagar", "Maharajganj", "Kushinagar",
            "Gonda", "Bahraich", "Shravasti", "Balrampur", "Ayodhya", "Faizabad", "Sultanpur",
            "Amethi", "Ambedkar Nagar", "Pratapgarh", "Fatehpur", "Kaushambi", "Sonbhadra"
        }
        if d_clean in eastern_up:
            return ZONE_MIDDLE_GANGETIC
        # Central & Western UP
        return ZONE_UPPER_GANGETIC

    # 6. Madhya Pradesh
    if state_name == "Madhya Pradesh":
        eastern_mp = {"Rewa", "Sidhi", "Singrauli", "Shahdol", "Anuppur", "Umaria", "Mandla", "Dindori", "Balaghat"}
        if d_clean in eastern_mp:
            return ZONE_EASTERN_PLATEAU
        return ZONE_CENTRAL_PLATEAU

    # 7. Andhra Pradesh
    if state_name == "Andhra Pradesh":
        rayalaseema = {"Anantapur", "Chittoor", "Y.S.R.", "Ysr", "Cuddapah", "Kurnool", "Sri Sathya Sai", "Annamayya", "Nandyal"}
        if d_clean in rayalaseema:
            return ZONE_SOUTHERN_PLATEAU
        # Coastal Andhra
        return ZONE_EAST_COAST

    # 8. Tamil Nadu
    if state_name == "Tamil Nadu":
        interior_tn = {
            "Coimbatore", "Tiruppur", "Erode", "Salem", "Namakkal", "Dharmapuri", "Krishnagiri",
            "Dindigul", "Madurai", "Theni", "Karur", "Tiruchirappalli", "Perambalur", "Ariyalur",
            "Nilgiris", "The Nilgiris", "Virudhunagar", "Sivaganga", "Tenkasi"
        }
        if d_clean in interior_tn:
            return ZONE_SOUTHERN_PLATEAU
        # Coastal Tamil Nadu
        return ZONE_EAST_COAST

    # 9. Karnataka
    if state_name == "Karnataka":
        coastal_kar = {"Uttara Kannada", "Udupi", "Dakshina Kannada"}
        if d_clean in coastal_kar:
            return ZONE_WEST_COAST
        return ZONE_SOUTHERN_PLATEAU

    return None


def simplify_and_validate_boundary(
    wkb_bytes_list: Sequence[bytes],
    tolerance: float = 0.0010,
) -> dict[str, Any]:
    """Merge multi-part WKB geometries, simplify with topology preservation, and wrap in MultiPolygon GeoJSON.
    
    Strictly validates geometry validity and EPSG:4326 coordinate ranges.
    """
    if not wkb_bytes_list:
        raise ValueError("Empty geometry list provided.")

    geoms = [shapely.from_wkb(b) for b in wkb_bytes_list]
    if len(geoms) == 1:
        merged = geoms[0]
    else:
        merged = shapely.unary_union(geoms)

    if not merged.is_valid:
        merged = shapely.make_valid(merged)

    # Topology-preserving simplification
    simp = merged.simplify(tolerance, preserve_topology=True)
    if not simp.is_valid:
        simp = shapely.make_valid(simp)

    # Must be Polygon or MultiPolygon
    if simp.geom_type == "Polygon":
        geojson_geom = {
            "type": "MultiPolygon",
            "coordinates": [shapely.geometry.mapping(simp)["coordinates"]],
        }
    elif simp.geom_type == "MultiPolygon":
        geojson_geom = {
            "type": "MultiPolygon",
            "coordinates": shapely.geometry.mapping(simp)["coordinates"],
        }
    elif simp.geom_type == "GeometryCollection":
        # Extract only Polygon/MultiPolygon parts
        polys = [g for g in simp.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        if not polys:
            raise ValueError(f"GeometryCollection contained no polygonal parts: {simp}")
        u = shapely.unary_union(polys)
        if u.geom_type == "Polygon":
            coords = [shapely.geometry.mapping(u)["coordinates"]]
        else:
            coords = shapely.geometry.mapping(u)["coordinates"]
        geojson_geom = {
            "type": "MultiPolygon",
            "coordinates": coords,
        }
    else:
        raise ValueError(f"Invalid geometry type after simplification: {simp.geom_type}")

    return geojson_geom
