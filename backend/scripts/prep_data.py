"""
prep_data.py - Data preparation script for ClimaGuard AI (Mumbai study area)

Downloads road network, elevation data, facilities (hospitals, fire stations, shelters),
and formats zones for the Sion-Kurla-Dharavi-BKC-Bandra East study area.
"""

from collections import Counter
import json
import math
import os
import sys
import time
from pathlib import Path
import networkx as nx
import numpy as np
import osmnx as ox
import requests

# Bounding box from SPEC.md Section 3:
# Covers Sion, Matunga, Dharavi, Kurla, Bandra East/BKC, and Mithi river corridor
NORTH = 19.095
SOUTH = 19.020
EAST = 72.905
WEST = 72.820

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DATA_DIR = BACKEND_DIR / "data"

ZONE_DEFINITIONS = [
    {
        "id": "z1",
        "name": "Dharavi",
        "lat": 19.0422,
        "lon": 72.8550,
        "population": 700000,
        "vulnerability": 0.95,
        "note": "Values are approximate estimates for simulation demonstration purposes."
    },
    {
        "id": "z2",
        "name": "Sion",
        "lat": 19.0390,
        "lon": 72.8620,
        "population": 180000,
        "vulnerability": 0.70,
        "note": "Values are approximate estimates for simulation demonstration purposes."
    },
    {
        "id": "z3",
        "name": "Kurla West",
        "lat": 19.0700,
        "lon": 72.8780,
        "population": 320000,
        "vulnerability": 0.85,
        "note": "Values are approximate estimates for simulation demonstration purposes."
    },
    {
        "id": "z4",
        "name": "Kurla East",
        "lat": 19.0650,
        "lon": 72.8890,
        "population": 260000,
        "vulnerability": 0.75,
        "note": "Values are approximate estimates for simulation demonstration purposes."
    },
    {
        "id": "z5",
        "name": "BKC",
        "lat": 19.0655,
        "lon": 72.8650,
        "population": 60000,
        "vulnerability": 0.35,
        "note": "Values are approximate estimates for simulation demonstration purposes."
    },
    {
        "id": "z6",
        "name": "Bandra East",
        "lat": 19.0600,
        "lon": 72.8480,
        "population": 150000,
        "vulnerability": 0.50,
        "note": "Values are approximate estimates for simulation demonstration purposes."
    },
    {
        "id": "z7",
        "name": "Chunabhatti",
        "lat": 19.0515,
        "lon": 72.8805,
        "population": 110000,
        "vulnerability": 0.75,
        "note": "Values are approximate estimates for simulation demonstration purposes."
    },
    {
        "id": "z8",
        "name": "Matunga",
        "lat": 19.0270,
        "lon": 72.8550,
        "population": 140000,
        "vulnerability": 0.55,
        "note": "Values are approximate estimates for simulation demonstration purposes."
    },
    {
        "id": "z9",
        "name": "Mahim",
        "lat": 19.0380,
        "lon": 72.8420,
        "population": 170000,
        "vulnerability": 0.60,
        "note": "Values are approximate estimates for simulation demonstration purposes."
    },
    {
        "id": "z10",
        "name": "Wadala",
        "lat": 19.0250,
        "lon": 72.8700,
        "population": 160000,
        "vulnerability": 0.65,
        "note": "Values are approximate estimates for simulation demonstration purposes."
    }
]

FALLBACK_HOSPITALS = [
    {"name": "Lokmanya Tilak Municipal General Hospital (Sion Hospital)", "lat": 19.0365, "lon": 72.8601},
    {"name": "Bhabha Hospital (Kurla)", "lat": 19.0645, "lon": 72.8835},
    {"name": "Lilavati Hospital and Research Centre", "lat": 19.0518, "lon": 72.8295},
    {"name": "Asian Heart Institute", "lat": 19.0668, "lon": 72.8679},
    {"name": "Guru Nanak Hospital", "lat": 19.0592, "lon": 72.8465},
    {"name": "K. J. Somaiya Hospital & Research Centre", "lat": 19.0470, "lon": 72.8753},
    {"name": "SL Raheja Hospital (Mahim)", "lat": 19.0435, "lon": 72.8415},
    {"name": "Surana Sethia Hospital", "lat": 19.0525, "lon": 72.8912},
]

