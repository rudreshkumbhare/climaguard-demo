"""
engine.py — Top-level simulation orchestrator (§5, §6).

simulate() is the single entry point used by both test_engine.py and
(in Session C) the /simulate FastAPI route.  It applies the what-if
adjustments from the request, calls risk / flood / cascade in order,
assembles the full §6 response shape, and measures compute_ms with
time.perf_counter().

No HTTP, no LLM, no side effects beyond reading data already in `data`.
"""
from __future__ import annotations

import time
from types import SimpleNamespace

from .risk    import compound_risk
from .flood   import compute_flood
from .cascade import run_cascade


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

    return {
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
