import React, { useState, useEffect, useRef } from "react";
import type { TraceEvent } from "../types/airlane";

interface LiveTracePanelProps {
  events: TraceEvent[];
  isStreaming: boolean;
  onCancel?: () => void;
  defaultExpanded?: boolean;
}

export const LiveTracePanel: React.FC<LiveTracePanelProps> = ({
  events,
  isStreaming,
  onCancel,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, isExpanded]);

  return (
    <div className="w-full bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs font-mono text-xs">
      {/* Trace Log Header / Collapsible Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-sky-500" />
          <span className="font-bold text-slate-800 tracking-wide text-xs">
            ANALYSIS TRACE · {events.length} STEPS
          </span>
          {isStreaming && (
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
              LIVE SSE
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isStreaming && onCancel && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              className="text-[10px] text-rose-600 hover:text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200"
            >
              ABORT
            </button>
          )}
          <span className="text-slate-400 text-xs">
            {isExpanded ? "▲ Collapse" : "▼ Expand Trace"}
          </span>
        </div>
      </div>

      {/* Terminal Log Body */}
      {isExpanded && (
        <div className="p-3.5 max-h-[360px] overflow-y-auto space-y-1.5 bg-slate-950 text-slate-200 text-xs">
          {events.length === 0 && isStreaming && (
            <div className="flex items-center gap-2 text-slate-400 py-3 justify-center">
              <span className="w-3.5 h-3.5 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
              <span>Connecting to live pipeline stream at /analyze/stream...</span>
            </div>
          )}

          {events.map((evt, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2.5 p-1.5 rounded hover:bg-slate-900/90 transition-colors"
            >
              <span className="text-slate-500 text-[10px] shrink-0 font-semibold">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="text-sky-400 text-[10px] font-bold uppercase tracking-wider shrink-0 w-32 truncate">
                [{evt.step.replace("_", " ")}]
              </span>
              <span className="text-slate-300 leading-relaxed font-sans text-xs flex-1">
                {evt.message}
              </span>
              <span className="text-slate-500 text-[10px] shrink-0">
                {evt.timestamp}
              </span>
            </div>
          ))}

          {isStreaming && (
            <div className="flex items-center gap-2 text-sky-400 text-xs pt-1">
              <span className="inline-block w-1.5 h-3 bg-sky-400 animate-pulse" />
              <span className="text-slate-400 text-[11px]">Computing multi-layer risk envelope...</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
};
