import React from "react";
import type { SafetyCase, ComputedComparison } from "../types/airlane";

interface VerdictCardProps {
  safetyCase: SafetyCase;
  comparison: ComputedComparison;
}

export const VerdictCard: React.FC<VerdictCardProps> = ({ safetyCase, comparison }) => {
  const confidencePct = Math.round(safetyCase.confidence_score * 100);
  const winnerMetrics = comparison?.scored_metrics?.[safetyCase.recommended_corridor];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4 font-sans">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-slate-800 uppercase tracking-wider">
            SAFETY CASE VERDICT
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-[10px]">
            {safetyCase.part108_tier || "TIER 1"}
          </span>
          <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-300 font-bold text-[10px]">
            CONFIDENCE {confidencePct}%
          </span>
        </div>
      </div>

      {/* Main Recommendation */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
          RECOMMENDED CORRIDOR
        </div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight font-display">
          {safetyCase.recommended_name}
        </h2>
        <p className="text-xs text-slate-700 leading-relaxed font-sans pt-1">
          {safetyCase.primary_justification}
        </p>
      </div>

      {/* Metrics Ribbon */}
      <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-3 font-mono text-xs">
        <div>
          <span className="text-[9px] text-slate-400 block uppercase">HAZARD SCORE</span>
          <span className="font-bold text-emerald-700">
            {winnerMetrics?.hazard_score.toFixed(1) ?? "0.0"}
          </span>
        </div>
        <div>
          <span className="text-[9px] text-slate-400 block uppercase">OBSTACLES</span>
          <span className="font-bold text-slate-800">
            {winnerMetrics?.obstacle_count ?? 0} In Buffer
          </span>
        </div>
        <div>
          <span className="text-[9px] text-slate-400 block uppercase">TOTAL DISTANCE</span>
          <span className="font-bold text-slate-800">
            {winnerMetrics ? (winnerMetrics.distance_m / 1609.34).toFixed(2) : "3.00"} MI
          </span>
        </div>
      </div>
    </div>
  );
};
