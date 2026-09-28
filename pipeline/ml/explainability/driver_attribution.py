"""Stage 11: Physical Driver Attribution Engine.

Translates mathematical feature contributions and physical indices into
transparent, farmer- and officer-interpretable explanations as specified in TECH_STACK.md §5 and PRD §2.
"""

from __future__ import annotations

from typing import Any, Optional


class DriverAttributionEngine:
    """Attribution engine determining primary and secondary physical drivers."""

    @staticmethod
    def attribute(
        telecon: dict[str, Any],
        block: dict[str, Any],
        lead_week: str,
        onset_prob: float,
        break_prob: float,
        heavy_prob: float,
        soil_moisture: Optional[float] = None,
        rain_7d_sum: Optional[float] = None,
        analog_year: Optional[int] = None,
        changepoint_info: Optional[dict[str, Any]] = None,
    ) -> tuple[str, str, str]:
        """Determine primary_driver, secondary_driver, and advisory_code from actual values.
        
        Returns:
            (primary_driver, secondary_driver, advisory_code)
        """
        oni = float(telecon.get("enso_oni") or 0.0)
        dmi = float(telecon.get("iod_dmi") or 0.0)
        phase = int(telecon.get("mjo_phase") or 1)
        amp = float(telecon.get("mjo_amplitude") or 1.0)

        elev = float(block.get("elevation_m") or 250.0)
        coast_km = float(block.get("distance_to_coast_km") or 200.0)

        # 1. Primary Driver: Dominant physical teleconnection or synoptic signal
        primary_parts: list[str] = []
        if abs(dmi) >= 0.40:
            if dmi < 0:
                primary_parts.append(f"Negative IOD (DMI {dmi:.2f})")
            else:
                primary_parts.append(f"Positive IOD (DMI +{dmi:.2f})")
        elif abs(oni) >= 0.50:
            if oni > 0:
                primary_parts.append(f"El Niño signal (ONI +{oni:.2f})")
            else:
                primary_parts.append(f"La Niña signal (ONI {oni:.2f})")
        else:
            primary_parts.append(f"ENSO-neutral (ONI {oni:+.2f})")

        # Add MJO component
        if 4 <= phase <= 6 and amp >= 1.0:
            primary_parts.append(f"MJO Phase {phase} convective surge")
        elif phase in (1, 2, 8) and amp >= 1.0:
            primary_parts.append(f"MJO Phase {phase} suppressed convection")
        elif amp >= 1.5:
            primary_parts.append(f"Active MJO Phase {phase}")
        else:
            primary_parts.append("quiescent MJO")

        primary_driver = " + ".join(primary_parts)

        # 2. Secondary Driver: Local agro-hydrological / terrain / analog factor
        secondary_candidates: list[str] = []

        if changepoint_info and changepoint_info.get("detected"):
            trans_date = changepoint_info.get("transition_date")
            secondary_candidates.append(f"Change-point shift detected ({trans_date})")

        if soil_moisture is not None:
            if soil_moisture < 25.0:
                secondary_candidates.append(f"Critical soil moisture deficit ({soil_moisture:.1f}%)")
            elif soil_moisture > 75.0:
                secondary_candidates.append(f"High root-zone saturation ({soil_moisture:.1f}%)")
            else:
                secondary_candidates.append(f"Moderate soil moisture ({soil_moisture:.1f}%)")

        if rain_7d_sum is not None:
            if rain_7d_sum < 5.0 and break_prob > 40.0:
                secondary_candidates.append(f"Prolonged 7-day rainfall gap ({rain_7d_sum:.1f} mm)")
            elif rain_7d_sum > 100.0:
                secondary_candidates.append(f"Excessive recent rainfall ({rain_7d_sum:.1f} mm/7d)")

        if analog_year:
            secondary_candidates.append(f"Teleconnection analog to {analog_year} monsoon pattern")

        if coast_km < 80.0:
            secondary_candidates.append(f"Coastal moisture flux ({coast_km:.0f} km from sea)")
        elif elev > 800.0:
            secondary_candidates.append(f"Orograhic rain-shadow elevation ({elev:.0f}m)")

        secondary_driver = " + ".join(secondary_candidates[:2]) if secondary_candidates else "Local climatological baseline"

        # 3. Advisory Code Mapping (ICAR / KVK aligned thresholds)
        if break_prob >= 50.0 and (soil_moisture is None or soil_moisture < 35.0):
            advisory_code = "delay_sowing" if lead_week in ("week_1", "week_2") else "prepare_irrigation"
        elif heavy_prob >= 40.0:
            advisory_code = "drainage_alert"
        elif onset_prob >= 50.0 and (soil_moisture is None or soil_moisture >= 40.0):
            advisory_code = "safe_to_sow"
        elif break_prob >= 40.0:
            advisory_code = "prepare_irrigation"
        else:
            advisory_code = "monitor_conditions"

        return primary_driver, secondary_driver, advisory_code
