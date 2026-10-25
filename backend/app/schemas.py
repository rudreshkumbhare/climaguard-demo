"""
schemas.py — Pydantic models = API contract (§6).

All request and response bodies are defined here. Do not add fields
that are not in the SPEC §6 contract; do not remove any.
"""
from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Shared geo types ──────────────────────────────────────────────────────────

class LineString(BaseModel):
    type: str = "LineString"
    coordinates: list[list[float]]


class FeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[dict[str, Any]]


# ── /health ───────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    nodes: int
    hospitals: int
    zones: int


# ── /region ───────────────────────────────────────────────────────────────────

class HospitalInfo(BaseModel):
    id: str
    name: str
    lat: float
    lon: float


class ShelterInfo(BaseModel):
    id: str
    name: str
    lat: float
    lon: float


class ZoneInfo(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    population: int
    vulnerability: float


class RegionResponse(BaseModel):
    bbox: list[float]                      # [west, south, east, north]
    hospitals: list[HospitalInfo]
    shelters: list[ShelterInfo]
    zones: list[ZoneInfo]
    roads: dict[str, Any]                  # GeoJSON FeatureCollection


# ── /weather/live ─────────────────────────────────────────────────────────────

class WeatherResponse(BaseModel):
    rain_mm_hr: float
    source: str                            # "live" | "cache"
    fetched_at: str                        # ISO-8601 UTC


# ── /simulate ────────────────────────────────────────────────────────────────

class SimulateRequest(BaseModel):
    rain_mm_hr: float = Field(..., ge=0, le=500)
    surge_m: float    = Field(..., ge=0, le=10)
    tide_m: float     = Field(..., ge=0, le=10)
    rain_increase_pct: float = Field(default=0, ge=0, le=200)
    sea_level_rise_m: float  = Field(default=0, ge=0, le=10)


class EffectiveInputs(BaseModel):
    rain_mm_hr: float
    surge_m: float
    tide_m: float


class HazardsDetail(BaseModel):
    rain: float
    surge: float
    tide: float


class RiskDetail(BaseModel):
    hazards: HazardsDetail
    baseline: float
    compound: float
    level: str
    k: float


class FloodDetail(BaseModel):
    closed_edge_ids: list[str]
    roads_closed_pct: float
    flooded_nodes: list[dict[str, Any]]    # [{lat, lon, depth_m}]


class CascadeMetrics(BaseModel):
    hospitals_isolated: int
    zones_cut_off: int
    population_isolated: int
    avg_extra_km: float
    wcc_count: Optional[int] = None
    largest_wcc_size: Optional[int] = None


class HospitalStatus(BaseModel):
    id: str
    status: str                            # "OPERATIONAL" | "ISOLATED"


class ZoneStatus(BaseModel):
    id: str
    status: str                            # "OK" | "REROUTED" | "CUT_OFF"
    nearest_hospital_id: Optional[str]
    nearest_shelter_id: Optional[str] = None
    extra_km: Optional[float]
    route: Optional[dict[str, Any]]        # GeoJSON LineString or null


class CascadeDetail(BaseModel):
    metrics: CascadeMetrics
    hospitals: list[HospitalStatus]
    zones: list[ZoneStatus]


class SimulateResponse(BaseModel):
    inputs_effective: EffectiveInputs
    risk: RiskDetail
    flood: FloodDetail
    cascade: CascadeDetail
    compute_ms: float


# ── /plan ─────────────────────────────────────────────────────────────────────

class PlanRequest(BaseModel):
    simulation: dict[str, Any]             # the full /simulate response
    mode: str                              # "authority" | "citizen"
    zone_id: Optional[str] = None          # required when mode == "citizen"


class AuthorityAction(BaseModel):
    rank: int
    action: str
    target: str
    reason: str
    est_people: int


class AuthorityPlanResponse(BaseModel):
    mode: str = "authority"
    source: str                            # "llm" | "template"
    actions: list[AuthorityAction]
    summary: str


class CitizenFacts(BaseModel):
    nearest_hospital: Optional[str]
    nearest_shelter: Optional[str]
    closed_roads: list[str]


class CitizenPlanResponse(BaseModel):
    mode: str = "citizen"
    source: str                            # "llm" | "template"
    zone: str
    message: str
    facts: CitizenFacts


# ── Errors ────────────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    error: str
    detail: str
