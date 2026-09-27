# BHUMI — Product Requirements Document

**B-H-U-M-I — Block-level Hydro-meteorological Updates for Micro-climate Intelligence**

| | |
|---|---|
| SIH 2026 Problem Statement | **26086** — Hyperlocal Monsoon Onset & Break Prediction System (Block/Village Scale) |
| Organization / Department | Ministry of Earth Sciences (MoES) / National Centre for Medium Range Weather Forecasting (NCMRWF) |
| Category / Theme | Software / Agriculture, FoodTech & Rural Development |
| Repository | github.com/bitsubhayu/BHUMI |

---

## 1. Problem, in one paragraph

Macro-scale monsoon forecasts miss the thing that actually decides whether a Kharif crop survives: whether a *specific block* sees a false onset, a break that lasts long enough to kill young seedlings, or a revival window worth re-sowing for. Farmers who act on a district- or state-level forecast are effectively acting on noise. The gap isn't rainfall data — it's translating global-scale climate signals (ENSO, IOD, MJO) into a block/panchayat-level probability that something specific (onset / break / heavy spell) happens in the next 1–4 weeks, in a form a farmer or extension officer can act on immediately.

## 2. MVP scope (what we commit to building for SIH)

1. A **block-level risk engine** that outputs, for every block in India, the probability of monsoon onset, a dry break, or a heavy-rain spell over four weekly lead-time buckets (week 1–4).
2. A **panchayat-level view**, computed on demand from the block value plus a static terrain adjustment — not stored separately (see Tech Stack §3).
3. A **map-based web app** (mobile-responsive PWA) showing color-coded risk by block, drillable to panchayat, refreshed once daily.
4. A **rule-based advisory engine** that turns a risk score into a plain-language, crop-specific recommendation (delay sowing / prepare irrigation / safe to sow), seeded from ICAR/KVK agronomic thresholds.
5. **Regional-language delivery**: advisory text in the farmer's language on the web app, plus a WhatsApp bot the farmer/officer can message to pull the same advisory (design rationale in Tech Stack §7).
6. **Explainability**: every risk score is shown with the one or two dominant drivers behind it (e.g. "IOD negative + MJO phase 3 → 65% break risk, next 2 weeks"), not just a number.

## 3. Explicit non-goals for the hackathon build

- No permanent panchayat-level historical storage (computed at serve time only).
- No proactive, always-on bulk WhatsApp/SMS push to real farmer phone numbers at scale — this needs a paid message volume once past free-tier limits (see Tech Stack §7). The MVP demo simulates this and supports a small real pilot list.
- No full neural machine-translation model running live; advisories are generated from templates + translation API, not free-form text.
- No support for irrigation-scheduling or crop-insurance calculations — advisory is sowing/dry-spell guidance only.

## 4. Users

| User | Need | How BHUMI serves them |
|---|---|---|
| Farmer (Kharif) | "Should I sow this week?" in their own language, on a basic smartphone | Web PWA + WhatsApp pull-bot, plain-language advisory |
| Agricultural extension officer | Block/panchayat-level view across their jurisdiction, more technical detail | Web app with map, probability breakdowns, explainability panel |
| Hackathon judges | Evidence the system is accurate, novel, and actually deployable by government post-event | Live demo, calibration/accuracy view, zero recurring cost |

## 5. Core features → problem-statement requirement mapping

| PS requirement | BHUMI feature |
|---|---|
| Ingest ENSO/IOD/MJO and downscale to local precipitation | Two-stage model: teleconnection state → block downscaling (Tech Stack §5) |
| 7–30 day probabilistic outlook, block/panchayat scale | Weekly-bucketed probability output, block stored + panchayat computed |
| Dynamic, color-coded risk maps | Map view, refreshed daily from precomputed predictions |
| Expert-system crop advisory | Rule-based engine on top of calibrated probabilities |
| Mobile web app or SMS/WhatsApp gateway, regional languages | Both: PWA (primary) + WhatsApp pull-bot (secondary channel) |

