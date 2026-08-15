import React from "react";
import type { SelectedObjectInfo } from "./MiniatureCityCanvas";

interface InteractiveHazardModalProps {
  info: SelectedObjectInfo | null;
  onClose: () => void;
}

export const InteractiveHazardModal: React.FC<InteractiveHazardModalProps> = ({ info, onClose }) => {
  if (!info) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150 font-sans">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header with Type Tag */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between font-mono">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                info.type === "hazard"
                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                  : info.type === "airspace"
                  ? "bg-sky-100 text-sky-900 border border-sky-300"
                  : info.type === "landing_zone"
                  ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                  : "bg-slate-200 text-slate-800 border border-slate-300"
              }`}
            >
              {info.type.replace("_", " ")}
            </span>
            <span className="text-xs text-slate-500 truncate">
              {info.source}
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 text-xs transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight font-display">
              {info.title}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{info.subtitle}</p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-2.5 font-mono">
            {info.metrics.map((m, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded border ${
                  m.highlight
                    ? "bg-sky-50/60 border-sky-200 text-sky-950"
                    : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
              >
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                  {m.label}
                </div>
                <div className="text-xs font-bold text-slate-900">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="p-3 rounded bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed font-sans">
            {info.description}
          </div>

          {/* Coordinates Footer */}
          {info.coordinates && (
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-2 border-t border-slate-100">
              <span>COORDINATES:</span>
              <span className="font-semibold text-slate-800">
                {info.coordinates.lat.toFixed(5)}° N, {info.coordinates.lng.toFixed(5)}° W
              </span>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200 flex justify-end font-mono">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-md transition-colors cursor-pointer"
          >
            CLOSE INSPECTOR
          </button>
        </div>
      </div>
    </div>
  );
};
