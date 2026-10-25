import React from 'react';
import type { PlanResponse } from '../types';

interface PlanPanelProps {
  plan?: PlanResponse | null;
  loading?: boolean;
}

export const PlanPanel: React.FC<PlanPanelProps> = ({ plan, loading }) => {
  if (loading && !plan) {
    return (
      <div className="bg-dark-800 rounded-lg p-4 border border-dark-600 animate-pulse text-sm text-gray-400">
        Generating response plan…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="bg-dark-800 rounded-lg p-4 border border-dark-600 text-xs text-gray-400">
        Plan will appear once simulation runs.
      </div>
    );
  }

  const isAuthority = plan.mode === 'authority';
  const isLLM = plan.source === 'llm';

  return (
    <div className="bg-dark-800 rounded-lg p-3.5 border border-dark-600 flex flex-col flex-1 min-h-0 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-dark-700">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">
            {isAuthority ? 'Authority Action Plan' : 'Citizen Safety Advisory'}
          </span>
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            isLLM
              ? 'bg-purple-950/60 text-purple-300 border-purple-700/60'
              : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
          }`}
        >
          {isLLM ? '✨ AI rewritten' : '📋 Template verified'}
        </span>
      </div>

      {/* Content */}
      <div className="overflow-y-auto pr-1 space-y-3 flex-1 text-xs">
        {isAuthority ? (
          <>
            {plan.summary && (
              <div className="p-2.5 rounded bg-dark-700/70 text-gray-300 border border-dark-600/60 leading-relaxed font-sans">
                {plan.summary}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Ranked Response Actions:
              </div>
              {plan.actions.map((act) => (
                <div
                  key={act.rank}
                  className="bg-dark-700/50 p-2.5 rounded border border-dark-600/50 space-y-1"
                >
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 font-bold text-[10px] flex items-center justify-center">
                      {act.rank}
                    </span>
                    <span className="font-semibold text-gray-200">
                      {act.action}
                    </span>
                  </div>
                  <div className="text-gray-400 text-[11px] pl-6">
                    <strong className="text-gray-300">Target:</strong> {act.target}
                  </div>
                  <div className="text-gray-400 text-[11px] pl-6">
                    <strong className="text-gray-300">Reason:</strong> {act.reason}
                  </div>
                  {act.est_people > 0 && (
                    <div className="text-amber-400/90 text-[10px] pl-6 font-medium">
                      Est. impacted: {act.est_people.toLocaleString()} residents
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="bg-sky-950/40 border border-sky-800/50 p-3 rounded text-sky-200 leading-relaxed">
              <div className="font-semibold text-sky-300 mb-1">
                Zone: {plan.zone}
              </div>
              <p>{plan.message}</p>
            </div>

            <div className="bg-dark-700/60 p-2.5 rounded border border-dark-600 space-y-2">
              <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                Key Facts:
              </div>
              <div className="text-[11px] text-gray-300">
                <span className="text-gray-400">Nearest Open Hospital:</span>{' '}
                <span className="font-medium text-emerald-400">
                  {plan.facts.nearest_hospital || 'None reachable'}
                </span>
              </div>
              <div className="text-[11px] text-gray-300">
                <span className="text-gray-400">Nearest Shelter:</span>{' '}
                <span className="font-medium text-sky-400">
                  {plan.facts.nearest_shelter || 'None designated'}
                </span>
              </div>
              {plan.facts.closed_roads.length > 0 && (
                <div className="text-[11px] text-gray-300">
                  <span className="text-gray-400">Impassable Corridors:</span>
                  <ul className="list-disc list-inside mt-1 text-red-400/90 space-y-0.5">
                    {plan.facts.closed_roads.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
