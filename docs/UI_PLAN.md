# BHUMI — UI Architecture & Implementation Plan

> **Taste-Skill Dial Overrides:**  
> - `DESIGN_VARIANCE = 3` (Calm, structured, authoritative layout matching reference)  
> - `MOTION_INTENSITY = 3` (Subtle, purposeful, non-distracting motion)  
> - `VISUAL_DENSITY = 6` (Airy, scannable data dashboard with generous breathing room)

---

## 1. Reference-Image Interpretation

The BHUMI frontend translates the design intent of the reference dashboard into an agro-meteorological intelligence interface:
- **Desktop Layout:** A muted teal-grey ground (`#9DBFC3`) housing a single rounded application shell (`#F7F6F2`, radius 32px) with a slim left navigation rail (72px) and a primary content canvas.
- **Map-Centric Experience:** An edge-to-edge light vector map occupies the upper viewport, overlaid with floating pill controls (search, administrative filters, hazard layer switcher, and legend).
- **Contextual Stat Chips:** Three joined near-black pills (`#101413`) anchor directly above the selected block centroid, displaying Onset %, Dry Spell %, and Heavy Rain % for the active week.
- **Three-Card Bottom Grid:** A structured horizontal card row underneath the map:
  1. **Location Card (1.5fr):** Displays administrative hierarchy, elevation, update timestamps, village cluster selector, and three mint stat tiles.
  2. **Advisory Card (1.1fr):** Displays ICAR/CRIDA-grounded sowing advice, crop badge, action verdict, and "Why this advice" explainability trigger.
  3. **Gauge Card (0.9fr):** Semicircle risk gauge for the active hazard and week, accompanied by lead-time tabs, reliability indicators, and teleconnection driver chips.
- **Mobile Translation:** On smartphone viewports (< 640px), the outer shell expands edge-to-edge, the left rail becomes a bottom tab bar, and the three-card row transforms into an interactive bottom sheet with peek, half, and full expansion states.

---

## 2. Design Tokens & Styling System

All design tokens are implemented as CSS custom properties in `src/app/globals.css` and mapped into Tailwind CSS utility classes.

### 2.1 Color Tokens
| Token | CSS Variable | Hex Value | Semantic Usage |
| :--- | :--- | :--- | :--- |
| **Page Ground** | `--bg-page` | `#9DBFC3` | Outer desktop background framing the application shell |
| **Shell Surface** | `--surface-shell` | `#F7F6F2` | Warm off-white surface for the outer container |
| **Card Surface** | `--surface-card` | `#FFFFFF` | Floating controls, overlay panels, and bottom cards |
| **Tile Surface** | `--surface-tile` | `#E9F2EF` | Soft mint background for stat tiles and metric badges |
| **Primary Ink** | `--ink` | `#101413` | High-contrast body text and dark stat chips (never pure `#000`) |
| **Muted Ink** | `--ink-muted` | `#5B6764` | Secondary labels; exceeds 4.5:1 contrast against white/mint |
| **Hairline Border** | `--line` | `rgba(16,20,19,0.08)` | Subtle card borders and divider lines |
| **Brand Accent** | `--accent` | `#F2A91F` | Warm amber for hotspot halos and highlights (ink text on fills) |

### 2.2 Probabilistic Risk Ramps (5 Stops: 0–20, 20–40, 40–60, 60–80, 80–100)
- **Monsoon Onset (Teal-Green):** `#E3F3EE` → `#B7DFD2` → `#7CC4B0` → `#3FA38E` → `#13755F`
- **Dry Spell / Break (Amber to Brick):** `#FBEBCB` → `#F6CF8A` → `#EDA84A` → `#D9762B` → `#B0451C`
- **Heavy Rain (Blue to Indigo):** `#E2ECFA` → `#B5CDF1` → `#7DA4E4` → `#4A73CC` → `#2B449E`
- **Categorical Bands:** Low (<25%), Moderate (25–49%), High (50–74%), Very High (≥75%).

### 2.3 Agronomic Action Verdicts
| Verdict Key | Display Icon | Text Color | Background Fill | Semantic Meaning |
| :--- | :---: | :--- | :--- | :--- |
| `sow_now` | 🌱 | `#13755F` | `#E3F3EE` | Favorable soil moisture & monsoon arrival confirmed |
| `wait` | ⏱ | `#101413` | `#FBEBCB` | Break monsoon or insufficient moisture anticipated |
| `prepare_irrigation` | 💧 | `#2B449E` | `#E2ECFA` | Dry spell approaching; prepare protective watering |
| `protect_from_rain` | 🌂 | `#2B449E` | `#E2ECFA` | Heavy rainfall spell likely; open field drainage channels |
| `switch_crop` | 🔄 | `#5B6764` | `#F7F6F2` | Extended deficit; consider shorter-duration Kharif pulses |

