import React from 'react';
import type { SimulateRequest, ZoneInfo } from '../types';
import presetsData from '../data/presets.json';

interface ControlPanelProps {
  params: SimulateRequest;
  onChangeParams: (params: SimulateRequest) => void;
  mode: 'authority' | 'citizen';
  onChangeMode: (mode: 'authority' | 'citizen') => void;
  selectedZone: string;
  onChangeZone: (zoneId: string) => void;
  zones: ZoneInfo[];
  onFetchLiveWeather: () => void;
  liveWeatherLoading: boolean;
  activePreset: string | null;
  onSelectPreset: (name: string) => void;
  weatherSource?: 'live' | 'cache' | null;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  params,
  onChangeParams,
  mode,
  onChangeMode,
  selectedZone,
  onChangeZone,
  zones,
  onFetchLiveWeather,
  liveWeatherLoading,
  activePreset,
  onSelectPreset,
  weatherSource,
}) => {
  const updateField = (field: keyof SimulateRequest, value: number) => {
    onChangeParams({
      ...params,
      [field]: value,
    });
  };

  return (
    <aside className="w-[300px] min-w-[300px] max-w-[300px] h-full bg-dark-800 border-r border-dark-600 flex flex-col shrink-0 select-none overflow-y-auto">
      <div className="px-3.5 py-3 space-y-3">
        {/* Header & Mode Switch */}
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Operation Mode
          </div>
          <div className="grid grid-cols-2 p-0.5 bg-dark-900 rounded-lg border border-dark-700">
            <button
              type="button"
              onClick={() => onChangeMode('authority')}
              className={`py-1 text-xs font-semibold rounded-md transition-all ${
                mode === 'authority'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Authority
            </button>
            <button
              type="button"
              onClick={() => onChangeMode('citizen')}
              className={`py-1 text-xs font-semibold rounded-md transition-all ${
                mode === 'citizen'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Citizen
            </button>
          </div>
        </div>

        {/* Zone Selector (Citizen Mode only) */}
        {mode === 'citizen' && (
          <div className="bg-dark-900/60 p-2.5 rounded-lg border border-dark-700/80 space-y-1">
            <label
              htmlFor="zone-select"
              className="block text-[10px] font-semibold text-sky-400 uppercase tracking-wide"
            >
              Select Citizen Zone
            </label>
            <select
              id="zone-select"
              value={selectedZone}
              onChange={(e) => onChangeZone(e.target.value)}
              className="w-full bg-dark-800 border border-dark-600 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
            >
              {zones.length > 0 ? (
                zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} (Pop: {(z.population / 1000).toFixed(0)}k)
                  </option>
                ))
              ) : (
                <>
                  <option value="z1">Dharavi</option>
                  <option value="z2">Sion</option>
                  <option value="z3">Kurla West</option>
                </>
              )}
            </select>
          </div>
        )}

        {/* Scenario Presets */}
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Scenarios
          </div>
          <div className="grid grid-cols-1 gap-1">
            {Object.keys(presetsData).map((presetName) => {
              const isSelected = activePreset === presetName;
              return (
                <button
                  key={presetName}
                  type="button"
                  onClick={() => onSelectPreset(presetName)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg text-left transition-all border ${
                    isSelected
                      ? 'bg-sky-950/80 text-sky-200 border-sky-600'
                      : 'bg-dark-900/70 text-gray-300 border-dark-700 hover:border-dark-600 hover:bg-dark-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{presetName}</span>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Weather Button */}
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onFetchLiveWeather}
            disabled={liveWeatherLoading}
            className="w-full py-1.5 px-2.5 text-xs font-semibold rounded-lg bg-dark-700 hover:bg-dark-600 border border-dark-600 text-sky-300 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            <span>☁️</span>
            {liveWeatherLoading ? 'Fetching Live Data…' : 'Use live weather'}
          </button>
          {weatherSource && (
            <div className="flex items-center justify-center">
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded border text-center leading-tight ${
                  weatherSource === 'live'
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/70'
                    : 'bg-amber-950/70 text-amber-300 border-amber-700/70'
                }`}
              >
                {weatherSource === 'live'
                  ? 'Live (Open-Meteo)'
                  : 'Replaying recorded monsoon sample (45 mm/hr)'}
              </span>
            </div>
          )}
        </div>

        {/* Primary Hazard Sliders */}
        <div className="space-y-2.5 pt-2 border-t border-dark-700">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Primary Hazards
          </div>

          {/* Rain */}
          <div className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-300 text-[11px]">Rainfall</span>
              <span className="font-semibold text-white text-[11px]">
                {params.rain_mm_hr} <span className="text-gray-400 font-normal">mm/hr</span>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="150"
              step="1"
              value={params.rain_mm_hr}
              onChange={(e) => updateField('rain_mm_hr', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-gray-500">
              <span>0</span>
              <span>75</span>
              <span>150</span>
            </div>
          </div>

          {/* Storm Surge */}
          <div className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-300 text-[11px]">Storm Surge</span>
              <span className="font-semibold text-white text-[11px]">
                {params.surge_m.toFixed(1)} <span className="text-gray-400 font-normal">m</span>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={params.surge_m}
              onChange={(e) => updateField('surge_m', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-gray-500">
              <span>0.0m</span>
              <span>1.5m</span>
              <span>3.0m</span>
            </div>
          </div>

          {/* High Tide */}
          <div className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-300 text-[11px]">Astronomical Tide</span>
              <span className="font-semibold text-white text-[11px]">
                {params.tide_m.toFixed(1)} <span className="text-gray-400 font-normal">m</span>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={params.tide_m}
              onChange={(e) => updateField('tide_m', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-gray-500">
              <span>0.0m</span>
              <span>1.5m</span>
              <span>3.0m</span>
            </div>
          </div>
        </div>

        {/* What-If Scenarios Sliders */}
        <div className="space-y-2.5 pt-2 border-t border-dark-700">
          <div className="text-[10px] font-semibold text-amber-400/90 uppercase tracking-wider">
            What-If Stressors
          </div>

          {/* Rain Increase % */}
          <div className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-300 text-[11px]">Rain Increase</span>
              <span className="font-semibold text-amber-400 text-[11px]">
                +{params.rain_increase_pct}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={params.rain_increase_pct}
              onChange={(e) => updateField('rain_increase_pct', parseFloat(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[9px] text-gray-500">
              <span>+0%</span>
              <span>+25%</span>
              <span>+50%</span>
            </div>
          </div>

          {/* Sea Level Rise */}
          <div className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-300 text-[11px]">Sea Level Rise</span>
              <span className="font-semibold text-amber-400 text-[11px]">
                +{params.sea_level_rise_m.toFixed(1)} m
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={params.sea_level_rise_m}
              onChange={(e) => updateField('sea_level_rise_m', parseFloat(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[9px] text-gray-500">
              <span>+0.0m</span>
              <span>+1.0m</span>
              <span>+2.0m</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
