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
- Fixed Citizen Safety Advisory in `PlanPanel.tsx`:
  - Resolved panel height collapse bug caused by `min-h-0` / `flex-1` nested in `overflow-y-auto` aside, fixing height to `shrink-0 min-h-[260px]` so advisory text and facts are never clipped.
  - Added "Loading advisory..." spinner state when fetching new plan for citizen mode.
  - Added visible error banner when plan generation fails.
  - Logged `POST /api/plan` request body (`simulation`, `mode`, `zone_id`) and response to console.
  - Guaranteed all 3 facts (nearest open hospital, nearest shelter, closed roads) and safety message always display cleanly in citizen mode.
- Redesigned Right Column & 1920x1080 Layout:
  - Eliminated the empty white band at the top by anchoring the root container with `fixed inset-0 h-full w-full` and styling `html, body, #root` with `background-color: #0d1117` and `color-scheme: dark`.
  - Expanded right panel width to 420px (`w-[420px] min-w-[420px] max-w-[420px]`).
  - Redesigned `ThreatGauge` into a compact single-row card (40px ring gauge, compound %, baseline %, pts synergy, and threat level badge).
  - Shortened `CompareBar` and dropped the bottom explanatory sentence, preserving the prominent bars, values, and synergy badge.
  - Condensed `MetricCards` into a single row of 4 small metric tiles (Hospitals Isolated, Zones Cut Off, Pop. Cut Off, Roads Closed %) with a clean footer line for average extra distance and compute time.
  - Restructured `PlanPanel` to fill all remaining height (`flex-1 min-h-0 overflow-hidden` with internal scroll `overflow-y-auto`):
    - In Authority mode: Summary + top 4-5 ranked response actions are fully visible without scrolling at 1920x1080.
    - In Citizen mode: Zone name, plain-language advisory, and all 3 facts (nearest hospital, nearest shelter, closed roads) are fully visible without scrolling at 1920x1080.
  - Optimized `ControlPanel` spacing and slider padding so the left controls fit entirely within 1080px (and 900px) height without scrolling, scrolling only if the window height falls below ~720px.
- Weather Source Indicator & Population Formatting:
  - Added weather source tracking in `App.tsx` and a dedicated tag in `ControlPanel.tsx` next to the "Use live weather" button: shows `"Live (Open-Meteo)"` when live, or `"Replaying recorded monsoon sample (45 mm/hr)"` when cached (never shows fetched_at for cache).
  - Added a `"Weather: recorded sample"` or `"Weather: live"` chip in the header bar next to the Live Backend badge upon fetching weather.
  - Formatted population figures in `MetricCards.tsx` using thousands separators below 1,000,000 (e.g. `650,000`) and one/two decimals with `M` above 1,000,000 (e.g. `2.25M`).
- Map Hospital Badges & Labels Readability & Fixed Positioning:
  - Added `LABEL_POSITIONS` table at the top of `MapView.tsx`:
    - `h1` Sion Hospital: `right`
    - `h2` Bhabha (Kurla): `right`
    - `h3` Lilavati: `left`
    - `h4` Asian Heart: `above`
    - `h5` Guru Nanak: `left`
    - `h6` KJ Somaiya: `right`
    - `h7` SL Raheja: `left`
    - `h8` Surana Sethia: `above`
  - Replaced automatic collision code with fixed anchor positions, small coordinates dot, and 1px leader lines styled via CSS classes (`.label-left`, `.label-right`, `.label-above`, `.label-below`).
  - Compact styling: `font-size: 11px`, `padding: 2px 6px`. Single-line for OPERATIONAL, and single-line for ISOLATED with a small red `ISOLATED` tag on the same line.
  - Isolated hospital markers draw strictly above operational ones via `zIndexOffset={isIsolated ? 1000 : 0}` and rendering order.
  - Fitted map tighter to study area with `fitBounds` padding `[20, 20]`, `maxZoom: 14`, `minZoom: 13`, and `maxBounds` bounding box restriction.

### Demo Safety Hardening
- `backend/scripts/save_weather_cache.py` — one-off script writing `backend/data/weather_cache.json` with 45 mm/hr monsoon sample; shape matches §6 `GET /weather/live` response exactly; adds `"note": "Recorded monsoon sample for replay"`. No network calls.
- `backend/app/weather.py` — `fetch_live_weather` updated:
  - `?replay=true` query param → always returns cached rainy sample, skipping live fetch.
  - If live call succeeds but rain < 1 mm/hr → returns cached sample with `source: "cache"` (non-dramatic live values suppressed for the demo).
  - On failure or timeout → cache fallback unchanged.
- `backend/app/plan.py` — citizen fact string changed from `~N% of local roads closed due to flooding` to `about N% of roads in the study area are closed` using real `roads_closed_pct` from simulation (never hardcoded).
- `backend/app/main.py` — `GET /weather/live` route accepts optional `replay: bool = False` query param and forwards to `fetch_live_weather`.

**Verified output:**
```
# save_weather_cache.py
Written: backend/data/weather_cache.json
{ "rain_mm_hr": 45.0, "source": "cache", "fetched_at": "2024-07-26T08:30:00Z",
  "note": "Recorded monsoon sample for replay" }

# replay=True
source : cache  |  rain: 45.0 mm/hr  |  note: Recorded monsoon sample for replay

# citizen facts.closed_roads (Compound event, z1)
['about 24% of roads in the study area are closed']

# citizen message
⚡ Dharavi: REROUTING IN EFFECT. Threat level: Severe. Your nearest accessible hospital is
Lokmanya Tilak Municipal General Hospital (Sion Hospital) (route is +0.2 km longer than usual).
Nearest shelter: Little Angels' High School. about 24% of roads in the study area are closed.
Avoid flooded roads. Follow authority instructions.
```

