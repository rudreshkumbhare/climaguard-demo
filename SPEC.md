# CLIMAGUARD AI: Prototype Spec (Mumbai)

> Paste this file at the start of EVERY agent session. Do not add features that are not in this file.

## 0. Goal

A single-page dashboard that, for **Mumbai (Sion–Kurla–Dharavi–BKC–Bandra East)**, takes **rain + storm surge + high tide** inputs and shows:

1. Compound threat level (vs. a naive averaging baseline)
2. Which roads flood, which hospitals become isolated, and the safe reroute
3. A ranked Authority action plan and a plain-language Citizen message
4. Live re-computation when what-if sliders move

It is a **simulation on a cached region with optional live weather input**. It is not a real-time digital twin. UI and video must say so.

## 1. Hard scope rules (for AI agents)

- DO NOT add: Redis, PostGIS, Postgres, Docker, Prometheus, LangChain, auth, user accounts, cloud deployment, LSTM/ARIMA, SMS.
- DO NOT download OSM data at runtime. Everything loads from `backend/data/`.
- The risk and cascade logic is **deterministic Python**. The LLM only rewrites facts the engine already produced.
- One repo, two folders: `backend/` (FastAPI) and `frontend/` (Vite + React). Single-page UI.
- Every engine function must be runnable and testable from a plain Python script without the server.
- Keep the graph small (see section 3). If anything is slow, shrink the area, don't add infrastructure.

## 2. Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.11+, FastAPI, uvicorn, pydantic |
| Geo/graph | osmnx, networkx, geopandas, shapely, numpy, pandas |
| Frontend | Vite + React + TypeScript (or JS), Tailwind CSS, Leaflet via react-leaflet |
| LLM | Gemini API (free tier) via plain HTTP/SDK, strict template, template fallback |
| Weather | Open-Meteo forecast API (no key), plus one cached JSON for replay |
| Elevation | Open-Meteo elevation API or Open-Elevation, batched once offline and saved |

## 3. Study area

Bounding box (adjust after checking the graph size):

```
north=19.095, south=19.020, east=72.905, west=72.820
```

Covers Sion, Matunga, Dharavi, Kurla, Bandra East/BKC and the Mithi river corridor, which is a well-known flood-prone zone. Drive network only (`network_type="drive"`).

Target: **under ~8,000 nodes**. If larger, shrink the box or simplify the graph (`ox.simplify_graph` is already applied; drop minor residential roads if needed).

Facilities to extract from OSM (`amenity=hospital`, `amenity=fire_station`, shelters via `amenity=shelter` / schools / community halls as a fallback). Verify the hospital list after extraction (expect names like Sion Hospital, Bhabha Hospital Kurla, Lilavati; confirm what OSM actually returns) and keep **5 to 10** hospitals. Snap each to its nearest graph node.

**Population:** 8 to 12 hand-defined "zones" (centroid + estimated population + vulnerability 0 to 1), saved in `zones.json`. Coarse numbers are fine; the video says "approximate".

## 4. Repo layout

```
climaguard/
  SPEC.md
  backend/
    data/                  # generated, committed
      graph.graphml
      facilities.json
      zones.json
      weather_cache.json
    scripts/
      prep_data.py         # one-off: OSM + elevation -> data/
      test_engine.py       # sanity tests, runnable without server
    app/
      main.py              # FastAPI app, CORS, routes
      schemas.py           # pydantic models = API contract below
      state.py             # loads graph/facilities/zones once at startup
      risk.py              # compound risk engine
      flood.py             # per-node flood depth + closed edges
      cascade.py           # isolation analysis + rerouting
      plan.py              # facts -> action plan (deterministic) + LLM rewrite
      weather.py           # Open-Meteo fetch + cache fallback
    requirements.txt
  frontend/
    src/
      App.tsx
      api.ts
      components/ (MapView, ControlPanel, ThreatGauge, CompareBar, PlanPanel)
```

## 5. Engine definitions (implement exactly; params in one `config.py`)

### 5.1 Hazard normalisation (each to 0..1)

```
rain_norm  = clip(rain_mm_hr / 100, 0, 1)      # 100 mm/hr = extreme
surge_norm = clip(surge_m   / 3,   0, 1)
tide_norm  = clip(tide_m    / 3,   0, 1)       # tide above mean sea level
hazards = [rain_norm, surge_norm, tide_norm]
```

### 5.2 Compound risk

```
baseline = mean(hazards)                        # naive "averaging" approach
synergy  = product(hazards)
compound = min(1.0, baseline * (1 + K * synergy))   # K = 2.0 default, tunable
```

Properties to test: if any hazard is ~0, `compound ≈ baseline`; if all three are high, `compound` is clearly above `baseline`. Level mapping: `<0.25 Low, <0.5 Moderate, <0.75 High, else Severe`.