### 2.4 Shape, Space & Shadows
- **Radii:** 8px (small badges), 12px (dropdowns/tiles), 16px (stat tiles), 24px (cards/map), 32px (desktop shell), 9999px (pills).
- **Spacing:** Rigid 4px/8px modular grid.
- **Shadow:** Single floating shadow token for overlays (`0 8px 24px -12px rgba(16,20,19,0.25)`). Flat cards with hairline borders.

---

## 3. Typography Architecture

- **Latin Primary:** Geometric sans-serif (`Geist Sans` / `Urbanist` / System geometric stack) loaded via `next/font`. Tabular numbers (`tnum`) applied across all probabilistic metrics to eliminate layout jitter during counters.
- **Indic Script Support:** `Noto Sans Devanagari` (Hindi, Marathi) and `Noto Sans Bengali` (Bengali) with `display: swap` and `preload: false`. Activated dynamically on locale switch.
- **Scale:** 12px (micro-labels), 14px (secondary text), 16px (body & inputs to prevent iOS zoom), 20px (card headings), 28px (stat numerals), 44px (large metric displays).
- **Line Heights:** 1.4 for Latin script, 1.6 for Indic scripts to accommodate conjunct consonants and ascenders/descenders.

---

## 4. Responsive Layout & ASCII Wireframes

### 4.1 Desktop (≥ 1024px)
```
+-------------------------------------------------------------------------------+
| Page Ground (--bg-page: #9DBFC3)                                              |
|  +-- Shell (--surface-shell: #F7F6F2, radius: 32px) ------------------------+ |
|  | [Rail] | [Top Map Overlay: Search | State | District | Block | Crop]     | |
|  |  Logo  | +-------------------------------------------------------------+ | |
|  |        | |                                                             | | |
|  |  (Map) | | MapView (OpenFreeMap Light + Risk Choropleth)               | | |
|  |  Adv   | |    [Amber Hotspots]       (Selected StatChips)              | | |
|  |  Out   | |                                                             | | |
|  |  Meth  | | [Legend]                 [LayerSwitcher]          [HelpFab] | | |
|  |        | +-------------------------------------------------------------+ | |
|  |        | [Cards Row (12px gap, columns 1.5fr : 1.1fr : 0.9fr)]         | | |
|  | [Lang] | +--------------------+ +-------------------+ +---------------+ | |
|  | [Help] | | LocationCard       | | AdvisoryCard      | | GaugeCard     | | |
|  |        | | - 3 StatTiles      | | - Verdict Badge   | | - Arc Gauge   | | |
|  |        | | - PanchayatSelect  | | - Why this advice | | - Driver Chips| | |
|  |        | +--------------------+ +-------------------+ +---------------+ | |
|  +--------+-----------------------------------------------------------------+ |
+-------------------------------------------------------------------------------+
```

### 4.2 Mobile (< 640px)
```
+---------------------------------------------------+
| Top Search & Filter Trigger Button                |
+---------------------------------------------------+
|                                                   |
| MapView (Full Bleed 100dvh)                       |
|   - Region Polygons & Centroid Hotspots           |
|                                                   |
| [LayerSwitcher: Onset | Dry Spell | Heavy Rain]   |
+---------------------------------------------------+
| Bottom Sheet Drawer (vaul snap points)            |
| [=== Handle ===]                                  |
| Peek (~132px): Verdict Badge + Metric + Week Tabs |
| Half: LocationCard + AdvisoryCard                 |
| Full: GaugeCard + Detailed Driver Breakdown       |
+---------------------------------------------------+
| BottomTabs: [Map] [Advisories] [Outlook] [Method] |
+---------------------------------------------------+
```

---

## 5. Motion Strategy & Performance Cheatsheet

In accordance with Emil Kowalski's animation principles, motion is purposeful, physical, and restrained. Zero arbitrary animation libraries are loaded.

### 5.1 Motion Inventory
| # | Target | Motion Effect | Duration & Easing | Animating Properties | Trigger |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | Page Load | Cards row and top overlay enter | 220ms `cubic-bezier(0.16, 1, 0.3, 1)` | `opacity`, `translateY(8px→0)` | Initial load only |
| **2** | Map Camera | Smooth pan & zoom to region | 600ms ease-out | Map camera bounds | Region or filter change |
| **3** | Stat Numbers | Counter transitions previous→next | 450ms ease-out | Text content interpolation | Risk or week change |
| **4** | Gauge Arc | Radial arc fills smoothly | 500ms ease-out | SVG `stroke-dashoffset` | Hazard or week change |
| **5** | Segmented Control | Sliding highlight pill | 180ms ease-out | CSS `transform: translateX` | Hazard switcher toggle |
| **6** | Drawer / Sheet | Slide-up sheet transition | 240ms enter / 160ms exit | CSS `transform: translateY` | User drag or click |
| **7** | Hotspots | Amber halo pulse (max 6) | 2400ms infinite loop | `transform: scale(1→1.8)`, `opacity` | When tab is visible |
| **8** | Buttons / Chips | Press scale feedback | 100ms ease-out | `transform: scale(0.97)` | Active press state |
| **9** | Driver Bars | Strength bars grow left-to-right | 350ms, 30ms stagger | `transform: scaleX` | Detail sheet open |
| **10** | Skeletons | Gentle opacity breathing | 1400ms loop | `opacity: 0.6 ↔ 1.0` | Loading state |

