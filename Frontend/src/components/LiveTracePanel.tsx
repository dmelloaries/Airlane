import React, { useEffect, useRef } from "react";
import type { TraceEvent } from "../types/airlane";

interface LiveTracePanelProps {
  events: TraceEvent[];
  isStreaming: boolean;
  onCancel?: () => void;
}

const STEP_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  geocoding: { icon: "📍", color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10", label: "GEOCODING" },
  corridor_generation: { icon: "📐", color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10", label: "CORRIDOR GEN" },
  data_ingestion: { icon: "⚡", color: "text-amber-400 border-amber-500/30 bg-amber-500/10", label: "MULTI-FETCH" },
  mireye_hazards: { icon: "🗼", color: "text-rose-400 border-rose-500/30 bg-rose-500/10", label: "MIREYE INFRASTRUCTURE" },
  faa_airspace: { icon: "✈️", color: "text-sky-400 border-sky-500/30 bg-sky-500/10", label: "FAA UASFM" },
  population_density: { icon: "👥", color: "text-purple-400 border-purple-500/30 bg-purple-500/10", label: "CENSUS GROUND RISK" },
  noaa_wind: { icon: "💨", color: "text-teal-400 border-teal-500/30 bg-teal-500/10", label: "NOAA METAR" },
  compute_engine: { icon: "🧮", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", label: "DETERMINISTIC COMPUTE" },
  reasoning_layer: { icon: "🧠", color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10", label: "REASONING SYNTHESIS" },
  verification: { icon: "🛡️", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", label: "VERIFICATION" },
  complete: { icon: "✅", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", label: "COMPLETE" },
  error: { icon: "❌", color: "text-rose-400 border-rose-500/30 bg-rose-500/10", label: "ERROR" },
};

export const LiveTracePanel: React.FC<LiveTracePanelProps> = ({ events, isStreaming, onCancel }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  return (
    <div className="w-full max-w-3xl mx-auto bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Panel Header */}
      <div className="bg-slate-900/90 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <span className="text-xs font-mono text-slate-300 font-semibold tracking-wider flex items-center gap-2">
            AGENT EXECUTION TRACE
            {isStreaming && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-normal">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                LIVE SSE STREAM
              </span>
            )}
          </span>
        </div>

        {isStreaming && onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-rose-400 transition-colors px-2 py-1 rounded bg-slate-800 hover:bg-slate-800/80"
          >
            Abort
          </button>
        )}
      </div>

      {/* Terminal Body */}
      <div className="p-4 sm:p-6 font-mono text-xs sm:text-[13px] max-h-[460px] overflow-y-auto space-y-3 bg-gradient-to-b from-slate-950 to-slate-900/50">
        {events.length === 0 && isStreaming && (
          <div className="flex items-center gap-3 text-slate-400 py-6 justify-center">
            <svg className="animate-spin h-5 w-5 text-emerald-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Connecting to agent pipeline stream at /analyze/stream...</span>
          </div>
        )}

        {events.map((evt, idx) => {
          const config = STEP_ICONS[evt.step] || {
            icon: "•",
            color: "text-slate-400 border-slate-700 bg-slate-800",
            label: evt.step.toUpperCase(),
          };

          return (
            <div
              key={idx}
              className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 transition-all hover:bg-slate-900"
            >
              <div className="mt-0.5 text-base select-none">{config.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${config.color}`}
                  >
                    {config.label}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{evt.timestamp}</span>
                </div>
                <p className="text-slate-200 leading-relaxed break-words font-sans sm:font-mono text-xs sm:text-[12.5px]">
                  {evt.message}
                </p>
              </div>
            </div>
          );
        })}

        {isStreaming && (
          <div className="flex items-center gap-2 text-emerald-400/80 text-xs pt-2">
            <span className="inline-block w-2 h-3.5 bg-emerald-400 animate-pulse" />
            <span className="text-slate-400 font-sans">Synthesizing live data layers & running determinism audit...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};
