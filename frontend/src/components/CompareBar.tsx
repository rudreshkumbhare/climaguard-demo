import React from 'react';
import type { RiskDetail } from '../types';

interface CompareBarProps {
  risk?: RiskDetail;
}

export const CompareBar: React.FC<CompareBarProps> = ({ risk }) => {
  const compound = risk ? Math.min(100, Math.round(risk.compound * 100)) : 0;
  const baseline = risk ? Math.min(100, Math.round(risk.baseline * 100)) : 0;
  const synergyGap = Math.max(0, compound - baseline);

  return (
    <div className="bg-dark-800 rounded-lg p-3.5 border border-dark-600 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold tracking-wider uppercase text-gray-400">
          Compound vs. Baseline
        </span>
        <span className="text-[11px] font-medium text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/50">
          +{synergyGap}% Synergy
        </span>
      </div>

      <div className="space-y-2.5">
        {/* Baseline Bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">Naive Average Baseline</span>
            <span className="font-semibold text-gray-300">{baseline}%</span>
          </div>
          <div className="w-full bg-dark-700 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-slate-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(2, baseline)}%` }}
            />
          </div>
        </div>

        {/* Compound Bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-white font-medium">ClimaGuard Compound</span>
            <span className="font-bold text-red-400">{compound}%</span>
          </div>
          <div className="w-full bg-dark-700 h-2.5 rounded-full overflow-hidden flex">
            <div
              className="bg-red-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(2, compound)}%` }}
            />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 mt-2.5 leading-relaxed">
        {synergyGap > 5
          ? `Compound modeling reveals a ${synergyGap}% surge in threat beyond naive averages due to coincident rainfall and coastal high tides.`
          : 'Normal conditions show baseline tracking closely with compound indicators.'}
      </p>
    </div>
  );
};
