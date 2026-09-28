# BHUMI — Frontend build brief for Antigravity

**Attach with this prompt:** the reference image (also saved at `docs/reference/ui-reference.webp`). **Also read, if present in the repo root:** `README.md`, `PRD.md`, `TECH_STACK.md`. This brief is self-contained; those files add background only.

---

## 0. Mission

Build the **BHUMI web app**: a mobile-first, installable PWA that shows block-level monsoon risk across India — chance of **monsoon onset**, **dry spell (break)** and **heavy rain**, 1 to 4 weeks ahead — on a map, with plain-language, crop-specific sowing advice.

- It must **look like the attached reference**: a calm, soft, map-first dashboard with a slim icon rail, floating filters, floating black stat chips, and a row of three cards underneath.
- It must **feel fast on a low-end Android phone on a weak connection**, and deploy on **Vercel's free (Hobby) tier**.
- Motion must be **subtle and purposeful**. Nothing may cause lag.
- Data is **mock for now**, behind a data layer, so wiring the real backend later means changing one adapter file.

Work in the milestones in §15. After each milestone run the checks, commit, and append to `docs/UI_BUILD_LOG.md`.

---

## 1. Rules of engagement

1. **Priority when instructions conflict:** (1) this brief and the reference image → (2) `PRODUCT.md` written by Impeccable's `init` → (3) Emil Kowalski's skills for motion, performance and mobile feel → (4) Impeccable and Taste-Skill rules for visual craft → (5) library defaults. Log every conflict and how you resolved it in `docs/UI_BUILD_LOG.md`.
2. **Skills govern craft, not concept.** Some skills discourage card-based layouts, push asymmetry, or suggest GSAP. Here the reference layout wins. Card rows, floating overlays and black pills are intended. GSAP is forbidden.
3. **Do not hallucinate.** Before using any library API (Next.js, MapLibre, Motion, shadcn/ui, Radix, vaul), check the installed version's types or official docs. Never invent endpoints, table names, props, or data. If a command fails, report the exact error; do not guess a fix silently.
4. **Never present mock data as real.** While `NEXT_PUBLIC_USE_MOCK_DATA=true`, show a small, visible **"Demo data"** badge.
5. **No secrets in code.** Only `NEXT_PUBLIC_*` variables are allowed in the frontend. Never use a Supabase `service_role` key here.
6. **Stop and ask only if genuinely blocked** (missing access, ambiguous requirement that changes the design). Otherwise choose the sensible default, log it, and continue.
7. **No placeholders.** No `// TODO: implement`, no truncated files, no lorem ipsum. Every component you create must be complete and working.

---

## 2. Product context

- **BHUMI** = Block-level Hydro-meteorological Updates for Micro-climate Intelligence. It is for Smart India Hackathon 2026, Problem Statement 26086 (Ministry of Earth Sciences / NCMRWF): hyperlocal monsoon onset and break prediction at block and panchayat scale.
- **Users**
  - A farmer on a basic Android phone, possibly on 3G, who reads Hindi, Bengali or English, and has little patience for text.
  - An agricultural extension officer who checks many blocks and wants more detail.
  - Hackathon judges viewing a demo on a laptop or projector.
- **The one question the UI answers in under 5 seconds:** "For my block, in the next 1 to 4 weeks, will the monsoon start, pause or pour, and should I sow now?"
- **What the backend will supply later (not built yet):** once-daily probabilities per region, hazard and week; the main drivers behind each number; and advisory text in several languages. **The UI never computes forecasts. It only displays them.** Panchayat numbers are backend-supplied, terrain-adjusted estimates and must be labelled as estimates.
- **Operating conditions to design for:** outdoor glare (so strong contrast), one-handed use, weak network, low-end GPU, Indian-language text that runs longer than English.

---

## 3. Setup: skills

### 3.1 What to install and how to use each

| Skill | Install | Use it for |
|---|---|---|
| **Impeccable** (github.com/pbakaus/impeccable) | `npx impeccable install` → choose Antigravity, project scope, then reload. Confirm `.agent/skills/impeccable` exists. Fallback in its README: copy `dist/antigravity/.agent` into the project. | `/impeccable init` (writes `PRODUCT.md`), `/impeccable shape` before coding. After building: `critique`, `typeset`, `layout`, `adapt`, `harden`, `optimize`, `audit`, `polish`. Also run `npx impeccable detect web/` and fix findings. |
| **Taste-Skill** (github.com/Leonxlnx/taste-skill) | `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"`, then the same command with `--skill "high-end-visual-design"` and `--skill "full-output-enforcement"`. If Antigravity is not offered as a target, copy each `SKILL.md` into `.agent/skills/<name>/SKILL.md`. | `design-taste-frontend`: anti-slop pass. `high-end-visual-design`: the soft, calm, spacious look the reference has. `full-output-enforcement`: no truncated or placeholder output. Do not use `gpt-taste`, `image-to-code` (we already have the image), `industrial-brutalist-ui`, `minimalist-ui` or `stitch-design-taste`. |
| **Emil Kowalski's skills** (github.com/emilkowalski/skills) | `npx skills@latest add emilkowalski/skills` | `emil-design-eng`: read first, governs all motion decisions. `find-animation-opportunities`: run once at M1 to decide what gets motion and what does not. `animate`: build each animation. `review-animations`: strict review at M4. `mobile-native`: apply at M3. `pick-ui-library`: run before adding any UI dependency (drawer, combobox, toast). `ask-sonner`: only if Sonner toasts are added. Skip `write-swift` and `animate-expo`. |
| **Motion Primitives** (github.com/ibelick/motion-primitives; docs at motion-primitives.com/docs) | Prerequisites: Tailwind CSS, `npm install motion lucide-react`, and `lib/utils.ts` exporting `cn()` built from `clsx` + `tailwind-merge`. Add a component with `npx motion-primitives@latest add <slug>`, or copy it manually from `components/core/<name>.tsx` in the repo and fix import paths. | A component library, not an agent skill. Use only what earns its place: `animated-number` (stat values), `animated-background` (segmented controls), `animated-group` (the single load entrance). **Check each slug on the docs site before running the command** and report failures. Import from `motion/react`. |

