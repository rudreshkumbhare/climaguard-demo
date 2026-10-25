Current step: Session B complete (engine)

## Done

### Session A — Data prep
- Created `backend/requirements.txt` with all required dependencies.
- Implemented and refined `backend/scripts/prep_data.py`:
  - OSMnx road network download for Mumbai bbox, simplified, largest SCC.
  - Primary elevation source updated to OpenTopoData SRTM 30m in batches of 100 with 1.2s rate-limit sleep.
  - Robust exponential backoff (5s to 60s, max 6 attempts), HTTP 429 backoff ≥ 30s.
  - Facility extraction (5–10 hospitals, fire stations, shelters) and 10 hand-defined zones.

### Session B — Engine
- `backend/app/__init__.py` — package marker.
- `backend/app/config.py` — all constants: K, DRAIN_CAP, MAX_PONDING, CLOSE_THRESHOLD,
  ELEVATION_FLOOR_M=1.0, normalisation divisors, level thresholds, REROUTE_THRESHOLD,
  PRESETS (Normal / Heavy rain / Compound event), data paths.
- `backend/app/risk.py` — `normalise_hazards()`, `compound_risk()` → §6 risk dict shape.
- `backend/app/flood.py` — `load_data()` (graph string→int IDs, float elevation cast, floor),
  `compute_flood()` (§5.3 formula with ELEVATION_FLOOR_M, closed edge ids as "{u}-{v}-{key}").
- `backend/app/cascade.py` — `precompute_baselines()`, `run_cascade()`:
  weakly-connected components for hospital ISOLATED, directed Dijkstra for routes/extra_km,
  REROUTED threshold = 5% above baseline or baseline hospital now ISOLATED.
- `backend/app/engine.py` — `simulate()`: applies what-if, calls risk→flood→cascade,
  measures compute_ms, returns full §6 /simulate response shape.
- `backend/scripts/test_engine.py` — 7/7 acceptance tests pass; preset report table.

**Test results** (`python3 scripts/test_engine.py` from `backend/`):
```
7/7 tests passed

Preset Report:
  Normal         → compound=0.0889  baseline=0.0889  Low       roads_cls=0.00%   h_iso=0  z_cut=0   pop_iso=0          n_flood=0
  Heavy rain     → compound=0.4111  baseline=0.4111  Moderate  roads_cls=39.67%  h_iso=8  z_cut=10  pop_iso=2,250,000  n_flood=400
  Compound event → compound=1.0000  baseline=0.6889  Severe    roads_cls=39.67%  h_iso=8  z_cut=10  pop_iso=2,250,000  n_flood=400
```

**Observation (not a bug):** Heavy rain closes ~40% of roads and isolates all hospitals/zones
because the Mumbai study area has many low-elevation nodes (< 12 m) that accumulate rain
ponding above the 0.30 m CLOSE_THRESHOLD.  The user said "do not tune constants yet" —
tuning is reserved for a later step.

## Next
- Session C (API): `schemas.py`, `state.py`, `weather.py`, `plan.py`, `main.py`.
- After Session C: tune CLOSE_THRESHOLD / DRAIN_CAP / MAX_PONDING so Heavy rain is
  visibly different from Compound event in the demo.

## Known bugs
- None

## Tuned values (frozen until tuning step)
- Study area BBox: `north=19.095, south=19.020, east=72.905, west=72.820`
- K=2.0, DRAIN_CAP=25, MAX_PONDING=0.8, CLOSE_THRESHOLD=0.30, ELEVATION_FLOOR_M=1.0
- Elevation source: OpenTopoData SRTM 30m (100 locations per request, 1.2s sleep)
