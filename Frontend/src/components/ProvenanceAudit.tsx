import React from "react";
import type { ProvenanceCitation } from "../types/airlane";

interface ProvenanceAuditProps {
  caveats: string[];
  provenanceCitations: ProvenanceCitation[];
}

export const ProvenanceAudit: React.FC<ProvenanceAuditProps> = ({
  caveats,
  provenanceCitations,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Operational Caveats */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <h3 className="text-base font-bold text-white tracking-wide">
            Operational Caveats & Compliance Disclaimers
          </h3>
        </div>

        <div className="space-y-2">
          {caveats.map((c, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 flex items-start gap-2.5"
            >
              <span className="text-indigo-400 font-bold text-sm">ℹ️</span>
              <span className="leading-relaxed">{c}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data Provenance & Authoritative Citations */}
      <div className="pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Data Layer Provenance & Audit Trail
          </h4>
          <span className="text-[10px] font-mono text-emerald-400">100% Grounded Sources</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-[11px]">
          {provenanceCitations.map((cit, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800 flex items-center justify-between gap-2"
            >
              <span className="text-slate-300 font-sans truncate">{cit.field}</span>
              <span className="text-emerald-400 font-bold flex-shrink-0 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                {cit.source}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
