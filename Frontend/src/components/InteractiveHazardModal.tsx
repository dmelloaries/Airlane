import React from "react";
import type { SelectedObjectInfo } from "./MiniatureCityCanvas";

interface InteractiveHazardModalProps {
  info: SelectedObjectInfo | null;
  onClose: () => void;
}

export const InteractiveHazardModal: React.FC<InteractiveHazardModalProps> = ({ info, onClose }) => {
  if (!info) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header with Type Tag */}
        <div className="bg-slate-50 border-b border-slate-200/80 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider ${
                info.type === "hazard"
                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                  : info.type === "airspace"
                  ? "bg-cyan-100 text-cyan-800 border border-cyan-300"
                  : info.type === "landing_zone"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-sky-100 text-sky-800 border border-sky-300"
              }`}
            >
              {info.type.replace("_", " ")}
            </span>
            <span className="text-xs text-slate-500 font-medium font-mono">
              Source: {info.source}
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5">
          <div>
            <h3 className="text-xl font-bold text-slate-900 tracking-tight font-display">
              {info.title}
            </h3>
            <p className="text-xs font-medium text-slate-500 mt-0.5">{info.subtitle}</p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            {info.metrics.map((m, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border ${
                  m.highlight
                    ? "bg-sky-50/60 border-sky-200 text-sky-900"
                    : "bg-slate-50 border-slate-200/70 text-slate-800"
                }`}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  {m.label}
                </div>
                <div className="text-sm font-bold font-mono text-slate-900">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 leading-relaxed">
            {info.description}
          </div>

          {/* Coordinates Footer */}
          {info.coordinates && (
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-100">
              <span>Geo Position:</span>
              <span className="font-semibold text-slate-700">
                {info.coordinates.lat.toFixed(5)}° N, {info.coordinates.lng.toFixed(5)}° W
              </span>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-sm transition-all"
          >
            Done Inspecting
          </button>
        </div>
      </div>
    </div>
  );
};