### 3.2 Setup sequence

1. Confirm the repo has `README.md`, `PRD.md`, `TECH_STACK.md` and `docs/reference/ui-reference.webp`. If the image is missing, use the attached one and save it there.
2. Look in `.agent/skills` (project) and `~/.gemini/config/skills` (global). Install only what is missing. If an installer waits for interactive input you cannot answer, stop and print the exact command for me to run.
3. Create `.impeccable/config.local.json` containing `{ "buildPath": "code" }`. We already have a reference image, so build straight in code.
4. Run `/impeccable init`. Do not ask me for anything listed in §3.3.
5. Add Impeccable's ignore block to `.gitignore`, exactly as its README documents, so screenshots and runtime files are not committed.
6. Write `docs/UI_PLAN.md` (see M0) and begin.

### 3.3 Answers for `/impeccable init` (`PRODUCT.md`)

- **Audience:** farmers and agricultural extension officers in India; secondary: hackathon judges.
- **Purpose:** show hyperlocal monsoon onset, dry-spell and heavy-rain chances 1 to 4 weeks ahead, and turn them into clear sowing advice.
- **Operating context:** low-end Android, weak network, outdoor glare, Hindi, Bengali and English (more languages later), often one-handed.
- **Constraints:** Vercel Hobby tier, no paid services, no backend calls through Vercel functions, WCAG 2.2 AA, lightweight.
- **Voice:** plain, calm, respectful, never alarmist, no meteorology jargon on primary screens.
- **Evidence and honesty:** numbers are probabilities, not guarantees. Show uncertainty. Never claim an accuracy figure that has not been measured.
- **Success:** a first-time farmer understands the verdict for their block in under 5 seconds.

### 3.4 Taste-Skill dial overrides

State these at the top of `docs/UI_PLAN.md`. Do **not** edit the skill file.

- `DESIGN_VARIANCE = 3` (structured and calm, matching the reference)
- `MOTION_INTENSITY = 3` (subtle only)
- `VISUAL_DENSITY = 6` (a real dashboard, but airy)

---

## 4. The reference image: keep, change, drop

Sample exact colours from the attached image. The values below are approximations.

| Reference element | In BHUMI |
|---|---|
| Muted teal-grey page background (~`#9DBFC3`) with one large rounded shell (~28–32px radius) | **Keep on desktop (≥1024px)** with a 20–24px gutter. **On mobile the shell goes edge-to-edge** with no gutter and no outer radius. |
| Shell surface: warm off-white with a faint mint/peach glow | Keep as a plain CSS gradient. **No `backdrop-filter`.** |
| Slim left icon rail: logo on top, four nav icons (active = black circle with white icon), utility icons at the bottom | Logo; nav = **Map, Advisories, Outlook, Methodology**; bottom = **Language, Help**. **Below 1024px it becomes a bottom tab bar.** |
| Search field plus four dropdowns floating over the map (Insurance Type, State, City, District) | Search ("Search block or village") + **State, District, Block, Crop** dropdowns. On mobile: search + a Filters button that opens a sheet. |
| Edge-to-edge light minimal map with rounded corners | Light minimal basemap (§8, MapView) with risk polygons on top. |
| Amber soft-glow circles as hotspots | Amber halo markers on the **highest-risk blocks for the active hazard** (max 6). |
| Three joined black pills over the selected pin (big number, tiny label) | Three pills for the selected block: **Onset %, Dry spell %, Heavy rain %** for the selected week. |
| Black round help button, bottom-right of the map | Keep. It opens "How to read this map". |
| Bottom row of three cards: Location (with three mint stat tiles) / photo / gauge card with avatars | **Location card** (three stat tiles) / **Advisory card** (no photo; a light inline-SVG illustration) / **Gauge card** (semicircle gauge, week tabs, top driver chips instead of avatars). |
| Type: geometric sans, big numerals, small grey labels | Same character (§6). Numerals dominate the tiles and pills. |
| Colour: amber accent, near-black, mint tiles, teal-grey ground | Same. Amber is the brand accent. Risk ramps (§6) must never be confused with it. |
| Radii: shell ~28–32, cards ~20–24, tiles ~16, pills fully round | Use the radius scale in §6. |

