import React from "react";
import type { SafetyCase, ComputedComparison } from "../types/airlane";

interface VerdictCardProps {
  safetyCase: SafetyCase;
  comparison: ComputedComparison;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; desc: string }> = {
  "Tier 1": { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", desc: "Sparsely Populated / Lowest Ground Risk" },
  "Tier 2": { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/30", desc: "Low-Density Rural / Exurban" },
  "Tier 3": { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", desc: "Medium Suburban (<2,500 people/sq mi)" },
  "Tier 4": { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30", desc: "Dense Urban Residential" },
  "Tier 5": { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/30", desc: "High-Density Metropolitan Core" },
};

export const VerdictCard: React.FC<VerdictCardProps> = ({ safetyCase, comparison }) => {
  const tierConfig = TIER_COLORS[safetyCase.part108_tier] || {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    desc: "Part 108 Standard",
  };

  const confidencePct = Math.round(safetyCase.confidence_score * 100);
  const confidenceLevel =
    safetyCase.confidence_score >= 0.9 ? "HIGH" : safetyCase.confidence_score >= 0.75 ? "MODERATE" : "DEGRADED";

  const winnerMetrics = comparison.scored_metrics[safetyCase.recommended_corridor];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-2xl overflow-hidden relative">
      {/* Glow background accent */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <span className="text-xs font-mono font-bold tracking-widest text-emerald-400 uppercase">
            AUTONOMOUS SAFETY CASE VERDICT
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Confidence Badge */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-xs">
            <span className="text-slate-400">Confidence:</span>
            <span className="font-bold text-white font-mono">{confidencePct}%</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                confidenceLevel === "HIGH"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : confidenceLevel === "MODERATE"
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-rose-500/20 text-rose-300"
              }`}
            >
              {confidenceLevel}
            </span>
          </div>
        </div>
      </div>

      {/* Main Verdict Row */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recommended Corridor Banner */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <div className="text-xs text-slate-400 font-medium mb-1">Recommended Flight Route</div>
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
                {safetyCase.recommended_name}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                APPROVED
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Primary Operational Justification
            </div>
            <p className="text-sm text-slate-200 leading-relaxed font-sans">
              {safetyCase.primary_justification}
            </p>
          </div>
        </div>

        {/* Part 108 Tier Badge Card */}
        <div className="flex flex-col justify-between p-5 rounded-xl bg-slate-950/80 border border-slate-800">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              FAA Part 108 Ground Risk
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-3xl font-black px-3.5 py-1 rounded-xl border ${tierConfig.bg} ${tierConfig.text} ${tierConfig.border}`}
              >
                {safetyCase.part108_tier}
              </span>
              <div>
                <div className="text-xs font-bold text-white uppercase">{tierConfig.desc}</div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Max: {winnerMetrics ? Math.round(winnerMetrics.distance_m) : 0}m route
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Hazard Score</span>
              <span className="font-mono font-bold text-emerald-400">
                {winnerMetrics?.hazard_score.toFixed(1) ?? "0.0"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Obstacles Flagged</span>
              <span className="font-mono font-bold text-slate-200">
                {winnerMetrics?.obstacle_count ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Rejected Candidate Corridors */}
      {safetyCase.rejected_corridors && safetyCase.rejected_corridors.length > 0 && (
        <div className="mt-6 pt-5 border-t border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
            Rejected Alternative Corridors
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {safetyCase.rejected_corridors.map((rej, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-950/50 border border-rose-500/20 text-xs flex items-start gap-2.5"
              >
                <span className="text-rose-400 font-bold text-sm mt-0.5 select-none">✗</span>
                <div>
                  <span className="font-bold text-slate-300 mr-1.5">{rej.name}:</span>
                  <span className="text-slate-400 leading-normal">{rej.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
