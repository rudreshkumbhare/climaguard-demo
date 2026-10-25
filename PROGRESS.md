Current step: Engine tuning complete (Session B refined)

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

## Next
- Session C (API): implement `schemas.py`, `state.py`, `weather.py`, `plan.py`, `main.py` per SPEC §6.

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

