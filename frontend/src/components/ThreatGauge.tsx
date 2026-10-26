import React from 'react';
import type { RiskDetail } from '../types';

interface ThreatGaugeProps {
  risk?: RiskDetail;
}

export const ThreatGauge: React.FC<ThreatGaugeProps> = ({ risk }) => {
  const level = risk?.level || 'Low';
  const compound = risk ? Math.min(100, Math.max(0, Math.round(risk.compound * 100))) : 0;
  const baseline = risk ? Math.min(100, Math.max(0, Math.round(risk.baseline * 100))) : 0;

  const getColor = (lvl: string) => {
    switch (lvl.toLowerCase()) {
      case 'severe':
        return '#ef4444'; // Red
      case 'high':
        return '#f97316'; // Orange
      case 'moderate':
        return '#eab308'; // Yellow
      default:
        return '#22c55e'; // Green
    }
  };

  const color = getColor(level);
  const strokeWidth = 10;
  const radius = 54;
  const arcLength = Math.PI * radius; // ~169.6
  const dashOffset = arcLength * (1 - compound / 100);

  return (
    <div className="bg-dark-800 rounded-lg p-3.5 border border-dark-600 shadow-sm flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold tracking-wider uppercase text-gray-400">
          Compound Threat Gauge
        </span>
        <span
          className="px-2 py-0.5 rounded text-[11px] font-bold border tracking-wide uppercase"
          style={{
            borderColor: `${color}66`,
            backgroundColor: `${color}20`,
            color: color,
          }}
        >
          {level}
        </span>
      </div>

      {/* Semicircle SVG Ring Gauge */}
      <div className="relative w-44 h-24 flex items-center justify-center mt-1">
        <svg viewBox="0 0 140 78" className="w-full h-full overflow-visible">
          {/* Background Track Arc */}
          <path
            d="M 16 70 A 54 54 0 0 1 124 70"
            fill="none"
            stroke="#21262d"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Active Colored Arc */}
          <path
            d="M 16 70 A 54 54 0 0 1 124 70"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={arcLength}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Center Value */}
        <div className="absolute bottom-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black tracking-tight text-white leading-none">
            {compound}%
          </span>
          <span className="text-[10px] text-gray-400 font-medium mt-0.5">
            Compound Threat
          </span>
        </div>
      </div>

      {/* Footer Metrics */}
      <div className="w-full flex justify-between items-center text-[11px] pt-2 border-t border-dark-700/60 mt-1">
        <span className="text-gray-400">
          Baseline avg: <strong className="text-gray-200">{baseline}%</strong>
        </span>
        <span className="text-gray-400">
          Synergy delta:{' '}
          <strong className="text-sky-400">
            +{Math.max(0, compound - baseline)} pts
          </strong>
        </span>
      </div>
    </div>
  );
};
