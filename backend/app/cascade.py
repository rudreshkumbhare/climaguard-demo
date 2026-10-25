"""
cascade.py — Infrastructure isolation and rerouting analysis (§5.4).

precompute_baselines(data) — run once after load_data(); caches baseline
                              distances and nearest-hospital per zone on the
                              unmodified directed graph.

run_cascade(data, closed_edges) — remove closed edges from a copy of the
                                   graph; classify hospitals and zones;
                                   return the §6 "cascade" response dict.

Rules (amendments applied):
• Weakly-connected components determine hospital ISOLATED status.
• Directed Dijkstra (weight="length") for routes, extra_km and zone status.
• A zone is CUT_OFF  if it cannot reach any non-isolated hospital by directed path.
• A zone is REROUTED if it reaches a hospital but distance > baseline * (1 + 5 %)
  OR if its baseline nearest hospital is now ISOLATED.
• Otherwise OK.
• Closed edge IDs format: "{u}-{v}-{key}" (consistent with flood.py).
"""
from __future__ import annotations

import math
from types import SimpleNamespace

import networkx as nx

from .config import REROUTE_THRESHOLD

# Module-level baseline cache — populated once per data load by precompute_baselines().
_baseline_cache: dict[str, dict] = {}


# ── baseline precomputation ────────────────────────────────────────────────────

def precompute_baselines(data: SimpleNamespace) -> None:
    """
    Precompute shortest-path distances from every zone to every hospital
    on the FULL (unmodified) directed graph.

    Stores results in the module-level _baseline_cache dict:
        { zone_id: { "nearest_hospital_id": str|None,
                     "distance_m":          float|None } }

    Call once after load_data().
    """
    global _baseline_cache
    _baseline_cache = {}

    G = data.graph
    hospitals = data.facilities["hospitals"]
    zones     = data.zones

    hospital_nodes: dict[str, int] = {
        h["id"]: int(h["nearest_node"]) for h in hospitals
    }

    for zone in zones:
        zone_id   = zone["id"]
        zone_node = int(zone["nearest_node"])

        try:
            lengths: dict[int, float] = nx.single_source_dijkstra_path_length(
                G, zone_node, weight="length"
            )
        except nx.NodeNotFound:
            _baseline_cache[zone_id] = {
                "nearest_hospital_id": None,
                "distance_m":          None,
            }
            continue

        best_h_id: str | None   = None
        best_dist: float         = math.inf

        for h_id, h_node in hospital_nodes.items():
            d = lengths.get(h_node, math.inf)
            if d < best_dist:
                best_dist = d
                best_h_id = h_id

        _baseline_cache[zone_id] = {
            "nearest_hospital_id": best_h_id,
            "distance_m":          best_dist if best_dist < math.inf else None,
        }


# ── cascade analysis ───────────────────────────────────────────────────────────