**Drop:** the real-estate content, the house photo, avatars, and the dollar and temperature formatting.

---

## 5. Stack, structure and dependencies

### 5.1 Stack
- **Next.js** (latest stable, App Router), **TypeScript in strict mode**, **npm**.
- **Tailwind CSS** (the latest version that shadcn/ui and Motion Primitives both support; verify).
- **shadcn/ui**, copying in only what is needed: Select, Popover, Command, Drawer, Tabs, Tooltip, Dialog. Run `pick-ui-library` before adding anything else.
- **`motion`** (import from `motion/react`), **`lucide-react`**.
- **`maplibre-gl`**, loaded with `next/dynamic` and `ssr: false`.
- **Selection state lives in the URL** (`?state=&district=&block=&crop=&hazard=&week=&lang=`) so views are shareable. Use Next's `useSearchParams` and `router.replace(url, { scroll: false })`. No global state library.
- **Fonts via `next/font`** (self-hosted at build time).
- **Icons:** lucide only. **Logo and illustrations:** inline SVG.

### 5.2 Forbidden dependencies
`gsap`, `three`, `lottie-*`, `react-spring`, `framer-motion` (use `motion`), any charting library (draw charts as hand-rolled SVG or CSS grid), `moment`, `lodash`, MUI / Chakra / Ant, any icon set other than lucide, any map library other than MapLibre, Google Fonts `<link>` tags, `@supabase/supabase-js` in the initial bundle.

### 5.3 Repository layout
Put the app in `web/`. On Vercel, set **Root Directory = `web`**. The pipeline and docs share the repo.

```
web/
  app/
    layout.tsx  page.tsx  loading.tsx  error.tsx  not-found.tsx  manifest.ts  icon.svg
    advisories/page.tsx   outlook/page.tsx   methodology/page.tsx
  components/
    shell/      AppShell, NavRail, BottomTabs, TopBar
    map/        MapView, RiskLayer, HotspotMarkers, StatChips, MapLegend, HelpFab
    cards/      LocationCard, StatTile, AdvisoryCard, GaugeCard, DriversSheet
    controls/   FilterCascade, SearchCombobox, LayerSwitcher, WeekTabs, LanguageSwitch, CropSelect, ListView
    feedback/   Skeletons, EmptyState, ErrorState, DemoBadge, OfflineBanner
    ui/         shadcn + motion-primitives components
  lib/
    data/       types.ts, repository.ts, mock/, supabase/ (adapter stub)
    risk/       bands.ts, colors.ts
    i18n/       messages/{en,hi,bn}.json, useT.ts
    utils.ts    (cn)
  public/       manifest icons only. No large images.
docs/           UI_PLAN.md, UI_BUILD_LOG.md, UI_DATA_CONTRACT.md, reference/ui-reference.webp
.env.example    NEXT_PUBLIC_USE_MOCK_DATA=true, NEXT_PUBLIC_SUPABASE_URL=, NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## 6. Design tokens

Define as CSS variables, mapped into the Tailwind theme. **Light theme only for v1**, but keep tokens semantic so dark can be added later.

### 6.1 Colour (approximate; sample from the image)
| Token | Value | Use |
|---|---|---|
| `--bg-page` | `#9DBFC3` | Desktop ground |
| `--surface-shell` | `#F7F6F2` | Shell |
| `--surface-card` | `#FFFFFF` | Cards, floating controls |
| `--surface-tile` | `#E9F2EF` | Stat tiles |
| `--ink` | `#101413` | Primary text, black pills (tinted near-black, not `#000`) |
| `--ink-muted` | `#5B6764` | Secondary text. Must be ≥ 4.5:1 on white and on tile. |
| `--line` | `rgba(16,20,19,.08)` | Hairlines |
| `--accent` | `#F2A91F` | Amber: hotspots, gauge, highlights. **Never amber text on white** (fails contrast). Use ink text on amber fills. |

### 6.2 Risk ramps (5 stops each, low to high; bins 0–20, 20–40, 40–60, 60–80, 80–100)
- **Onset** (good news, teal-green): `#E3F3EE`, `#B7DFD2`, `#7CC4B0`, `#3FA38E`, `#13755F`
- **Dry spell** (amber to brick): `#FBEBCB`, `#F6CF8A`, `#EDA84A`, `#D9762B`, `#B0451C`
- **Heavy rain** (blue to indigo): `#E2ECFA`, `#B5CDF1`, `#7DA4E4`, `#4A73CC`, `#2B449E`
- **Bands** (UI default; the real thresholds come from backend calibration later): `<25` Low, `25–49` Moderate, `50–74` High, `≥75` Very high.
- **Colour is never the only signal.** Every risk display also shows the number and the band word, and the legend uses labels. Check the ramps with a colour-vision-deficiency simulation and adjust if adjacent stops merge.

### 6.3 Verdicts (icon + text + colour)
`sow_now` (teal, sprout icon), `wait` (amber fill with ink text, clock), `prepare_irrigation` (blue, droplet), `protect_from_rain` (indigo, umbrella or shield), `switch_crop` (neutral, shuffle arrows).

