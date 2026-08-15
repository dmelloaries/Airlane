import React from "react";

interface FlaggedRisksListProps {
  flaggedRisks: string[];
}

export const FlaggedRisksList: React.FC<FlaggedRisksListProps> = ({ flaggedRisks }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs font-sans space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900 font-display">
            Flagged Route Risks & Grounded Citations
          </h3>
          <p className="text-xs text-slate-500 font-mono">
            Direct physical hazards flagged along candidate flight paths
          </p>
        </div>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
          {flaggedRisks.length} Risk{flaggedRisks.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2.5 pt-1">
        {flaggedRisks.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-2 text-center font-mono">
            No critical hazards or airspace constraints flagged along this corridor.
          </p>
        ) : (
          flaggedRisks.map((risk, idx) => {
            const sourceMatch = risk.match(/\[Source:\s*([^\]]+)\]/i);
            const sourceText = sourceMatch ? sourceMatch[1].trim() : null;
            const cleanText = sourceMatch ? risk.replace(sourceMatch[0], "").trim() : risk;
            const isEnv = sourceText && (sourceText.includes("USFWS") || sourceText.includes("Fish & Wildlife") || sourceText.includes("Environmental"));

            return (
              <div
                key={idx}
                className={`p-3 rounded-md text-xs flex items-start gap-2.5 ${
                  isEnv
                    ? "bg-teal-50/70 border border-teal-200 text-teal-950"
                    : "bg-slate-50 border border-slate-200 text-slate-800"
                }`}
              >
                <span className={`text-sm mt-0.5 select-none font-mono ${isEnv ? "text-teal-700" : "text-amber-600"}`}>
                  {isEnv ? "🌿" : "⚠️"}
                </span>
                <div className="flex-1 min-w-0">
                  {sourceText && (
                    <div className={`text-[10px] font-mono font-bold uppercase tracking-wider mb-0.5 ${
                      isEnv ? "text-teal-700" : "text-slate-500"
                    }`}>
                      SOURCE: {sourceText}
                    </div>
                  )}
                  <p className="text-xs leading-relaxed font-sans">
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
