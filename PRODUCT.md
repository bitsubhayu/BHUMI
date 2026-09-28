# BHUMI — Product Definition

> **Block-level Hydro-meteorological Updates for Micro-climate Intelligence**  
> Developed for Smart India Hackathon 2026, Problem Statement 26086 (Ministry of Earth Sciences / NCMRWF): Hyperlocal monsoon onset, break (dry spell), and heavy rain prediction at block and panchayat scale.

---

## Platform
- **Target:** Web application (Mobile-first, installable Progressive Web App / PWA).
- **Deployment:** Vercel Hobby tier, static export / ISR with client-side read-only queries. Zero serverless compute overhead.
- **Supported Formats:** Responsive across smartphones (360×640, 390×844, 412×915), tablets (768×1024), and desktop displays (1024×768, 1440×900, 1920×1080).

---

## Purpose
BHUMI bridges complex meteorological teleconnections and downscaled weather projections into actionable, plain-language agronomic risk forecasts for Indian farming communities. It delivers 1-to-4 week lead forecasts for:
1. **Monsoon Onset:** Timing and probability of monsoon arrival.
2. **Dry Spell (Monsoon Break):** Periods of rainfall deficit during Kharif crop cycles.
3. **Heavy Rain Spells:** Extreme precipitation risks requiring drainage or delay in operations.

---

## Users & Jobs

### 1. Smallholder Farmers
- **Context:** Accesses the interface outdoors on basic Android devices over variable 3G/4G connectivity, often under direct solar glare.
- **Languages:** Primary interaction in Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Kannada, Punjabi, Odia, or English.
- **Job to be Done:** Answer the core operational question in under 5 seconds: *"For my block, in the next 1 to 4 weeks, will the monsoon start, pause, or pour, and should I sow now?"*

### 2. Agricultural Extension Officers (KVK / Block Agronomists)
- **Context:** Inspects multiple administrative blocks across districts on mobile or desktop; generates shareable or printable multi-week advisories.
- **Job to be Done:** Review lead week progressions, evaluate crop contingencies, verify underlying drivers, and print or share localized advisories with farmer cooperatives.

### 3. Hackathon Judges & Operational Stakeholders
- **Context:** Evaluates system capability on laptop screens or projectors.
- **Job to be Done:** Review national coverage, probe model readiness and data provenance, and verify transparent teleconnection explainability.

---

## Operating Context & Constraints

- **Connectivity & Hardware:** Optimized for low-end GPUs and weak mobile data. First paint must not depend on map tile availability.
- **Outdoor Legibility:** High-contrast design tokens exceeding WCAG 2.2 AA (4.5:1 for body text, 3:1 for large graphical elements). Amber brand accents are strictly separated from hazard risk ramps.
- **Zero Hallucinated / Synthesized Data:** The UI never computes or synthesizes forecasts client-side. Probabilities, drivers, and advisories are supplied directly by the calibrated pipeline or explicitly labelled mock generator.
- **Public Read-Only Security:** Browser execution uses public/anonymous PostgREST access or static API routes. Zero `service_role` keys or administrative credentials exist in client bundles.
- **Zero Arbitrary Code Execution:** The frontend contains no `eval()`, `new Function()`, or dynamic runtime script evaluation.

---

## Voice & Tone
- **Plain & Respectful:** Direct, active verbs naming agro-meteorological events the way farmers communicate ("Monsoon start", "Dry spell", "Heavy rain").
- **No Unexplained Jargon:** Primary screens avoid technical jargon such as "teleconnection", "downscaling", "MJO", or "IOD". These appear strictly inside detail sheets and methodology documentation with plain-language explanations.
- **Honest & Non-Alarmist:** Predictions are expressed as probabilities, not guarantees (e.g., *"72% chance"*). Uncertainty and confidence bands are clearly communicated.

---

## Evidence & Honesty
- **Probabilistic Reality:** Forecasts represent statistical likelihoods calibrated against historical archives.
- **Model Provenance:** Experimental model outputs are explicitly flagged with `[EXPERIMENTAL]` warnings and disclaimers.
- **Demo Transparency:** Whenever `NEXT_PUBLIC_USE_MOCK_DATA=true` is active, an unobtrusive **"Demo data"** badge is permanently displayed.
- **Accuracy Claims:** No unvalidated accuracy or skill scores are claimed until multi-season backtesting reports are finalized.

---

## Success Criteria
1. **5-Second Clarity:** A first-time user can identify the active block's verdict, hazard percentage, and sowing recommendation within 5 seconds of loading.
2. **Zero-Lag Responsiveness:** Smooth filter cascading, instant week switching, and accessible fallback table when WebGL or map tiles fail.
3. **Accessibility:** 100% keyboard navigable, visible focus states, screen-reader live announcements on verdict updates, and full `prefers-reduced-motion` compliance.
