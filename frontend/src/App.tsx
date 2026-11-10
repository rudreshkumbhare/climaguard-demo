import React, { useState, useEffect, useRef } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { MapView } from './components/MapView';
import { ThreatGauge } from './components/ThreatGauge';
import { CompareBar } from './components/CompareBar';
import { MetricCards } from './components/MetricCards';
import { PlanPanel } from './components/PlanPanel';
import {
  getRegion,
  simulate,
  getPlan,
  getWeatherLive,
  getBackendStatus,
  subscribeBackendStatus,
  type BackendStatus,
} from './api';
import type {
  RegionResponse,
  SimulateRequest,
  SimulateResponse,
  PlanResponse,
  PresetsMap,
  WeatherResponse,
} from './types';
import presetsDataRaw from './data/presets.json';

const presetsData = presetsDataRaw as PresetsMap;

export const App: React.FC = () => {
  // Region & initial setup
  const [region, setRegion] = useState<RegionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Simulation parameters (defaults to Normal preset)
  const initialPreset = 'Normal';
  const [activePreset, setActivePreset] = useState<string | null>(initialPreset);
  const [params, setParams] = useState<SimulateRequest>({
    rain_mm_hr: presetsData[initialPreset]?.rain_mm_hr ?? 10,
    surge_m: presetsData[initialPreset]?.surge_m ?? 0.0,
    tide_m: presetsData[initialPreset]?.tide_m ?? 0.5,
    rain_increase_pct: 0,
    sea_level_rise_m: 0,
  });

  // Mode and Zone state
  const [mode, setMode] = useState<'authority' | 'citizen'>('authority');
  const [selectedZone, setSelectedZone] = useState<string>('z1');

  // Simulation & Plan responses
  const [simulation, setSimulation] = useState<SimulateResponse | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);

  // Loading states
  const [simLoading, setSimLoading] = useState<boolean>(false);
  const [planLoading, setPlanLoading] = useState<boolean>(false);
  const [liveWeatherLoading, setLiveWeatherLoading] = useState<boolean>(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [weatherInfo, setWeatherInfo] = useState<WeatherResponse | null>(null);

  // Ref to hold previous simulation response while recomputing
  const previousSimulation = useRef<SimulateResponse | null>(null);

  // Backend connection status: 'connecting' | 'live' | 'mock'
  const [backendStatus, setBackendStatus] = useState<BackendStatus>(getBackendStatus());

  useEffect(() => {
    const unsubscribe = subscribeBackendStatus(setBackendStatus);
    return unsubscribe;
  }, []);

  // 1. Fetch static region data once on mount
  useEffect(() => {
    let mounted = true;

    getRegion()
      .then((data) => {
        if (mounted) {
          setRegion(data);
          if (data.zones && data.zones.length > 0) {
            setSelectedZone(data.zones[0].id);
          }
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(`Region load failed: ${err.message || String(err)}`);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Debounced simulation trigger (300 ms debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSimLoading(true);
      setError(null);

      simulate(params)
        .then((simResult) => {
          setSimulation(simResult);
          previousSimulation.current = simResult;
        })
        .catch((err) => {
          setError(`Simulation error: ${err.message || String(err)}`);
        })
        .finally(() => {
          setSimLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [params]);

  // 3. Whenever simulation or mode or selectedZone changes, update the plan (debounced)
  useEffect(() => {
    if (!simulation) return;

    setPlanLoading(true);
    setPlanError(null);
    const timer = setTimeout(() => {
      getPlan({
        simulation,
        mode,
        zone_id: mode === 'citizen' ? selectedZone : undefined,
      })
        .then((planResult) => {
          setPlan(planResult);
          setPlanError(null);
        })
        .catch((err) => {
          const msg = err.message || String(err);
          setPlanError(msg);
          setError(`Plan error: ${msg}`);
        })
        .finally(() => {
          setPlanLoading(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [simulation, mode, selectedZone]);

  // Preset selection handler
  const handleSelectPreset = (presetName: string) => {
    const p = presetsData[presetName];
    if (p) {
      setActivePreset(presetName);
      setParams({
        rain_mm_hr: p.rain_mm_hr,
        surge_m: p.surge_m,
        tide_m: p.tide_m,
        rain_increase_pct: 0,
        sea_level_rise_m: 0,
      });
    }
  };

  // Params change from sliders handler
  const handleParamsChange = (newParams: SimulateRequest) => {
    setActivePreset(null);
    setParams(newParams);
  };

  // Fetch live weather
  const handleFetchLiveWeather = async () => {
    setLiveWeatherLoading(true);
    setError(null);
    try {
      const weather = await getWeatherLive();
      setWeatherInfo(weather);
      setActivePreset(null);
      setParams((prev) => ({
        ...prev,
        rain_mm_hr: Math.round(weather.rain_mm_hr * 10) / 10,
      }));
    } catch (err: any) {
      setError(`Weather fetch failed: ${err.message || String(err)}`);
    } finally {
      setLiveWeatherLoading(false);
    }
  };

  // Keep previous simulation visible while recomputing
  const currentSim = simulation || previousSimulation.current;

  return (
    <div className="fixed inset-0 h-full w-full flex flex-col bg-dark-900 text-gray-100 overflow-hidden font-sans">
      {/* ── Top Header Bar ──────────────────────────────────────────────── */}
      <header className="h-12 bg-dark-800 border-b border-dark-600 px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌊</span>
            <span className="font-bold tracking-tight text-white text-base">
              ClimaGuard <span className="text-sky-400">AI</span>
            </span>
          </div>
          <span className="text-[11px] text-gray-400 border-l border-dark-600 pl-3">
            Mumbai Multi-Hazard Flood & Cascade Simulator
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Subtle loading indicator */}
          {(simLoading || planLoading) && (
            <div className="flex items-center gap-2 text-xs text-sky-400 bg-sky-950/60 border border-sky-800/60 px-2.5 py-1 rounded-full animate-pulse">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>Computing scenario…</span>
            </div>
          )}

          {/* Engine Mode Badge */}
          {backendStatus === 'connecting' ? (
            <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border bg-dark-700/80 text-gray-300 border-dark-500 flex items-center gap-1.5 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              Connecting to server...
            </span>
          ) : backendStatus === 'live' ? (
            <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border bg-emerald-950/50 text-emerald-300 border-emerald-700/60 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Live Backend
            </span>
          ) : (
            <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border bg-amber-950/50 text-amber-300 border-amber-700/60 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Demo mode: cached scenarios
            </span>
          )}

          {/* Weather Source Chip (next to Live Backend badge after click) */}
          {weatherInfo && (
            <span
              className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                weatherInfo.source === 'live'
                  ? 'bg-sky-950/50 text-sky-300 border-sky-700/60'
                  : 'bg-amber-950/50 text-amber-300 border-amber-700/60'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  weatherInfo.source === 'live' ? 'bg-sky-400' : 'bg-amber-400'
                }`}
              />
              {weatherInfo.source === 'live'
                ? 'Weather: live'
                : 'Weather: recorded sample'}
            </span>
          )}
        </div>
      </header>

      {/* ── Small Error Banner (Never crashes) ─────────────────────────── */}
      {error && (
        <div className="bg-red-950/80 border-b border-red-800 text-red-200 px-4 py-1.5 text-xs flex items-center justify-between z-30 shrink-0">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-300 hover:text-white font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Main 3-Column Layout (§7) ──────────────────────────────────── */}
      <main className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Column 1: Left Controls (300px) */}
        <ControlPanel
          params={params}
          onChangeParams={handleParamsChange}
          mode={mode}
          onChangeMode={setMode}
          selectedZone={selectedZone}
          onChangeZone={setSelectedZone}
          zones={region?.zones || []}
          onFetchLiveWeather={handleFetchLiveWeather}
          liveWeatherLoading={liveWeatherLoading}
          activePreset={activePreset}
          onSelectPreset={handleSelectPreset}
          weatherSource={weatherInfo?.source || null}
        />

        {/* Column 2: Centre Map (Flexible) */}
        <MapView region={region} simulation={currentSim} />

        {/* Column 3: Right Panel (~420px) */}
        <aside className="w-[420px] min-w-[420px] max-w-[420px] h-full bg-dark-900 border-l border-dark-600 flex flex-col shrink-0 p-3 space-y-2.5 overflow-hidden select-none">
          {/* Threat Gauge */}
          <ThreatGauge risk={currentSim?.risk} />

          {/* Compare Bar (The money shot) */}
          <CompareBar risk={currentSim?.risk} />

          {/* Metric Cards */}
          <MetricCards simulation={currentSim || undefined} />

          {/* Plan Panel (Checklist or message with AI/template tag) */}
          <PlanPanel
            plan={plan}
            loading={planLoading}
            mode={mode}
            error={planError}
          />
        </aside>
      </main>

      {/* ── Footer Bar ─────────────────────────────────────────────────── */}
      <footer className="h-7 bg-dark-800 border-t border-dark-600 px-4 flex items-center justify-between text-[11px] text-gray-400 shrink-0 select-none z-20">
        <div>
          Simulation on cached Mumbai network. Parameters are scenario assumptions.
        </div>
        <div className="text-gray-400">
          ClimaGuard AI Prototype • Sion–Kurla–Dharavi–BKC
        </div>
      </footer>
    </div>
  );
};

export default App;
