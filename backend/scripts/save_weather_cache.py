"""
save_weather_cache.py — Write a recorded heavy-monsoon sample to weather_cache.json.

Run from the backend/ folder:
    python3 scripts/save_weather_cache.py

Writes backend/data/weather_cache.json with a 45 mm/hr monsoon sample.
Does NOT fetch anything from the network.
"""
import json
from pathlib import Path

CACHE_PATH = Path(__file__).resolve().parent.parent / "data" / "weather_cache.json"

SAMPLE = {
    "rain_mm_hr": 45.0,
    "source": "cache",
    "fetched_at": "2024-07-26T08:30:00Z",
    "note": "Recorded monsoon sample for replay",
}

CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
CACHE_PATH.write_text(json.dumps(SAMPLE, indent=2))
print(f"Written: {CACHE_PATH}")
print(json.dumps(SAMPLE, indent=2))

