# BHUMI — UI Data Contract & API Specification

> **Specification of actual data types, repository interfaces, GeoJSON properties, and runtime adapters used by the BHUMI frontend.**  
> Source of truth: `src/lib/forecast/types.ts`, `src/lib/forecast/mock.ts`, and `src/lib/forecast/supabase-adapter.ts`.

---

## 1. Domain Types & Enums

### 1.1 Hazard
Defines the three monsoon risk phenomena predicted at 1-to-4 week lead times:
```ts
export type Hazard = 'onset' | 'dry_spell' | 'heavy_rain';
```
- `'onset'`: Probability of monsoon arrival during Kharif onset window.
- `'dry_spell'`: Probability of a monsoon break (consecutive dry days during active monsoon).
- `'heavy_rain'`: Probability of extreme precipitation spell (> 65 mm/day).

### 1.2 LeadWeek
The 4 rolling forecast lead weeks:
```ts
export type LeadWeek = 1 | 2 | 3 | 4;
```
- `1`: Days 1–7 from `validFrom`.
- `2`: Days 8–14 from `validFrom`.
- `3`: Days 15–21 from `validFrom`.
- `4`: Days 22–28 from `validFrom`.

### 1.3 Locale
All 10 regional Indian languages verified in the Step 6 advisory engine:
```ts
export type Locale =
  | 'en' // English
  | 'hi' // Hindi (हिन्दी)
  | 'mr' // Marathi (मराठी)
  | 'te' // Telugu (తెలుగు)
  | 'ta' // Tamil (தமிழ்)
  | 'bn' // Bengali (বাংলা)
  | 'gu' // Gujarati (ગુજરાતી)
  | 'kn' // Kannada (ಕನ್ನಡ)
  | 'pa' // Punjabi (ਪੰਜਾਬੀ)
  | 'or';// Odia (ଓଡ଼ିଆ)
```

### 1.4 Band
Categorical risk classification mapped from 0–100 probability values:
```ts
export type Band = 'low' | 'moderate' | 'high' | 'very_high';
```
- `'low'`: Probability < 25%
- `'moderate'`: Probability 25% – 49%
- `'high'`: Probability 50% – 74%
- `'very_high'`: Probability ≥ 75%

### 1.5 Verdict
Agronomic action recommendations based on verified ICAR/CRIDA contingency guidelines:
```ts
export type Verdict =
  | 'sow_now'            // Favorable moisture confirmed; proceed with sowing
  | 'wait'               // Deficit or break anticipated; delay field sowing
  | 'prepare_irrigation' // Prolonged dry spell likely; arrange protective irrigation
  | 'protect_from_rain'  // Heavy spell incoming; provide drainage & delay fertilizer
  | 'switch_crop';       // Late onset; switch to short-duration Kharif pulses/millets
```

### 1.6 Crop
Supported Kharif crop categories for targeted agronomic advice:
```ts
export type Crop = 'rice' | 'maize' | 'cotton' | 'soybean' | 'groundnut' | 'pulses';
```

---

## 2. Core Entities

### 2.1 Region
Represents an administrative entity in the national hierarchy:
```ts
export interface Region {
  id: string;
  name: string;
  level: 'state' | 'district' | 'block' | 'panchayat';
  parentId: string | null;
  centroid: [lng: number, lat: number];
  bbox: [minLng: number, minLat: number, maxLng: number, maxLat: number];
}
```
- `id`: Unique identifier (e.g. `'Rajasthan'`, `'district:Rajasthan:Jodhpur'`, `'IND_RJ_JOD_001'`).
- `name`: Clean display name (e.g. `'Mandore (Jodhpur)'`).
- `level`: Hierarchical tier.
- `parentId`: Identifier of parent administrative division (`null` for states).
- `centroid`: Longitude and latitude coordinate pair `[lon, lat]`.
- `bbox`: Spatial bounding box `[minLng, minLat, maxLng, maxLat]`.

### 2.2 Driver
An explainability factor influencing the probabilistic prediction:
```ts
export interface Driver {
  key: string;
  labelByLocale: Record<Locale, string>;
  effect: 'raises' | 'lowers';
  strength: number; // Normalized weight 0.0 .. 1.0
}
```
- `key`: Internal factor key (e.g. `'primary_driver'`, `'enso_signal'`, `'mjo_phase'`).
- `labelByLocale`: Human-readable description localized across all 10 languages.
- `effect`: Direction of influence (`'raises'` increases probability, `'lowers'` decreases probability).
- `strength`: Relative magnitude of impact on the final calibrated score.

### 2.3 RegionRisk
Multi-lead probabilistic hazard risks for a selected region:
```ts
export interface RegionRisk {
  regionId: string;
  probabilities: Record<Hazard, Record<LeadWeek, number>>; // Integer percentages 0..100
  reliability: 'low' | 'medium' | 'high';
  drivers: Record<Hazard, Driver[]>;
  isEstimate: boolean; // True for terrain-adjusted panchayat estimates
}
```

