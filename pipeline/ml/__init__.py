"""BHUMI Machine Learning & Forecasting Engine.

Implements the 3-stage probabilistic forecasting architecture specified in
TECH_STACK.md §5 and PRD §5:
  Stage 1: Teleconnection State Model (Analog Ensemble + Small GRU sequence model)
  Stage 2: Block-Level Downscaling (LightGBM + XGBoost 2-model ensemble)
  Stage 3: Probability Calibration & Change-Point Detection (Platt/Isotonic + Mann-Kendall)
"""

__version__ = "1.0.0"
