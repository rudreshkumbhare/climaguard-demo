"""
weather.py — Live weather fetch from Open-Meteo with cache fallback (§6 GET /weather/live).

Strategy:
  1. Call Open-Meteo forecast API with `current=precipitation` (no API key needed).
     Open-Meteo returns precipitation in mm/hr in the current object.
  2. On any network/parse failure (timeout, HTTP error, missing field) fall back
     to backend/data/weather_cache.json and return source="cache".
  3. If the cache file is missing, create it from a plausible sample response.

Timeout: 5 seconds (httpx).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .config import DATA_DIR

logger = logging.getLogger(__name__)

WEATHER_CACHE_PATH = DATA_DIR / "weather_cache.json"

# Open-Meteo forecast endpoint — no API key required
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Sample plausible cache written if the file is missing
_SAMPLE_CACHE = {
    "rain_mm_hr": 14.5,
    "source": "cache",
    "fetched_at": "2026-10-25T12:00:00Z",
}


def _ensure_cache() -> None:
    """Write a sample cache if the file does not exist."""
    if not WEATHER_CACHE_PATH.exists():
        WEATHER_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        WEATHER_CACHE_PATH.write_text(json.dumps(_SAMPLE_CACHE, indent=2))
        logger.info("Created weather_cache.json from sample data.")


def _read_cache() -> dict:
    """Return the cache dict with source forced to 'cache'."""
    _ensure_cache()
    with open(WEATHER_CACHE_PATH, encoding="utf-8") as fh:
        data = json.load(fh)
    data["source"] = "cache"
    return data


async def fetch_live_weather(lat: float, lon: float) -> dict:
    """
    Fetch current precipitation from Open-Meteo.

    Returns a dict with keys:
        rain_mm_hr  : float
        source      : "live" | "cache"
        fetched_at  : ISO-8601 UTC string

    On any failure, falls back to weather_cache.json.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "precipitation",     # mm/hr in Open-Meteo current block
        "timezone": "UTC",
        "forecast_days": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(OPEN_METEO_URL, params=params)
            resp.raise_for_status()
            body = resp.json()

        current = body.get("current", {})
        rain_mm_hr = float(current.get("precipitation", 0.0))

        fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        # Update the on-disk cache with the latest live reading (best-effort)
        cache_data = {
            "rain_mm_hr": round(rain_mm_hr, 2),
            "source": "cache",
            "fetched_at": fetched_at,
        }
        try:
            WEATHER_CACHE_PATH.write_text(json.dumps(cache_data, indent=2))
        except OSError:
            pass  # Non-fatal

        return {
            "rain_mm_hr": round(rain_mm_hr, 2),
            "source": "live",
            "fetched_at": fetched_at,
        }

    except Exception as exc:
        logger.warning("Open-Meteo fetch failed (%s). Using cache.", exc)
        return _read_cache()
