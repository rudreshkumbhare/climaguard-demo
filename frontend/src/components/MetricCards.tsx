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

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {/* Hospitals Isolated */}
      <div className="bg-dark-800 p-3 rounded-lg border border-dark-600">
        <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">
          Hospitals Isolated
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-xl font-bold ${
              hospitalsIsolated > 0 ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            {hospitalsIsolated}
          </span>
          <span className="text-xs text-gray-400">/ {totalHospitals}</span>
        </div>
      </div>

      {/* Roads Closed */}
      <div className="bg-dark-800 p-3 rounded-lg border border-dark-600">
        <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">
          Roads Closed
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-xl font-bold ${
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

      {/* Population Cut Off */}
      <div className="bg-dark-800 p-3 rounded-lg border border-dark-600">
        <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">
          Pop. Cut Off
        </div>
        <div className="text-xl font-bold text-amber-400">
          {populationIsolated.toLocaleString()}
        </div>
      </div>

      {/* Zones Cut Off */}
      <div className="bg-dark-800 p-3 rounded-lg border border-dark-600">
        <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">
          Zones Cut Off
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-xl font-bold ${
              zonesCutOff > 0 ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            {zonesCutOff}
          </span>
          <span className="text-xs text-gray-400">/ {totalZones}</span>
        </div>
      </div>
    </div>
  );
};
