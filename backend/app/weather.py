"""
weather.py — Live weather fetch from Open-Meteo with cache fallback (§6 GET /weather/live).

Strategy:
  1. If ?replay=true is requested, return the cached rainy sample immediately.
  2. Call Open-Meteo forecast API with `current=precipitation` (no API key needed).
     Open-Meteo returns precipitation in mm/hr in the current object.
  3. Fall back to backend/data/weather_cache.json (source="cache") when:
       a. Any network/parse failure (timeout, HTTP error, missing field), OR
       b. The live value is below 1 mm/hr (not dramatic enough for the demo).
  4. If the cache file is missing, it must have been written by save_weather_cache.py;
     create a minimal plausible placeholder so the server never crashes.

Timeout: 5 seconds (httpx).
Response shape (§6 frozen): { rain_mm_hr, source, fetched_at }
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

# Minimum live rain value worth returning as "live".
# Below this threshold the live value is not interesting for the demo,
# so we fall back to the cached rainy sample.
_MIN_LIVE_MM_HR: float = 1.0

# Fallback sample written only if the cache file is entirely missing.
_PLACEHOLDER_CACHE = {
    "rain_mm_hr": 45.0,
    "source": "cache",
    "fetched_at": "2024-07-26T08:30:00Z",
    "note": "Recorded monsoon sample for replay",
}


def _ensure_cache() -> None:
    """Write a placeholder cache only if the file does not exist at all."""
    if not WEATHER_CACHE_PATH.exists():
        WEATHER_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        WEATHER_CACHE_PATH.write_text(json.dumps(_PLACEHOLDER_CACHE, indent=2))
        logger.info("Created weather_cache.json from placeholder data.")


def _read_cache() -> dict:
    """Return the cache dict with source forced to 'cache'."""
    _ensure_cache()
    with open(WEATHER_CACHE_PATH, encoding="utf-8") as fh:
        data = json.load(fh)
    # Enforce the §6 response shape; keep any extra fields (e.g. "note") harmlessly.
    data["source"] = "cache"
    return data


async def fetch_live_weather(lat: float, lon: float, *, replay: bool = False) -> dict:
    """
    Fetch current precipitation from Open-Meteo.

    Parameters
    ----------
    lat, lon : coordinates forwarded to Open-Meteo
    replay   : if True, skip the live call and return the cached sample immediately

    Returns
    -------
    dict with keys:
        rain_mm_hr  : float
        source      : "live" | "cache"
        fetched_at  : ISO-8601 UTC string
        note        : str (only present in cached samples that carry it)

    Falls back to weather_cache.json on any failure OR when live rain < _MIN_LIVE_MM_HR.
    """
    # ── replay mode: always return the cached rainy sample ────────────────────
    if replay:
        logger.info("replay=true: returning cached weather sample.")
        return _read_cache()

    # ── try live fetch ────────────────────────────────────────────────────────
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "precipitation",   # mm/hr in Open-Meteo current block
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

        # ── fall back when live value is below threshold ──────────────────────
        if rain_mm_hr < _MIN_LIVE_MM_HR:
            logger.info(
                "Live rain %.2f mm/hr < %.1f mm/hr threshold — returning cached sample.",
                rain_mm_hr,
                _MIN_LIVE_MM_HR,
            )
            return _read_cache()

        # ── good live value: update on-disk cache and return ──────────────────
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