### 6.4 Type
- **Latin:** start with **Urbanist** (geometric, close to the reference), variable font, self-hosted with `next/font`. Load only the weights used. If Impeccable's `typeset` critique flags it, you may substitute one other distinctive geometric sans. **Never Inter, Arial or system-ui as the design font.** Maximum two Latin families.
- **Indic:** **Noto Sans Devanagari** (Hindi) and **Noto Sans Bengali** (Bengali) with `preload: false` and `display: "swap"`. Apply each only when that locale is active. Put both in the fallback stack.
- **Scale:** 12 / 14 / 16 / 20 / 28 / 44 / 56 px. Body ≥ 14px. Micro-labels ≥ 12px and never carrying essential information. **Inputs ≥ 16px** (prevents iOS zoom-on-focus).
- **Line height:** 1.4 for Latin, **1.6 for Devanagari and Bengali** (taller glyphs).
- **Numerals:** dominate the tiles and pills. Use tabular figures if the font supports them; otherwise give animated numbers a fixed-width container so they do not jitter.

### 6.5 Shape, space, depth
- Radius scale: 8 / 12 / 16 / 24 / 32.
- Spacing on a 4px grid.
- **One** soft shadow token for floating map overlays only: `0 8px 24px -12px rgba(16,20,19,.25)`. Cards are flat with a hairline border. No shadow on every card.
- Icons: lucide, 1.75 stroke, 20px in the rail and tiles.

### 6.6 Motion tokens
`--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`. Durations: 120 / 200 / 280 / 450 / 600 ms. **No ease-in and no bounce or elastic curves for UI motion.**

---

## 7. Layout specifications

### 7.1 Desktop, ≥ 1024px
1. Page background `--bg-page`. Shell: margin 20–24px, height `calc(100dvh - 40px)`, min-height 640px, radius 32, `overflow: hidden`.
2. Shell grid: **rail 72px | content 1fr**.
3. Content grid: **map (1fr, min 420px)** above **cards row (auto, about 236–260px)**, 12px gap, 12px inset from the shell edge.
4. Map: rounded ~20–24px, fills its cell.
5. **Top overlay on the map** (top 12, left 12, right 12): search field (flex, 320–420px) then State, District, Block, Crop selects (120–150px each). 8px gaps. White, radius 12, floating shadow token.
6. **Bottom overlay on the map:** legend bottom-left (collapsed to one pill, expands on click), **LayerSwitcher** bottom-centre, **HelpFab** bottom-right.
7. **StatChips** anchor above the selected block's centroid with a small pointer dot like the reference. Clamp inside the map bounds.
8. **Cards row**, three equal-height cards, 12px gap, columns `1.5fr 1.1fr 0.9fr`: Location, Advisory, Gauge.

### 7.2 Tablet, 640–1023px
- Bottom tab bar replaces the rail. Map about 55dvh. Below it: Location card full width, then Advisory and Gauge side by side. The shell scrolls vertically; the map does not capture page scroll (`overscroll-behavior: contain` on the map).

### 7.3 Mobile, < 640px
- Map full-bleed, `100dvh` minus the tab bar. **Bottom sheet** (vaul, via shadcn Drawer) with three snap points:
  - **Peek (~132px):** verdict badge + the active hazard's number + week tabs.
  - **Half:** Location card + Advisory card.
  - **Full:** adds the Gauge card and the week outlook.
- Drag applies to the **sheet handle only**, so it never fights map gestures.
- Top overlay: full-width search plus a Filters icon button that opens a Drawer with the cascade selects. The layer switcher sits directly above the sheet. StatChips render as a static horizontal row over the map's bottom edge, not anchored to the pin.
- Respect safe areas: `padding: env(safe-area-inset-*)`, `viewport-fit=cover`, tab bar height 56px plus bottom inset.

### 7.4 Test viewports (all must work, no clipped controls, no horizontal scroll)
360×640, 390×844, 412×915, 768×1024, 1024×768, 1440×900, 1920×1080, and landscape 640×360.

---

## 8. Component specifications

Every data-driven component needs **loading, empty and error states**.

**AppShell.** Sets the grid, renders a "Skip to map" link, sets `<html lang>` to the active locale, shows `DemoBadge` when mock data is on.

**NavRail / BottomTabs.** Routes: `/` Map, `/advisories`, `/outlook`, `/methodology`. `aria-current="page"` on the active item. Active item = 44px black circle with a white icon. Desktop: tooltip label on hover and focus. Preserve the selection query params when navigating.

**FilterCascade.** State → District → Block dependent selects, plus an independent Crop select. Changing a parent clears its children. Every change updates the URL and calls `fitBounds` on the map. A Clear button resets to the national view.

**SearchCombobox.** shadcn Command inside a Popover. Loads the region-name index lazily on first focus. Debounce 150ms. Each result shows name plus parent. Full keyboard support. Empty state: "No match. Try a nearby block."

**LayerSwitcher.** Segmented control: Onset · Dry spell · Heavy rain, using `animated-background`. Changes the map ramp, legend, gauge and stat emphasis. State in `?hazard=`.