## 6. Success criteria

- **Accuracy**: model's onset/break classification is compared against IMD's own recorded onset/break dates for past seasons (backtested, not just training accuracy); report a calibration curve, not just a headline accuracy number, since the PS explicitly asks for probabilities.
- **Latency**: user-perceived response on the web app stays near-instant, since the app only ever reads a precomputed table — this is a systems property to demonstrate, not just claim (see Tech Stack §1).
- **Coverage**: all ~6,700 blocks in India represented, not a curated subset.
- **Cost**: entire pipeline runs at ₹0 recurring cost, provable from the account list in Tech Stack §9.
- **Differentiation**: judges can see, side by side, why this is a different product from Meghdoot rather than a re-skin of it (§7).

## 7. Competitive landscape & differentiation

| Product | What it is | Gap BHUMI addresses |
|---|---|---|
| **Meghdoot** (IMD/ICRISAT/ICAR) | Free govt app, block-level, biweekly advisories in 13 languages, built on GFS/CFSv2 | Medium-range (5-day) + a general extended outlook, not a dedicated 7–30 day onset/break *probability* product; updates twice a week; no panchayat granularity; no explicit ENSO/IOD/MJO downscaling |
| **Skymet** | Private, own AWS network, genuinely village-level | Paid B2B (insurers, media, governments) — not free, direct-to-farmer |
| **Kisan Suvidha** and similar govt apps | Basic weather + advisory | Same granularity/cadence limits as Meghdoot |

BHUMI's pitch: the only free, open-source product framed explicitly around onset/break/heavy-spell **probability** at panchayat scale, updated daily, with an explainable driver behind every number, and zero recurring cost — which matters for whether a government body could actually adopt it after the hackathon ends.

## 8. Constraints (given, not negotiable for this build)

- Frontend hosted on **Vercel free (Hobby)** tier.
- Database is **Supabase**, hard-capped at **500 MB**.
- Every data source and every piece of infrastructure must be free.
- Must stay responsive/fast; animation is allowed but must not cause jank on a free-tier serverless frontend.

## 9. Key risks & mitigations

| Risk | Mitigation |
|---|---|
| IMD gridded data access has a registration step, not an instant API | Start the registration in week 1; use CHIRPS/GPM as free, instant-access substitutes for anything time-boxed |
| Supabase free project auto-pauses after 7 days idle | The daily ingestion job (Tech Stack §4) touches the DB every day, which keeps it active by construction |
| Limited years of local ground truth for a genuinely novel ML system | Report calibration honestly (Brier score / reliability diagram) rather than a single inflated accuracy number; lean on the rule-based/analog layer for years where ML confidence is low |
| WhatsApp/SMS proactive push is not actually free at real scale | Ship the PWA as the primary, fully-free channel; frame WhatsApp as a pull-based bot within free service-conversation terms (Tech Stack §7), not a bulk push |
| 500 MB fills up faster than expected | Schema in Tech Stack §3 is deliberately array-packed, not one-row-per-day, specifically to avoid this |

## 10. Build phases (rough, for a hackathon timeline)

1. **Phase 0** — data pipeline: registrations, ingestion scripts, Supabase schema, one full historical backfill.
2. **Phase 1** — models: analog engine + LightGBM/XGBoost downscaling + calibration; validate against IMD's historical onset/break record.
3. **Phase 2** — frontend: map, risk display, drill-down, explainability panel.
4. **Phase 3** — advisory + language layer, WhatsApp pull-bot.
5. **Phase 4** — polish pass, demo script, accuracy/backtest slide for judges.

## 11. Phase-2 / stretch scope (not for the initial build)

- Graph neural network across block adjacency for spatially-smoother risk maps.
- Real IndicTrans2 model instead of template + translation API.
- Paid-tier WhatsApp push for a real farmer pilot group.
- Panchayat-level historical storage once budget/hosting allows moving off the free tier.
