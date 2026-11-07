/**
 * api.ts — API client with mock and real HTTP modes.
 */
import type {
  RegionResponse,
  SimulateRequest,
  SimulateResponse,
  PlanRequest,
  PlanResponse,
  WeatherResponse,
  AuthorityPlanResponse,
  CitizenPlanResponse,
} from "./types";

export const USE_MOCK = false;
const API_BASE = "http://localhost:8000/api";

// ── Mock data loaders ────────────────────────────────────────────────────────

async function loadMockRegion(): Promise<RegionResponse> {
  const mod = await import("../mock/region.json");
  return mod.default as unknown as RegionResponse;
}

async function loadMockSimulate(req: SimulateRequest): Promise<SimulateResponse> {
  const effectiveRain = req.rain_mm_hr * (1 + (req.rain_increase_pct || 0) / 100);
  const effectiveSurge = req.surge_m;
  const effectiveTide = req.tide_m + (req.sea_level_rise_m || 0);

  // Simple nearest match on rain, taking into account extreme compound condition
  let mod;
  if (effectiveRain <= 50) {
    mod = await import("../mock/simulate_normal.json");
  } else if (effectiveSurge >= 1.5 || effectiveTide >= 2.5) {
    mod = await import("../mock/simulate_compound.json");
  } else {
    mod = await import("../mock/simulate_heavy.json");
  }

  const baseData = JSON.parse(JSON.stringify(mod.default)) as SimulateResponse;
  // Echo effective inputs reflecting what-if sliders
  baseData.inputs_effective = {
    rain_mm_hr: Math.round(effectiveRain * 10) / 10,
    surge_m: Math.round(effectiveSurge * 10) / 10,
    tide_m: Math.round(effectiveTide * 10) / 10,
  };
  return baseData;
}

function loadMockPlan(req: PlanRequest): PlanResponse {
  if (req.mode === "authority") {
    const authPlan: AuthorityPlanResponse = {
      mode: "authority",
      source: "template",
      actions: [
        {
          rank: 1,
          action: "Pre-position ambulances at operational facilities",
          target: "Lokmanya Tilak Municipal General Hospital (Sion)",
          reason: "Critical hospital access corridors threatened by flood depth > 0.3m",
          est_people: 18000,
        },
        {
          rank: 2,
          action: "Deploy de-watering pumps to underpasses",
          target: "Kurla West & Sion Rail Corridor",
          reason: "Severe surface runoff ponding at elevations below 4.0m",
          est_people: 35000,
        },
        {
          rank: 3,
          action: "Open emergency evacuation shelters",
          target: "Sevadaan Special School & Little Angels High School",
          reason: "Low-lying settlements in Dharavi isolated from regular road grid",
          est_people: 24000,
        },
        {
          rank: 4,
          action: "Activate police road closures & traffic diversions",
          target: "Western Express Highway & L.B.S. Marg",
          reason: "Arterial roads impassable for standard vehicular traffic",
          est_people: 65000,
        },
      ],
      summary:
        "Severe compound threat. Pre-position medical transports, deploy emergency pumps to low-lying rail corridors, and activate safe rerouting via high-ground bridges.",
    };
    return authPlan;
  }

  // Citizen mode
  const zoneId = req.zone_id || "z1";
  const zoneNames: Record<string, string> = {
    z1: "Dharavi",
    z2: "Sion",
    z3: "Kurla West",
    z4: "Kurla East",
    z5: "BKC",
    z6: "Bandra East",
    z7: "Chunabhatti",
    z8: "Matunga",
    z9: "Mahim",
    z10: "Wadala",
  };
  const zoneName = zoneNames[zoneId] || "Your Zone";

  const citPlan: CitizenPlanResponse = {
    mode: "citizen",
    source: "template",
    zone: zoneName,
    message: `⚡ ${zoneName}: REROUTING IN EFFECT. Threat level: High. Your nearest accessible hospital is Lokmanya Tilak Municipal General Hospital (Sion Hospital). Safe route via high-elevation bridges is active. Please avoid waterlogged underpasses.`,
    facts: {
      nearest_hospital: "Lokmanya Tilak Municipal General Hospital (Sion Hospital)",
      nearest_shelter: "Little Angels' High School",
      closed_roads: [
        "Western Express Highway (submerged > 0.3m)",
        "L.B.S. Marg (traffic stalled)",
        "Local connector lanes under flyovers",
      ],
    },
  };
  return citPlan;
}

// ── Public API functions ────────────────────────────────────────────────────

export async function getRegion(): Promise<RegionResponse> {
  if (USE_MOCK) {
    return loadMockRegion();
  }
  const res = await fetch(`${API_BASE}/region`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.error || "Failed to fetch region data");
  }
  return res.json();
}

export async function simulate(req: SimulateRequest): Promise<SimulateResponse> {
  if (USE_MOCK) {
    return loadMockSimulate(req);
  }
  const res = await fetch(`${API_BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.error || "Failed to simulate");
  }
  return res.json();
}

export async function getPlan(req: PlanRequest): Promise<PlanResponse> {
  if (USE_MOCK) {
    const mock = loadMockPlan(req);
    console.log("[POST /api/plan mock request body]:", req);
    console.log("[POST /api/plan mock response]:", mock);
    return mock;
  }
  console.log("[POST /api/plan request body]:", req);
  const res = await fetch(`${API_BASE}/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    console.error("[POST /api/plan error response]:", res.status, err);
    throw new Error(err.detail || err.error || "Failed to generate plan");
  }
  const data = await res.json();
  console.log("[POST /api/plan response]:", data);
  return data;
}

export async function getWeatherLive(
  lat = 19.05,
  lon = 72.86
): Promise<WeatherResponse> {
  if (USE_MOCK) {
    return {
      rain_mm_hr: 12.4,
      source: "cache",
      fetched_at: new Date().toISOString(),
    };
  }
  const res = await fetch(`${API_BASE}/weather/live?lat=${lat}&lon=${lon}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.error || "Failed to fetch live weather");
  }
  return res.json();
}
