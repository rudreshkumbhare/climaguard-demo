/**
 * types.ts — TypeScript types matching §6 API contract exactly.
 */

// ── Shared Geo Types ────────────────────────────────────────────────────────

export interface GeoLineString {
  type: "LineString";
  coordinates: [number, number][];
}

export interface RoadFeature {
  type: "Feature";
  id: string;
  properties: {
    id: string;
    name: string | null;
    highway: string;
  };
  geometry: {
    type: string;
    coordinates: any;
  };
}

export interface RoadFeatureCollection {
  type: "FeatureCollection";
  features: RoadFeature[];
}

// ── GET /health ─────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  nodes: number;
  hospitals: number;
  zones: number;
}

// ── GET /region ─────────────────────────────────────────────────────────────

export interface HospitalInfo {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface ShelterInfo {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface ZoneInfo {
  id: string;
  name: string;
  lat: number;
  lon: number;
  population: number;
  vulnerability: number;
}

export interface RegionResponse {
  bbox: [number, number, number, number]; // [west, south, east, north]
  hospitals: HospitalInfo[];
  shelters: ShelterInfo[];
  zones: ZoneInfo[];
  roads: RoadFeatureCollection;
}

// ── GET /weather/live ───────────────────────────────────────────────────────

export interface WeatherResponse {
  rain_mm_hr: number;
  source: "live" | "cache";
  fetched_at: string;
}

// ── POST /simulate ──────────────────────────────────────────────────────────

export interface SimulateRequest {
  rain_mm_hr: number;
  surge_m: number;
  tide_m: number;
  rain_increase_pct: number;
  sea_level_rise_m: number;
}

export interface EffectiveInputs {
  rain_mm_hr: number;
  surge_m: number;
  tide_m: number;
}

export interface HazardsDetail {
  rain: number;
  surge: number;
  tide: number;
}

export type RiskLevel = "Low" | "Moderate" | "High" | "Severe";

export interface RiskDetail {
  hazards: HazardsDetail;
  baseline: number;
  compound: number;
  level: RiskLevel | string;
  k: number;
}

export interface FloodedNode {
  lat: number;
  lon: number;
  depth_m: number;
}

export interface FloodDetail {
  closed_edge_ids: string[];
  roads_closed_pct: number;
  flooded_nodes: FloodedNode[];
}

export interface CascadeMetrics {
  hospitals_isolated: number;
  zones_cut_off: number;
  population_isolated: number;
  avg_extra_km: number;
  wcc_count?: number;
  largest_wcc_size?: number;
}

export interface HospitalStatus {
  id: string;
  status: "OPERATIONAL" | "ISOLATED";
}

export interface ZoneStatus {
  id: string;
  status: "OK" | "REROUTED" | "CUT_OFF";
  nearest_hospital_id: string | null;
  nearest_shelter_id?: string | null;
  extra_km: number | null;
  route: GeoLineString | null;
}

export interface CascadeDetail {
  metrics: CascadeMetrics;
  hospitals: HospitalStatus[];
  zones: ZoneStatus[];
}

export interface SimulateResponse {
  inputs_effective: EffectiveInputs;
  risk: RiskDetail;
  flood: FloodDetail;
  cascade: CascadeDetail;
  compute_ms: number;
}

// ── POST /plan ──────────────────────────────────────────────────────────────

export interface PlanRequest {
  simulation: SimulateResponse;
  mode: "authority" | "citizen";
  zone_id?: string;
}

export interface AuthorityAction {
  rank: number;
  action: string;
  target: string;
  reason: string;
  est_people: number;
}

export interface AuthorityPlanResponse {
  mode: "authority";
  source: "llm" | "template";
  actions: AuthorityAction[];
  summary: string;
}

export interface CitizenFacts {
  nearest_hospital: string | null;
  nearest_shelter: string | null;
  closed_roads: string[];
}

export interface CitizenPlanResponse {
  mode: "citizen";
  source: "llm" | "template";
  zone: string;
  message: string;
  facts: CitizenFacts;
}

export type PlanResponse = AuthorityPlanResponse | CitizenPlanResponse;

// ── Errors ──────────────────────────────────────────────────────────────────

export interface ErrorResponse {
  error: string;
  detail: string;
}

// ── Presets ─────────────────────────────────────────────────────────────────

export interface PresetValues {
  rain_mm_hr: number;
  surge_m: number;
  tide_m: number;
}

export type PresetsMap = Record<string, PresetValues>;
