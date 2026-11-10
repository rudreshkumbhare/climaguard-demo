"""
main.py — FastAPI application (§6).

Routes (all under /api prefix):
  GET  /health
  GET  /region
  GET  /weather/live?lat=&lon=
  POST /simulate
  POST /plan

CORS: open for http://localhost:5173 and http://127.0.0.1:5173
GZip: enabled (minimum_size=1000 bytes) for large /region and /simulate responses.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from .schemas import (
    HealthResponse,
    RegionResponse,
    WeatherResponse,
    SimulateRequest,
    SimulateResponse,
    PlanRequest,
    AuthorityPlanResponse,
    CitizenPlanResponse,
    ErrorResponse,
)
from .state import init_app_state, get_app_state
from .weather import fetch_live_weather
from .engine import simulate
from .plan import build_plan

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load data once at startup; nothing to teardown."""
    logger.info("Loading graph, facilities and zones…")
    init_app_state()
    logger.info("Data loaded. Baselines precomputed. Ready.")

    # Print RSS memory after startup so we can track Render free-tier headroom
    try:
        import resource
        rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        # macOS reports bytes, Linux reports kilobytes
        import sys
        rss_mb = rss_kb / (1024 * 1024) if sys.platform == "darwin" else rss_kb / 1024
        logger.info("Memory after startup: %.1f MB RSS", rss_mb)
    except Exception:
        pass

    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ClimaguardAI API",
    version="1.0.0",
    description="Compound flood-risk simulation for Mumbai (Sion–Kurla–Dharavi–BKC–Bandra East).",
    lifespan=lifespan,
)

# GZip compression (minimum 1 kB)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS — origins read from env var CORS_ORIGINS (comma-separated).
# Default: local Vite dev servers. On Render, set CORS_ORIGINS to your
# frontend domain, e.g. https://your-app.onrender.com
_cors_env = os.environ.get("CORS_ORIGINS", "").strip()
_cors_origins: list[str] = (
    [o.strip() for o in _cors_env.split(",") if o.strip()]
    if _cors_env
    else ["http://localhost:5173", "http://127.0.0.1:5173"]
)
logger.info("CORS origins: %s", _cors_origins)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Error helper ──────────────────────────────────────────────────────────────

def _err(status: int, error: str, detail: str = "") -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": error, "detail": detail},
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse, tags=["meta"])
def health():
    """Quick liveness check. Returns node/hospital/zone counts."""
    try:
        state = get_app_state()
        return {
            "status": "ok",
            "nodes": state.graph.number_of_nodes(),
            "hospitals": len(state.facilities.get("hospitals", [])),
            "zones": len(state.zones),
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/api/region", response_model=RegionResponse, tags=["data"])
def region():
    """
    Static geographic layers — call once on page load.

    Returns hospitals, shelters, zones and a simplified GeoJSON road network.
    Response is GZip-compressed (>1 kB threshold).
    """
    try:
        state = get_app_state()
        facilities = state.facilities
        zones = state.zones
        G = state.graph

        hospitals = [
            {"id": h["id"], "name": h["name"], "lat": h["lat"], "lon": h["lon"]}
            for h in facilities.get("hospitals", [])
        ]
        shelters = [
            {"id": s["id"], "name": s["name"], "lat": s["lat"], "lon": s["lon"]}
            for s in facilities.get("shelters", [])
        ]
        zone_list = [
            {
                "id": z["id"],
                "name": z["name"],
                "lat": z["lat"],
                "lon": z["lon"],
                "population": z["population"],
                "vulnerability": z["vulnerability"],
            }
            for z in zones
        ]

        # Build simplified GeoJSON road network
        # Each unique (u,v) pair → one feature (skip multi-keys)
        seen_edges: set[tuple] = set()
        features = []
        for u, v, key, edata in G.edges(keys=True, data=True):
            pair = (min(u, v), max(u, v))
            if pair in seen_edges:
                continue
            seen_edges.add(pair)

            u_data = G.nodes[u]
            v_data = G.nodes[v]
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [float(u_data["x"]), float(u_data["y"])],
                        [float(v_data["x"]), float(v_data["y"])],
                    ],
                },
                "properties": {
                    "id": f"{u}-{v}-{key}",
                    "name": edata.get("name", ""),
                    "highway": edata.get("highway", ""),
                },
            }
            features.append(feature)

        roads = {"type": "FeatureCollection", "features": features}

        return {
            "bbox": [72.820, 19.020, 72.905, 19.095],
            "hospitals": hospitals,
            "shelters": shelters,
            "zones": zone_list,
            "roads": roads,
        }

    except Exception as exc:
        logger.exception("Error in /region")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/weather/live", response_model=WeatherResponse, tags=["weather"])
async def weather_live(
    lat: float = Query(default=19.05, description="Latitude"),
    lon: float = Query(default=72.86, description="Longitude"),
    replay: bool = Query(default=False, description="Always return the cached rainy sample"),
):
    """
    Fetch current precipitation from Open-Meteo (no key required).
    Falls back to weather_cache.json on any failure or when live rain < 1 mm/hr.
    Pass ?replay=true to always return the cached monsoon sample.
    """
    try:
        result = await fetch_live_weather(lat, lon, replay=replay)
        return result
    except Exception as exc:
        logger.exception("Unexpected error in /weather/live")
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/simulate", response_model=SimulateResponse, tags=["simulation"])
def simulate_endpoint(body: SimulateRequest):
    """
    Run the compound-risk simulation.

    Applies what-if adjustments (rain_increase_pct, sea_level_rise_m),
    then runs risk → flood → cascade in sequence.
    Response is GZip-compressed.
    """
    try:
        state = get_app_state()
        result = simulate(
            data=state,
            rain_mm_hr=body.rain_mm_hr,
            surge_m=body.surge_m,
            tide_m=body.tide_m,
            rain_increase_pct=body.rain_increase_pct,
            sea_level_rise_m=body.sea_level_rise_m,
        )
        return result
    except Exception as exc:
        logger.exception("Error in /simulate")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/plan", tags=["plan"])
def plan_endpoint(body: PlanRequest):
    """
    Generate an authority action plan or a citizen safety message.

    Uses the full /simulate response as input.
    Attempts a Gemini LLM rewrite if GEMINI_API_KEY is set;
    falls back to a Python string template on failure or if the key is absent.
    Always returns source: "llm" | "template".
    """
    if body.mode not in ("authority", "citizen"):
        return _err(400, "Invalid mode", "mode must be 'authority' or 'citizen'")

    if body.mode == "citizen" and not body.zone_id:
        return _err(400, "Missing zone_id", "zone_id is required for citizen mode")

    try:
        state = get_app_state()
        result = build_plan(
            simulation=body.simulation,
            mode=body.mode,
            zone_id=body.zone_id,
            facilities=state.facilities,
            zones=state.zones,
        )
        return result
    except ValueError as exc:
        return _err(400, "Bad request", str(exc))
    except Exception as exc:
        logger.exception("Error in /plan")
        raise HTTPException(status_code=500, detail=str(exc))