**WeekTabs.** Week 1–4, each with its date range beneath. Week n covers days `7(n−1)+1` to `7n` from `validFrom` (for example "Days 1–7"), rendered as real dates using `Intl.DateTimeFormat` with `timeZone: "Asia/Kolkata"`. Arrow-key navigation. State in `?week=`.

**MapView.**
- Load with `next/dynamic` + `ssr: false`, after first paint. Reserve the map's size so nothing shifts when it loads. Show a skeleton until ready.
- **Basemap:** OpenFreeMap **Positron**. Start from `https://tiles.openfreemap.org/styles/positron`; confirm the URL responds, and if it does not, use their `liberty` style and hide POI and label layers. Mute the basemap so risk colours dominate. **Attribution is required:** OpenStreetMap contributors and OpenFreeMap, via a compact attribution control.
- **Risk layer:** a GeoJSON source with a fill layer. Colour from the feature property for the active hazard and week (keys such as `onset_w1`) using an `interpolate` or `step` expression over the ramp in §6.2. Region outline layer driven by `feature-state` for hover and selected. Click selects a region.
- **The basemap is best-effort.** The risk layer must render on a plain background if tiles fail. Include a `background` layer in the style.
- **Rendering options** (verify each option name against the installed maplibre-gl version): disable rotation, pitch and terrain; `renderWorldCopies: false`; cap pixel ratio at 2; keep `fadeDuration` low; create exactly one map instance and call `remove()` on unmount.
- **Data granularity:** national view shows district summaries; selecting a district loads its blocks. Never load all ~6,700 block polygons at once.
- **Fallback:** if WebGL initialisation throws, or tiles have not loaded within 5 seconds, show the `ListView` with a one-line explanation. The app must remain fully usable from the list.

**HotspotMarkers.** The top 5 highest-probability regions in the current view for the active hazard, as amber halo markers (a solid dot with a translucent ring). DOM markers, **maximum 6**. Click selects. Pulse defined in §11.

**StatChips.** Three joined black pills (number large, label tiny). Anchored to the selected region's centroid using `map.project()`. **Update position from a `requestAnimationFrame`-throttled `move` handler by writing to the element's `style.transform` through a ref, not React state.** Hidden while a region is loading.

**MapLegend.** Five swatches with the numeric bins for the active hazard, plus a "No data" swatch. Collapsed to a pill by default.

**HelpFab.** 44px black circle. Opens a Popover: how to read the colours, what "probability" means, the disclaimer, and a link to `/methodology`.

**LocationCard.** Block name, `District, State`, "Updated {date}, {time} IST", a pin button (stores the region id in `localStorage`; pinned regions appear at the top of search results). A **PanchayatSelect** ("Block average" by default; choosing a village cluster shows an "Estimate" badge with tooltip "Adjusted for local terrain"). Three `StatTile`s.

**StatTile.** Icon top-left, label, large percentage (`animated-number`), week label, band word, and a thin bar. Background `--surface-tile`.

**AdvisoryCard.** Verdict badge (icon + label), advice text (≤ 220 characters), crop chip, **"Why this advice"** button (opens `DriversSheet`), and **"Share"** (uses `navigator.share` with the text "BHUMI advice for {block}: {advice}"; if unavailable, copy to clipboard and confirm with a toast). A light inline-SVG illustration. No photos.

**GaugeCard.** Semicircle SVG gauge (`pathLength` + `stroke-dasharray`) for the active hazard and week, the percentage in the centre, the hazard name beneath. Under it, four small week bars (probability for weeks 1–4); clicking one sets the week. A **Reliability** chip (Low / Medium / High) with tooltip "Forecasts further ahead are less certain." Top two driver chips.

**DriversSheet.** Drawer on mobile, dialog on desktop. For each driver: a direction arrow (raises / lowers), a plain-language label, and a horizontal strength bar. One-sentence summary composed from the top drivers. Disclaimer at the bottom. Focus trap; `Esc` closes.

**LanguageSwitch.** Menu listing English, हिन्दी, বাংলা. Persist in a cookie and `?lang=`. Sets `<html lang>`. Architecture must make adding another locale a JSON file plus a font entry.

**ListView.** Accessible table (semantic `<table>`) of regions in view: name, probability, band word; sortable by probability. Shown via a Map | List toggle, and automatically as the map fallback. Render 50 rows at a time with `content-visibility: auto`.

**Feedback components.**
- `Skeletons` are shaped like the real cards and use a slow opacity pulse, not a sweeping shimmer.
- `ErrorState` says what happened and how to fix it, with a Retry button.
- `EmptyState` invites an action.
- `OfflineBanner` appears when `navigator.onLine` is false.
- `DemoBadge` is small and unobtrusive.

### 8.1 Secondary pages (server-rendered, small)
- **/advisories:** four rows (week 1–4) for the selected region and crop: verdict badge, advice text, Share button. Print stylesheet so an officer can print it.
- **/outlook:** a 4-week × 3-hazard grid for the selected region, each cell showing the percentage and band word (hand-built with CSS grid). Tapping a cell sets hazard and week and returns to `/`.
- **/methodology:** what BHUMI predicts; where the data comes from (IMD, ERA5, CHIRPS, GPM, ENSO / IOD / MJO indices, GFS / ECMWF forecasts); how to read a probability; update cadence (once daily); limits. **Do not state any accuracy number.** Leave a clearly marked slot for backtest results to be added once validation is done.

