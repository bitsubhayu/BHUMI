"""Stage 4: Change-Point Detection.

Statistical transition detection for monsoon onset and dry-break episodes
using Sequential Mann-Kendall / Pettitt's test and Bayesian Online Change-Point Detection.
"""

from pipeline.ml.changepoint.detector import ChangePointDetector

__all__ = ["ChangePointDetector"]
