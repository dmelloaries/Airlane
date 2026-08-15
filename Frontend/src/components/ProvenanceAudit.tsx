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
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs font-sans space-y-4">
      {/* Operational Caveats */}
      <div>
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
          <h3 className="text-sm font-bold text-slate-900 font-display">
            Operational Caveats & Compliance Disclaimers
          </h3>
          <span className="text-[10px] font-mono text-slate-400">PART 108</span>
        </div>

        <div className="space-y-2">
          {caveats.map((c, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed font-sans"
            >
              {c}
            </div>
          ))}
        </div>
      </div>

      {/* Data Provenance & Authoritative Citations */}
      <div className="pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-slate-900 font-display">
            Data Layer Provenance & Audit Trail
          </h4>
          <span className="text-[10px] font-mono text-emerald-700">100% Grounded Sources</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
          {provenanceCitations.map((cit, idx) => (
            <div
              key={idx}
              className="p-2 rounded bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
            >
              <span className="text-slate-700 font-sans truncate">{cit.field}</span>
              <span className="text-emerald-700 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                {cit.source}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