State honestly in the video: **K is a tunable parameter, not a calibrated constant.**

### 5.3 Flood depth per node (metres)

```
water_level   = tide_m + surge_m                           # relative to mean sea level (SRTM-like datum)
coastal_depth = max(0, water_level - elevation)
rain_depth    = clip((rain_mm_hr - DRAIN_CAP)/75, 0, 1) * MAX_PONDING   # DRAIN_CAP=25, MAX_PONDING=0.8
lowness       = clip((12 - elevation) / 12, 0, 1)
depth         = coastal_depth + rain_depth * lowness
```

An **edge is closed** if `max(depth[u], depth[v]) >= CLOSE_THRESHOLD` (default 0.30 m). Document these as scenario assumptions, not hydrological truth.

### 5.4 Cascade

1. Copy the base graph, remove closed edges.
2. For each zone, find the nearest node. For each hospital, find the nearest node.
3. A zone is **cut off from care** if it cannot reach ANY operating hospital by road. A hospital is **ISOLATED** if its node is not reachable from the main connected component (or from the majority of zones).
4. For zones that still reach a hospital, compute shortest-path (Dijkstra, weight=`length`) on the flooded graph vs the baseline graph. Report extra distance.
5. For each affected zone, return the safe route polyline to the nearest reachable hospital, plus the nearest reachable shelter.

Metrics returned: `hospitals_isolated`, `zones_cut_off`, `population_isolated`, `avg_extra_km`, `roads_closed_pct`.

### 5.5 Plan (Authority + Citizen)

Deterministic first:

- **Authority:** list of ranked actions built by rules, priority score = `population × vulnerability × (cut-off ? 2 : 1)`. Each action: `{rank, action, target, reason, est_people}`.
- **Citizen:** for a chosen zone: `{zone, risk_level, closed_roads, nearest_open_hospital, nearest_shelter, safe_route_summary}`.

LLM layer (`plan.py`): send the facts JSON and ask Gemini to **rewrite only**, with this system rule: *"Use only the facts provided. Do not invent roads, places, numbers or shelters. If a fact is missing say 'not available'."* Validate output is non-empty and under N words; otherwise **fall back to a Python string template**. The API response always includes `source: "llm" | "template"`.

## 6. API contract

Base URL `http://localhost:8000/api`. All JSON. CORS open for `http://localhost:5173`.

### GET `/health`
```json
{ "status": "ok", "nodes": 6421, "hospitals": 7, "zones": 10 }
```

### GET `/region`
Static layers, called once on load.
```json
{
  "bbox": [72.820, 19.020, 72.905, 19.095],
  "hospitals": [{ "id": "h1", "name": "Sion Hospital", "lat": 19.04, "lon": 72.86 }],
  "shelters":  [{ "id": "s1", "name": "...", "lat": 0, "lon": 0 }],
  "zones":     [{ "id": "z1", "name": "Dharavi", "lat": 0, "lon": 0, "population": 0, "vulnerability": 0.8 }],
  "roads": { "type": "FeatureCollection", "features": [] }
}
```
Each road feature has `properties: { "id": "u-v-0", "name": "...", "highway": "primary" }`. Keep geometry simplified.

### GET `/weather/live?lat=19.05&lon=72.86`
Returns current/forecast rain from Open-Meteo, falling back to `weather_cache.json` (`"source": "live" | "cache"`).
```json
{ "rain_mm_hr": 12.4, "source": "live", "fetched_at": "2026-11-01T10:00:00Z" }
```

### POST `/simulate`  (the main endpoint, used by sliders)
Request:
```json
{
  "rain_mm_hr": 80,
  "surge_m": 1.5,
  "tide_m": 2.0,
  "rain_increase_pct": 0,
  "sea_level_rise_m": 0
}
```
Backend applies the what-if: `rain = rain_mm_hr * (1 + rain_increase_pct/100)`, `tide = tide_m + sea_level_rise_m`.

Response:
```json
{
  "inputs_effective": { "rain_mm_hr": 80, "surge_m": 1.5, "tide_m": 2.0 },
  "risk": {
    "hazards": { "rain": 0.8, "surge": 0.5, "tide": 0.67 },
    "baseline": 0.66,
    "compound": 0.94,
    "level": "Severe",
    "k": 2.0
  },
  "flood": {
    "closed_edge_ids": ["u-v-0"],
    "roads_closed_pct": 23.4,
    "flooded_nodes": [{ "lat": 0, "lon": 0, "depth_m": 0.6 }]
  },
  "cascade": {
    "metrics": {
      "hospitals_isolated": 2,
      "zones_cut_off": 3,
      "population_isolated": 41200,
      "avg_extra_km": 3.2
    },
    "hospitals": [{ "id": "h1", "status": "ISOLATED" }, { "id": "h2", "status": "OPERATIONAL" }],
    "zones": [{
      "id": "z1", "status": "CUT_OFF",
      "nearest_hospital_id": null, "extra_km": null,
      "route": null
    }, {
      "id": "z2", "status": "REROUTED",
      "nearest_hospital_id": "h2", "extra_km": 2.1,
      "route": { "type": "LineString", "coordinates": [[72.85, 19.04]] }
    }]
  },
  "compute_ms": 180
}
```
`status` enums: hospitals `OPERATIONAL | ISOLATED`; zones `OK | REROUTED | CUT_OFF`.

