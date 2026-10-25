"""
export_mocks.py — Export mock JSON payloads for frontend development.

Generates 5 mock files in frontend/mock/:
  1. simulate_normal.json   — simulate() output for Normal preset
  2. simulate_heavy.json    — simulate() output for Heavy rain preset
  3. simulate_compound.json — simulate() output for Compound event (extreme) preset
  4. region.json            — exact GET /region shape per SPEC.md §6
  5. presets.json           — exact PRESETS dict from app/config.py

Run from the backend directory:
    python scripts/export_mocks.py
Or from the project root:
    python backend/scripts/export_mocks.py
"""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

# Ensure the backend directory is in sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent
FRONTEND_MOCK_DIR = PROJECT_ROOT / "frontend" / "mock"

sys.path.insert(0, str(BACKEND_DIR))

from app.config import PRESETS
from app.flood import load_data
from app.cascade import precompute_baselines
from app.engine import simulate


def _clean_str(val: object) -> str | None:
    if val is None:
        return None
    if isinstance(val, list):
        return str(val[0]) if val else None
    if isinstance(val, str) and val.startswith("["):
        try:
            parsed = ast.literal_eval(val)
            if isinstance(parsed, list):
                return str(parsed[0]) if parsed else None
        except Exception:
            pass
    s = str(val).strip()
    return s if s else None


def _parse_linestring_coords(wkt_str: str) -> list[list[float]]:
    """Parse a WKT LINESTRING string into a list of [lon, lat] coordinates rounded to 5 decimals."""
    s = wkt_str.strip()
    if s.upper().startswith("LINESTRING"):
        s = s[len("LINESTRING"):].strip()
    s = s.strip("()")
    coords = []
    for pair in s.split(","):
        parts = pair.strip().split()
        if len(parts) >= 2:
            lon = round(float(parts[0]), 5)
            lat = round(float(parts[1]), 5)
            coords.append([lon, lat])
    return coords


def export_mocks() -> None:
    print(f"Loading data from {BACKEND_DIR / 'data'}…")
    data = load_data()
    print("Precomputing baselines…")
    precompute_baselines(data)

    FRONTEND_MOCK_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Exporting mock files to {FRONTEND_MOCK_DIR}…\n")

    # ── 1. Presets ─────────────────────────────────────────────────────────────
    # Exact 3 presets defined in config.py
    presets_export = {
        "Normal": PRESETS["Normal"],
        "Heavy rain": PRESETS["Heavy rain"],
        "Compound event (extreme)": PRESETS["Compound event (extreme)"],
    }
    presets_path = FRONTEND_MOCK_DIR / "presets.json"
    with open(presets_path, "w", encoding="utf-8") as fh:
        json.dump(presets_export, fh, indent=2)
    print(f"  ✓  Written: {presets_path.relative_to(PROJECT_ROOT)} ({presets_path.stat().st_size} bytes)")

    # ── 2. Simulate Preset Responses ───────────────────────────────────────────
    preset_files = [
        ("Normal", "simulate_normal.json"),
        ("Heavy rain", "simulate_heavy.json"),
        ("Compound event (extreme)", "simulate_compound.json"),
    ]
    for preset_key, filename in preset_files:
        params = PRESETS[preset_key]
        sim_res = simulate(
            data,
            rain_mm_hr=params["rain_mm_hr"],
            surge_m=params["surge_m"],
            tide_m=params["tide_m"],
        )
        out_path = FRONTEND_MOCK_DIR / filename
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(sim_res, fh, indent=2)
        print(f"  ✓  Written: {out_path.relative_to(PROJECT_ROOT)} ({out_path.stat().st_size} bytes)")

    # ── 3. Region Payload (§6 GET /region) ─────────────────────────────────────
    G = data.graph
    road_features = []
    for u, v, k, edata in G.edges(keys=True, data=True):
        edge_id = f"{u}-{v}-{k}"
        name = _clean_str(edata.get("name"))
        highway = _clean_str(edata.get("highway")) or "unclassified"

        if "geometry" in edata:
            coords = _parse_linestring_coords(edata["geometry"])
        else:
            u_node = G.nodes[u]
            v_node = G.nodes[v]
            coords = [
                [round(float(u_node["x"]), 5), round(float(u_node["y"]), 5)],
                [round(float(v_node["x"]), 5), round(float(v_node["y"]), 5)],
            ]

        road_features.append({
            "type": "Feature",
            "id": edge_id,
            "properties": {
                "id": edge_id,
                "name": name,
                "highway": highway,
            },
            "geometry": {
                "type": "LineString",
                "coordinates": coords,
            },
        })

    hospitals_export = [
        {
            "id": h["id"],
            "name": h["name"],
            "lat": round(float(h["lat"]), 5),
            "lon": round(float(h["lon"]), 5),
        }
        for h in data.facilities["hospitals"]
    ]

    shelters_export = [
        {
            "id": s["id"],
            "name": s["name"],
            "lat": round(float(s["lat"]), 5),
            "lon": round(float(s["lon"]), 5),
        }
        for s in data.facilities.get("shelters", [])
    ]

    zones_export = [
        {
            "id": z["id"],
            "name": z["name"],
            "lat": round(float(z["lat"]), 5),
            "lon": round(float(z["lon"]), 5),
            "population": z.get("population", 0),
            "vulnerability": z.get("vulnerability", 0.0),
        }
        for z in data.zones
    ]

    region_payload = {
        "bbox": [72.820, 19.020, 72.905, 19.095],
        "hospitals": hospitals_export,
        "shelters": shelters_export,
        "zones": zones_export,
        "roads": {
            "type": "FeatureCollection",
            "features": road_features,
        },
    }

    region_path = FRONTEND_MOCK_DIR / "region.json"
    with open(region_path, "w", encoding="utf-8") as fh:
        json.dump(region_payload, fh, separators=(",", ":"))
    print(f"  ✓  Written: {region_path.relative_to(PROJECT_ROOT)} ({region_path.stat().st_size / (1024 * 1024):.2f} MB)")
    print("\nAll mock exports completed successfully.")


if __name__ == "__main__":
    export_mocks()
