"""
engine.py — Top-level simulation orchestrator (§5, §6).

simulate() is the single entry point used by both test_engine.py and
(in Session C) the /simulate FastAPI route.  It applies the what-if
adjustments from the request, calls risk / flood / cascade in order,
assembles the full §6 response shape, and measures compute_ms with
time.perf_counter().

Performance: results are cached in an in-memory LRU dict (max 256 entries)
keyed on (eff_rain rounded to 2 dp, eff_surge rounded to 2 dp, eff_tide
rounded to 2 dp).  Cache hits skip all computation and return instantly.
The three presets are pre-warmed at startup in a background thread.

No HTTP, no LLM, no side effects beyond reading data already in `data`.
"""
from __future__ import annotations

import copy
import time
from types import SimpleNamespace

from .risk    import compound_risk
from .flood   import compute_flood
from .cascade import run_cascade

# ── LRU-style cache (insertion-order dict, capped at _CACHE_MAX entries) ──────
_cache: dict[tuple, dict] = {}
_CACHE_MAX = 256


def _cache_key(eff_rain: float, eff_surge: float, eff_tide: float) -> tuple:
    return (round(eff_rain, 2), round(eff_surge, 2), round(eff_tide, 2))


def _evict_oldest() -> None:
    """Remove the oldest entry if the cache is full."""
    if len(_cache) >= _CACHE_MAX:
        _cache.pop(next(iter(_cache)))


def simulate(
    data: SimpleNamespace,
    rain_mm_hr: float,
    surge_m: float,
    tide_m: float,
    rain_increase_pct: float = 0,
    sea_level_rise_m: float  = 0,
) -> dict:
    """
    Run the full simulation and return the §6 /simulate response shape.

    What-if adjustments (§6 POST /simulate):
        effective rain = rain_mm_hr * (1 + rain_increase_pct / 100)
        effective tide = tide_m + sea_level_rise_m
        effective surge = surge_m  (unchanged)

    Parameters
    ----------
    data              : SimpleNamespace from flood.load_data()
                        (cascade.precompute_baselines must have been called first)
    rain_mm_hr        : base rainfall in mm/hr
    surge_m           : storm-surge height in metres
    tide_m            : tide height above mean sea level in metres
    rain_increase_pct : what-if rainfall increase percentage (default 0)
    sea_level_rise_m  : what-if sea-level rise in metres (default 0)

    Returns
    -------
    dict with keys: inputs_effective, risk, flood, cascade, compute_ms
    """
    t0 = time.perf_counter()

    # ── apply what-if adjustments ─────────────────────────────────────────────
    eff_rain  = rain_mm_hr * (1.0 + rain_increase_pct / 100.0)
    eff_tide  = tide_m + sea_level_rise_m
    eff_surge = surge_m

    # ── cache lookup ─────────────────────────────────────────────────────────
    key = _cache_key(eff_rain, eff_surge, eff_tide)
    if key in _cache:
        cached = _cache[key]
        # Return a deep copy so mutations by the caller don't corrupt the cache.
        result = copy.deepcopy(cached)
        result["compute_ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
        return result

    # ── risk ──────────────────────────────────────────────────────────────────
    risk = compound_risk(eff_rain, eff_surge, eff_tide)

    # ── flood ─────────────────────────────────────────────────────────────────
    _node_depths, closed_edges, flood = compute_flood(
        data, eff_rain, eff_surge, eff_tide
    )

    # ── cascade ───────────────────────────────────────────────────────────────
    cascade = run_cascade(data, closed_edges)

    # ── timing ───────────────────────────────────────────────────────────────
    compute_ms = round((time.perf_counter() - t0) * 1000.0, 1)

    result = {
        "inputs_effective": {
            "rain_mm_hr": eff_rain,
            "surge_m":    eff_surge,
            "tide_m":     eff_tide,
        },
        "risk":        risk,
        "flood":       flood,
        "cascade":     cascade,
        "compute_ms":  compute_ms,
    }

    # ── cache store ───────────────────────────────────────────────────────────
    _evict_oldest()
    # Store without compute_ms so cache entries are timing-independent.
    to_store = {k: v for k, v in result.items() if k != "compute_ms"}
    _cache[key] = copy.deepcopy(to_store)

    return result