### POST `/plan`
Request: `{ "simulation": <the /simulate response>, "mode": "authority" | "citizen", "zone_id": "z1" }` (`zone_id` required only for citizen).

Response (authority):
```json
{
  "mode": "authority",
  "source": "llm",
  "actions": [
    { "rank": 1, "action": "Pre-position ambulances", "target": "Bhabha Hospital", "reason": "Sion Hospital isolated", "est_people": 12000 }
  ],
  "summary": "Short rewritten briefing text."
}
```
Response (citizen):
```json
{
  "mode": "citizen",
  "source": "template",
  "zone": "Dharavi",
  "message": "Plain-language safety steps using only provided facts.",
  "facts": { "nearest_hospital": "Bhabha Hospital", "nearest_shelter": "...", "closed_roads": ["..."] }
}
```

### Errors
`{ "error": "string", "detail": "string" }` with proper HTTP status. The frontend must never crash on an error; show a small banner.

## 7. Frontend requirements

Single page, three columns (desktop, fixed full-screen for recording):

- **Left, controls:** rain (0 to 150 mm/hr), surge (0 to 3 m), tide (0 to 3 m), what-if rain +% (0 to 50), sea level rise (0 to 2 m), mode toggle (Authority/Citizen), zone picker (Citizen), "Use live weather" button, preset buttons: *Normal*, *Heavy rain*, *Compound event*.
- **Centre, map:** dark or light basemap (OSM/Carto tiles). Roads grey; closed roads red; flooded node heat/circles (blue, by depth); hospitals green or red `ISOLATED` badge; zones as circles sized by population; reroute polyline green; cut-off zones pulsing/orange.
- **Right:** threat gauge (level + %), **Compound vs Baseline** bar comparison (the money shot), metrics cards (hospitals isolated, population isolated, roads closed %), and the Plan panel (checklist or message, with a tiny "AI rewritten" / "template" tag).
- Debounce sliders (~300 ms). Show a subtle loading state. Keep the previous result visible while recomputing.
- A small footer label: *"Simulation on cached Mumbai network. Parameters are scenario assumptions."*

## 8. Acceptance tests (must pass before moving on)

Engine, via `scripts/test_engine.py`:

1. All inputs 0 gives compound 0 and zero closed roads.
2. Rain 80 only (no surge) gives compound ≈ baseline.
3. Rain 80 + surge 1.5 + tide 2 gives compound > baseline by a visible margin and a Severe or High level.
4. Raising `sea_level_rise_m` never reduces closed roads (monotonic).
5. At least one hospital becomes ISOLATED in the "Compound event" preset; if not, adjust thresholds in `config.py`, not the code.
6. `/simulate` responds in a reasonable time (measure and note the number; use it in the video).

Integration:

7. Each preset renders on the map with no console errors.
8. `/plan` returns valid output with the LLM key removed (template fallback works).

## 9. Presets (for the demo)

| Preset | rain_mm_hr | surge_m | tide_m |
|---|---|---|---|
| Normal | 10 | 0 | 0.5 |
| Heavy rain | 90 | 0 | 1.0 |
| Compound event | 90 | 1.5 | 2.0 |

Tune the numbers until *Compound event* gives a dramatic but plausible result. Store final values in `config.py` and in the frontend presets.

## 10. Agent session briefs (copy the relevant one + this SPEC)

- **Session A (data prep):** implement `scripts/prep_data.py` to produce everything in `backend/data/`. Print node/edge counts. Do not touch `app/`.
- **Session B (engine):** implement `risk.py`, `flood.py`, `cascade.py`, `config.py` and `scripts/test_engine.py` against the saved data. Nothing about HTTP.
- **Session C (API):** implement `schemas.py`, `state.py`, `weather.py`, `plan.py`, `main.py` exactly per section 6.
- **Session D (frontend):** build the UI against the contract in section 6 using a mocked `/simulate` JSON first, then switch to the real API.

Rules for every session: follow the contract exactly, ask before changing it, no extra features, commit after each working step.

## 11. Video honesty notes

- Say "simulation on a cached network with live weather input", not "real-time digital twin".
- Say K and thresholds are tunable scenario parameters.
- Mention LSTM/ARIMA forecasting, SMS fallback, SDMA integration, Redis/PostGIS as the **production roadmap**.
- Use the measured compute time, not the deck's "under 100 ms" unless you actually hit it.
