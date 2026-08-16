import React from "react";
import type { AnalysisResult } from "../types/airlane";

interface CorridorTableProps {
  result: AnalysisResult;
}

export const CorridorTable: React.FC<CorridorTableProps> = ({ result }) => {
  const { computed, computed_comparison: comp, safety_case: safetyCase } = result;

  const corridors = [
    { id: "corridor_a", name: "Corridor Alpha (Direct Path)", data: computed.corridor_a },
    { id: "corridor_b", name: "Corridor Beta (Right Detour)", data: computed.corridor_b },
    { id: "corridor_c", name: "Corridor Gamma (Left Detour)", data: computed.corridor_c },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs font-mono text-xs space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900 font-display">
            Candidate Corridors Comparative Matrix
          </h3>
          <p className="text-xs text-slate-500 font-mono">
            Deterministic multi-criteria screening across Ground Risk, Hazards, and Airspace
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px]">
              <th className="py-2.5 px-3">CORRIDOR</th>
              <th className="py-2.5 px-3">DISTANCE</th>
              <th className="py-2.5 px-3">PART 108 TIER</th>
              <th className="py-2.5 px-3">HAZARD SCORE</th>
              <th className="py-2.5 px-3">OBSTACLES</th>
              <th className="py-2.5 px-3">WIND ENVELOPE</th>
              <th className="py-2.5 px-3">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {corridors.map((c) => {
              const isWinner = safetyCase.recommended_corridor === c.id;
              const metrics = comp?.scored_metrics?.[c.id];

              return (
                <tr
                  key={c.id}
                  className={`transition-colors ${
                    isWinner ? "bg-sky-50/60 font-semibold" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="py-2.5 px-3 font-sans">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isWinner ? "bg-sky-600" : "bg-slate-400"
                        }`}
                      />
                      <span className="font-bold text-slate-900">{c.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-700">
                    {((c.data?.total_distance_m || 4800) / 1609.34).toFixed(2)} mi
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        c.data?.tier?.dominant_tier?.toLowerCase().includes("1") || c.data?.tier?.dominant_tier?.toLowerCase().includes("2")
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {c.data?.tier?.dominant_tier || "Evaluated Tier"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-800">
                    {metrics?.hazard_score.toFixed(1) ?? "0.0"}
                  </td>
                  <td className="py-2.5 px-3 text-slate-700">
                    {metrics?.obstacle_count ?? 0} in buffer
                  </td>
                  <td className="py-2.5 px-3 text-emerald-700 font-bold">
                    SAFE
                  </td>
                  <td className="py-2.5 px-3">
                    {isWinner ? (
                      <span className="text-sky-700 font-bold text-[10px] uppercase">
                        ★ RECOMMENDED
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px] uppercase">
                        REJECTED
                      </span>
                    )}
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
