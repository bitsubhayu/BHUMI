"""Rolling-Origin Temporal Validation Splitter.

Enforces strict temporal ordering:
  - Never shuffles time series
  - Training window precedes validation window
  - Validation window precedes test window
  - Guarantees zero lookahead leakage
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterator, Sequence


@dataclass
class TemporalSplit:
    """A train/validation/test split of indices by season years."""
    train_years: list[int]
    val_years: list[int]
    test_years: list[int]
    train_indices: list[int]
    val_indices: list[int]
    test_indices: list[int]


class RollingOriginSplitter:
    """Generates rolling-origin time-based cross-validation splits across seasons."""

    def __init__(
        self,
        min_train_years: int = 1,
        val_years_count: int = 1,
        test_years_count: int = 1,
    ) -> None:
        self.min_train_years = min_train_years
        self.val_years_count = val_years_count
        self.test_years_count = test_years_count

    def split(self, meta_rows: Sequence[dict[str, Any]]) -> Iterator[TemporalSplit]:
        """Yield temporal splits based on the 'season_year' field of meta_rows."""
        if not meta_rows:
            return

        all_years = sorted(list({int(m["season_year"]) for m in meta_rows if "season_year" in m}))
        if len(all_years) < (self.min_train_years + self.val_years_count):
            # If dataset has fewer seasons (e.g. initial archive with 1-2 seasons),
            # split by date within the season(s) to preserve temporal integrity.
            yield self._split_by_date(meta_rows)
            return

        total_seasons = len(all_years)
        max_train_start = total_seasons - self.val_years_count - self.test_years_count + 1
        for i in range(self.min_train_years, max(self.min_train_years + 1, max_train_start)):
            train_yr = all_years[:i]
            val_yr = all_years[i : i + self.val_years_count]
            test_yr = all_years[i + self.val_years_count : i + self.val_years_count + self.test_years_count]

            if not val_yr or not test_yr:
                continue

            train_idx = [idx for idx, m in enumerate(meta_rows) if int(m.get("season_year", 0)) in train_yr]
            val_idx = [idx for idx, m in enumerate(meta_rows) if int(m.get("season_year", 0)) in val_yr]
            test_idx = [idx for idx, m in enumerate(meta_rows) if int(m.get("season_year", 0)) in test_yr]

            yield TemporalSplit(
                train_years=train_yr,
                val_years=val_yr,
                test_years=test_yr,
                train_indices=train_idx,
                val_indices=val_idx,
                test_indices=test_idx,
            )

    @staticmethod
    def _split_by_date(meta_rows: Sequence[dict[str, Any]]) -> TemporalSplit:
        """Fallback split by date within available season(s) to strictly maintain time direction."""
        sorted_indices = sorted(range(len(meta_rows)), key=lambda idx: str(meta_rows[idx].get("date", "")))
        n = len(sorted_indices)
        train_end = int(0.60 * n)
        val_end = int(0.80 * n)

        train_idx = sorted_indices[:train_end]
        val_idx = sorted_indices[train_end:val_end]
        test_idx = sorted_indices[val_end:]

        train_yr = sorted(list({int(meta_rows[i].get("season_year", 2024)) for i in train_idx}))
        val_yr = sorted(list({int(meta_rows[i].get("season_year", 2024)) for i in val_idx}))
        test_yr = sorted(list({int(meta_rows[i].get("season_year", 2024)) for i in test_idx}))

        return TemporalSplit(
            train_years=train_yr,
            val_years=val_yr,
            test_years=test_yr,
            train_indices=train_idx,
            val_indices=val_idx,
            test_indices=test_idx,
        )
