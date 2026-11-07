import React from 'react';
import type { RiskDetail } from '../types';

interface CompareBarProps {
  risk?: RiskDetail;
}

export const CompareBar: React.FC<CompareBarProps> = ({ risk }) => {
  const compound = risk ? Math.min(100, Math.round(risk.compound * 100)) : 0;
  const baseline = risk ? Math.min(100, Math.round(risk.baseline * 100)) : 0;
  const ptsDiff = Math.max(0, compound - baseline);

  return (
    <div className="bg-dark-800 rounded-lg p-2.5 border border-dark-600 shadow-sm shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold tracking-wider uppercase text-gray-300">
          Compound vs. Baseline Model
        </span>
        <span className="text-[10px] font-bold text-sky-300 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-700/60 shadow-sm">
          +{ptsDiff} pts synergy
        </span>
      </div>

      <div className="space-y-1.5">
        {/* Independent Averaging (Baseline) */}
        <div>
          <div className="flex justify-between items-baseline text-[10px] mb-0.5">
            <span className="text-gray-400">Independent averaging</span>
            <span className="font-bold text-gray-300 text-xs">{baseline}%</span>
          </div>
          <div className="w-full bg-dark-700 h-2.5 rounded-full overflow-hidden p-0.5">
            <div
              className="bg-slate-400 h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.max(2, baseline)}%` }}
            />
          </div>
        </div>

        {/* ClimaGuard Compound Model */}
        <div>
          <div className="flex justify-between items-baseline text-[10px] mb-0.5">
            <span className="text-white font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              ClimaGuard compound model
            </span>
            <span className="font-extrabold text-red-400 text-xs">{compound}%</span>
          </div>
          <div className="w-full bg-dark-700 h-2.5 rounded-full overflow-hidden p-0.5">
            <div
              className="bg-gradient-to-r from-red-600 to-red-500 h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_6px_rgba(239,68,68,0.5)]"
              style={{ width: `${Math.max(2, compound)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
