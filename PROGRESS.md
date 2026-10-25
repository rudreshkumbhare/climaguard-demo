Current step: Session A (data prep scripts updated with OpenTopoData elevation fetcher)

## Done
- Created `backend/requirements.txt` with all required dependencies.
- Implemented and refined `backend/scripts/prep_data.py`:
  - OSMnx road network download for Mumbai bbox, simplified, largest SCC.
  - Primary elevation source updated to OpenTopoData SRTM 30m (`https://api.opentopodata.org/v1/srtm30m`) in batches of 100 locations with 1.2s rate-limit sleep.
  - Robust exponential backoff (5s to 60s, max 6 attempts), HTTP 429 backoff waiting >= 30s.
  - Removed all silent 6.0m defaults. Only valid responses are saved to `elevation_cache.json` after each batch.
  - Nearest-node elevation imputation (< 5% missing threshold; stops with error if > 5%).
  - Elevation stats reporting and > 30% uniform value warning.
  - Added `--clean-cache` CLI flag.
  - Facility extraction (5–10 hospitals, fire stations, shelters) and 10 hand-defined zones with population and vulnerability.

## Next
- Run `python scripts/prep_data.py --clean-cache` (or delete `data/elevation_cache.json` first) to generate `backend/data/` files.
- Proceed with Session B (Engine: `risk.py`, `flood.py`, `cascade.py`, `config.py`, `scripts/test_engine.py`).

## Known bugs
- None

## Tuned values
- Study area BBox: `north=19.095, south=19.020, east=72.905, west=72.820`
- Elevation source: OpenTopoData SRTM 30m (100 locations per request, 1.2s sleep)
- Elevation retry: max 6 attempts, 5s to 60s exponential backoff, >= 30s on HTTP 429
- Elevation imputation threshold: max 5% missing allowed
