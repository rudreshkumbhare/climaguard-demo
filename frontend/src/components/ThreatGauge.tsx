import React from 'react';
import type { RiskDetail } from '../types';

interface ThreatGaugeProps {
  risk?: RiskDetail;
}

export const ThreatGauge: React.FC<ThreatGaugeProps> = ({ risk }) => {
  const level = risk?.level || 'Low';
  const compound = risk ? Math.round(risk.compound * 100) : 0;
  const baseline = risk ? Math.round(risk.baseline * 100) : 0;

  const getLevelColor = (lvl: string) => {
    switch (lvl.toLowerCase()) {
      case 'severe':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'high':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'moderate':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      default:
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    }
  };

  return (
    <div className="bg-dark-800 rounded-lg p-3.5 border border-dark-600 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold tracking-wider uppercase text-gray-400">
          Threat Assessment
        </span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold border ${getLevelColor(
            level
          )}`}
        >
          {level}
        </span>
      </div>

      <div className="flex items-baseline justify-between mt-1">
        <div>
          <span className="text-2xl font-bold tracking-tight text-white">
            {compound}%
          </span>
          <span className="text-xs text-gray-400 ml-1.5 font-normal">
            compound index
          </span>
        </div>
        <div className="text-xs text-gray-400">
          baseline: <span className="text-gray-200 font-medium">{baseline}%</span>
        </div>
      </div>

      <div className="w-full bg-dark-700 h-2 rounded-full mt-2.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            level.toLowerCase() === 'severe'
              ? 'bg-red-500'
              : level.toLowerCase() === 'high'
              ? 'bg-amber-500'
              : level.toLowerCase() === 'moderate'
              ? 'bg-yellow-400'
              : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(100, Math.max(2, compound))}%` }}
        />
      </div>
    </div>
  );
};
