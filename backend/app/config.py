"""
config.py — Single source of truth for all engine constants and presets.
All values are scenario assumptions, not calibrated hydrological constants.
"""
from pathlib import Path

# ── Data paths ─────────────────────────────────────────────────────────────────
DATA_DIR        = Path(__file__).parent.parent / "data"
GRAPH_PATH      = DATA_DIR / "graph.graphml"
FACILITIES_PATH = DATA_DIR / "facilities.json"
ZONES_PATH      = DATA_DIR / "zones.json"

# ── Risk: synergy amplification (K is tunable, not calibrated) ────────────────
K: float = 2.0

# ── Hazard normalisation divisors ─────────────────────────────────────────────
RAIN_DIV:  float = 100.0   # mm/hr that maps rain to 1.0 (extreme)
SURGE_DIV: float = 3.0     # metres
TIDE_DIV:  float = 3.0     # metres above mean sea level

# ── Compound risk level thresholds ────────────────────────────────────────────
LEVEL_LOW:      float = 0.25   # compound < 0.25  → "Low"
LEVEL_MODERATE: float = 0.50   # compound < 0.50  → "Moderate"
LEVEL_HIGH:     float = 0.75   # compound < 0.75  → "High"
                               # compound >= 0.75 → "Severe"

# ── Flood model constants ─────────────────────────────────────────────────────
DRAIN_CAP:          float = 25.0   # mm/hr: drain capacity before ponding begins
MAX_PONDING:        float = 0.8    # metres: maximum rain-driven ponding depth
CLOSE_THRESHOLD:    float = 0.30   # metres: edge closed when max(depth_u, depth_v) >= this
ELEVATION_FLOOR_M:  float = 1.0    # metres: effective elevation floor (prevents artefact
                                   # flooding when stored elevation is 0 and all hazards are 0)

# ── Flooded-node output constraints ───────────────────────────────────────────
FLOOD_MIN_DEPTH:   float = 0.1    # metres: only report nodes at or above this depth
MAX_FLOODED_NODES: int   = 400    # cap on flooded_nodes list (evenly sampled if exceeded)

# ── Cascade rerouting threshold ────────────────────────────────────────────────
REROUTE_THRESHOLD: float = 0.05   # 5 %: zone is REROUTED if new distance > baseline * (1 + this)
                                   # or if baseline nearest hospital is now ISOLATED

# ── Presets (§9) ──────────────────────────────────────────────────────────────
PRESETS: dict[str, dict] = {
    "Normal": {
        "rain_mm_hr": 10,
        "surge_m":    0.0,
        "tide_m":     0.5,
    },
    "Heavy rain": {
        "rain_mm_hr": 90,
        "surge_m":    0.0,
        "tide_m":     1.0,
    },
    "Compound event": {
        "rain_mm_hr": 90,
        "surge_m":    1.5,
        "tide_m":     2.0,
    },
}
