"""
flood.py — Graph/data loading and per-node flood-depth computation (§5.3).

load_data()     — load graph, facilities, zones once; returns a SimpleNamespace.
compute_flood() — deterministic depth model; returns raw depths, closed-edge set,
                  and the "flood" response dict per §6.

No HTTP, no LLM, no randomness.  Parameters come from config.py.
These formulas are scenario assumptions, not hydrological truth.
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import networkx as nx
import numpy as np

from .config import (
    GRAPH_PATH, FACILITIES_PATH, ZONES_PATH,
    DRAIN_CAP, MAX_PONDING, CLOSE_THRESHOLD, ELEVATION_FLOOR_M,
    FLOOD_MIN_DEPTH, MAX_FLOODED_NODES,
)


# ── data loading ───────────────────────────────────────────────────────────────

def load_data() -> SimpleNamespace:
    """
    Load the road graph, facilities and zones from disk.

    Performs once-only type coercions on the graphml data:
      • Node IDs (strings in graphml) → int
      • Node 'elevation' attribute     → float  (graphml stores all attrs as str)
      • Edge 'length' attribute        → float

    Returns a SimpleNamespace with:
        graph           : nx.MultiDiGraph  (directed, integer node IDs)
        facilities      : dict  {'hospitals': [...], 'shelters': [...], ...}
        zones           : list  of zone dicts
        node_elevations : dict  {node_id(int): effective_elevation(float)}
                          effective_elevation = max(raw_elevation, ELEVATION_FLOOR_M)
    """
    # --- graph ---
    G_raw: nx.MultiDiGraph = nx.read_graphml(str(GRAPH_PATH))

    # Relabel node IDs: str → int
    mapping: dict[str, int] = {n: int(n) for n in G_raw.nodes()}
    G: nx.MultiDiGraph = nx.relabel_nodes(G_raw, mapping)

    # Cast node attributes
    for _node, data in G.nodes(data=True):
        raw_elev = data.get("elevation", ELEVATION_FLOOR_M)
        try:
            data["elevation"] = float(raw_elev)
        except (TypeError, ValueError):
            data["elevation"] = ELEVATION_FLOOR_M

    # Cast edge attributes
    for _u, _v, _k, data in G.edges(keys=True, data=True):
        if "length" in data:
            try:
                data["length"] = float(data["length"])
            except (TypeError, ValueError):
                data["length"] = 0.0

    # --- facilities ---
    with open(FACILITIES_PATH, encoding="utf-8") as fh:
        facilities: dict[str, Any] = json.load(fh)

    # --- zones ---
    with open(ZONES_PATH, encoding="utf-8") as fh:
        zones: list[dict] = json.load(fh)

    # --- effective elevation lookup (with floor applied) ---
    node_elevations: dict[int, float] = {}
    for node, data in G.nodes(data=True):
        raw = data.get("elevation", ELEVATION_FLOOR_M)
        node_elevations[node] = max(float(raw), ELEVATION_FLOOR_M)

    return SimpleNamespace(
        graph=G,
        facilities=facilities,
        zones=zones,
        node_elevations=node_elevations,
    )


# ── flood model ────────────────────────────────────────────────────────────────

def _clip(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def compute_flood(
    data: SimpleNamespace,
    rain_mm_hr: float,
    surge_m: float,
    tide_m: float,
) -> tuple[dict[int, float], set[tuple], dict]:
    """
    Compute per-node flood depth using the §5.3 model.

    Depth formula (all depths in metres):
        water_level   = tide_m + surge_m
        effective_elev = max(raw_elevation, ELEVATION_FLOOR_M)   ← amendment 1
        coastal_depth = max(0, water_level - effective_elev)
        rain_factor   = clip((rain_mm_hr - DRAIN_CAP) / 75, 0, 1)
        lowness       = clip((12 - effective_elev) / 12, 0, 1)
        rain_depth    = rain_factor * MAX_PONDING * lowness
        depth         = coastal_depth + rain_depth

    An edge (u, v, key) is CLOSED when max(depth[u], depth[v]) >= CLOSE_THRESHOLD.

    Closed edge IDs use the format "{u}-{v}-{key}" (amendment 3).

    Returns
    -------
    node_depths   : dict {node_id: depth_m}   (all nodes, including 0-depth)
    closed_edges  : set  {(u, v, key), ...}   (raw tuples for cascade)
    flood_dict    : dict matching the §6 "flood" response object
    """
    G = data.graph
    node_elevations = data.node_elevations

    water_level = tide_m + surge_m
    rain_factor = _clip((rain_mm_hr - DRAIN_CAP) / 75.0, 0.0, 1.0)

    # --- per-node depth ---
    node_depths: dict[int, float] = {}
    for node, eff_elev in node_elevations.items():
        coastal_depth = max(0.0, water_level - eff_elev)
        lowness       = _clip((12.0 - eff_elev) / 12.0, 0.0, 1.0)
        rain_depth    = rain_factor * MAX_PONDING * lowness
        node_depths[node] = coastal_depth + rain_depth

    # --- closed edges ---
    total_edges = G.number_of_edges()
    closed_edges: set[tuple] = set()
    closed_edge_ids: list[str] = []

    for u, v, key in G.edges(keys=True):
        depth_u = node_depths.get(u, 0.0)
        depth_v = node_depths.get(v, 0.0)
        if max(depth_u, depth_v) >= CLOSE_THRESHOLD:
            closed_edges.add((u, v, key))
            closed_edge_ids.append(f"{u}-{v}-{key}")

    roads_closed_pct = (
        round(100.0 * len(closed_edges) / total_edges, 2)
        if total_edges > 0 else 0.0
    )

    # --- flooded nodes list (depth >= FLOOD_MIN_DEPTH, capped at MAX_FLOODED_NODES) ---
    candidates = [
        (node, depth)
        for node, depth in node_depths.items()
        if depth >= FLOOD_MIN_DEPTH
    ]

    # Even sampling if over cap
    if len(candidates) > MAX_FLOODED_NODES:
        indices = np.linspace(0, len(candidates) - 1, MAX_FLOODED_NODES, dtype=int)
        candidates = [candidates[i] for i in indices]

    flooded_nodes: list[dict] = []
    for node, depth in candidates:
        ndata = G.nodes[node]
        flooded_nodes.append({
            "lat":     float(ndata["y"]),
            "lon":     float(ndata["x"]),
            "depth_m": round(depth, 3),
        })

    flood_dict = {
        "closed_edge_ids":  closed_edge_ids,
        "roads_closed_pct": roads_closed_pct,
        "flooded_nodes":    flooded_nodes,
    }

    return node_depths, closed_edges, flood_dict