---

## 9. Data layer and contract

The UI depends only on the interface below. **This is a UI-side proposal. The backend tables do not exist yet.** Do not invent Supabase table or column names. Write the final contract to `docs/UI_DATA_CONTRACT.md` so the pipeline can conform to it.

```ts
export type Hazard = 'onset' | 'dry_spell' | 'heavy_rain';
export type LeadWeek = 1 | 2 | 3 | 4;
export type Locale = 'en' | 'hi' | 'bn';
export type Band = 'low' | 'moderate' | 'high' | 'very_high';
export type Verdict = 'sow_now' | 'wait' | 'prepare_irrigation' | 'protect_from_rain' | 'switch_crop';
export type Crop = 'rice' | 'maize' | 'cotton' | 'soybean' | 'groundnut' | 'pulses'; // mock list; real list comes from the advisory rule set

export interface Region {
  id: string; name: string;
  level: 'state' | 'district' | 'block' | 'panchayat';
  parentId: string | null;
  centroid: [lng: number, lat: number];
  bbox: [minLng: number, minLat: number, maxLng: number, maxLat: number];
}
export interface Driver {
  key: string;
  labelByLocale: Record<Locale, string>;
  effect: 'raises' | 'lowers';
  strength: number; // 0..1
}
export interface RegionRisk {
  regionId: string;
  probabilities: Record<Hazard, Record<LeadWeek, number>>; // integers 0..100
  reliability: 'low' | 'medium' | 'high';
  drivers: Record<Hazard, Driver[]>;
  isEstimate: boolean; // true for panchayat values
}
export interface Advisory {
  regionId: string; crop: Crop; week: LeadWeek;
  verdict: Verdict;
  textByLocale: Record<Locale, string>;
}
export interface ForecastMeta {
  issuedAt: string;    // ISO 8601
  validFrom: string;   // ISO 8601, start of "Days 1–7"
  nextUpdateAt: string;
}
export type RegionFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: string; name: string } & Record<string, number | string> // e.g. onset_w1, dry_spell_w3
>;
export interface ForecastRepository {
  getMeta(): Promise<ForecastMeta>;
  listRegions(parentId: string | null): Promise<Region[]>;
  searchRegions(query: string, limit?: number): Promise<Region[]>;
  getRegionsGeoJSON(parentId: string | null): Promise<GeoJSON.FeatureCollection<RegionFeature['geometry'], RegionFeature['properties']>>;
  getRisk(regionId: string): Promise<RegionRisk>;
  getAdvisory(regionId: string, crop: Crop, week: LeadWeek): Promise<Advisory>;
}
```

**Rules**
1. `lib/data/repository.ts` exports `getRepository()`, which returns the mock implementation when `NEXT_PUBLIC_USE_MOCK_DATA=true`, otherwise the Supabase adapter.
2. **Mock implementation:** a seeded, deterministic generator producing spatially smooth values (neighbouring blocks look alike), integers 0–100, plausible drivers, and advisories in en / hi / bn. Geometry is a **synthetic hex grid**. **Use generic names** ("Demo State", "Demo District A", "Block 07"). Do not attach real place names to synthetic shapes. Mark every mock advisory string `// MOCK COPY: needs native-speaker review`.
3. **Supabase adapter:** a stub whose methods throw `Error('Not implemented: wire after pipeline tables exist')`. When wired later, prefer plain `fetch` to the PostgREST endpoint with the anon key (smaller than the SDK), and only **read** from the browser, so no Next.js API routes or Vercel functions are involved.
4. Cache responses in an in-memory `Map` keyed by request. Issue independent requests in parallel with `Promise.all`; no request waterfalls.
5. Server components may set `export const revalidate = 1800` for static shell data. Region-level fetches happen in the browser.

---

## 10. Internationalisation

- Messages in `lib/i18n/messages/{en,hi,bn}.json`, loaded with dynamic `import()` for the active locale only. Small `useT()` hook. No i18n library.
- The **UI chrome** is translated here. **Advisory text** arrives already translated (`textByLocale`) from the backend later.
- Use Latin digits (0–9) in all locales for now. Format with `Intl.NumberFormat('en-IN')` and `Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kolkata' })`.
- Hindi and Bengali strings run longer. Test every component with an artificially long string and fix overflow (`/impeccable harden`).
- Write Hindi and Bengali UI strings yourself, mark the files `MOCK COPY: needs native-speaker review`.

---

## 11. Motion specification

**Motion inventory. Nothing outside this table gets added without a log entry explaining why.**

