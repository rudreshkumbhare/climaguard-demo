import React from 'react';
import type { PlanResponse } from '../types';

interface PlanPanelProps {
  plan?: PlanResponse | null;
  loading?: boolean;
  mode?: 'authority' | 'citizen';
  error?: string | null;
}

export const PlanPanel: React.FC<PlanPanelProps> = ({
  plan,
  loading = false,
  mode = 'authority',
  error = null,
}) => {
  const currentMode = mode || plan?.mode || 'authority';
  const isAuthorityMode = currentMode === 'authority';
  const isPlanModeMatch = plan && plan.mode === currentMode;

  // 1. Loading state when there is no matching plan yet
  if (loading && (!plan || !isPlanModeMatch)) {
    return (
      <div className="bg-dark-800 rounded-lg p-3 border border-dark-600 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-dark-700 shrink-0">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-200">
            {isAuthorityMode ? 'Authority Action Plan' : 'Citizen Safety Advisory'}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-sky-950/60 text-sky-300 border-sky-700/60 animate-pulse">
            Loading…
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-6 text-xs text-sky-400 gap-2">
          <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          <span>{isAuthorityMode ? 'Generating response plan…' : 'Loading advisory...'}</span>
        </div>
      </div>
    );
  }

  // 2. Visible error state when request fails and no matching plan is available
  if (error && (!plan || !isPlanModeMatch)) {
    return (
      <div className="bg-dark-800 rounded-lg p-3 border border-dark-600 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-dark-700 shrink-0">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-200">
            {isAuthorityMode ? 'Authority Action Plan' : 'Citizen Safety Advisory'}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-950/60 text-red-300 border-red-700/60">
            Error
          </span>
        </div>
        <div className="bg-red-950/70 border border-red-700/80 rounded-md p-2.5 text-xs text-red-200 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Failed to load {isAuthorityMode ? 'action plan' : 'citizen advisory'}</span>
          </div>
          <div className="text-[11px] text-red-300/90 pl-5">{error}</div>
        </div>
      </div>
    );
  }

  // 3. Fallback when simulation has not run yet
  if (!plan) {
    return (
      <div className="bg-dark-800 rounded-lg p-3 border border-dark-600 text-xs text-gray-400 flex flex-col flex-1 min-h-0 items-center justify-center">
        Plan will appear once simulation runs.
      </div>
    );
  }

  const isLLM = plan.source === 'llm';

  return (
    <div className="bg-dark-800 rounded-lg p-3 border border-dark-600 flex flex-col flex-1 min-h-0 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-dark-700 shrink-0">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-200">
          {plan.mode === 'authority' ? 'Authority Action Plan' : 'Citizen Safety Advisory'}
        </span>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-[10px] font-medium text-sky-400 animate-pulse">
              {plan.mode === 'authority' ? 'Updating…' : 'Loading advisory...'}
            </span>
          )}
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
      </div>

      {/* Inline error banner if refresh failed while showing previous plan */}
      {error && (
        <div className="bg-red-950/70 border border-red-700/80 rounded-md p-2 text-xs text-red-200 flex items-start gap-1.5 mb-2 shrink-0">
          <span>⚠️</span>
          <div className="text-[11px] leading-tight">
            <span className="font-semibold">Update failed:</span> {error}
          </div>
        </div>
      )}

      {/* Internal scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {plan.mode === 'authority' ? (
          <>
            {plan.summary && (
              <div className="p-2 rounded bg-dark-900/60 text-gray-200 border border-dark-700 leading-snug font-sans text-[11px]">
                {plan.summary}
              </div>
            )}

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Ranked Response Checklist:
              </div>
              {plan.actions &&
                plan.actions.map((act) => (
                  <div
                    key={act.rank}
                    className="bg-dark-900/60 px-2.5 py-1.5 rounded-md border border-dark-700/80 hover:border-dark-600 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/40 font-black text-[10px] flex items-center justify-center">
                          {act.rank}
                        </span>
                        <span className="font-semibold text-gray-100 text-[11px] truncate">
                          {act.action}
                        </span>
                      </div>
                      {act.est_people > 0 && (
                        <span className="text-amber-400 text-[10px] font-semibold shrink-0">
                          ~{act.est_people >= 1000 ? `${(act.est_people / 1000).toFixed(0)}k` : act.est_people.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-gray-400 text-[10px] pl-5 mt-0.5 leading-snug">
                      <span className="text-gray-300 font-medium">{act.target}</span> • {act.reason}
                    </div>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <>
            {/* 1. Plain-language safety message */}
            <div className="bg-sky-950/50 border border-sky-800/60 p-2.5 rounded-lg text-sky-200 leading-relaxed text-xs">
              <div className="font-bold text-sky-300 text-xs mb-1">
                Zone: {plan.zone}
              </div>
              <p className="leading-relaxed">{plan.message}</p>
            </div>

            {/* 2. Zone Facts (Hospital, Shelter, Closed Roads) */}
            <div className="bg-dark-900/60 p-2.5 rounded-lg border border-dark-700 space-y-2">
              <div className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                Zone Facts:
              </div>
              {/* Fact 1: Nearest open hospital */}
              <div className="text-[11px] text-gray-300 flex items-baseline justify-between border-b border-dark-700/60 pb-1.5">
                <span className="text-gray-400">Nearest Open Hospital:</span>
                <span className="font-semibold text-emerald-400 text-right ml-2">
                  {plan.facts?.nearest_hospital || 'None accessible'}
                </span>
              </div>
              {/* Fact 2: Nearest shelter */}
              <div className="text-[11px] text-gray-300 flex items-baseline justify-between border-b border-dark-700/60 pb-1.5">
                <span className="text-gray-400">Nearest Shelter:</span>
                <span className="font-semibold text-sky-400 text-right ml-2">
                  {plan.facts?.nearest_shelter || 'None designated'}
                </span>
              </div>
              {/* Fact 3: Closed roads list */}
              <div className="text-[11px] text-gray-300 pt-0.5">
                <span className="text-gray-400 font-medium">Closed Roads:</span>
                {plan.facts?.closed_roads && plan.facts.closed_roads.length > 0 ? (
                  <ul className="list-disc list-inside mt-1 text-red-400 space-y-1">
                    {plan.facts.closed_roads.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 text-emerald-400 text-[11px]">
                    No flooded road closures reported
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
