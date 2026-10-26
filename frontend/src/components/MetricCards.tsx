import React from 'react';
import type { SimulateResponse } from '../types';

interface MetricCardsProps {
  simulation?: SimulateResponse;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ simulation }) => {
  const cascade = simulation?.cascade;
  const flood = simulation?.flood;

  const hospitalsIsolated = cascade?.metrics.hospitals_isolated ?? 0;
  const totalHospitals = cascade?.hospitals.length ?? 8;
  const zonesCutOff = cascade?.metrics.zones_cut_off ?? 0;
  const totalZones = cascade?.zones.length ?? 10;
  const populationIsolated = cascade?.metrics.population_isolated ?? 0;
  const roadsClosedPct = flood?.roads_closed_pct ?? 0;
  const avgExtraKm = cascade?.metrics.avg_extra_km ?? 0;
  const computeMs = simulation?.compute_ms ?? 0;

  return (
    <div className="grid grid-cols-2 gap-2">
      {/* 1. Hospitals Isolated */}
      <div className="bg-dark-800 p-2.5 rounded-lg border border-dark-600">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
          Hospitals Isolated
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-lg font-black ${
              hospitalsIsolated > 0 ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            {hospitalsIsolated}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            / {totalHospitals}
          </span>
        </div>
      </div>

      {/* 2. Zones Cut Off */}
      <div className="bg-dark-800 p-2.5 rounded-lg border border-dark-600">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
          Zones Cut Off
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-lg font-black ${
              zonesCutOff > 0 ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            {zonesCutOff}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            / {totalZones}
          </span>
        </div>
      </div>

      {/* 3. Population Isolated */}
      <div className="bg-dark-800 p-2.5 rounded-lg border border-dark-600">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
          Pop. Isolated
        </div>
        <div className="text-lg font-black text-amber-400 tracking-tight">
          {populationIsolated.toLocaleString()}
        </div>
      </div>

      {/* 4. Roads Closed % */}
      <div className="bg-dark-800 p-2.5 rounded-lg border border-dark-600">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
          Roads Closed
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-lg font-black ${
              roadsClosedPct > 15
                ? 'text-red-400'
                : roadsClosedPct > 5
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            {roadsClosedPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 5. Avg Extra Distance */}
      <div className="bg-dark-800 p-2.5 rounded-lg border border-dark-600">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
          Avg. Extra Distance
        </div>
        <div className="text-lg font-black text-sky-400 tracking-tight">
          {avgExtraKm > 0 ? `+${avgExtraKm.toFixed(1)} km` : '0.0 km'}
        </div>
      </div>

      {/* 6. Compute Time */}
      <div className="bg-dark-800 p-2.5 rounded-lg border border-dark-600">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
          Compute Time
        </div>
        <div className="text-lg font-black text-emerald-400 tracking-tight">
          {computeMs > 0 ? `${computeMs.toFixed(1)} ms` : '--'}
        </div>
      </div>
    </div>
  );
};
