# BHUMI — Frontend Implementation & Build Log

> **Chronological Record of Frontend Delivery Milestones, Architecture Adaptations, Backend Integration, and Security Audits.**

---

## Reference Asset Disclosure
> [!NOTE]  
> **UI Reference Image Status:**  
> The visual reference image specified in the initial frontend brief was supplied externally as context for the dashboard design direction. The image file is not stored locally within the repository (`docs/reference/ui-reference.webp` was omitted from tracking to prevent committing unversioned binary artifacts). The implementation directly reflects all color values, layout proportions, card hierarchies, and floating pill controls specified in the design brief.

---

## Milestone 0: Setup, Design Tokens & Architectural Alignment
- **Implemented:**
  - Evaluated design specifications from `docs/ANTIGRAVITY_UI_PROMPT.md`.
  - Configured semantic CSS custom properties in `src/app/globals.css` matching reference tokens (`--bg-page`, `--surface-shell`, `--surface-card`, `--surface-tile`, `--ink`, `--ink-muted`, `--line`, `--accent`).
  - Implemented 5-stop categorical risk color ramps for Onset (teal-green), Dry Spell (amber-brick), and Heavy Rain (blue-indigo).
  - Configured font loading via `next/font` for high-readability geometric typography with tabular numbers (`tnum`) for probabilistic metrics.
- **Architecture Adaptation:**
  - The brief suggested creating an isolated `web/` subdirectory. To protect and preserve the existing Step 1–6 BHUMI repository structure (which already housed a fully configured Next.js 16 App Router at the root, working PostGIS utilities in `src/lib/geo.ts`, server database clients, and verified test suites), the frontend was anchored directly in `src/`. This eliminated build duplication and allowed the UI to directly import shared types without duplicate copies.

---

## Milestone 1: Application Shell & Dashboard Component Foundations
- **Implemented:**
  - Built root `AppShell` with desktop navigation rail (72px) and mobile bottom tab bar.
  - Implemented the three core dashboard cards:
    - `LocationCard`: Displays administrative hierarchy, elevation, update timestamps, village cluster selector (`PanchayatSelect`), and three mint stat tiles.
    - `AdvisoryCard`: Displays ICAR/CRIDA contingency advice, crop badge, action verdict, and "Why this advice" explainability trigger.
    - `GaugeCard`: Custom SVG semicircle gauge displaying probability for the active hazard and week, accompanied by reliability indicators and teleconnection driver chips.
  - Built loading skeleton components utilizing subtle opacity transitions rather than aggressive sweep shimmers.
  - Implemented `DemoBadge` to guarantee transparent disclosure whenever mock data mode is active (`NEXT_PUBLIC_USE_MOCK_DATA=true`).

---

## Milestone 2: Map & Spatial Interaction Layer
- **Implemented:**
  - Integrated `maplibre-gl` dynamically with `{ ssr: false }` to ensure zero hydration mismatch.
  - Configured OpenFreeMap Positron vector tiles with automatic fallback to Liberty style or solid canvas if external tile servers become unavailable.
  - Built dynamic GeoJSON risk choropleth layer driven by active hazard and lead week.
  - Implemented DOM-based `HotspotMarkers` (maximum 6) pulsing over top hazard areas with automatic document visibility pausing.
  - Built `StatChips` rendered with near-black pills, anchored to the selected block centroid via `requestAnimationFrame`-throttled transform updates.
  - Implemented `FilterCascade` (State → District → Block → Crop), `SearchCombobox` with debounced input, `LayerSwitcher`, and `WeekTabs`.
  - Built accessible `ListView` fallback rendering a semantic, keyboard-navigable table when WebGL is unavailable or disabled.

---

## Milestone 3: Localization & Secondary Routes
- **Implemented:**
  - Implemented lightweight `useT` hook for UI chrome internationalization with JSON message bundles (`en`, `hi`, `bn`).
  - Configured dynamic Indic font loading (`Noto Sans Devanagari` and `Noto Sans Bengali`) with `display: swap` and `preload: false`.
  - Built secondary informational routes:
    - `/advisories`: Four-week lead advisory matrix with print-friendly stylesheet.
    - `/outlook`: 4-week × 3-hazard risk grid with interactive cell navigation.
    - `/methodology`: Comprehensive data provenance guide detailing IMD, ERA5, GPM, and teleconnection inputs.
  - Implemented `DriversSheet` (drawer on mobile, modal dialog on desktop) displaying relative influence and direction of climate drivers.

---

## Milestone 4: Motion Polish & Mobile Native Optimization
- **Implemented:**
  - Audited and verified all motion against the §11 motion specifications:
    - Page-load card stagger (220ms `--ease-out`).
    - Counter animations interpolating previous-to-next probability values without jumping from zero.
    - Semicircle gauge fill via SVG `stroke-dashoffset`.
    - Zero forbidden libraries (no GSAP, no Lottie, no heavy physics engines).
  - Enforced full `prefers-reduced-motion: reduce` compliance across counters, camera pans, and hotspot loops.
  - Applied mobile-native refinements: `100dvh` viewport heights, safe-area padding (`env(safe-area-inset-*)`), `touch-action: manipulation`, and elimination of tap highlights.

