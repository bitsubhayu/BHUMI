# BHUMI — Model Architecture & Forecasting Engine Specification

Companion to `PRD.md` and `TECH_STACK.md` §5. Documents the mathematical formulation, feature store, calibration, change-point detection, validation methodology, artifact management, and operational limits of the BHUMI probabilistic forecasting engine.

---

## 1. System Overview

The BHUMI forecasting engine generates hyperlocal 7–30 day probabilistic weather risk forecasts for all administrative blocks across India across four forward lead-time windows:
- **`week_1`**: Days 1–7
- **`week_2`**: Days 8–14
- **`week_3`**: Days 15–21
- **`week_4`**: Days 22–28

For every block and every lead week, the system produces:
1. **Onset Probability** ($P_{\text{onset}} \in [0.0, 100.0]$): Probability of monsoon onset or active onset window.
2. **Break Probability** ($P_{\text{break}} \in [0.0, 100.0]$): Probability of a persistent dry-break spell (rainfall $< 2.5\text{ mm/day}$ for $\ge 4$ consecutive days).
3. **Heavy-Rain Probability** ($P_{\text{heavy}} \in [0.0, 100.0]$): Probability of heavy precipitation ($\ge 64.5\text{ mm/day}$).
4. **Calibrated Confidence** ($C \in [0.0, 100.0]$): Distribution entropy and sharpness score.
5. **Primary Physical Driver**: Dominant planetary or synoptic climate driver (e.g., *"Negative IOD (DMI -0.48) + MJO Phase 3 suppressed convection"*).
6. **Secondary Physical Driver**: Local agro-hydrological / terrain / analog driver (e.g., *"Critical soil moisture deficit (18.5%) + Teleconnection analog to 2018 monsoon pattern"*).
7. **Analogous Historical Year**: Closest historical match year in teleconnection state space.
8. **ICAR/KVK Advisory Code**: Action code (`safe_to_sow`, `delay_sowing`, `prepare_irrigation`, `drainage_alert`, `monitor_conditions`).

Predictions are written to `public.live_predictions` in Supabase Postgres. Nothing computationally heavy runs in the client or frontend.

---

## 2. Multi-Stage Model Architecture

### Stage 1: Teleconnection State Model
- **Primary: Analog Ensemble**
  - Inputs: ENSO / ONI (Oceanic Niño Index), IOD / DMI (Dipole Mode Index), MJO phase (1–8) and amplitude ($A \ge 0$).
  - MJO circular mapping to continuous 2D RMM Cartesian coordinates:
    $$RMM_1 = A \cos\left(\frac{2\pi (\text{phase} - 1)}{8}\right), \quad RMM_2 = A \sin\left(\frac{2\pi (\text{phase} - 1)}{8}\right)$$
  - Trajectory derivatives: $\Delta \text{ONI}_{14\text{d}}, \Delta \text{DMI}_{14\text{d}}, \Delta RMM_{1, 14\text{d}}, \Delta RMM_{2, 14\text{d}}$.
  - Distance metric: Weighted normalized Euclidean distance:
    $$D(s_1, s_2) = \sqrt{\sum_{i=1}^8 w_i \left(\frac{s_{1,i} - s_{2,i}}{\sigma_i + \epsilon}\right)^2}$$
    where $w = [1.5, 1.2, 1.0, 1.0, 0.8, 0.6, 0.5, 0.5]$.
  - Softmax weighting over Top-$K$ analogs ($K=5$) with negative exponential distance:
    $$W_k = \frac{\exp(-D_k / \tau)}{\sum_j \exp(-D_j / \tau)}$$
- **Secondary: Small GRU Sequence Model**
  - Single-layer Gated Recurrent Unit (GRU) with 16 hidden units (~1,100 parameters).
  - Takes 30-day temporal sequence of $[ONI, DMI, RMM_1, RMM_2, A]$ to cross-check trajectory nonlinearity.
- **Ensemble Combination**:
  $$P_{\text{telecon}}(w) = 0.70 \cdot P_{\text{analog}}(w) + 0.30 \cdot P_{\text{gru}}(w)$$

