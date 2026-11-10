/**
 * api.ts — API client with mock and real HTTP modes, timeout handling, and automatic fallback.
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

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
export const API_BASE =
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_API_BASE ??
  "http://localhost:8000/api";

const REQUEST_TIMEOUT_MS = 8000;
const SESSION_MOCK_STORAGE_KEY = "climaguard_use_mock_session";

// ── Session Mock State & Status Subscriptions ────────────────────────────────

export type BackendStatus = "connecting" | "live" | "mock";

type StatusListener = (status: BackendStatus) => void;
const statusListeners = new Set<StatusListener>();

function getInitialMockState(): boolean {
  if (USE_MOCK) return true;
  try {
    return sessionStorage.getItem(SESSION_MOCK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

let activeMockMode = getInitialMockState();
let currentStatus: BackendStatus = activeMockMode ? "mock" : "connecting";

export function isMockActive(): boolean {
  return activeMockMode;
}

export function getBackendStatus(): BackendStatus {
  return currentStatus;
}

export function subscribeBackendStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

function updateStatus(status: BackendStatus) {
  if (currentStatus !== status) {
    currentStatus = status;
    statusListeners.forEach((fn) => fn(status));
  }
}

export function switchToMockMode() {
  activeMockMode = true;
  try {
    sessionStorage.setItem(SESSION_MOCK_STORAGE_KEY, "true");
  } catch {
    // sessionStorage not available or quota exceeded
  }
  updateStatus("mock");
}

function notifyBackendSuccess() {
  if (!activeMockMode) {
    updateStatus("live");
  }
}

// ── Fetch with Timeout ───────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Mock data loaders ────────────────────────────────────────────────────────

async function loadMockRegion(): Promise<RegionResponse> {
  const mod = await import("../mock/region.json");
  return mod.default as unknown as RegionResponse;
}

async function loadMockSimulate(req: SimulateRequest): Promise<SimulateResponse> {
  const effectiveRain = req.rain_mm_hr * (1 + (req.rain_increase_pct || 0) / 100);
  const effectiveSurge = req.surge_m;
  const effectiveTide = req.tide_m + (req.sea_level_rise_m || 0);

  // Normalized distance in hazard space to the 3 presets per SPEC §5.1:
  // Normal: rain=10, surge=0.0, tide=0.5
  // Heavy rain: rain=90, surge=0.0, tide=1.0
  // Compound event (extreme): rain=90, surge=2.5, tide=3.0
  const dNormal =
    Math.pow((effectiveRain - 10) / 125, 2) +
    Math.pow((effectiveSurge - 0.0) / 4, 2) +
    Math.pow((effectiveTide - 0.5) / 4, 2);

  const dHeavy =
    Math.pow((effectiveRain - 90) / 125, 2) +
    Math.pow((effectiveSurge - 0.0) / 4, 2) +
    Math.pow((effectiveTide - 1.0) / 4, 2);

  const dCompound =
    Math.pow((effectiveRain - 90) / 125, 2) +
    Math.pow((effectiveSurge - 2.5) / 4, 2) +
    Math.pow((effectiveTide - 3.0) / 4, 2);

  let mod;
  if (dNormal <= dHeavy && dNormal <= dCompound) {
    mod = await import("../mock/simulate_normal.json");
  } else if (dCompound <= dHeavy) {
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
  const isAllClear =
    req.simulation.risk?.level === "Low" ||
    (req.simulation.cascade?.metrics?.hospitals_isolated === 0 &&
      req.simulation.cascade?.metrics?.zones_cut_off === 0 &&
      (req.simulation.flood?.roads_closed_pct || 0) < 0.5);

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

  // Plausible facility associations for realistic citizen messages
  const nearestHospitals: Record<string, string> = {
    z1: "Lokmanya Tilak Municipal General Hospital (Sion Hospital)",
    z2: "Lokmanya Tilak Municipal General Hospital (Sion Hospital)",
    z3: "Bhabha Hospital (Kurla)",
    z4: "Surana Sethia Hospital",
    z5: "Asian Heart Institute",
    z6: "Guru Nanak Hospital",
    z7: "K. J. Somaiya Hospital",
    z8: "Lokmanya Tilak Municipal General Hospital (Sion Hospital)",
    z9: "S. L. Raheja Hospital",
    z10: "K. J. Somaiya Hospital",
  };

  const nearestShelters: Record<string, string> = {
    z1: "Little Angels' High School",
    z2: "Little Angels' High School",
    z3: "Municipal School Kurla",
    z4: "Municipal School Kurla",
    z5: "Sevadaan Special School",
    z6: "Guru Nanak High School",
    z7: "Chunabhatti Welfare Centre",
    z8: "Matunga Community Hall",
    z9: "Mahim Municipal School",
    z10: "Wadala Municipal School",
  };

  const nearestHospital =
    nearestHospitals[zoneId] || "Lokmanya Tilak Municipal General Hospital (Sion Hospital)";
  const nearestShelter =
    nearestShelters[zoneId] || "Little Angels' High School";

  if (isAllClear) {
    if (req.mode === "authority") {
      const authPlan: AuthorityPlanResponse = {
        mode: "authority",
        source: "template",
        actions: [
          {
            rank: 1,
            action: "Continue monitoring",
            target: "All zones",
            reason: "No closed roads and all hospitals reachable",
            est_people: 0,
          },
        ],
        summary:
          "Compound threat level: Low. No roads closed, all hospitals reachable. No action required. Continue monitoring.",
      };
      return authPlan;
    }

    // Citizen mode - all clear
    const citPlan: CitizenPlanResponse = {
      mode: "citizen",
      source: "template",
      zone: zoneName,
      message: `${zoneName}: No flooding impact right now. Threat level: Low. All nearby roads are open. Your nearest hospital is ${nearestHospital}. Stay informed and check back if conditions change.`,
      facts: {
        nearest_hospital: nearestHospital,
        nearest_shelter: nearestShelter,
        closed_roads: ["No roads closed"],
      },
    };
    return citPlan;
  }

  // Active flood / compound event plans
  if (req.mode === "authority") {
    const closedPct = Math.round(req.simulation.flood?.roads_closed_pct || 24);
    const isolatedHCount = req.simulation.cascade?.metrics?.hospitals_isolated || 5;
    const cutOffZCount = req.simulation.cascade?.metrics?.zones_cut_off || 5;

    const authPlan: AuthorityPlanResponse = {
      mode: "authority",
      source: "template",
      actions: [
        {
          rank: 1,
          action: "Pre-position ambulance at nearest operational hospital",
          target: "Lokmanya Tilak Municipal General Hospital (Sion Hospital)",
          reason: "Critical hospital access corridors threatened by flood depth > 0.3m",
          est_people: 700000,
        },
        {
          rank: 2,
          action: "Pre-position ambulance at nearest operational hospital",
          target: "Surana Sethia Hospital",
          reason: "Route from Kurla West extended by detour; 320,000 residents affected",
          est_people: 320000,
        },
        {
          rank: 3,
          action: "Evacuate zone and open emergency shelter",
          target: "Wadala",
          reason: "Zone cut off from all hospitals; 160,000 residents at risk",
          est_people: 160000,
        },
        {
          rank: 4,
          action: "Open emergency evacuation shelters",
          target: "Sevadaan Special School & Little Angels High School",
          reason: "Serve evacuees from low-lying areas cut off by flood water",
          est_people: 160000,
        },
        {
          rank: 5,
          action: "Close and signpost closed roads",
          target: "Western Express Highway & L.B.S. Marg",
          reason: `Water depth > 0.3m exceeding vehicular safety limits (${closedPct}% closed)`,
          est_people: 650000,
        },
      ],
      summary: `Compound threat level: ${
        req.simulation.risk?.level || "Severe"
      }. ${isolatedHCount} hospital(s) isolated. ${cutOffZCount} zone(s) cut off. Pre-position medical transports, deploy emergency pumps, and activate safe rerouting via high-ground bridges.`,
    };
    return authPlan;
  }

  // Citizen mode - active hazard
  const closedRoadsPct = Math.round(req.simulation.flood?.roads_closed_pct || 24);
  const citPlan: CitizenPlanResponse = {
    mode: "citizen",
    source: "template",
    zone: zoneName,
    message: `⚡ ${zoneName}: REROUTING IN EFFECT. Threat level: ${
      req.simulation.risk?.level || "Severe"
    }. Your nearest accessible hospital is ${nearestHospital}. Nearest shelter: ${nearestShelter}. Avoid flooded roads. Follow authority instructions.`,
    facts: {
      nearest_hospital: nearestHospital,
      nearest_shelter: nearestShelter,
      closed_roads: [
        `about ${closedRoadsPct}% of roads in the study area are closed`,
        "L.B.S. Marg (traffic stalled)",
        "Local underpasses submerged > 0.3m",
      ],
    },
  };
  return citPlan;
}

// ── Public API functions ────────────────────────────────────────────────────

export async function getRegion(): Promise<RegionResponse> {
  if (isMockActive()) {
    return loadMockRegion();
  }
  try {
    const res = await fetchWithTimeout(`${API_BASE}/region`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    notifyBackendSuccess();
    return data;
  } catch (err) {
    console.warn("[ClimaGuard API] Backend unreachable or timed out for /region. Switching to mock mode.", err);
    switchToMockMode();
    return loadMockRegion();
  }
}

export async function simulate(req: SimulateRequest): Promise<SimulateResponse> {
  if (isMockActive()) {
    return loadMockSimulate(req);
  }
  try {
    const res = await fetchWithTimeout(`${API_BASE}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    notifyBackendSuccess();
    return data;
  } catch (err) {
    console.warn("[ClimaGuard API] Backend unreachable or timed out for /simulate. Switching to mock mode.", err);
    switchToMockMode();
    return loadMockSimulate(req);
  }
}

export async function getPlan(req: PlanRequest): Promise<PlanResponse> {
  if (isMockActive()) {
    const mock = loadMockPlan(req);
    console.log("[POST /api/plan mock request body]:", req);
    console.log("[POST /api/plan mock response]:", mock);
    return mock;
  }
  try {
    console.log("[POST /api/plan request body]:", req);
    const res = await fetchWithTimeout(`${API_BASE}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    console.log("[POST /api/plan response]:", data);
    notifyBackendSuccess();
    return data;
  } catch (err) {
    console.warn("[ClimaGuard API] Backend unreachable or timed out for /plan. Switching to mock mode.", err);
    switchToMockMode();
    return loadMockPlan(req);
  }
}

export async function getWeatherLive(
  lat = 19.05,
  lon = 72.86
): Promise<WeatherResponse> {
  if (isMockActive()) {
    return {
      rain_mm_hr: 45.0,
      source: "cache",
      fetched_at: "2024-07-26T08:30:00Z",
    };
  }
  try {
    const res = await fetchWithTimeout(`${API_BASE}/weather/live?lat=${lat}&lon=${lon}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    notifyBackendSuccess();
    return data;
  } catch (err) {
    console.warn("[ClimaGuard API] Backend unreachable or timed out for /weather/live. Switching to mock mode.", err);
    switchToMockMode();
    return {
      rain_mm_hr: 45.0,
      source: "cache",
      fetched_at: "2024-07-26T08:30:00Z",
    };
  }
}
