"""
benchmark.py — Measure simulate() cold and warm times.

Run from backend/ directory:
    python scripts/benchmark.py
"""
from __future__ import annotations
import sys, random, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.flood import load_data
from app.cascade import precompute_baselines
import app.engine as eng

print("\nLoading data...")
t0 = time.perf_counter()
data = load_data()
precompute_baselines(data)
load_ms = (time.perf_counter() - t0) * 1000
print(f"  load+precompute: {load_ms:.0f} ms")

presets = {
    "Normal":   dict(rain_mm_hr=10,  surge_m=0.0, tide_m=0.5),
    "Heavy":    dict(rain_mm_hr=90,  surge_m=0.0, tide_m=1.0),
    "Compound": dict(rain_mm_hr=90,  surge_m=2.5, tide_m=3.0),
}

print("\n── COLD (first call, uncached) ─────────────────────────")
cold_times: dict[str, float] = {}
for name, params in presets.items():
    eng._cache.clear()
    t0 = time.perf_counter()
    r = eng.simulate(data, **params)
    cold_ms = (time.perf_counter() - t0) * 1000
    cold_times[name] = cold_ms
    print(f"  {name:12s}  cold={cold_ms:6.1f} ms  "
          f"compound={r['risk']['compound']:.4f}  roads={r['flood']['roads_closed_pct']:.2f}%")

print("\n── WARM (second call, cached) ──────────────────────────")
eng._cache.clear()
for name, params in presets.items():
    eng.simulate(data, **params)
warm_times: dict[str, float] = {}
for name, params in presets.items():
    t0 = time.perf_counter()
    r = eng.simulate(data, **params)
    warm_ms = (time.perf_counter() - t0) * 1000
    warm_times[name] = warm_ms
    print(f"  {name:12s}  warm={warm_ms:6.2f} ms  compute_ms={r['compute_ms']}")

print("\n── 20 RANDOM values (cold, cache cleared each time) ────")
random.seed(42)
rand_times: list[float] = []
for i in range(20):
    rain  = random.uniform(0, 150)
    surge = random.uniform(0, 3)
    tide  = random.uniform(0, 3)
    eng._cache.clear()
    t0 = time.perf_counter()
    eng.simulate(data, rain, surge, tide)
    ms = (time.perf_counter() - t0) * 1000
    rand_times.append(ms)
    if i < 5 or i >= 18:
        print(f"  [{i+1:2d}] rain={rain:5.1f} surge={surge:.2f} tide={tide:.2f}  -> {ms:6.1f} ms")
    elif i == 5:
        print(f"  ... (omitting 6-18) ...")

avg_rand = sum(rand_times) / len(rand_times)
print(f"\n  Random min={min(rand_times):.1f} ms  max={max(rand_times):.1f} ms  avg={avg_rand:.1f} ms")

print("\n── SPEEDUP SUMMARY ─────────────────────────────────────")
print(f"  {'Preset':<12}  {'Before':>8}  {'Cold':>8}  {'Warm':>8}  {'Speedup(warm)':>14}")
before = {"Normal": 168.7, "Heavy": 156.6, "Compound": 54.7}
for name in presets:
    b = before[name]
    c = cold_times[name]
    w = warm_times[name]
    sp = b / w if w > 0 else float("inf")
    print(f"  {name:<12}  {b:>7.1f}ms  {c:>7.1f}ms  {w:>7.2f}ms  {sp:>13.0f}x")

try:
    import resource, platform
    mem = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    mem_mb = mem / 1024 / 1024 if platform.system() == "Darwin" else mem / 1024
    print(f"\n  Memory (RSS after benchmark): {mem_mb:.1f} MB")
except Exception:
    pass