### 2.4 Advisory
Crop-specific agronomic recommendation for a region and lead week:
```ts
export interface Advisory {
  regionId: string;
  crop: Crop;
  week: LeadWeek;
  verdict: Verdict;
  textByLocale: Record<Locale, string>;
}
```
- `textByLocale`: Evaluated advice strings across all 10 languages (`en`, `hi`, `mr`, `te`, `ta`, `bn`, `gu`, `kn`, `pa`, `or`). Static pretranslated templates are the authoritative runtime approach. If localized content for a regional language is missing, it deterministically defaults to verified English text with an explicit fallback indicator (`isEnglishFallback: true`). IndicTrans2 (AI4Bharat) is designated as the open-source fallback architecture if future dynamic translation is required. Zero runtime translation APIs (no Bhashini dependency) and zero translation credentials are used.

### 2.5 ForecastMeta
Authoritative model operational status and metadata:
```ts
export interface ForecastMeta {
  issuedAt: string;          // ISO 8601 timestamp of forecast issue
  validFrom: string;         // ISO 8601 timestamp of Week 1 start
  nextUpdateAt: string;      // ISO 8601 timestamp of anticipated next run
  isProductionReady?: boolean;
  modelTier?: 'PRODUCTION' | 'EXPERIMENTAL';
  trainingCoverage?: {
    seasonsCount: number;
    blocksCount: number;
    samplesGenerated: number;
  };
}
```

---

## 3. Spatial GeoJSON Contract

Features rendered on the MapLibre map adhere to `RegionFeature`:

```ts
export type RegionFeatureProperties = {
  id: string;
  name: string;
} & Record<string, number | string | boolean | null>;

export type RegionFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.Point,
  RegionFeatureProperties
>;
```

### 3.1 Feature Properties Dictionary
| Property Key | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique region or summary identifier (e.g. `'IND_RJ_JOD_001'`) |
| `name` | `string` | Display name of the block or district |
| `level` | `string` | `'district'` for national overview points, `'block'` for block boundaries |
| `state` | `string` | Parent state name (e.g. `'Rajasthan'`) |
| `district` | `string` | Parent district name (e.g. `'Jodhpur'`) |
| `representation` | `string` | `'polygon'` for authentic PostGIS bounds, `'centroid'` or `'centroid_fallback'` |
| `is_centroid_fallback` | `boolean` | `true` if PostGIS polygon was missing and centroid point was used |
| `is_experimental` | `boolean` | `true` if forecast was produced by an experimental or unvalidated model |
| `onset_w1` .. `w4` | `number` | Onset probability (0–100) for weeks 1 through 4 |
| `dry_spell_w1` .. `w4`| `number` | Break probability (0–100) for weeks 1 through 4 |
| `heavy_rain_w1` .. `w4`| `number` | Heavy rain probability (0–100) for weeks 1 through 4 |

---

## 4. Repository Interface (`ForecastRepository`)

```ts
export interface ForecastRepository {
  /** Retrieves model readiness metadata, issue timestamps, and training coverage */
  getMeta(): Promise<ForecastMeta>;

  /** Lists child regions under parent (null returns states; stateId returns districts; districtId returns blocks) */
  listRegions(parentId: string | null): Promise<Region[]>;

  /** Fuzzy search for blocks or districts by name or identifier */
  searchRegions(query: string, limit?: number): Promise<Region[]>;

  /** Loads GeoJSON FeatureCollection (null returns national district summaries; districtId returns block boundaries) */
  getRegionsGeoJSON(
    parentId: string | null
  ): Promise<GeoJSON.FeatureCollection<RegionFeature['geometry'], RegionFeatureProperties>>;

  /** Fetches weekly probabilities and explainability drivers for a block */
  getRisk(regionId: string): Promise<RegionRisk>;

  /** Evaluates crop contingency rule and returns localized advice for block and lead week */
  getAdvisory(regionId: string, crop: Crop, week: LeadWeek): Promise<Advisory>;
}
```

---

## 5. Implementations

### 5.1 `MockForecastRepository` (`src/lib/forecast/mock.ts`)
- **Usage:** Active when `NEXT_PUBLIC_USE_MOCK_DATA="true"`.
- **Behavior:**
  - Generates synthetic hexagonal grid geometries.
  - Provides deterministic, spatially coherent risk values for mock entities (`"Demo State"`, `"Demo District A"`, `"Block 07"`).
  - Supplies mock translations across all 10 locales.
  - Automatically signals the UI to display the visible **"Demo data"** badge.

### 5.2 `SupabaseForecastRepository` (`src/lib/forecast/supabase-adapter.ts`)
- **Usage:** Active when `NEXT_PUBLIC_USE_MOCK_DATA="false"` and Supabase credentials are configured.
- **Behavior:**
  - **Security:** Connects via public anonymous PostgREST API using `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Zero `service_role` keys are exposed.
  - **Metadata:** Resolves `getMeta()` by invoking `GET /api/readiness`, which reads `pipeline/ml/artifacts/metadata.json` on the server. Zero client filesystem access.
  - **Tables Queried:**
    - `public.blocks`: Fetches authentic administrative hierarchies, centroids, and PostGIS `boundary_geom`.
    - `public.live_predictions`: Fetches daily probabilistic forecasts across weeks 1–4 and teleconnection drivers.
    - `public.advisory_rules`: Sourced by the Step 6 `evaluateAdvisoryRule` engine to produce deterministic Kharif advisories across all 10 locales.
  - **Performance Optimization:** In national overview (`parentId === null`), aggregates district centroid points rather than loading all 6,700 block boundary polygons.
  - **Fallback Integrity:** If PostGIS geometry is null or unseeded, safely falls back to centroid `Point` features without fabricating fake polygons.
