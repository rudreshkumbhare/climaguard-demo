"""
risk.py — Hazard normalisation and compound risk computation (§5.1, §5.2).

No HTTP, no LLM, no side effects.  All outputs are deterministic given inputs.
K is a tunable scenario parameter, not a calibrated hydrological constant.
"""
from .config import (
    K,
    RAIN_DIV, SURGE_DIV, TIDE_DIV,
    LEVEL_LOW, LEVEL_MODERATE, LEVEL_HIGH,
)


# ── helpers ────────────────────────────────────────────────────────────────────

def _clip(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _level(compound: float) -> str:
    if compound < LEVEL_LOW:
        return "Low"
    elif compound < LEVEL_MODERATE:
        return "Moderate"
    elif compound < LEVEL_HIGH:
        return "High"
    return "Severe"


# ── public API ─────────────────────────────────────────────────────────────────

def normalise_hazards(rain_mm_hr: float, surge_m: float, tide_m: float) -> dict:
    """
    Normalise each hazard to [0, 1].

    Returns
    -------
    dict with keys "rain", "surge", "tide" each in [0.0, 1.0].
    """
    return {
        "rain":  _clip(rain_mm_hr / RAIN_DIV,  0.0, 1.0),
        "surge": _clip(surge_m   / SURGE_DIV,  0.0, 1.0),
        "tide":  _clip(tide_m    / TIDE_DIV,   0.0, 1.0),
    }


def compound_risk(rain_mm_hr: float, surge_m: float, tide_m: float) -> dict:
    """
    Compute compound risk score and metadata.

    Formula (§5.2):
        baseline = mean(hazards)
        synergy  = product(hazards)
        compound = min(1.0, baseline * (1 + K * synergy))

    Properties:
      • If any hazard ≈ 0  →  synergy ≈ 0  →  compound ≈ baseline  (no amplification)
      • If all three high  →  compound clearly exceeds baseline

    Returns
    -------
    dict matching the "risk" object in §6:
        hazards, baseline, compound, level, k
    """
    hazards = normalise_hazards(rain_mm_hr, surge_m, tide_m)
    h = [hazards["rain"], hazards["surge"], hazards["tide"]]

    baseline = sum(h) / 3.0
    synergy  = h[0] * h[1] * h[2]
    compound = min(1.0, baseline * (1.0 + K * synergy))

    return {
        "hazards":  hazards,
        "baseline": round(baseline, 6),
        "compound": round(compound, 6),
        "level":    _level(compound),
        "k":        K,
    }
