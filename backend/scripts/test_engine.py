"""
test_engine.py — Acceptance tests 1-5 (§8) + preset report (§9).

Run from the backend/ directory:
    python scripts/test_engine.py

No server required.  Tests use plain asserts; failures are reported, not
raised, so the preset table always prints.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure the backend package is importable when run as a script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config  import PRESETS, ELEVATION_FLOOR_M, REROUTE_THRESHOLD, CLOSE_THRESHOLD
from app.flood   import load_data, compute_flood
from app.cascade import precompute_baselines, run_cascade
from app.engine  import simulate


# ── test runner ────────────────────────────────────────────────────────────────

class _Results:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0

    def ok(self, label: str) -> None:
        print(f"  ✓  {label}")
        self.passed += 1

    def fail(self, label: str, detail: str) -> None:
        print(f"  ✗  {label}")
        print(f"       FAIL: {detail}")
        self.failed += 1

    def check(self, label: str, condition: bool, detail: str = "") -> None:
        if condition:
            self.ok(label)
        else:
            self.fail(label, detail or "condition is False")

    def summary(self) -> None:
        total = self.passed + self.failed
        print(f"\n  {self.passed}/{total} tests passed", end="")
        if self.failed:
            print(f"  ({self.failed} FAILED — thresholds NOT tuned; report only)")
        print()


# ── acceptance tests ───────────────────────────────────────────────────────────

def run_tests(data: object, res: _Results) -> None:
    print("\n═══════════════════════════════════════")
    print("  Acceptance Tests (§8, tests 1 – 5)")
    print("═══════════════════════════════════════\n")

    # ── Test 1: all inputs = 0 → compound = 0, zero closed roads ─────────────
    r1 = simulate(data, rain_mm_hr=0, surge_m=0, tide_m=0)
    res.check(
        "Test 1a: compound = 0 when all inputs are 0",
        r1["risk"]["compound"] == 0.0,
        f"compound={r1['risk']['compound']}",
    )
    res.check(
        "Test 1b: zero closed roads when all inputs are 0",
        len(r1["flood"]["closed_edge_ids"]) == 0,
        f"closed_edge_ids count={len(r1['flood']['closed_edge_ids'])}",
    )

    # ── Test 2: rain=80 only → compound ≈ baseline (synergy=0 exactly) ───────
    r2 = simulate(data, rain_mm_hr=80, surge_m=0, tide_m=0)
    diff2 = abs(r2["risk"]["compound"] - r2["risk"]["baseline"])
    res.check(
        "Test 2: compound ≈ baseline when only rain is non-zero (synergy=0)",
        diff2 < 1e-9,
        f"compound={r2['risk']['compound']:.9f}  baseline={r2['risk']['baseline']:.9f}  diff={diff2:.2e}",
    )

    # ── Test 3: rain=80 + surge=1.5 + tide=2 → visible margin, High/Severe ───
    r3 = simulate(data, rain_mm_hr=80, surge_m=1.5, tide_m=2.0)
    margin3 = r3["risk"]["compound"] - r3["risk"]["baseline"]
    res.check(
        "Test 3a: compound > baseline by visible margin (> 0.05)",
        margin3 > 0.05,
        f"compound={r3['risk']['compound']:.4f}  baseline={r3['risk']['baseline']:.4f}  margin={margin3:.4f}",
    )
    res.check(
        "Test 3b: level is High or Severe",
        r3["risk"]["level"] in ("High", "Severe"),
        f"level={r3['risk']['level']}",
    )

    # ── Test 4: raising sea_level_rise_m never reduces closed roads ───────────
    base_rain, base_surge, base_tide = 60.0, 1.0, 1.5
    slr_levels = [0.0, 0.25, 0.5, 1.0, 1.5, 2.0]
    prev_closed: int = -1
    mono_ok = True
    mono_detail = ""
    for slr in slr_levels:
        r4 = simulate(data, base_rain, base_surge, base_tide, sea_level_rise_m=slr)
        n = len(r4["flood"]["closed_edge_ids"])
        if n < prev_closed:
            mono_ok = False
            mono_detail = f"closed roads decreased at sea_level_rise_m={slr}: {prev_closed}→{n}"
            break
        prev_closed = n

    res.check("Test 4: increasing sea_level_rise_m never reduces closed roads", mono_ok, mono_detail)

    # ── Test 5: Compound event preset → at least 1 hospital ISOLATED ──────────
    cp = PRESETS["Compound event"]
    r5 = simulate(data, cp["rain_mm_hr"], cp["surge_m"], cp["tide_m"])
    n_iso = r5["cascade"]["metrics"]["hospitals_isolated"]
    res.check(
        "Test 5: ≥ 1 hospital ISOLATED under Compound event preset",
        n_iso >= 1,
        f"hospitals_isolated={n_iso} (need ≥ 1).  "
        f"roads_closed_pct={r5['flood']['roads_closed_pct']}%  "
        f"CLOSE_THRESHOLD={CLOSE_THRESHOLD} m",
    )

    res.summary()


# ── preset report ──────────────────────────────────────────────────────────────

def _top_closed_roads(data: object, closed_edge_ids: list[str], n: int = 3) -> list[str]:
    """Return names of the n longest named closed edges, sorted by length desc."""
    G = data.graph
    named: list[tuple[float, str]] = []
    for eid in closed_edge_ids:
        parts = eid.split("-")
        if len(parts) != 3:
            continue
        try:
            u   = int(parts[0])
            v   = int(parts[1])
            key = int(parts[2])
        except ValueError:
            continue
        if not G.has_edge(u, v, key):
            continue
        edata     = G.edges[u, v, key]
        road_name = edata.get("name")
        if road_name:
            # graphml may serialise multi-value OSM names as a Python list literal
            if isinstance(road_name, list):
                road_name = road_name[0]
            elif isinstance(road_name, str) and road_name.startswith("["):
                try:
                    import ast
                    parsed = ast.literal_eval(road_name)
                    road_name = parsed[0] if parsed else road_name
                except Exception:
                    pass
            length = float(edata.get("length", 0.0))
            named.append((length, str(road_name)))

    named.sort(reverse=True)
    # Deduplicate by name (same road can appear many times)
    seen:   set[str] = set()
    result: list[str] = []
    for _, name in named:
        if name not in seen:
            seen.add(name)
            result.append(name)
        if len(result) == n:
            break
    return result


def print_preset_report(data: object) -> None:
    print("\n══════════════════════════════════════════════════════════════════")
    print("  Preset Report (§9)")
    print("══════════════════════════════════════════════════════════════════\n")
    print(f"  Elevation floor  : {ELEVATION_FLOOR_M} m")
    print(f"  Close threshold  : {CLOSE_THRESHOLD} m")
    print(f"  Reroute threshold: {int(REROUTE_THRESHOLD * 100)} %\n")

    col = "{:<18}  {:>8}  {:>8}  {:>10}  {:>9}  {:>6}  {:>6}  {:>12}  {:>7}  {:>8}"
    hdr = col.format(
        "Preset", "compound", "baseline", "level",
        "roads_cls%", "h_iso", "z_cut", "pop_isolated", "n_flood", "ms",
    )
    print("  " + hdr)
    print("  " + "─" * len(hdr))

    for preset_name, params in PRESETS.items():
        r        = simulate(data, params["rain_mm_hr"], params["surge_m"], params["tide_m"])
        risk     = r["risk"]
        flood    = r["flood"]
        metrics  = r["cascade"]["metrics"]
        n_flood  = len(flood["flooded_nodes"])

        row = col.format(
            preset_name,
            f"{risk['compound']:.4f}",
            f"{risk['baseline']:.4f}",
            risk["level"],
            f"{flood['roads_closed_pct']:.2f}",
            metrics["hospitals_isolated"],
            metrics["zones_cut_off"],
            f"{metrics['population_isolated']:,}",
            n_flood,
            f"{r['compute_ms']:.1f}",
        )
        print("  " + row)

        top3 = _top_closed_roads(data, flood["closed_edge_ids"], n=3)
        if top3:
            print(f"    ↳ top closed roads: {', '.join(top3)}")
        elif flood["closed_edge_ids"]:
            print(f"    ↳ top closed roads: (no named edges)")
        else:
            print(f"    ↳ top closed roads: (none — no closed roads)")
        print()

    print("══════════════════════════════════════════════════════════════════\n")


# ── entrypoint ─────────────────────────────────────────────────────────────────

def main() -> None:
    print("\nLoading data (graph + facilities + zones)…")
    data = load_data()
    print(
        f"  Graph      : {data.graph.number_of_nodes()} nodes, "
        f"{data.graph.number_of_edges()} edges"
    )
    print(f"  Hospitals  : {len(data.facilities['hospitals'])}")
    print(f"  Shelters   : {len(data.facilities.get('shelters', []))}")
    print(f"  Zones      : {len(data.zones)}")

    print("\nPrecomputing baseline shortest paths…")
    precompute_baselines(data)
    print("  Done.")

    res = _Results()
    run_tests(data, res)
    print_preset_report(data)

    sys.exit(0 if res.failed == 0 else 1)


if __name__ == "__main__":
    main()
