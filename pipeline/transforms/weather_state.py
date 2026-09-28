"""Monsoon weather state classification engine.

Implements operational IMD / NCMRWF classification criteria for:
  - 0: Normal (standard light/moderate rainfall or dry pre/post monsoon day)
  - 1: Onset (transition window marking monsoon arrival at the block)
  - 2: Active (active monsoon spell: widespread daily rainfall > 15 mm)
  - 3: Break (monsoon break: >= 3 consecutive days with rain < 2.5 mm during peak season)
  - 4: Heavy (heavy rainfall event: daily rainfall >= 64.5 mm)
"""

from __future__ import annotations

import datetime
from typing import Sequence


def classify_monsoon_states(
    dates: Sequence[datetime.date],
    rainfall_mm: Sequence[float],
) -> list[int]:
    """Classify 214 daily rainfall values into weather state codes (0 to 4).
    
    Parameters:
      dates: 214 dates (1 April to 31 October).
      rainfall_mm: 214 daily rainfall amounts in millimeters.
      
    Returns:
      List of 214 integer codes in {0, 1, 2, 3, 4}.
    """
    n = len(rainfall_mm)
    if n != 214:
        raise ValueError(f"Expected exactly 214 daily rainfall values, got {n}")

    state_codes = [0] * n

    # Step 1: Detect Heavy Rainfall events (IMD standard >= 64.5 mm)
    for i in range(n):
        if rainfall_mm[i] >= 64.5:
            state_codes[i] = 4

    # Step 2: Detect Monsoon Onset
    # Operational IMD definition: After 10 May, 2 consecutive days with rain >= 2.5 mm
    onset_idx = -1
    for i in range(n):
        d = dates[i]
        # Onset search window: 10 May to 15 July (days ~40 to ~105)
        if (d.month == 5 and d.day >= 10) or d.month == 6 or (d.month == 7 and d.day <= 15):
            if i + 1 < n and rainfall_mm[i] >= 2.5 and rainfall_mm[i + 1] >= 2.5:
                onset_idx = i
                break

    if onset_idx != -1:
        # Mark onset transition window (the 2-3 days of initial sustained rain)
        for k in range(onset_idx, min(onset_idx + 3, n)):
            if state_codes[k] != 4:
                state_codes[k] = 1

    # Step 3: Detect Active Monsoon Spells and Monsoon Breaks (June 1 - Sept 30)
    dry_spell_start = -1
    for i in range(n):
        d = dates[i]
        is_core_monsoon = d.month in (6, 7, 8, 9) and (onset_idx == -1 or i > onset_idx + 2)

        if is_core_monsoon:
            rain = rainfall_mm[i]

            # Check for Active monsoon day (substantial rainfall > 15 mm not classified as heavy)
            if rain >= 15.0 and state_codes[i] == 0:
                state_codes[i] = 2

            # Track consecutive dry days for Break detection
            if rain < 2.5:
                if dry_spell_start == -1:
                    dry_spell_start = i
            else:
                if dry_spell_start != -1:
                    spell_len = i - dry_spell_start
                    if spell_len >= 3:
                        # Mark this dry spell as a Monsoon Break
                        for k in range(dry_spell_start, i):
                            if state_codes[k] == 0:
                                state_codes[k] = 3
                    dry_spell_start = -1

    # Handle dry spell reaching end of month
    if dry_spell_start != -1:
        spell_len = n - dry_spell_start
        if spell_len >= 3:
            for k in range(dry_spell_start, n):
                if state_codes[k] == 0:
                    state_codes[k] = 3

    return state_codes


def classify_recent_observation_states(
    dates: Sequence[datetime.date | str],
    rainfall_mm: Sequence[float],
) -> list[int]:
    """Classify an arbitrary sequence of recent daily observations into weather state codes (0 to 4).
    
    Maintains exact consistency with authoritative IMD / NCMRWF classification criteria:
      - 4: Heavy rainfall (>= 64.5 mm)
      - 2: Active spell (>= 15.0 mm)
      - 3: Break spell (>= 3 consecutive days with rain < 2.5 mm)
      - 0: Normal / light rainfall
    """
    n = len(rainfall_mm)
    if n == 0:
        return []

    state_codes = [0] * n
    for i in range(n):
        if rainfall_mm[i] >= 64.5:
            state_codes[i] = 4
        elif rainfall_mm[i] >= 15.0:
            state_codes[i] = 2

    # Break detection (>= 3 consecutive days < 2.5 mm)
    dry_spell_start = -1
    for i in range(n):
        if rainfall_mm[i] < 2.5:
            if dry_spell_start == -1:
                dry_spell_start = i
        else:
            if dry_spell_start != -1:
                if i - dry_spell_start >= 3:
                    for k in range(dry_spell_start, i):
                        if state_codes[k] == 0:
                            state_codes[k] = 3
                dry_spell_start = -1

    if dry_spell_start != -1 and (n - dry_spell_start) >= 3:
        for k in range(dry_spell_start, n):
            if state_codes[k] == 0:
                state_codes[k] = 3

    return state_codes

