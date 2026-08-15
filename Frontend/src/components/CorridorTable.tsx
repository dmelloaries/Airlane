import React from "react";
import type { AnalysisResult } from "../types/airlane";

interface CorridorTableProps {
  result: AnalysisResult;
}

export const CorridorTable: React.FC<CorridorTableProps> = ({ result }) => {
  const { computed, computed_comparison: comp, safetyCase } = {
    computed: result.computed,
    computed_comparison: result.computed_comparison,
    safetyCase: result.safety_case,
  };

  const corridors = [
    { id: "corridor_a", name: "Corridor A (Direct Path)", data: computed.corridor_a },
    { id: "corridor_b", name: "Corridor B (Right Detour)", data: computed.corridor_b },
    { id: "corridor_c", name: "Corridor C (Left Detour)", data: computed.corridor_c },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
            <span>Candidate Corridors Comparative Matrix</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Deterministic multi-criteria screening across Ground Risk, Infrastructure Hazards, and Airspace
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider text-[11px]">
              <th className="py-3 px-3">Candidate Corridor</th>
              <th className="py-3 px-3">Distance</th>
              <th className="py-3 px-3">Part 108 Tier</th>
              <th className="py-3 px-3">Hazard Score</th>
              <th className="py-3 px-3">Flagged Hazards</th>
              <th className="py-3 px-3">Wind Limits</th>
              <th className="py-3 px-3">Forced Landing Zones</th>
              <th className="py-3 px-3">Data Quality</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {corridors.map((c) => {
              const isWinner = safetyCase.recommended_corridor === c.id;
              const metrics = comp.scored_metrics[c.id];
              const lzCount = c.data.landing_zones?.length ?? 0;
              const completenessPct = Math.round((metrics?.completeness_ratio ?? 1) * 100);

              return (
                <tr
                  key={c.id}
                  className={`transition-colors ${
                    isWinner
                      ? "bg-emerald-500/10 hover:bg-emerald-500/15"
                      : "hover:bg-slate-800/40"
                  }`}
                >
                  <td className="py-3.5 px-3 font-sans">
                    <div className="flex items-center gap-2">
                      {isWinner ? (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      ) : (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-slate-600" />
                      )}
                      <span className={`font-semibold ${isWinner ? "text-emerald-300" : "text-slate-300"}`}>
                        {c.name}
                      </span>
                      {isWinner && (
                        <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 font-mono font-bold">
                          Winner
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-slate-300">
                    {(c.data.total_distance_m / 1609.34).toFixed(2)} mi
                    <span className="text-slate-500 text-[10px] block">({Math.round(c.data.total_distance_m)}m)</span>
                  </td>
                  <td className="py-3.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        c.data.tier.dominant_tier === "Tier 1"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-sky-500/20 text-sky-300"
                      }`}
                    >
                      {c.data.tier.dominant_tier}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 font-bold text-slate-200">
                    <span className={isWinner ? "text-emerald-400 font-black" : "text-slate-300"}>
                      {metrics?.hazard_score.toFixed(1) ?? "0.0"}
                    </span>
                  </td>
                  <td className="py-3.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        (metrics?.obstacle_count ?? 0) === 0
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {metrics?.obstacle_count ?? 0} flagged
                    </span>
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      SAFE
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-slate-300">
                    <span className="text-cyan-400 font-bold">{lzCount}</span> spot(s)
                  </td>
                  <td className="py-3.5 px-3 text-slate-400 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-emerald-400 h-full rounded-full"
                          style={{ width: `${completenessPct}%` }}
                        />
                      </div>
                      <span>{completenessPct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
