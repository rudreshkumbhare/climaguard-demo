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
    <div className="bg-dark-800 rounded-lg p-2 border border-dark-600 shadow-sm shrink-0 space-y-1.5">
      {/* Single row of 4 small metric tiles */}
      <div className="grid grid-cols-4 gap-1.5">
        {/* 1. Hospitals Isolated */}
        <div className="bg-dark-900/80 px-1.5 py-1.5 rounded border border-dark-700/80 text-center">
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide truncate">
            Hospitals
          </div>
          <div className="text-sm font-black mt-0.5">
            <span className={hospitalsIsolated > 0 ? 'text-red-400' : 'text-emerald-400'}>
              {hospitalsIsolated}
            </span>
            <span className="text-[10px] text-gray-500 font-normal">/{totalHospitals}</span>
          </div>
        </div>

        {/* 2. Zones Cut Off */}
        <div className="bg-dark-900/80 px-1.5 py-1.5 rounded border border-dark-700/80 text-center">
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide truncate">
            Zones Cut
          </div>
          <div className="text-sm font-black mt-0.5">
            <span className={zonesCutOff > 0 ? 'text-red-400' : 'text-emerald-400'}>
              {zonesCutOff}
            </span>
            <span className="text-[10px] text-gray-500 font-normal">/{totalZones}</span>
          </div>
        </div>

        {/* 3. Population Isolated */}
        <div className="bg-dark-900/80 px-1.5 py-1.5 rounded border border-dark-700/80 text-center">
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide truncate">
            Pop. Cut
          </div>
          <div className="text-sm font-black text-amber-400 mt-0.5 tracking-tight truncate">
            {populationIsolated >= 1000
              ? `${(populationIsolated / 1000).toFixed(0)}k`
              : populationIsolated.toLocaleString()}
          </div>
        </div>

        {/* 4. Roads Closed % */}
        <div className="bg-dark-900/80 px-1.5 py-1.5 rounded border border-dark-700/80 text-center">
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide truncate">
            Roads Closed
          </div>
          <div
            className={`text-sm font-black mt-0.5 ${
              roadsClosedPct > 15
                ? 'text-red-400'
                : roadsClosedPct > 5
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            {roadsClosedPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Footer line: avg extra distance and compute time */}
      <div className="flex items-center justify-between text-[10px] text-gray-400 px-1 pt-0.5">
        <span>
          Avg reroute: <strong className="text-sky-300">+{avgExtraKm.toFixed(1)} km</strong>
        </span>
        <span>
          Compute: <strong className="text-gray-300">{computeMs.toFixed(0)} ms</strong>
        </span>
      </div>
    </div>
  );
};