---

## Milestone 5: Backend Integration Correction
- **Problem Identified:**
  - The initial frontend prototype used a placeholder stub in `src/lib/forecast/supabase-adapter.ts` that threw `"Not implemented: wire after pipeline tables exist"`, separating the UI from the authentic Step 1–6 Supabase database.
- **Corrections Implemented:**
  1. **Live PostgREST Queries:** Replaced stub with live anonymous PostgREST queries against `public.blocks`, `public.live_predictions`, and `public.advisory_rules`.
  2. **Authentic Block Geometry & Centroid Fallback:** Wired PostGIS `boundary_geom` GeoJSON parsing for true administrative boundaries. If boundaries are unseeded or null, the adapter falls back cleanly to authentic centroid `Point` coordinates, avoiding synthetic polygon fabrication.
  3. **Step 6 Advisory Engine Delegation:** Replaced mock advisory text with real evaluations from `evaluateAdvisoryRule()`, sourcing active rules and crop normalization directly from Step 6 agronomic logic.
  4. **Full 10-Language Restoration:** Expanded advisory generation from 3 languages to all 10 verified Step 6 regional languages (`en`, `hi`, `mr`, `te`, `ta`, `bn`, `gu`, `kn`, `pa`, `or`) with deterministic English fallback.
  5. **National District Point Aggregation:** Implemented district centroid summary points for the national view (`getRegionsGeoJSON(null)`), eliminating performance lag caused by loading all 6,700 block boundary polygons simultaneously.

---

## Milestone 6: Model Metadata Authoritative Pipeline Correction
- **Problem Identified:**
  - An earlier iteration hardcoded a static snapshot of training coverage and model readiness in TypeScript (`AUTHORITATIVE_MODEL_METADATA`), violating the requirement that `pipeline/ml/artifacts/metadata.json` must remain the single authoritative source of truth.
- **Corrections Implemented:**
  1. Removed static hardcoded training counts from TypeScript modules.
  2. Integrated `parseModelMetadata()` in `src/lib/metadata.ts` to preserve authentic zero values and omit synthetic defaults.
  3. Created deterministic reactivity tests verifying that changes in `pipeline/ml/artifacts/metadata.json` dynamically reflect in the server data layer.

---

## Milestone 7: Security Correction (Zero Dynamic Code Execution)
- **Problem Identified:**
  - `src/lib/forecast/supabase-adapter.ts` contained `new Function('moduleName', 'return import(moduleName)')` to dynamically import `node:fs`, violating the strict prohibition against arbitrary runtime code execution in browser-facing code.
- **Corrections Implemented:**
  1. **Complete Removal of `new Function`:** Removed all `new Function(...)` usage and dynamic `node:fs` / `node:path` loading from `supabase-adapter.ts`.
  2. **Dedicated `/api/readiness` Flow:** The client repository exclusively fetches `GET /api/readiness`, which runs `getModelMetadata()` server-side where filesystem access is safe and native.
  3. **Automated Security Test Suite:** Extended `tests/frontend/supabase-adapter.test.mjs` with static AST scans confirming that `eval(`, `Function(`, `new Function`, `node:fs`, and dynamic `import(` are strictly absent from client-facing forecast adapters.

---

## Verification & Build Results

All automated checks pass cleanly:

```bash
# 1. Static Linting
npm run lint
# Output: ESLint passed with 0 errors and 0 warnings.

# 2. TypeScript Compilation
npx tsc --noEmit
# Output: TypeScript type-check passed with 0 errors.

# 3. Next.js Production Build
npm run build
# Output: All 8 routes compiled and statically optimized (11 workers, Turbopack).

# 4. Frontend Verification Suite
npm test
# Output: 80 tests passing across 22 suites (0 failing, 0 skipped).

# 5. Pipeline & Unit Test Suite
python -m unittest discover -s tests/unit
# Output: 57 unit tests passing (0 failing, 0 errors).

# 6. Live Adapter Verification
node --experimental-strip-types scripts/verify_adapter.mjs
# Output: Verified real Supabase integration across all 10 locales, district summaries, and authentic geometry.
```

---

## Intentionally Excluded Requirements
- **Bhashini Integration:** Intentionally excluded from the BHUMI implementation and planned dependencies. No runtime translation API is used; static multilingual templates serve as the primary runtime delivery mechanism across all 10 Step 6 locales, with IndicTrans2 (AI4Bharat) designated as the open-source fallback architecture if future dynamic translation is required.
- **WhatsApp Integration:** Reserved as future Phase 2 scope; not implemented in Steps 1–7.
- **Client-Side Heavy Animation Libraries (GSAP / Lottie):** Banned to preserve low-end mobile performance and battery efficiency.
- **External Charting Packages (Chart.js / Recharts):** Excluded in favor of lightweight, hand-rolled SVG gauge and CSS grid visualizations.
- **Global State Management Libraries (Redux / Zustand):** Excluded in favor of shareable URL query parameters (`?block=&hazard=&week=&lang=`).
