Current step: Session D, Part 3 complete

## Done

### Session A — Data prep
- Created `backend/requirements.txt` with all required dependencies.
- Implemented and refined `backend/scripts/prep_data.py`:
  - OSMnx road network download for Mumbai bbox, simplified, largest SCC.
  - Primary elevation source updated to OpenTopoData SRTM 30m in batches of 100 with 1.2s rate-limit sleep.
  - Robust exponential backoff (5s to 60s, max 6 attempts), HTTP 429 backoff ≥ 30s.
  - Facility extraction (5–10 hospitals, fire stations, shelters) and 10 hand-defined zones.

### Session B — Engine & Tuning
- `backend/app/config.py` — single source of truth for all constants and presets:
  - `K = 0.85`, `RAIN_DIV = 125.0`, `SURGE_DIV = 4.0`, `TIDE_DIV = 4.0`.
  - `RAIN_LOW_REF_M = 6.0`, `MAX_PONDING = 0.55`, `CLOSE_THRESHOLD = 0.30`, `DRAIN_CAP = 25.0`, `ELEVATION_FLOOR_M = 1.0`.
  - Presets: Normal, Heavy rain, Compound event (extreme) [surge=2.5, tide=3.0, rain=90].
- `backend/app/flood.py`:
  - Bridge exemption: `is_bridge()` checks OSM `bridge` attributes; bridges/flyovers never close (e.g. SCLR Flyover).
  - Parameterized lowness formula using `RAIN_LOW_REF_M` instead of hardcoded 12.
- `backend/app/cascade.py`:
  - Hospital isolation logic: hospital is OPERATIONAL if in largest WCC and largest WCC has ≥ 10% of all nodes; otherwise ISOLATED.
  - Zone cut-off logic: zone is CUT_OFF if it cannot reach any non-isolated hospital via directed path in flooded graph.
  - WCC count and largest WCC size reported in metrics.
- `backend/scripts/test_engine.py`:
  - 12/12 tests pass (Acceptance tests 1–5 + Regression tests 6–10).
  - Tests verify: Heavy rain < 20% closed (5.15%), Compound event ≥ 8% above Heavy rain (24.00%, +18.85% margin), 0 bridges closed, Compound event isolates 1–5 hospitals (5 isolated), Compound score uncapped < 1.0 (0.8987).

**Test results** (`python3 scripts/test_engine.py` from `backend/`):
```
12/12 tests passed

Preset Report:
  Normal                   → compound=0.0683  baseline=0.0683  Low       roads_cls=0.00%   h_iso=0  z_cut=0  wccs=1     largest_wcc=7513  pop_iso=0
  Heavy rain               → compound=0.3233  baseline=0.3233  Moderate  roads_cls=5.15%   h_iso=0  z_cut=0  wccs=306   largest_wcc=7102  pop_iso=0
  Compound event (extreme) → compound=0.8987  baseline=0.6983  Severe    roads_cls=24.00%  h_iso=5  z_cut=5  wccs=1571  largest_wcc=4751  pop_iso=650,000

Slider Maximums (rain=150, surge=3.0, tide=3.0):
  compound=1.0000  baseline=0.8333  Severe  roads_closed=24.00%
```

### Session C — API
- `backend/app/schemas.py` — Pydantic models for every §6 request and response body:
  - `SimulateRequest`, `SimulateResponse`, `PlanRequest`, `AuthorityPlanResponse`, `CitizenPlanResponse`, `RegionResponse`, `WeatherResponse`, `HealthResponse`, `ErrorResponse`.
- `backend/app/state.py` — FastAPI dependency singleton:
  - Calls `load_data()` + `precompute_baselines()` once in lifespan startup.
  - Exposes `get_app_state()` dependency and `AppState` typed alias.
- `backend/app/weather.py` — `GET /weather/live`:
  - httpx async client, 5-second timeout, Open-Meteo `current=precipitation`.
  - Falls back to `weather_cache.json` on any failure; creates sample cache if missing.
  - Updates cache on successful live fetch.
- `backend/app/plan.py` — `build_plan(simulation, mode, zone_id, facilities, zones)`:
  - Authority: ranked actions by `population × vulnerability × (2 if CUT_OFF else 1)`.
  - Action templates: pre-position ambulance, evacuate zone, open shelter, close roads, protect isolated hospital.
  - Citizen: fact sheet (nearest hospital, shelter, closed road summary) + template message.
  - Gemini rewrite via `google-genai` SDK if `GEMINI_API_KEY` is set.
  - Validation: non-empty, ≤ 180 words, no invented hospital/shelter names.
  - Falls back to Python template silently; always returns `source: "llm" | "template"`.