| # | Where | What | Duration / easing | Properties | Trigger |
|---|---|---|---|---|---|
| 1 | Page-load entrance | Cards row and top overlay fade in | 220ms `--ease-out`, 50ms stagger, ≤ 400ms total | `opacity`, `translateY(8px→0)` | Once per full page load. Not on client navigation. |
| 2 | Map camera | `fitBounds` / `flyTo` | 600ms | Camera | Filter change or region click only |
| 3 | Stat values | Count from previous value to new value (not from 0) | 450ms `--ease-out` | Text | Region, hazard or week change |
| 4 | Gauge arc | Arc length changes | 500ms `--ease-out` | `stroke-dashoffset` on one small SVG (the only non-transform animation allowed) | Same as #3 |
| 5 | Segmented controls | Sliding highlight | 180ms `--ease-out` | Transform | User click |
| 6 | Sheet, drawer, popover | Enter `translateY` / `opacity` / `scale .98→1`; exit faster | Enter 200–280ms, exit 150ms | Transform, opacity | User action |
| 7 | Hotspot pulse | Ring scales out and fades | 2400ms loop, ≤ 6 markers | `transform: scale(1→1.8)`, `opacity(.5→0)` via CSS keyframes | Only while the document is visible |
| 8 | Press and hover | Hover tint; press `scale(.97)` | 100–120ms | Colour, transform | Hover only inside `@media (hover: hover)` |
| 9 | Driver bars | Bars grow from the left | 350ms, 30ms stagger | `transform: scaleX` | Sheet opens |
| 10 | Skeleton | Slow pulse | 1400ms | `opacity` (.6↔1) | While loading only |

**Ceilings:** nothing longer than 600ms except the hotspot loop. Nothing blocks input. No more than 3 elements animating at once outside the load entrance.

**Reduced motion:** with `prefers-reduced-motion: reduce`, drop #1, #3, #4, #5, #9 to instant changes, set map camera duration to 0, and make #7 a static ring.

**Forbidden:** parallax, scroll-jacking, scroll-triggered reveals, GSAP, three.js, Lottie, canvas particles, autoplay video, animated `blur()` or `backdrop-filter`, animating `width` / `height` / `top` / `left` / `box-shadow`, `transition: all` (list exact properties), bounce or elastic easing, any animation that repeats forever other than #7 and #10.

