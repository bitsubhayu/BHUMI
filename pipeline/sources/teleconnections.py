"""Teleconnections source adapter for ENSO (NOAA ONI), IOD (BOM DMI), and MJO (BOM RMM).

Parses authoritative open climate index data from NOAA CPC and BOM Australia.
Produces unified daily records matching public.teleconnections_history.
"""

from __future__ import annotations

import datetime
from io import StringIO
from typing import Any, Optional

import requests
from pipeline.sources.base import AdapterResult, BaseSourceAdapter
from pipeline.utils.validation import validate_teleconnection_record


class TeleconnectionsAdapter(BaseSourceAdapter):
    """Adapter for global teleconnection indices (ENSO, IOD, MJO)."""

    # Upstream public data URLs (no API key required)
    NOAA_ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
    BOM_RMM_URL = "http://www.bom.gov.au/climate/mjo/graphics/rmm.74toRealtime.txt"
    # Alternative reliable mirror for NOAA ONI
    NOAA_ONI_FALLBACK_URL = "https://psl.noaa.gov/data/correlation/oni.data"
    # BOM DMI index (HadISST / BOM)
    BOM_DMI_URL = "https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data"

    @property
    def name(self) -> str:
        return "TELECONNECTIONS"

    @property
    def is_configured(self) -> bool:
        # Public data sources require no secret keys
        return True

    def fetch_mjo_daily(self) -> dict[datetime.date, tuple[int, float]]:
        """Fetch Wheeler-Hendon RMM MJO phase and amplitude from BOM Australia."""
        self.logger.info("Fetching MJO index from BOM Australia...")
        resp = self.request_with_retry("GET", self.BOM_RMM_URL)
        mjo_map: dict[datetime.date, tuple[int, float]] = {}

        for line in resp.text.splitlines():
            parts = line.strip().split()
            if len(parts) >= 7 and parts[0].isdigit():
                try:
                    yr = int(parts[0])
                    mo = int(parts[1])
                    day = int(parts[2])
                    phase = int(parts[5])
                    amp = float(parts[6])

                    # BOM uses 999.0 for missing/unfinalized values
                    if phase in range(1, 9) and 0.0 <= amp < 99.0:
                        obs_date = datetime.date(yr, mo, day)
                        mjo_map[obs_date] = (phase, amp)
                except (ValueError, IndexError):
                    continue

        self.logger.info(f"Parsed {len(mjo_map)} daily MJO records")
        return mjo_map

    def fetch_oni_monthly(self) -> dict[tuple[int, int], float]:
        """Fetch NOAA CPC Oceanic Niño Index (3-month running mean anomaly)."""
        self.logger.info("Fetching ENSO ONI index from NOAA CPC...")
        oni_map: dict[tuple[int, int], float] = {}
        month_map = {
            "DJF": 1, "JFM": 2, "FMA": 3, "MAM": 4,
            "AMJ": 5, "MJJ": 6, "JJA": 7, "JAS": 8,
            "ASO": 9, "SON": 10, "OND": 11, "NDJ": 12,
        }

        try:
            resp = self.request_with_retry("GET", self.NOAA_ONI_URL)
            for line in resp.text.splitlines():
                parts = line.strip().split()
                if len(parts) >= 4 and parts[0] in month_map and parts[1].isdigit():
                    season = parts[0]
                    year = int(parts[1])
                    try:
                        anom = float(parts[3])
                        mo = month_map[season]
                        oni_map[(year, mo)] = anom
                    except ValueError:
                        continue
        except Exception as e:
            self.logger.warning(f"NOAA CPC ONI primary failed ({e}), trying fallback mirror...")
            resp = self.request_with_retry("GET", self.NOAA_ONI_FALLBACK_URL)
            for line in resp.text.splitlines():
                parts = line.strip().split()
                if len(parts) == 13 and parts[0].isdigit():
                    year = int(parts[0])
                    for mo in range(1, 13):
                        try:
                            val = float(parts[mo])
                            if -99.0 < val < 99.0:
                                oni_map[(year, mo)] = val
                        except ValueError:
                            continue

        self.logger.info(f"Parsed {len(oni_map)} monthly ENSO ONI values")
        return oni_map

    def fetch_dmi_monthly(self) -> dict[tuple[int, int], float]:
        """Fetch Indian Ocean Dipole Mode Index (DMI)."""
        self.logger.info("Fetching IOD DMI index...")
        dmi_map: dict[tuple[int, int], float] = {}

        try:
            resp = self.request_with_retry("GET", self.BOM_DMI_URL)
            for line in resp.text.splitlines():
                parts = line.strip().split()
                if len(parts) == 13 and parts[0].isdigit():
                    year = int(parts[0])
                    for mo in range(1, 13):
                        try:
                            val = float(parts[mo])
                            if -99.0 < val < 99.0:
                                dmi_map[(year, mo)] = val
                        except ValueError:
                            continue
        except Exception as e:
            self.logger.warning(f"BOM/NOAA DMI fetch failed ({e})")

        self.logger.info(f"Parsed {len(dmi_map)} monthly IOD DMI values")
        return dmi_map

    def fetch_teleconnections_window(
        self,
        start_date: datetime.date,
        end_date: datetime.date,
    ) -> list[dict[str, Any]]:
        """Fetch and merge ENSO, IOD, and MJO indices across a date window."""
        mjo_data = self.fetch_mjo_daily()
        oni_data = self.fetch_oni_monthly()
        dmi_data = self.fetch_dmi_monthly()

        records: list[dict[str, Any]] = []
        cur_date = start_date
        one_day = datetime.timedelta(days=1)

        while cur_date <= end_date:
            yr, mo = cur_date.year, cur_date.month
            oni_val = oni_data.get((yr, mo))
            dmi_val = dmi_data.get((yr, mo))
            mjo_tuple = mjo_data.get(cur_date)

            phase = mjo_tuple[0] if mjo_tuple else None
            amp = mjo_tuple[1] if mjo_tuple else None

            # Only record days where at least one authoritative index is available
            if oni_val is not None or dmi_val is not None or phase is not None:
                record = {
                    "observation_date": str(cur_date),
                    "enso_oni": oni_val,
                    "iod_dmi": dmi_val,
                    "mjo_phase": phase,
                    "mjo_amplitude": amp,
                    "source_agency": "NOAA_CPC_BOM_AU",
                }
                valid = validate_teleconnection_record(record)
                records.append(valid)

            cur_date += one_day

        return records

    def fetch_live_recent(
        self,
        days: int = 90,
        reference_date: Optional[datetime.date] = None,
    ) -> AdapterResult[list[dict[str, Any]]]:
        """Fetch teleconnection indices for the rolling 90-day window up to reference_date (or latest available)."""
        def _fetch() -> list[dict[str, Any]]:
            mjo_data = self.fetch_mjo_daily()
            oni_data = self.fetch_oni_monthly()
            dmi_data = self.fetch_dmi_monthly()

            target_end = reference_date or datetime.date.today()
            if not reference_date and mjo_data:
                latest_mjo = max(mjo_data.keys())
                # If today is far ahead of available data (e.g. simulated clock), anchor to latest real data
                if target_end > latest_mjo:
                    target_end = latest_mjo

            start = target_end - datetime.timedelta(days=days)

            records: list[dict[str, Any]] = []
            cur_date = start
            one_day = datetime.timedelta(days=1)

            while cur_date <= target_end:
                yr, mo = cur_date.year, cur_date.month
                oni_val = oni_data.get((yr, mo))
                dmi_val = dmi_data.get((yr, mo))
                mjo_tuple = mjo_data.get(cur_date)

                phase = mjo_tuple[0] if mjo_tuple else None
                amp = mjo_tuple[1] if mjo_tuple else None

                if oni_val is not None or dmi_val is not None or phase is not None:
                    record = {
                        "observation_date": str(cur_date),
                        "enso_oni": oni_val,
                        "iod_dmi": dmi_val,
                        "mjo_phase": phase,
                        "mjo_amplitude": amp,
                        "source_agency": "NOAA_CPC_BOM_AU",
                    }
                    records.append(validate_teleconnection_record(record))
                cur_date += one_day

            return records

        return self.safe_execute(f"fetch_live_recent ({days} days)", _fetch)

    def fetch_historical(
        self,
        start_year: int = 2014,
        end_year: int = 2025,
    ) -> AdapterResult[list[dict[str, Any]]]:
        """Fetch teleconnection indices for the specified historical year span."""
        start = datetime.date(start_year, 1, 1)
        end = datetime.date(end_year, 12, 31)
        return self.safe_execute(
            f"fetch_historical ({start_year}–{end_year})",
            lambda: self.fetch_teleconnections_window(start, end),
        )