- `backend/app/main.py` — FastAPI app:
  - Lifespan startup: `init_app_state()`.
  - `GZipMiddleware(minimum_size=1000)` for compressed `/region` and `/simulate` responses.
  - CORS for `http://localhost:5173` and `http://127.0.0.1:5173`.
  - Routes: `GET /api/health`, `GET /api/region`, `GET /api/weather/live`, `POST /api/simulate`, `POST /api/plan`.
  - `§6` error shape `{"error": ..., "detail": ...}` with proper HTTP status codes.
- `backend/scripts/smoke_test.sh` — 10 curl tests:
  - All 5 endpoints including `/plan` authority+citizen for Compound event preset.
  - Error cases: missing `zone_id` (400), bad simulate body (422).

**Smoke test results** (`bash scripts/smoke_test.sh` from `backend/`):
```
10 passed, 0 failed

GET /health      → {"status":"ok","nodes":7513,"hospitals":8,"zones":10}
GET /region      → 8 hospitals, 8 shelters, 10 zones, 10280 road features
GET /weather/live→ {"rain_mm_hr":0.0,"source":"live","fetched_at":"2026-10-25T17:54:01Z"}
POST /simulate   → Severe, compound=0.8987, 24% roads closed, 5 hospitals isolated, compute_ms≈60
POST /plan auth  → source=template, 14 actions
POST /plan cit   → source=template, zone=Dharavi, message OK
template fallback→ source=template when GEMINI_API_KEY="" ✅
```

### Session D, Part 1 — Frontend Foundation & Layout
- Created Vite + React + TypeScript application in `frontend/` with Tailwind CSS and Leaflet via `react-leaflet`.
- `frontend/src/types.ts` — TypeScript types matching §6 API contract exactly (`SimulateRequest`, `SimulateResponse`, `RegionResponse`, `PlanRequest`, `AuthorityPlanResponse`, `CitizenPlanResponse`, `WeatherResponse`, `HealthResponse`, `ErrorResponse`).
- `frontend/src/data/presets.json` — copied from `mock/presets.json` preserving exact names and parameter values.
- `frontend/src/api.ts` — client with `USE_MOCK` flag (default `true`):
  - `getRegion()` loads `mock/region.json`.
  - `simulate()` loads preset mock via nearest match on rain / compound thresholds.
  - `plan()` returns plausible mocks for Authority and Citizen modes matching §6.
  - `getWeatherLive()` returns live weather / cache.
  - When `USE_MOCK = false`, connects to `http://localhost:8000/api` with fetch.
- Full-screen three-column layout per §7:
  - Left controls (300px): Sliders (rain 0–150 mm/hr, surge 0–3 m, tide 0–3 m, what-if rain +% 0–50, sea level rise 0–2 m step 0.1), Authority/Citizen mode toggle, zone dropdown (Citizen only), "Use live weather" button, 3 preset buttons loaded from `presets.json`.
  - 300 ms debounce on slider adjustments before calling `simulate()`.
  - Centre map (flexible): Leaflet map placeholder with dark Carto tiles fitted to bbox `[72.82, 19.02, 72.905, 19.095]`.
  - Right panel (360px): `ThreatGauge`, `CompareBar` (Compound vs Baseline money shot), `MetricCards`, and `PlanPanel` (with AI/template indicator badge).
  - Footer label: "Simulation on cached Mumbai network. Parameters are scenario assumptions."
- Dark UI with subtle loading indicator, retaining previous results while recomputing, non-crashing error banner.
- Verified `npm run build` and started Vite dev server at `http://127.0.0.1:5173/`.

