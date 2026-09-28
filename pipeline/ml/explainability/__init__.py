"""Stage 11: Explainability and Physical Driver Attribution.

Derives interpretable, physical explanations for block-level risk predictions
based on actual model feature contributions, teleconnection indices, and soil-moisture anomalies.
"""

from pipeline.ml.explainability.driver_attribution import DriverAttributionEngine

__all__ = ["DriverAttributionEngine"]