def run_cascade(data: SimpleNamespace, closed_edges: set[tuple]) -> dict:
    """
    Run isolation and rerouting analysis on the flooded network.

    Parameters
    ----------
    data         : SimpleNamespace from load_data()
    closed_edges : set of (u, v, key) tuples produced by compute_flood()

    Returns
    -------
    dict matching the §6 "cascade" response object:
        { "metrics":   {...},
          "hospitals": [{id, status}, ...],
          "zones":     [{id, status, nearest_hospital_id, extra_km, route}, ...] }
    """
    if not _baseline_cache:
        raise RuntimeError(
            "Baselines not precomputed — call precompute_baselines(data) first."
        )

    G          = data.graph
    hospitals  = data.facilities["hospitals"]
    shelters   = data.facilities.get("shelters", [])
    zones      = data.zones

    hospital_nodes: dict[str, int] = {
        h["id"]: int(h["nearest_node"]) for h in hospitals
    }

    # shelters: skip entries without nearest_node
    shelter_pairs: list[tuple[str, int]] = []
    for s in shelters:
        if "nearest_node" in s:
            shelter_pairs.append((s["id"], int(s["nearest_node"])))

    # ── 1. Build flooded graph (copy; remove closed edges) ────────────────────
    Gf: nx.MultiDiGraph = G.copy()
    for u, v, key in closed_edges:
        if Gf.has_edge(u, v, key):
            Gf.remove_edge(u, v, key)

    # ── 2. Weakly-connected components ────────────────────────────────────────
    wccs = list(nx.weakly_connected_components(Gf))
    total_nodes = G.number_of_nodes()
    largest_wcc = max(wccs, key=len) if wccs else set()
    largest_len = len(largest_wcc)

    # ── 3. Hospital status ────────────────────────────────────────────────────
    # A hospital is ISOLATED if it is not in the largest weakly connected component
    # of the flooded graph, or its component has fewer than 10% of all nodes.
    hospital_statuses: dict[str, str] = {}
    for h in hospitals:
        h_node = int(h["nearest_node"])
        if h_node in largest_wcc and largest_len >= 0.10 * total_nodes:
            hospital_statuses[h["id"]] = "OPERATIONAL"
        else:
            hospital_statuses[h["id"]] = "ISOLATED"

    operational_h_nodes: dict[str, int] = {
        h_id: h_node
        for h_id, h_node in hospital_nodes.items()
        if hospital_statuses[h_id] == "OPERATIONAL"
    }

    # ── 4 & 5. Zone analysis ──────────────────────────────────────────────────
    zone_results: list[dict]  = []
    total_extra_km: float     = 0.0
    rerouted_count: int       = 0
    cut_off_count: int        = 0
    pop_isolated: int         = 0

    for zone in zones:
        zone_id   = zone["id"]
        zone_node = int(zone["nearest_node"])
        baseline  = _baseline_cache.get(zone_id, {})
        bl_h_id   = baseline.get("nearest_hospital_id")
        bl_dist   = baseline.get("distance_m")

        # Directed Dijkstra from zone_node in flooded graph
        try:
            lengths, paths = nx.single_source_dijkstra(
                Gf, zone_node, weight="length"
            )
        except nx.NodeNotFound:
            # Zone node has no edges at all in Gf — treat as CUT_OFF
            zone_results.append(_cut_off_entry(zone_id))
            cut_off_count += 1
            pop_isolated  += zone.get("population", 0)
            continue

        # Nearest reachable operational hospital
        best_h_id: str | None   = None
        best_dist: float         = math.inf
        best_path: list | None   = None

        for h_id, h_node in operational_h_nodes.items():
            d = lengths.get(h_node, math.inf)
            if d < best_dist:
                best_dist = d
                best_h_id = h_id
                best_path = paths.get(h_node)

        # Nearest reachable shelter
        best_s_id: str | None  = None
        best_s_dist: float      = math.inf
        for s_id, s_node in shelter_pairs:
            d = lengths.get(s_node, math.inf)
            if d < best_s_dist:
                best_s_dist = d
                best_s_id   = s_id

        # CUT_OFF: cannot reach any operational hospital
        if best_h_id is None:
            zone_results.append(_cut_off_entry(zone_id, best_s_id))
            cut_off_count += 1
            pop_isolated  += zone.get("population", 0)
            continue

        # REROUTED vs OK
        bl_h_isolated = (
            bl_h_id is not None
            and hospital_statuses.get(bl_h_id) == "ISOLATED"
        )
        dist_increase = (
            bl_dist is not None
            and bl_dist > 0.0
            and best_dist > bl_dist * (1.0 + REROUTE_THRESHOLD)
        )

        extra_m  = best_dist - (bl_dist or 0.0)
        extra_km = round(extra_m / 1000.0, 3) if bl_dist is not None else None

        if bl_h_isolated or dist_increase:
            status = "REROUTED"
            route  = _build_linestring(Gf, best_path)
            rerouted_count += 1
            if extra_km and extra_km > 0.0:
                total_extra_km += extra_km
        else:
            status = "OK"
            route  = None

        zone_results.append({
            "id":                  zone_id,
            "status":              status,
            "nearest_hospital_id": best_h_id,
            "nearest_shelter_id":  best_s_id,
            "extra_km":            extra_km,
            "route":               route,
        })

    # ── 6. Assemble output ────────────────────────────────────────────────────
    hospitals_isolated_n = sum(
        1 for s in hospital_statuses.values() if s == "ISOLATED"
    )
    avg_extra_km = (
        round(total_extra_km / rerouted_count, 3) if rerouted_count > 0 else 0.0
    )

    return {
        "metrics": {
            "hospitals_isolated":  hospitals_isolated_n,
            "zones_cut_off":       cut_off_count,
            "population_isolated": pop_isolated,
            "avg_extra_km":        avg_extra_km,
            "wcc_count":           len(wccs),
            "largest_wcc_size":    largest_len,
        },
        "hospitals": [
            {"id": h["id"], "status": hospital_statuses[h["id"]]}
            for h in hospitals
        ],
        "zones": zone_results,
    }


# ── helpers ────────────────────────────────────────────────────────────────────

def _cut_off_entry(zone_id: str, shelter_id: str | None = None) -> dict:
    return {
        "id":                  zone_id,
        "status":              "CUT_OFF",
        "nearest_hospital_id": None,
        "nearest_shelter_id":  shelter_id,
        "extra_km":            None,
        "route":               None,
    }


def _build_linestring(G: nx.MultiDiGraph, path: list | None) -> dict | None:
    """Build a GeoJSON LineString from a list of node IDs."""
    if not path:
        return None
    coords = []
    for n in path:
        if n in G.nodes:
            ndata = G.nodes[n]
            coords.append([float(ndata["x"]), float(ndata["y"])])
    if len(coords) < 2:
        return None
    return {"type": "LineString", "coordinates": coords}
