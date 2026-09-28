"""Pure-Python GRIB2 simple-packing decoder for meteorological forecast data.

Decodes NOAA GFS and ECMWF Open Data GRIB2 files (Template 5.0: Grid point data - Simple Packing)
without requiring C libraries (eccodes / wgrib2).
"""

from __future__ import annotations

import struct
from typing import Any, Optional

import numpy as np


class Grib2DecodeError(ValueError):
    """Raised when GRIB2 message cannot be parsed."""
    pass


def parse_grib2_sections(data: bytes) -> dict[int, bytes]:
    """Parse a single GRIB2 message into its constituent sections (0 to 8)."""
    if len(data) < 16 or data[:4] != b"GRIB":
        raise Grib2DecodeError("Invalid GRIB2 header: missing 'GRIB' magic bytes")

    edition = data[7]
    if edition != 2:
        raise Grib2DecodeError(f"Unsupported GRIB edition {edition}, expected edition 2")

    total_len = struct.unpack(">Q", data[8:16])[0]
    sections: dict[int, bytes] = {0: data[:16]}
    pos = 16

    while pos < len(data):
        if data[pos : pos + 4] == b"7777":
            sections[8] = b"7777"
            break
        if pos + 5 > len(data):
            break

        sec_len, sec_num = struct.unpack(">IB", data[pos : pos + 5])
        if sec_len == 0 or pos + sec_len > len(data):
            break

        sections[sec_num] = data[pos : pos + sec_len]
        pos += sec_len

    if 8 not in sections:
        raise Grib2DecodeError("Incomplete GRIB2 message: missing end section '7777'")

    return sections


def decode_grib2_grid(data: bytes) -> dict[str, Any]:
    """Decode a GRIB2 simple-packed message into latitudes, longitudes, and values.
    
    Returns:
      Dictionary containing:
        - 'ni': int (number of longitude points)
        - 'nj': int (number of latitude points)
        - 'lats': 1D numpy array of latitudes
        - 'lons': 1D numpy array of longitudes
        - 'grid': 2D numpy array of shape (nj, ni) containing floating point values
    """
    sections = parse_grib2_sections(data)

    if 3 not in sections:
        raise Grib2DecodeError("Missing Section 3 (Grid Definition)")
    if 5 not in sections:
        raise Grib2DecodeError("Missing Section 5 (Data Representation)")
    if 7 not in sections:
        raise Grib2DecodeError("Missing Section 7 (Data Section)")

    sec3 = sections[3]
    sec5 = sections[5]
    sec7 = sections[7]

    # Section 3: Regular Lat/Lon grid parameters (Template 3.0)
    grid_template = struct.unpack(">H", sec3[12:14])[0]
    ni, nj = struct.unpack(">II", sec3[30:38])
    lat1 = struct.unpack(">i", sec3[46:50])[0] / 1e6
    lon1 = struct.unpack(">i", sec3[50:54])[0] / 1e6
    lat2 = struct.unpack(">i", sec3[55:59])[0] / 1e6
    lon2 = struct.unpack(">i", sec3[59:63])[0] / 1e6

    lats = np.linspace(lat1, lat2, nj)
    lons = np.linspace(lon1, lon2, ni)

    # Section 5: Data Representation Template (Template 5.0: Simple Packing)
    rep_template = struct.unpack(">H", sec5[9:11])[0]
    if rep_template != 0:
        raise Grib2DecodeError(f"Unsupported data representation template {rep_template}, only Template 5.0 supported")

    ref_val = struct.unpack(">f", sec5[11:15])[0]
    b_raw, d_raw, nbits = struct.unpack(">HHB", sec5[15:20])
    # WMO GRIB2 Section 5 scale factors are sign-magnitude integers
    bin_scale = -(b_raw & 0x7FFF) if (b_raw & 0x8000) else (b_raw & 0x7FFF)
    dec_scale = -(d_raw & 0x7FFF) if (d_raw & 0x8000) else (d_raw & 0x7FFF)

    if nbits == 0:
        # Constant field across all grid points
        grid = np.full((nj, ni), ref_val, dtype=np.float32)
        return {"ni": ni, "nj": nj, "lats": lats, "lons": lons, "grid": grid}

    # Section 7: Unpack bitstream
    raw_data = sec7[5:]
    bit_arr = np.unpackbits(np.frombuffer(raw_data, dtype=np.uint8))

    total_pts = ni * nj
    required_bits = total_pts * nbits
    if len(bit_arr) < required_bits:
        raise Grib2DecodeError(f"Bitstream underflow: expected {required_bits} bits, got {len(bit_arr)}")

    bit_matrix = bit_arr[:required_bits].reshape((total_pts, nbits))
    powers = 2 ** np.arange(nbits - 1, -1, -1, dtype=np.int64)
    y_integers = bit_matrix.dot(powers)

    # Reconstruct physical values: (ref_val + Y * 2^bin_scale) / 10^dec_scale
    flat_values = (ref_val + y_integers * (2.0 ** bin_scale)) / (10.0 ** dec_scale)
    grid = flat_values.reshape((nj, ni)).astype(np.float32)

    return {
        "ni": ni,
        "nj": nj,
        "lats": lats,
        "lons": lons,
        "grid": grid,
    }


def extract_point_from_grib2(
    grib_data: dict[str, Any],
    lat: float,
    lon: float,
) -> float:
    """Extract interpolated or nearest-neighbor value from a decoded GRIB2 grid."""
    lats = grib_data["lats"]
    lons = grib_data["lons"]
    grid = grib_data["grid"]

    lat_idx = int(np.argmin(np.abs(lats - lat)))
    lon_idx = int(np.argmin(np.abs(lons - lon)))

    return float(grid[lat_idx, lon_idx])
