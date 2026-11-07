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
  const strokeWidth = 4.5;
  const radius = 17;
  const circumference = 2 * Math.PI * radius; // ~106.8
  const strokeDashoffset = circumference * (1 - compound / 100);
  const ptsDiff = Math.max(0, compound - baseline);

  return (
    <div className="bg-dark-800 rounded-lg px-3 py-2 border border-dark-600 shadow-sm flex items-center justify-between gap-3 shrink-0">
      {/* Mini Ring Gauge & Main Value */}
      <div className="flex items-center gap-2.5">
        <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
          <svg className="w-full h-full -rotate-90">
            {/* Background Track Circle */}
            <circle
              cx="20"
              cy="20"
              r={radius}
              fill="none"
              stroke="#21262d"
              strokeWidth={strokeWidth}
            />
            {/* Active Colored Arc */}
            <circle
              cx="20"
              cy="20"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-500 ease-out"
            />
          </svg>
          <span className="absolute text-[11px] font-black text-white">
            {compound}%
          </span>
        </div>

        {/* Labels & Comparison */}
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-gray-300">
            Compound Threat
          </div>
          <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
            <span>
              Baseline: <strong className="text-gray-300 font-medium">{baseline}%</strong>
            </span>
            <span className="text-sky-400 font-semibold text-[10px] bg-sky-950/60 px-1.5 py-0.2 rounded border border-sky-800/50">
              +{ptsDiff} pts synergy
            </span>
          </div>
        </div>
      </div>

      {/* Level Badge */}
      <span
        className="px-2.5 py-1 rounded text-xs font-bold border tracking-wider uppercase shrink-0 shadow-sm"
        style={{
          borderColor: `${color}66`,
          backgroundColor: `${color}20`,
          color: color,
        }}
      >
        {level}
      </span>
    </div>
  );
};
