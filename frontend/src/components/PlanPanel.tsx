import React from 'react';
import type { PlanResponse } from '../types';

interface PlanPanelProps {
  plan?: PlanResponse | null;
  loading?: boolean;
}

export const PlanPanel: React.FC<PlanPanelProps> = ({ plan, loading }) => {
  if (loading && !plan) {
    return (
      <div className="bg-dark-800 rounded-lg p-4 border border-dark-600 animate-pulse text-xs text-gray-400">
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
    <div className="bg-dark-800 rounded-lg p-3 border border-dark-600 flex flex-col flex-1 min-h-0 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-dark-700">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-200">
            {isAuthority ? 'Authority Action Plan' : 'Citizen Safety Advisory'}
          </span>
        </div>
        {/* Tag: "AI-assisted" if llm, "Rule-based" if template */}
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            isLLM
              ? 'bg-purple-950/70 text-purple-300 border-purple-600/70'
              : 'bg-emerald-950/70 text-emerald-300 border-emerald-600/70'
          }`}
        >
          {isLLM ? '✨ AI-assisted' : '📋 Rule-based'}
        </span>
      </div>

      {/* Content */}
      <div className="overflow-y-auto pr-1 space-y-2.5 flex-1 text-xs">
        {isAuthority ? (
          <>
            {plan.summary && (
              <div className="p-2.5 rounded bg-dark-900/60 text-gray-200 border border-dark-700 leading-relaxed font-sans text-[11px]">
                {plan.summary}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Ranked Response Checklist:
              </div>
              {plan.actions.map((act) => (
                <div
                  key={act.rank}
                  className="bg-dark-900/50 p-2.5 rounded-lg border border-dark-700/80 space-y-1 hover:border-dark-600 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/40 font-black text-[10px] flex items-center justify-center mt-0.5">
                      {act.rank}
                    </span>
                    <span className="font-semibold text-gray-100 text-xs">
                      {act.action}
                    </span>
                  </div>
                  <div className="text-gray-400 text-[11px] pl-6">
                    <strong className="text-gray-300 font-medium">Target:</strong> {act.target}
                  </div>
                  <div className="text-gray-400 text-[11px] pl-6">
                    <strong className="text-gray-300 font-medium">Reason:</strong> {act.reason}
                  </div>
                  {act.est_people > 0 && (
                    <div className="text-amber-400 text-[10px] pl-6 font-semibold">
                      Est. people: {act.est_people.toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="bg-sky-950/50 border border-sky-800/60 p-3 rounded-lg text-sky-200 leading-relaxed text-xs">
              <div className="font-bold text-sky-300 text-xs mb-1">
                Zone: {plan.zone}
              </div>
              <p>{plan.message}</p>
            </div>

            <div className="bg-dark-900/50 p-3 rounded-lg border border-dark-700 space-y-2.5">
              <div className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                Zone Facts:
              </div>
              <div className="text-[11px] text-gray-300 flex items-baseline justify-between border-b border-dark-700/60 pb-1.5">
                <span className="text-gray-400">Nearest Open Hospital:</span>
                <span className="font-semibold text-emerald-400 text-right ml-2">
                  {plan.facts.nearest_hospital || 'None accessible'}
                </span>
              </div>
              <div className="text-[11px] text-gray-300 flex items-baseline justify-between border-b border-dark-700/60 pb-1.5">
                <span className="text-gray-400">Nearest Shelter:</span>
                <span className="font-semibold text-sky-400 text-right ml-2">
                  {plan.facts.nearest_shelter || 'None designated'}
                </span>
              </div>
              {plan.facts.closed_roads.length > 0 && (
                <div className="text-[11px] text-gray-300 pt-0.5">
                  <span className="text-gray-400 font-medium">Closed Roads:</span>
                  <ul className="list-disc list-inside mt-1 text-red-400 space-y-1">
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