### Session D, Part 2 — Interactive Map Overlays & Rendering
- Refined `frontend/src/components/MapView.tsx`:
  - `MapController` dynamically invalidates map container size and executes `map.fitBounds` with padding to `region.bbox` on mount and upon region data loading.
  - Custom Leaflet panes configured with explicit z-index stacking above the tile pane (200): `roadsPane` (350), `closedRoadsPane` (360), `reroutePane` (370), `floodPane` (380), `zonesPane` (390), `hospitalsPane` (450).
  - High-performance canvas vector rendering for the 16,724 road features: open roads rendered in grey (`#94a3b8`, opacity 0.5), closed roads matched by `u-v-key` rendered in bright red (`#ff3b30`, weight 4, opacity 1) in `closedRoadsPane`.
  - Blue flooded node circles (`#38bdf8`, fill opacity 0.5) scaled by water depth.
  - Zone circles scaled by population with status colors: OK (green), REROUTED (amber), CUT_OFF (red).
  - Safe reroute paths rendered as bright green polylines (`#22c55e`, weight 4).
  - Hospital markers rendered as custom large colored `L.divIcon` badges: green with hospital name when OPERATIONAL; prominent red badges with text `ISOLATED` when cut off from care.
  - Removed temporary dashed bbox rectangle.
  - Verified dark filter in `index.css` applies strictly to `.leaflet-tile-pane` only.
  - Zero console errors; verified map and overlays rendering in browser under normal and compound scenarios.

### Session D, Part 3 — Right Panel Components & Map Visual Refinements
- `ThreatGauge.tsx`: Refined into an SVG semicircle ring gauge displaying `risk.compound` as a percentage, threat level label with color coding (Low green, Moderate yellow, High orange, Severe red), and baseline comparison.
- `CompareBar.tsx`: Built prominent horizontal comparison bars labelled "Independent averaging" (`risk.baseline`) and "ClimaGuard compound model" (`risk.compound`), with "+... pts synergy" badge and an explanatory percentage-point difference caption.
- `MetricCards.tsx`: Rendered 6 simulation metrics: Hospitals Isolated, Zones Cut Off, Population Isolated (formatted with commas), Roads Closed %, Average Extra Distance, and Compute Time.
- `PlanPanel.tsx`:
  - Authority mode: Displays ranked actions as a numbered checklist with target, reason, and estimated people.
  - Citizen mode: Displays plain-language safety advisory and key facts (nearest open hospital, shelter, closed roads).
  - Source tag: Displays `✨ AI-assisted` when source is `llm`, and `📋 Rule-based` when source is `template`.
- `App.tsx`: Debounced `getPlan` re-fetch (250 ms) whenever simulation, mode, or zone selection changes.
- `MapView.tsx`:
  - Flood circles: Rendered as subtle, translucent circles (radius 25m to 60m scaled by `depth_m`, `fillOpacity: 0.25`, `stroke: false`) so road lines and reroutes stay crisp and clear.
  - Hospital badges: Compact green `H` badge when OPERATIONAL with short name on hover and full popup on click; red badge with `H` and `ISOLATED` anchored below the point to prevent overlap.
- Verified in browser with subagent: components render and update dynamically across Normal, Heavy rain, and Compound event scenarios.

## Next
- Session D, Part 4: Final verification against real backend API (`USE_MOCK = false`), edge cases, and video recording prep.

## Known bugs
- None

## Tuned values
- `RAIN_LOW_REF_M = 6.0 m` — reference elevation below which rain accumulates; covers lower 30% of terrain without inundating high ground.
- `MAX_PONDING = 0.55 m` — maximum rainfall ponding depth; calibrated so heavy rain ponds 0.48m at 1m elev and 0.16m at 4m elev.
- `CLOSE_THRESHOLD = 0.30 m` — vehicular stalling threshold (30cm passenger vehicle standard) per SPEC §5.3.
- `DRAIN_CAP = 25.0 mm/hr` — urban storm drain runoff capacity; rainfall below 25 mm/hr drains without ponding.
- `ELEVATION_FLOOR_M = 1.0 m` — effective minimum elevation floor preventing numerical division artefacts.
- `K = 0.85` — synergy multiplier tuned so Compound event reaches 0.8987 (Severe) without hitting the 1.0 ceiling, with margin > 0.20 above baseline.
- `RAIN_DIV = 125.0 mm/hr` — normalisation scale mapping rain to [0,1]; maps 125 mm/hr cloudburst to 1.0.
- `SURGE_DIV = 4.0 m` — normalisation scale mapping storm surge to [0,1]; maps 4.0 m severe cyclone surge to 1.0.
- `TIDE_DIV = 4.0 m` — normalisation scale mapping tide to [0,1]; maps 4.0 m highest astronomical tide to 1.0.
- `PRESETS`:
  - `Normal`: rain=10, surge=0.0, tide=0.5
  - `Heavy rain`: rain=90, surge=0.0, tide=1.0
  - `Compound event (extreme)`: rain=90, surge=2.5, tide=3.0