### 5.2 Accessibility & Reduced Motion
- When `prefers-reduced-motion: reduce` is active:
  - Numerical transitions, gauge sweeps, and slide-in animations become instantaneous.
  - Map camera animations execute with `duration: 0`.
  - Hotspot halo pulses freeze into static translucent rings.

---

## 6. Map Architecture & Resiliency

1. **Client-Side Dynamic Loading:** MapLibre GL is loaded lazily via `next/dynamic({ ssr: false })` after initial shell paint, ensuring fast First Contentful Paint.
2. **OpenFreeMap Vector Tiles:** Basemap targets `https://tiles.openfreemap.org/styles/positron` with automated fallback to `liberty` or plain canvas background if external tile servers time out.
3. **National vs. District Performance Hierarchy:**
   - **National View (`parentId === null`):** Renders lightweight district summary points (`Point` geometry with centroid coordinates and aggregated hazards), avoiding loading 6,700 high-resolution block boundaries at once.
   - **District View (`parentId === districtId`):** Loads authentic PostGIS block boundary polygons from `public.blocks.boundary_geom` for the selected district.
4. **Centroid Fallback:** Blocks lacking PostGIS polygon geometry render safely as centroid `Point` features, tagged with `is_centroid_fallback: true`.
5. **Zero-Failure Fallback (`ListView`):** If WebGL initialization throws or tile networks are completely severed, an accessible, sortable semantic table (`ListView`) renders seamlessly.

---

## 7. Data Architecture & Integration Model

The frontend decouples UI presentation from backend storage via the `ForecastRepository` interface:

```
[UI Components]
       │
       ▼
[ForecastRepository] (src/lib/forecast/repository.ts)
       │
       ├── NEXT_PUBLIC_USE_MOCK_DATA = "true"  ──►  [MockForecastRepository] (src/lib/forecast/mock.ts)
       │                                            - Synthetic spatial hex grid
       │                                            - Seeded deterministic values
       │                                            - Demo data badge displayed
       │
       └── NEXT_PUBLIC_USE_MOCK_DATA = "false" ──►  [SupabaseForecastRepository] (src/lib/forecast/supabase-adapter.ts)
                                                    - Anonymous PostgREST access (public.blocks, public.live_predictions)
                                                    - Step 6 Rule Engine (evaluateAdvisoryRule across 10 locales)
                                                    - Model metadata via GET /api/readiness -> pipeline/ml/artifacts/metadata.json
```

---

## 8. URL-Based State Management

All user selection parameters are synchronized to URL query parameters via `useSearchParams()` and `router.replace(url, { scroll: false })`:
- `?state=`: Active state name (e.g., `Rajasthan`)
- `?district=`: Active district name (e.g., `Jodhpur`)
- `?block=`: Active block identifier (e.g., `IND_RJ_JOD_001`)
- `?crop=`: Active Kharif crop category (e.g., `rice`, `cotton`, `maize`)
- `?hazard=`: Active hazard layer (`onset`, `dry_spell`, `heavy_rain`)
- `?week=`: Active forecast lead time (`1`, `2`, `3`, `4`)
- `?lang=`: Active interface language (`en`, `hi`, `bn`, etc.)

This enables bookmarkable views, shareable links for extension officers, and back/forward browser navigation support with zero external state management dependencies.

---

## 9. Deviations from the Original UI Prompt

1. **Unified Root-Level Next.js Architecture:**  
   The initial brief contemplated placing the frontend scaffold under an isolated `web/` subdirectory. To maintain seamless integration with the existing working Step 1–6 BHUMI architecture (Next.js 16 App Router at the root, existing PostgREST schemas, unit test runners, and shared TypeScript modules), the application resides in `src/` at the repository root.
2. **Restoration of All 10 Step 6 Locales in Advisories:**  
   While the initial UI brief outlined 3 languages (`en`, `hi`, `bn`), Step 6 of BHUMI established 10 verified regional languages for ICAR/CRIDA contingency advisories (`en`, `hi`, `mr`, `te`, `ta`, `bn`, `gu`, `kn`, `pa`, `or`). The forecast adapter and advisory engine support all 10 languages with English fallback.
3. **National District Point Aggregation:**  
   Rather than attempting to stream all 6,700 block boundary polygons in the initial view, the national view serves centroid summary points, loading high-resolution PostGIS boundaries only when a specific district or block is selected.
4. **Authoritative Model Metadata Isolation:**  
   To prevent bundling `node:fs` or invoking `new Function` dynamic execution in browser adapters, metadata is resolved via the existing server route `GET /api/readiness`, which reads `pipeline/ml/artifacts/metadata.json` server-side.