FALLBACK_FIRE_STATIONS = [
    {"name": "Dharavi Fire Station", "lat": 19.0430, "lon": 72.8530},
    {"name": "Kurla Fire Station", "lat": 19.0680, "lon": 72.8790},
    {"name": "BKC Fire Station", "lat": 19.0620, "lon": 72.8620},
    {"name": "Bandra Fire Station", "lat": 19.0550, "lon": 72.8400},
]

FALLBACK_SHELTERS = [
    {"name": "Dharavi Community Centre & Shelter", "lat": 19.0410, "lon": 72.8580},
    {"name": "Sion Municipal School Shelter", "lat": 19.0380, "lon": 72.8650},
    {"name": "Kurla Municipal High School Shelter", "lat": 19.0670, "lon": 72.8820},
    {"name": "BKC Relief & Shelter Point", "lat": 19.0640, "lon": 72.8690},
    {"name": "Mahim Community Welfare Centre", "lat": 19.0395, "lon": 72.8450},
    {"name": "Wadala Municipal Relief Centre", "lat": 19.0260, "lon": 72.8680},
    {"name": "Chunabhatti Transit Shelter", "lat": 19.0530, "lon": 72.8820},
]


def download_road_network(north, south, east, west):
    """Download DRIVE road network for bbox, simplify, and keep largest SCC."""
    print(f"Step 1: Downloading drive network for bbox (N={north}, S={south}, E={east}, W={west})...")
    G = None
    try:
        # osmnx >= 2.0 (west, south, east, north)
        G = ox.graph_from_bbox(bbox=(west, south, east, north), network_type="drive", simplify=True)
    except Exception:
        try:
            # osmnx 1.x bbox=(north, south, east, west)
            G = ox.graph_from_bbox(bbox=(north, south, east, west), network_type="drive", simplify=True)
        except Exception:
            # osmnx 1.x keyword arguments
            G = ox.graph_from_bbox(north=north, south=south, east=east, west=west, network_type="drive", simplify=True)

    print(f"Initial graph downloaded: {len(G)} nodes, {len(G.edges)} edges.")

    # Keep only the largest strongly connected component
    if not nx.is_strongly_connected(G):
        print("Extracting largest strongly connected component...")
        largest_scc = max(nx.strongly_connected_components(G), key=len)
        G = G.subgraph(largest_scc).copy()
        print(f"After SCC extraction: {len(G)} nodes, {len(G.edges)} edges.")

    return G


def find_nearest_node(G, lat, lon):
    """Find the nearest graph node ID for a given coordinate."""
    try:
        if hasattr(ox, "distance") and hasattr(ox.distance, "nearest_nodes"):
            return int(ox.distance.nearest_nodes(G, X=lon, Y=lat))
        elif hasattr(ox, "nearest_nodes"):
            return int(ox.nearest_nodes(G, lon, lat))
    except Exception:
        pass

    # Fallback search using Euclidean distance on coordinates
    best_node = None
    min_dist_sq = float("inf")
    for n, data in G.nodes(data=True):
        y = data.get("y", 0.0)
        x = data.get("x", 0.0)
        d = (y - lat) ** 2 + (x - lon) ** 2
        if d < min_dist_sq:
            min_dist_sq = d
            best_node = n
    return int(best_node)


