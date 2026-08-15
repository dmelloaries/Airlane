import React from "react";

interface FlaggedRisksListProps {
  flaggedRisks: string[];
}

export const FlaggedRisksList: React.FC<FlaggedRisksListProps> = ({ flaggedRisks }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </span>
          <h3 className="text-base font-bold text-white tracking-wide">
            Flagged Route Risks & Grounded Citations
          </h3>
        </div>
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
          {flaggedRisks.length} Citation{flaggedRisks.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-3">
        {flaggedRisks.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-3 text-center">
            No critical hazards or airspace constraints flagged along this corridor.
          </p>
        ) : (
          flaggedRisks.map((risk, idx) => {
            // Extract [Source: ...] tag if present
            const sourceMatch = risk.match(/\[Source:\s*([^\]]+)\]/i);
            const sourceText = sourceMatch ? sourceMatch[1].trim() : null;
            const cleanText = sourceMatch ? risk.replace(sourceMatch[0], "").trim() : risk;

            const isMireye = sourceText?.includes("Mireye");
            const isCensus = sourceText?.includes("Census");
            const isFAA = sourceText?.includes("FAA");
            const isNOAA = sourceText?.includes("NOAA");

            const badgeStyle = isMireye
              ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
              : isCensus
              ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
              : isFAA
              ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
              : isNOAA
              ? "bg-teal-500/15 text-teal-400 border-teal-500/30"
              : "bg-slate-800 text-slate-300 border-slate-700";

            return (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-start gap-3"
              >
                <span className="text-amber-400 text-sm mt-0.5 select-none">⚠️</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {sourceText && (
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${badgeStyle}`}
                      >
                        Source: {sourceText}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-[13px] text-slate-200 leading-relaxed font-sans">
                    {cleanText}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
