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
    <div className="bg-dark-800 rounded-lg p-4 border border-dark-600 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <span className="text-xs font-bold tracking-wider uppercase text-gray-300 block">
            Compound vs. Baseline Model
          </span>
          <span className="text-[10px] text-gray-400">
            Coincident hazard multiplication
          </span>
        </div>
        <span className="text-xs font-bold text-sky-300 bg-sky-950/80 px-2.5 py-1 rounded-md border border-sky-700/60 shadow-sm">
          +{ptsDiff} pts synergy
        </span>
      </div>

      <div className="space-y-3.5">
        {/* Independent Averaging (Baseline) */}
        <div>
          <div className="flex justify-between items-baseline text-xs mb-1.5">
            <span className="text-gray-300 font-medium">Independent averaging</span>
            <span className="font-bold text-gray-300 text-sm">{baseline}%</span>
          </div>
          <div className="w-full bg-dark-700 h-3.5 rounded-full overflow-hidden p-0.5">
            <div
              className="bg-slate-400 h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.max(2, baseline)}%` }}
            />
          </div>
        </div>

        {/* ClimaGuard Compound Model */}
        <div>
          <div className="flex justify-between items-baseline text-xs mb-1.5">
            <span className="text-white font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              ClimaGuard compound model
            </span>
            <span className="font-extrabold text-red-400 text-base">{compound}%</span>
          </div>
          <div className="w-full bg-dark-700 h-3.5 rounded-full overflow-hidden p-0.5">
            <div
              className="bg-gradient-to-r from-red-600 to-red-500 h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_8px_rgba(239,68,68,0.5)]"
              style={{ width: `${Math.max(2, compound)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Prominent Caption */}
      <div className="mt-3.5 pt-2.5 border-t border-dark-700/70 text-xs text-gray-300 leading-relaxed bg-dark-900/50 p-2.5 rounded border border-dark-700">
        {ptsDiff > 0 ? (
          <span>
            Compound hazard interaction amplifies the threat by{' '}
            <strong className="text-amber-300 font-bold">+{ptsDiff} percentage points</strong>{' '}
            over naive independent averaging due to simultaneous rainfall runoff and storm surge barrier effects.
          </span>
        ) : (
          <span>
            Single-hazard baseline aligns with compound model under low-synergy assumptions.
          </span>
        )}
      </div>
    </div>
  );
};