### All-clear fix in plan.py
- Added `_is_all_clear(simulation)` helper: returns `True` when `roads_closed_pct < 0.5` AND `hospitals_isolated == 0` AND `zones_cut_off == 0`, reading entirely from the simulation object received by `/plan`.
- **Authority mode, all_clear:** returns single action `{rank:1, action:"Continue monitoring", target:"All zones", ...}` and summary `"Compound threat level: <level>. No roads closed, all hospitals reachable. No action required. Continue monitoring."` — no "Close and signpost" actions for Normal preset.
- **Citizen mode, all_clear:** returns message `"<Zone>: No flooding impact right now. Threat level: <level>. All nearby roads are open. Your nearest hospital is <name>. Stay informed and check back if conditions change."` and `closed_roads: ["No roads closed"]`.
- Heavy rain (5% roads closed, 0 hospitals isolated) is NOT all_clear → still produces "Close and signpost closed roads" actions correctly.
- Response shape unchanged per §6; source always `"template"` on this path.

**Verified outputs:**
```
Normal — authority:
  source: template | actions: 1
  1. [Continue monitoring] → All zones
  summary: Compound threat level: Low. No roads closed, all hospitals reachable. No action required. Continue monitoring.

Normal — citizen z1:
  zone: Dharavi
  message: Dharavi: No flooding impact right now. Threat level: Low. All nearby roads are open.
           Your nearest hospital is Lokmanya Tilak Municipal General Hospital (Sion Hospital).
           Stay informed and check back if conditions change.
  closed_roads: ['No roads closed']

Heavy rain — authority:
  source: template | actions: 5
  1. [Close and signpost closed roads] → Dharavi
  2. [Pre-position ambulance ...] → Bhabha Hospital (Kurla)
  ... (correctly shows road-closure actions)

Compound — authority:
  source: template | actions: 6
  1. [Pre-position ambulance ...] → Lokmanya Tilak...
  3. [Evacuate zone and open emergency shelter] → Wadala
  ... (correctly shows full emergency actions)
```

**smoke_test.sh: 10 passed, 0 failed** ✅

### Session D, Part 4 — Configurable API Layer & Automatic Mock Fallback
- `frontend/src/api.ts`:
  - `USE_MOCK = import.meta.env.VITE_USE_MOCK === "true"` (defaults to `false`).
  - `API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api"`.
  - Added `fetchWithTimeout(url, options, 8000)`: 8-second request timeout for all backend calls.
  - Automatic fallback: when `USE_MOCK` is false and a request is unreachable or times out, smoothly transitions the app to mock mode once and persists it in `sessionStorage` (`climaguard_use_mock_session`) for the rest of the session.
  - Reactive `subscribeBackendStatus` and `getBackendStatus()`: broadcasts `"connecting"`, `"live"`, or `"mock"`.
  - Nearest mock simulation matching in normalized hazard space (`rain/125`, `surge/4`, `tide/4`) for all presets and sliders.
  - Plausible mock action plans for Authority and Citizen modes: includes exact all-clear wording for Normal scenario (`"Continue monitoring"` and `"No flooding impact right now..."`), and ranked emergency actions for active compound/heavy events.
  - Mock live weather returns 45 mm/hr recorded monsoon sample (`rain_mm_hr: 45.0, source: "cache"`).
- `frontend/src/App.tsx`:
  - Dynamic Header Badge:
    - `"Connecting to server..."` while waiting for the first backend response.
    - `"Live Backend"` in green when the backend actually responded.
    - `"Demo mode: cached scenarios"` in amber when running in mock mode or after fallback.
  - Removed hardcoded `/health` call; status flows naturally through API client requests.
- `frontend/src/vite-env.d.ts`:
  - Added environment variable type declarations for `VITE_USE_MOCK`, `VITE_API_URL`, and `VITE_API_BASE`.
- Build verification: `npm run build` exits 0 with zero warnings/errors.
- Browser test verification: verified Live Backend status, session fallback to mock mode, Normal all-clear plan, Compound advisory, and weather 45 mm/hr replay button.

### Render deployment prep
- **`backend/requirements-prod.txt`** (new): production-only deps — `fastapi`, `uvicorn[standard]`, `pydantic`, `python-dotenv`, `httpx`, `networkx`, `numpy`, `google-genai`, `pytest`. Excludes `osmnx`, `geopandas`, `shapely`, `pandas`, `requests` (all data-prep only). `requirements.txt` unchanged for `prep_data.py`.
- **`backend/app/main.py`** — two changes:
  1. CORS origins now read from env var `CORS_ORIGINS` (comma-separated); defaults to `http://localhost:5173,http://127.0.0.1:5173`. Set `CORS_ORIGINS=https://your-app.onrender.com` on Render.
  2. Memory logged at startup via `resource.getrusage` (platform-safe: bytes on macOS, KB on Linux).
- No changes to `flood.py` — it already uses `nx.read_graphml`, never imports osmnx at runtime.
- Startup confirmed with `--host 0.0.0.0 --port $PORT`.

**Measured memory after startup: 189.2 MB RSS** (well within Render free-tier 512 MB limit).

**Start command for Render:**
```
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

**Test results:**
```
test_engine.py : 12/12 passed
smoke_test.sh  : 10/10 passed
```

## Next
- Session D, Part 5: Video walkthrough & demo recording.

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
