import React, { useState } from "react";
import type { TraceEvent } from "../types/airlane";
import { AgentTerminal } from "./AgentTerminal";

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

  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm font-mono text-xs transition-all">
      {/* Trace Log Collapsible Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-sky-500" />
          <span className="font-bold text-slate-800 tracking-wide text-xs">
            ENGINEERING EXECUTION TRACE · {events.length} EVENTS RECORDED
          </span>
          {isStreaming ? (
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold animate-pulse">
              LIVE SSE
            </span>
          ) : (
            <span className="text-[10px] text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-full font-bold">
              AUDIT READY
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
              className="text-[10px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200"
            >
              ABORT
            </button>
          )}
          <span className="text-slate-500 font-semibold text-xs">
            {isExpanded ? "▲ Collapse Trace" : "▼ Expand Audit Terminal"}
          </span>
        </div>
      </div>

      {/* Terminal View Body */}
      {isExpanded && (
        <div className="p-2 bg-slate-950">
          <AgentTerminal
            events={events}
            isStreaming={isStreaming}
            onCancel={onCancel}
            title="AIRLANE POST-MISSION AUDIT & TELEMETRY LOGS"
            maxHeight="380px"
          />
        </div>
      )}
    </div>
  );
};