def fetch_node_elevations(G):
    """
    Fetch elevation for all nodes in batches using OpenTopoData SRTM 30m API.
    GET https://api.opentopodata.org/v1/srtm30m?locations=lat,lon|lat,lon|...
    - At most 100 locations per request
    - Sleep 1.2s between requests
    - Exponential backoff (start 5s, up to 60s, max 6 attempts), HTTP 429 waits >= 30s
    - Only caches successful lookups, saved after every batch
    - Fills remaining missing nodes (< 5%) using nearest valid node
    - Warnings if > 30% of nodes share the exact same elevation
    """
    print("\nStep 2: Fetching elevations from OpenTopoData (SRTM 30m)...")
    cache_file = DATA_DIR / "elevation_cache.json"

    if "--clean-cache" in sys.argv and cache_file.exists():
        print(f"Clearing existing elevation cache: {cache_file.name}")
        cache_file.unlink(missing_ok=True)

    cache = {}
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cache = json.load(f)
            print(f"Loaded {len(cache)} elevations from cache {cache_file.name}")
        except Exception as e:
            print(f"Warning: Could not read elevation cache ({e}), starting empty.")
            cache = {}

    missing_nodes = [n for n in G.nodes if str(n) not in cache]
    print(f"Nodes needing elevation lookup: {len(missing_nodes)} of {len(G.nodes)}")

    batch_size = 100
    total_batches = math.ceil(len(missing_nodes) / batch_size) if missing_nodes else 0
    url = "https://api.opentopodata.org/v1/srtm30m"

    for i in range(0, len(missing_nodes), batch_size):
        batch = missing_nodes[i : i + batch_size]
        batch_num = (i // batch_size) + 1

        loc_strings = [f"{G.nodes[n]['y']:.6f},{G.nodes[n]['x']:.6f}" for n in batch]
        locations_param = "|".join(loc_strings)

        max_attempts = 6
        success = False

        for attempt in range(max_attempts):
            # Exponential backoff: start 5s, up to 60s (5, 10, 20, 40, 60, 60)
            backoff = min(60, 5 * (2 ** attempt))
            try:
                resp = requests.get(
                    url,
                    params={"locations": locations_param},
                    timeout=25
                )
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results", [])
                    batch_success_count = 0
                    for n, item in zip(batch, results):
                        elev = item.get("elevation")
                        # If null, treat as missing. NEVER use a default value.
                        if elev is not None:
                            cache[str(n)] = float(elev)
                            batch_success_count += 1
                    success = True
                    print(f"  [Batch {batch_num}/{total_batches}] Successfully fetched {batch_success_count}/{len(batch)} node elevations.")
                    break
                elif resp.status_code == 429:
                    wait_time = max(30, backoff)
                    print(f"  [Batch {batch_num}/{total_batches}] Rate limited (HTTP 429). Waiting {wait_time}s before attempt {attempt + 1}/{max_attempts}...")
                    time.sleep(wait_time)
                else:
                    print(f"  [Batch {batch_num}/{total_batches}] HTTP {resp.status_code}. Waiting {backoff}s before attempt {attempt + 1}/{max_attempts}...")
                    time.sleep(backoff)
            except Exception as e:
                print(f"  [Batch {batch_num}/{total_batches}] Request error: {e}. Waiting {backoff}s before attempt {attempt + 1}/{max_attempts}...")
                time.sleep(backoff)

        if not success:
            print(f"  [Batch {batch_num}/{total_batches}] FAILED after {max_attempts} attempts. Leaving {len(batch)} nodes as missing.")

        # Only cache successful lookups to elevation_cache.json (save after every batch so the script can resume)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)

        # Sleep 1.2 seconds between requests
        time.sleep(1.2)

    # Check for missing nodes after all batches
    still_missing = [n for n in G.nodes if str(n) not in cache]
    total_nodes = len(G.nodes)
    missing_count = len(still_missing)
    missing_pct = (missing_count / total_nodes) * 100.0 if total_nodes > 0 else 0.0

    if missing_count > 0:
        if missing_pct > 5.0:
            raise RuntimeError(
                f"Elevation lookup failed: {missing_count} of {total_nodes} nodes ({missing_pct:.2f}%) are missing elevation. "
                f"Exceeds 5% allowed threshold! Stopping to prevent corrupt data."
            )

        print(f"\n{missing_count} nodes ({missing_pct:.2f}%) are missing elevation (<= 5%). Filling with nearest valid node...")
        known_nodes = [n for n in G.nodes if str(n) in cache]
        if not known_nodes:
            raise RuntimeError("No nodes have elevation data available to interpolate from.")

        known_coords = np.array([[G.nodes[n]["y"], G.nodes[n]["x"]] for n in known_nodes])
        known_elevs = np.array([cache[str(n)] for n in known_nodes])

        filled_count = 0
        try:
            from scipy.spatial import cKDTree
            tree = cKDTree(known_coords)
            missing_coords = np.array([[G.nodes[n]["y"], G.nodes[n]["x"]] for n in still_missing])
            _, indices = tree.query(missing_coords)
            for n, idx in zip(still_missing, indices):
                cache[str(n)] = float(known_elevs[idx])
                filled_count += 1
        except ImportError:
            missing_coords = np.array([[G.nodes[n]["y"], G.nodes[n]["x"]] for n in still_missing])
            for n, coord in zip(still_missing, missing_coords):
                dists = (known_coords[:, 0] - coord[0]) ** 2 + (known_coords[:, 1] - coord[1]) ** 2
                nearest_idx = np.argmin(dists)
                cache[str(n)] = float(known_elevs[nearest_idx])
                filled_count += 1

        print(f"Filled {filled_count} nodes using elevation from nearest valid node.")
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
    else:
        print(f"\nAll {total_nodes} nodes have valid elevation data (0 missing).")

    # Assign elevation attribute to each graph node
    elev_values = []
    for n in G.nodes:
        elev = float(cache[str(n)])
        G.nodes[n]["elevation"] = elev
        elev_values.append(elev)

    elev_min = min(elev_values)
    elev_max = max(elev_values)
    elev_mean = sum(elev_values) / len(elev_values)

    print(f"\nElevation stats (metres):")
    print(f"  - Min : {elev_min:.2f} m")
    print(f"  - Max : {elev_max:.2f} m")
    print(f"  - Mean: {elev_mean:.2f} m")

    # Warning if more than 30% of nodes have the exact same elevation value
    elev_counts = Counter(elev_values)
    most_common_val, most_common_count = elev_counts.most_common(1)[0]
    pct_same = (most_common_count / len(elev_values)) * 100.0
    if pct_same > 30.0:
        print(f"\nWARNING: {pct_same:.1f}% of nodes have the exact same elevation value ({most_common_val:.2f} m)!")

    return elev_min, elev_max, elev_mean



def extract_features_from_osm(north, south, east, west, tags):
    """Helper to query OSM via osmnx features/geometries API."""
    try:
        if hasattr(ox, "features_from_bbox"):
            try:
                return ox.features_from_bbox(bbox=(west, south, east, north), tags=tags)
            except TypeError:
                try:
                    return ox.features_from_bbox(bbox=(north, south, east, west), tags=tags)
                except TypeError:
                    return ox.features_from_bbox(north=north, south=south, east=east, west=west, tags=tags)
        elif hasattr(ox, "geometries_from_bbox"):
            return ox.geometries_from_bbox(north=north, south=south, east=east, west=west, tags=tags)
    except Exception as e:
        print(f"  Note: OSM feature query for {tags} had an issue ({e}).")
    return None


def extract_facilities(G, north, south, east, west):
    """
    Extract hospitals, fire stations, and shelters from OSM within bbox.
    Filters to 5-10 significant hospitals.
    """
    print("\nStep 3: Extracting facilities (hospitals, fire stations, shelters)...")

    # 1. Hospitals
    hospitals_raw = []
    gdf_hospitals = extract_features_from_osm(north, south, east, west, {"amenity": "hospital"})

    disallowed_keywords = [
        "clinic", "dispensary", "dental", "eye", "skin", "pathology",
        "diagnostic", "polyclinic", "homeo", "dr.", "doctor", "consulting"
    ]

    if gdf_hospitals is not None and not gdf_hospitals.empty:
        for _, row in gdf_hospitals.iterrows():
            name = row.get("name")
            if not name or not isinstance(name, str):
                continue
            name_clean = name.strip()
            name_lower = name_clean.lower()
            if any(kw in name_lower for kw in disallowed_keywords):
                continue
            geom = row.geometry
            if geom.geom_type == "Point":
                lat, lon = geom.y, geom.x
            else:
                lat, lon = geom.centroid.y, geom.centroid.x
            if south <= lat <= north and west <= lon <= east:
                hospitals_raw.append({"name": name_clean, "lat": round(lat, 5), "lon": round(lon, 5)})

    # Deduplicate and merge with curated fallback if needed
    seen_names = set()
    hospitals_filtered = []
    for h in hospitals_raw:
        norm = h["name"].lower()
        if norm not in seen_names:
            seen_names.add(norm)
            hospitals_filtered.append(h)

    # Ensure 5 to 10 significant hospitals
    if len(hospitals_filtered) < 5:
        print(f"  OSM returned {len(hospitals_filtered)} major hospitals; adding key regional hospitals...")
        for h in FALLBACK_HOSPITALS:
            norm = h["name"].lower()
            if not any(norm in s or s in norm for s in seen_names):
                seen_names.add(norm)
                hospitals_filtered.append(h)
                if len(hospitals_filtered) >= 8:
                    break

    hospitals_selected = hospitals_filtered[:8]
    final_hospitals = []
    for idx, h in enumerate(hospitals_selected, 1):
        node_id = find_nearest_node(G, h["lat"], h["lon"])
        final_hospitals.append({
            "id": f"h{idx}",
            "name": h["name"],
            "lat": h["lat"],
            "lon": h["lon"],
            "nearest_node": node_id
        })

    # 2. Fire Stations
    fire_raw = []
    gdf_fire = extract_features_from_osm(north, south, east, west, {"amenity": "fire_station"})
    if gdf_fire is not None and not gdf_fire.empty:
        for _, row in gdf_fire.iterrows():
            name = row.get("name")
            name_clean = name.strip() if isinstance(name, str) and name.strip() else "Unnamed Fire Station"
            geom = row.geometry
            lat, lon = (geom.y, geom.x) if geom.geom_type == "Point" else (geom.centroid.y, geom.centroid.x)
            if south <= lat <= north and west <= lon <= east:
                fire_raw.append({"name": name_clean, "lat": round(lat, 5), "lon": round(lon, 5)})

    if len(fire_raw) < 2:
        for f in FALLBACK_FIRE_STATIONS:
            fire_raw.append(f)

    final_fire_stations = []
    for idx, f in enumerate(fire_raw[:5], 1):
        node_id = find_nearest_node(G, f["lat"], f["lon"])
        final_fire_stations.append({
            "id": f"f{idx}",
            "name": f["name"],
            "lat": f["lat"],
            "lon": f["lon"],
            "nearest_node": node_id
        })

    # 3. Shelters (amenity=shelter, plus schools and community centres as fallback)
    shelters_raw = []
    gdf_shelters = extract_features_from_osm(north, south, east, west, {"amenity": ["shelter", "community_centre", "school"]})
    if gdf_shelters is not None and not gdf_shelters.empty:
        for _, row in gdf_shelters.iterrows():
            name = row.get("name")
            name_clean = name.strip() if isinstance(name, str) and name.strip() else "Municipal Relief Shelter"
            geom = row.geometry
            lat, lon = (geom.y, geom.x) if geom.geom_type == "Point" else (geom.centroid.y, geom.centroid.x)
            if south <= lat <= north and west <= lon <= east:
                shelters_raw.append({"name": name_clean, "lat": round(lat, 5), "lon": round(lon, 5)})

    if len(shelters_raw) < 5:
        for s in FALLBACK_SHELTERS:
            shelters_raw.append(s)

    final_shelters = []
    for idx, s in enumerate(shelters_raw[:8], 1):
        node_id = find_nearest_node(G, s["lat"], s["lon"])
        final_shelters.append({
            "id": f"s{idx}",
            "name": s["name"],
            "lat": s["lat"],
            "lon": s["lon"],
            "nearest_node": node_id
        })

    facilities = {
        "hospitals": final_hospitals,
        "fire_stations": final_fire_stations,
        "shelters": final_shelters
    }

    return facilities


def clean_graph_for_graphml(G):
    """Ensure all attributes are scalar strings or numbers compatible with GraphML format."""
    G_clean = G.copy()
    for u, v, k, data in G_clean.edges(keys=True, data=True):
        for key, val in list(data.items()):
            if isinstance(val, (list, tuple, dict)):
                data[key] = str(val)
    for n, data in G_clean.nodes(data=True):
        for key, val in list(data.items()):
            if isinstance(val, (list, tuple, dict)):
                data[key] = str(val)
    return G_clean


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: Road network
    G = download_road_network(NORTH, SOUTH, EAST, WEST)

    # Step 2: Elevation
    elev_min, elev_max, elev_mean = fetch_node_elevations(G)

    # Step 3: Facilities
    facilities = extract_facilities(G, NORTH, SOUTH, EAST, WEST)

    # Step 4: Zones
    print("\nStep 4: Mapping 10 hand-defined zones to graph...")
    zones = []
    for z in ZONE_DEFINITIONS:
        node_id = find_nearest_node(G, z["lat"], z["lon"])
        z_copy = dict(z)
        z_copy["nearest_node"] = node_id
        zones.append(z_copy)

    # Step 5: Save files
    print("\nStep 5: Saving outputs into backend/data/...")
    graphml_path = DATA_DIR / "graph.graphml"
    facilities_path = DATA_DIR / "facilities.json"
    zones_path = DATA_DIR / "zones.json"
    weather_cache_path = DATA_DIR / "weather_cache.json"

    # Save GraphML
    try:
        if hasattr(ox, "save_graphml"):
            ox.save_graphml(G, filepath=graphml_path)
        elif hasattr(ox, "io") and hasattr(ox.io, "save_graphml"):
            ox.io.save_graphml(G, filepath=graphml_path)
        else:
            nx.write_graphml(clean_graph_for_graphml(G), graphml_path)
    except Exception:
        nx.write_graphml(clean_graph_for_graphml(G), graphml_path)
    print(f"  Saved: {graphml_path}")

    # Save facilities.json
    with open(facilities_path, "w", encoding="utf-8") as f:
        json.dump(facilities, f, indent=2)
    print(f"  Saved: {facilities_path}")

    # Save zones.json
    with open(zones_path, "w", encoding="utf-8") as f:
        json.dump(zones, f, indent=2)
    print(f"  Saved: {zones_path}")

    # Seed weather_cache.json if missing (SPEC Section 6)
    if not weather_cache_path.exists():
        weather_seed = {
            "rain_mm_hr": 14.5,
            "source": "cache",
            "fetched_at": "2026-10-25T12:00:00Z"
        }
        with open(weather_cache_path, "w", encoding="utf-8") as f:
            json.dump(weather_seed, f, indent=2)
        print(f"  Saved initial: {weather_cache_path}")

    # Step 6: Print summary
    num_nodes = len(G.nodes)
    num_edges = len(G.edges)

    print("\n" + "=" * 50)
    print("           DATA PREPARATION SUMMARY")
    print("=" * 50)
    print(f"Node count: {num_nodes}")
    print(f"Edge count: {num_edges}")
    print(f"Elevation stats (metres):")
    print(f"  - Min : {elev_min:.2f} m")
    print(f"  - Max : {elev_max:.2f} m")
    print(f"  - Mean: {elev_mean:.2f} m")
    print(f"\nExtracted Hospitals ({len(facilities['hospitals'])}):")
    for h in facilities["hospitals"]:
        print(f"  - [{h['id']}] {h['name']} (Node: {h['nearest_node']}, Lat: {h['lat']}, Lon: {h['lon']})")

    if num_nodes > 8000:
        print(f"\nWARNING: Node count ({num_nodes}) exceeds target 8,000 nodes! Consider simplifying graph or trimming bbox.")
    else:
        print(f"\nNode count is within target budget (<= 8,000 nodes).")
    print("=" * 50)


if __name__ == "__main__":
    main()