### Stage 2: Block-Level Downscaling Ensemble
- **Primary: LightGBM Classifier** (`LGBMClassifier`, 60 estimators, max depth 4, 15 leaves).
- **Secondary: XGBoost Classifier** (`XGBClassifier`, 50 estimators, max depth 3, subsample 0.8).
- **2-Model Ensemble**:
  $$P_{\text{downscale}} = 0.50 \cdot P_{\text{LGBM}} + 0.50 \cdot P_{\text{XGB}}$$

### Stage 3: Probability Calibration
- Raw classifier probabilities are **never** reported directly as final risk percentages.
- **Platt Scaling**: Logistic regression fitted on validation log-odds:
  $$\hat{P} = \frac{1}{1 + \exp(A \cdot P_{\text{raw}} + B)}$$
- **Isotonic Regression**: Non-parametric piecewise isotonic step mapping:
  $$\hat{P} = \text{np.interp}(P_{\text{raw}}, X_{\text{thresholds}}, y_{\text{thresholds}})$$
- **Selection**: Time-respecting validation fold chooses between Platt and Isotonic by minimizing validation Brier score.
- **Scaling**: Final percentages strictly clamped to $[0.0, 100.0]$.

### Stage 4: Change-Point Detection
- **Sequential Mann-Kendall ($u(t), u'(t)$)** and **Pettitt's Rank Test** identify discrete onset dates and abrupt transition to dry breaks.
- Feeds discrete change-point dates into the explanation and advisory attribution layer.

---

## 3. Tabular Feature Schema (26 Features)

| Feature Name | Description | Source | Lookahead Check |
|---|---|---|---|
| `centroid_lat` | Block centroid latitude | `public.blocks` | Static |
| `centroid_lon` | Block centroid longitude | `public.blocks` | Static |
| `elevation_m` | Mean terrain elevation (meters) | `public.blocks` | Static |
| `slope_deg` | Mean terrain slope (degrees) | `public.blocks` | Static |
| `distance_to_coast_km` | Distance to coastline (km) | `public.blocks` | Static |
| `enso_oni` | Oceanic Niño Index | NOAA CPC | Current $t$ |
| `iod_dmi` | Indian Ocean Dipole Mode Index | BOM Australia | Current $t$ |
| `mjo_phase` | Real-time Multivariate MJO Phase (1–8) | BOM Australia | Current $t$ |
| `mjo_amplitude` | MJO Amplitude | BOM Australia | Current $t$ |
| `analog_onset_prob` | Stage 1 analog onset signal | Stage 1 | Current $t$ |
| `analog_active_prob` | Stage 1 analog active signal | Stage 1 | Current $t$ |
| `analog_break_prob` | Stage 1 analog break signal | Stage 1 | Current $t$ |
| `analog_heavy_prob` | Stage 1 analog heavy-rain signal | Stage 1 | Current $t$ |
| `climatology_mean_rain_mm` | Historical seasonal mean daily rainfall | Seasonal archive | Historical |
| `climatology_std_rain_mm` | Historical seasonal standard deviation | Seasonal archive | Historical |
| `rain_lag_1d_mm` | 1-day lagged rainfall (day $t-1$) | Reanalysis / Buffer | Strictly past ($t-1$) |
| `rain_lag_3d_sum_mm` | 3-day cumulative rainfall | Reanalysis / Buffer | Strictly past ($t-3:t$) |
| `rain_lag_7d_sum_mm` | 7-day cumulative rainfall | Reanalysis / Buffer | Strictly past ($t-7:t$) |
| `rain_lag_14d_sum_mm` | 14-day cumulative rainfall | Reanalysis / Buffer | Strictly past ($t-14:t$) |
| `temp_lag_1d_c` | 1-day lagged maximum temperature | Reanalysis / Buffer | Strictly past ($t-1$) |
| `temp_lag_7d_mean_c` | 7-day mean maximum temperature | Reanalysis / Buffer | Strictly past ($t-7:t$) |
| `soil_moisture_latest` | Latest root-zone soil wetness index | NASA SMAP / Buffer | Current $t$ |
| `soil_moisture_7d_trend` | 7-day soil moisture change | NASA SMAP / Buffer | Strictly past ($t-7:t$) |
| `recent_break_days_14d` | Break days in past 14 days | Reanalysis / Buffer | Strictly past ($t-14:t$) |
| `recent_active_days_14d` | Active days in past 14 days | Reanalysis / Buffer | Strictly past ($t-14:t$) |
| `lead_week` | Lead time bucket indicator (1, 2, 3, 4) | Forecast horizon | Known constant |

---

## 4. Training Strategy & Leakage Prevention

1. **Temporal Rolling-Origin Splits (`RollingOriginSplitter`)**:
   - Time-series data is **never shuffled**.
   - Chronological partition: Earlier seasons $\rightarrow$ Training, Intermediate season $\rightarrow$ Calibration/Validation, Latest held-out season $\rightarrow$ Test.
2. **Leakage Prevention**:
   - Feature vectors at observation day $t$ strictly sample indices $< t$.
   - Target labels are evaluated exclusively in the forward horizon $[t + (w-1)\cdot 7, t + w \cdot 7]$.
3. **Multi-Dimensional Metrics**:
   - Multi-class Brier score ($BS \in [0, 1]$, lower is better)
   - Expected Calibration Error (ECE) across 10 confidence bins
   - Multi-class Log Loss
   - ROC-AUC (One-vs-Rest macro and per-class)
   - Confusion Matrix and Per-Class Precision, Recall, and F1
   - Lead-time specific breakdown (`week_1` through `week_4`)

---

## 5. Model Artifact Storage (< 1 MB Total)

Trained artifacts are stored in `pipeline/ml/artifacts/` and committed version-controlled:
- `metadata.json`: Model version, training timestamps, data coverage limitations, validation metrics.
- `lgb_downscaling.txt`: LightGBM booster text representation (~335 KB).
- `xgb_downscaling.json`: XGBoost JSON representation (~180 KB).
- `ensemble_meta.json`: Ensemble configuration and feature names (~1 KB).
- `calibrator.json`: Calibration knots and coefficients (~1 KB).
- `gru_weights.json`: GRU layer weights (~27 KB).
- **Total footprint: ~548 KB**, easily fitting within the 500 MB Supabase and GitHub repository constraints.

---

## 6. Daily Production Pipeline Flow

The GitHub Actions workflow (`.github/workflows/daily-live-sync.yml`) runs at 00:30 UTC (06:00 AM IST) daily:
```
[Data Ingestion]
  → Pull latest NOAA ONI, BOM DMI, BOM MJO
  → Pull NOAA GFS + ECMWF Open Data + NASA SMAP
  → Validate records & pack into public.live_weather_buffer
  → Enforce 90-day rolling buffer retention
[ML Inference]
  → Load latest teleconnection trajectory & block metadata
  → Run Stage 1 (Analog Ensemble + Small GRU)
  → Run Stage 2 (LightGBM + XGBoost Downscaling)
  → Run Stage 3 (Probability Calibration)
  → Run Stage 4 (Change-Point Analysis)
  → Run Stage 11 (Driver Attribution & ICAR Advisory Mapping)
  → Upsert predictions into public.live_predictions
```

---

## 7. Retraining Cadence

- **Offline Seasonal Cadence**: Retraining runs twice per year (Pre-Kharif in May, Pre-Rabi in October) via `.github/workflows/seasonal-retraining.yml`.
- Retraining is **strictly separated from daily inference** to maintain stability and prevent catastrophic forgetting.

---

## 8. Data Readiness Audit & IMD Status

1. **Current Archive Coverage**:
   - Supabase archive currently contains 4 administrative blocks (Haveli Pune, Mandore Jodhpur, Barasat West Bengal) with authentic 214-day seasonal data for season 2024.
   - Real-data training extracts 192 authentic samples without synthetic fabrication.
   - National validation claims are restricted strictly to the available real data.
2. **IMD Ground-Truth Status**:
   - Official IMD Pune credentials/bulletins are currently unconfigured.
   - `IMDGroundTruthAdapter` reports `IMD_VALIDATION_UNAVAILABLE` cleanly without inventing synthetic benchmark scores.