**Performance rules for motion (from Emil Kowalski's performance cheatsheet):** animate `transform` and `opacity`; never write per-frame values into React state (write to `ref.current.style`); with Motion, animate the full `transform` string rather than `x` / `y` if you see dropped frames; add `will-change: transform` only after you observe a problem.

Run `find-animation-opportunities` at M1 and build each animation with `animate`. At M4 run `review-animations` and fix everything it flags.

---

## 12. Performance

### 12.1 Budgets (measure and report; do not just claim)
- Mobile Lighthouse on `/` (production build, simulated slow 4G, mid-tier phone): **Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95**. Target **CLS < 0.05, LCP < 2.5s**. The LCP element must be shell text or a stat tile, **not the map**.
- **JS for the route excluding the map chunk: ≤ 150 KB gzipped.** The map chunk (MapLibre core is roughly 200 KB gzipped) loads lazily after first paint.
- CSS ≤ 30 KB gzipped. No raster image larger than 50 KB.
- During interactions with **4× CPU throttling** in Chrome DevTools: no long task over 50ms during filter changes, week changes, or region selection.

### 12.2 Techniques (required)
1. Server Components by default; `"use client"` only at the leaves.
2. One map instance, DOM markers ≤ 6, no per-frame React state, `move` handlers throttled with `requestAnimationFrame`.
3. Geometry: coordinates to 4 decimal places; per-district GeoJSON only.
4. No `next/image` for icons; use inline SVG. Avoid raster images entirely.
5. `<link rel="preconnect">` to `tiles.openfreemap.org`. Fonts via `next/font`; Indic fonts `preload: false`.
6. No middleware, no Next API routes, no server actions for data. The browser reads directly when the backend is wired.
7. Keep the page static or ISR. Everything interactive happens in the browser.
8. Add `@next/bundle-analyzer` as a **dev** dependency only, and report chunk sizes at the end of M2 and M4.

---

## 13. Accessibility and mobile-native feel

**Accessibility (WCAG 2.2 AA)**
- Contrast: text ≥ 4.5:1, large text and UI components ≥ 3:1. Critical values in `--ink` on white or tile.
- Colour is never the only signal (see §6.2). The map has a list alternative (§8, ListView).
- Visible `:focus-visible` ring (2px ink, 2px offset) on every interactive element. Full keyboard operation.
- `aria-live="polite"` on the verdict area so a screen reader announces changes when the region changes.
- Tap targets ≥ 44×44px. Labels on every input. Respect `prefers-reduced-motion`.

**Mobile-native (apply Emil's `mobile-native` skill at M3)**
- `100dvh`, never `100vh`. `viewport-fit=cover` and safe-area padding.
- `touch-action: manipulation`. `-webkit-tap-highlight-color: transparent` with a custom `:active` state.
- Hover styles only inside `@media (hover: hover)`.
- `overscroll-behavior: contain` on the map and the sheet.
- Inputs at 16px or larger.
- `theme-color` meta matching `--bg-page` on desktop and `--surface-shell` on mobile.

**PWA**
- `manifest.ts`: `name` "BHUMI", `short_name` "BHUMI", `display: standalone`, `start_url: "/"`, colours from tokens, 192 and 512 icons plus a maskable icon. Generate the PNGs with a one-off script; do not add an image library as a runtime dependency.
- **Optional at M5:** offline service worker that caches the app shell and the last-fetched forecast for the selected region (stale-while-revalidate), with a warning when data is over 36 hours old. If you use a Next PWA plugin, first verify it supports the installed Next.js version; otherwise write a minimal service worker by hand.

---

## 14. Copy

- Plain verbs, sentence case, active voice. Name things the way a farmer would. **No "teleconnection", "downscaling", "MJO" or "IOD" on primary screens.** They may appear inside `DriversSheet` and `/methodology`, each with a plain explanation.
- Hazard labels: **Monsoon start**, **Dry spell**, **Heavy rain**. Show values as "72% chance".
- Verdict labels: "Good time to sow", "Wait a week", "Prepare irrigation", "Protect seed from heavy rain", "Consider a crop that needs less water".
- Freshness: "Updated {date}, {time} IST. Next update tomorrow morning."
- Disclaimer (help popover, drivers sheet, methodology): "These are chances, not guarantees. Check with your local agriculture office before big decisions."
- Error: "Couldn't load the forecast for {region}. Check your connection and try again."
- Offline: "You're offline. Showing the forecast from {time}."
- **Do not claim accuracy** anywhere until validation numbers exist.

---

## 15. Milestones and acceptance criteria

At the end of each milestone: run `npm run lint`, `npx tsc --noEmit`, `npm run build`; commit; append to `docs/UI_BUILD_LOG.md` (what was done, screenshots, measured numbers, conflicts and how they were resolved, open questions). If your environment has a browser tool, take screenshots at 390×844, 768×1024 and 1440×900; otherwise say so in the log.

**M0. Setup and plan.** Skills installed and verified, `PRODUCT.md` written, `docs/UI_PLAN.md` written: dial values, colour and type tokens, an ASCII wireframe for each of the three breakpoints, the component tree, and the motion table copied from §11.
*Accept:* files exist, the plan matches this brief, `npm run build` passes on the scaffold.

**M1. Static shell with mock data.** Next.js scaffold in `web/`, tokens, fonts, `AppShell`, rail and tabs, top overlay controls, `LocationCard`, `StatTile`, `AdvisoryCard`, `GaugeCard`, skeletons, and a fixed-size map placeholder. Run `find-animation-opportunities`.
*Accept:* at 1440×900 the structure matches the reference (rail, floating filters, three-card row); at 390×844 there is no horizontal scroll and the sheet peeks correctly; Lighthouse Accessibility ≥ 95.

**M2. Map and interactions.** `MapView`, risk layer, hotspots, `StatChips`, filter cascade, search, layer switcher, week tabs, URL state, legend, help popover, `ListView` and the WebGL and tile fallbacks.
*Accept:* selecting a block on the map, in search, or in the dropdowns updates all cards and the URL; the map chunk is lazy; JS budget met (report sizes); no console errors; with WebGL disabled the list view works; keyboard-only flow reaches every control.

**M3. Languages and secondary pages.** i18n (en / hi / bn), Indic fonts loaded lazily, `DriversSheet`, Share, `PanchayatSelect`, `OfflineBanner`, `/advisories`, `/outlook`, `/methodology`. Apply Emil's `mobile-native`.
*Accept:* switching language changes chrome and sets `<html lang>`; no text overflow in Hindi or Bengali at 360px; Indic fonts do not load until selected.

**M4. Motion and polish.** Implement exactly the §11 table. Run `review-animations`, then `/impeccable critique`, `audit`, `polish`, `harden`, `adapt`, `optimize`, then `npx impeccable detect web/` and fix findings.
*Accept:* every budget in §12 measured and met (or the miss explained); reduced-motion verified; no long tasks over 50ms under 4× CPU throttling.

**M5 (optional). Offline and handoff.** Pinned regions, print CSS, offline service worker, `docs/UI_DATA_CONTRACT.md`, `.env.example`, and Vercel deploy notes (Root Directory `web`, env vars, framework preset Next.js).

---

## 16. Definition of done
- [ ] Looks like the reference at desktop and adapts cleanly to tablet and mobile.
- [ ] All §7.4 viewports work with no clipped controls or horizontal scroll.
- [ ] Every control is keyboard reachable; focus visible; contrast met; colour never the only signal.
- [ ] The map has a list alternative, and a basemap or WebGL failure never leaves the user stuck.
- [ ] Only §11 motion exists; reduced motion respected.
- [ ] Budgets in §12 measured and reported.
- [ ] Mock data is labelled as demo; no fake accuracy claims; no secrets committed.
- [ ] `docs/UI_DATA_CONTRACT.md` describes exactly what the backend must provide.
- [ ] Lint, type-check and build pass; `npx impeccable detect web/` is clean or every remaining finding is justified in the log.

## 17. Final report (write to `docs/UI_BUILD_LOG.md` and summarise in chat)
1. Files created, by area.
2. Which skills you actually ran, with the commands or evidence.
3. Measured numbers: Lighthouse scores, JS and CSS sizes, chunk sizes.
4. Deviations from this brief, and why.
5. Open questions and anything you could not verify.
6. What the backend must supply to replace the mock data.
