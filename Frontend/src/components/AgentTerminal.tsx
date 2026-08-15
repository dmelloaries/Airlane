import React, { useState, useEffect, useRef, useMemo } from "react";
import type { TraceEvent } from "../types/airlane";

export interface AgentTerminalProps {
  events: TraceEvent[];
  isStreaming: boolean;
  onCancel?: () => void;
  title?: string;
  defaultExpanded?: boolean;
  maxHeight?: string;
  showControls?: boolean;
  activeStage?: number;
}

type FilterCategory = "all" | "agent" | "sensor" | "geometry" | "compute" | "warning";

const STAGE_CONFIG: Record<
  string,
  { tag: string; color: string; bg: string; border: string; icon: string }
> = {
  geocoding: {
    tag: "GEOCODE",
    color: "text-sky-400",
    bg: "bg-sky-950/70",
    border: "border-sky-800/60",
    icon: "📍",
  },
  corridor_generation: {
    tag: "GEOMETRY",
    color: "text-cyan-400",
    bg: "bg-cyan-950/70",
    border: "border-cyan-800/60",
    icon: "📐",
  },
  data_ingestion: {
    tag: "SENSOR HUB",
    color: "text-indigo-400",
    bg: "bg-indigo-950/70",
    border: "border-indigo-800/60",
    icon: "⚡",
  },
  mireye_hazards: {
    tag: "MIREYE 345kV",
    color: "text-amber-400",
    bg: "bg-amber-950/70",
    border: "border-amber-800/60",
    icon: "⚠️",
  },
  faa_airspace: {
    tag: "FAA UASFM",
    color: "text-blue-400",
    bg: "bg-blue-950/70",
    border: "border-blue-800/60",
    icon: "🛡️",
  },
  population_density: {
    tag: "CENSUS TIER",
    color: "text-purple-400",
    bg: "bg-purple-950/70",
    border: "border-purple-800/60",
    icon: "👥",
  },
  noaa_wind: {
    tag: "NOAA METAR",
    color: "text-teal-400",
    bg: "bg-teal-950/70",
    border: "border-teal-800/60",
    icon: "💨",
  },
  compute_engine: {
    tag: "COMPUTE RANK",
    color: "text-emerald-400",
    bg: "bg-emerald-950/70",
    border: "border-emerald-800/60",
    icon: "⚖️",
  },
  reasoning_layer: {
    tag: "SAFETY REASON",
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-950/70",
    border: "border-fuchsia-800/60",
    icon: "🧠",
  },
  verification: {
    tag: "PROVENANCE",
    color: "text-lime-400",
    bg: "bg-lime-950/70",
    border: "border-lime-800/60",
    icon: "✓",
  },
  complete: {
    tag: "COMPLETE",
    color: "text-emerald-300",
    bg: "bg-emerald-950/80",
    border: "border-emerald-700/80",
    icon: "🏁",
  },
  error: {
    tag: "ERROR",
    color: "text-rose-400",
    bg: "bg-rose-950/80",
    border: "border-rose-700/80",
    icon: "✖",
  },
};

export const AgentTerminal: React.FC<AgentTerminalProps> = ({
  events,
  isStreaming,
  onCancel,
  title = "AIRLANE AGENT OPERATIONAL RUNTIME",
  maxHeight = "460px",
  showControls = true,
  activeStage,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("all");
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsedTimer, setElapsedTimer] = useState<string>("00:00.0");

  const terminalBodyRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number | null>(null);

  // Live timer during streaming
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isStreaming) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      interval = setInterval(() => {
        if (startTimeRef.current) {
          const delta = (Date.now() - startTimeRef.current) / 1000;
          const mins = Math.floor(delta / 60);
          const secs = (delta % 60).toFixed(1);
          setElapsedTimer(`${String(mins).padStart(2, "0")}:${secs.padStart(4, "0")}`);
        }
      }, 100);
    } else {
      if (events.length > 0 && !startTimeRef.current) {
        setElapsedTimer("00:01.8");
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isStreaming, events.length]);

  // Handle auto-scroll
  useEffect(() => {
    if (autoScroll && !isUserScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, autoScroll, isUserScrolledUp]);

  // Check scroll position to determine if user scrolled away from bottom
  const handleScroll = () => {
    if (!terminalBodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalBodyRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setIsUserScrolledUp(!isAtBottom);
  };

  const scrollToBottom = () => {
    setIsUserScrolledUp(false);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Toggle single log expansion
  const toggleExpand = (idx: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  // Filter events based on search query and category
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      // Category filter
      if (filterCategory !== "all") {
        if (filterCategory === "agent" && evt.category !== "agent" && evt.step !== "reasoning_layer" && evt.step !== "verification") return false;
        if (filterCategory === "sensor" && evt.category !== "sensor" && evt.step !== "geocoding" && evt.step !== "mireye_hazards" && evt.step !== "faa_airspace" && evt.step !== "population_density" && evt.step !== "noaa_wind") return false;
        if (filterCategory === "geometry" && evt.category !== "geometry" && evt.step !== "corridor_generation") return false;
        if (filterCategory === "compute" && evt.category !== "compute" && evt.step !== "compute_engine") return false;
        if (filterCategory === "warning" && evt.level !== "warning" && evt.level !== "error") return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${evt.step} ${evt.message} ${evt.source_name || ""} ${evt.agent_thought || ""} ${JSON.stringify(evt.metrics || {})}`.toLowerCase();
        return text.includes(q);
      }

      return true;
    });
  }, [events, filterCategory, searchQuery]);

  // Copy full logs to clipboard
  const handleCopyLogs = () => {
    const formatted = events
      .map(
        (e, i) =>
          `[${e.timestamp}] #${String(i + 1).padStart(2, "0")} [${e.step.toUpperCase()}] ${e.message}${
            e.agent_thought ? `\n  ↳ AGENT THOUGHT: ${e.agent_thought}` : ""
          }${e.metrics ? `\n  ↳ METRICS: ${JSON.stringify(e.metrics)}` : ""}`
      )
      .join("\n\n");
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Latest event for the thought banner
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const activeThought = latestEvent?.agent_thought || (isStreaming ? "Analyzing multi-corridor route risk..." : "Pipeline execution finalized.");

  return (
    <div className="w-full rounded-xl bg-slate-950 border border-slate-800/90 shadow-2xl overflow-hidden font-mono flex flex-col transition-all duration-300">
      {/* 1. TERMINAL WINDOW HEADER */}
      <div className="bg-slate-900/95 border-b border-slate-800/90 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 select-none backdrop-blur-md">
        {/* Left: Window Dots & Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-200 tracking-wider">
              {title}
            </span>
            <span className="text-[10px] text-slate-400 bg-slate-800/70 px-1.5 py-0.5 rounded border border-slate-700/50">
              v1.0-BVLOS
            </span>
          </div>
        </div>

        {/* Right: Live Stream Pill, Elapsed Timer & Controls */}
        <div className="flex items-center gap-3">
          {/* Live Status Badge */}
          {isStreaming ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold tracking-wide animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>LIVE SSE STREAM</span>
            </div>
          ) : events.length > 0 ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-950/80 border border-sky-500/40 text-sky-400 text-[10px] font-bold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>TRACE COMPLETE ({events.length})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">
              <span>IDLE</span>
            </div>
          )}

          {/* Elapsed Timer */}
          <div className="text-[11px] text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">
            ⏱ {elapsedTimer}
          </div>

          {/* Abort Button (during streaming) */}
          {isStreaming && onCancel && (
            <button
              onClick={onCancel}
              className="px-2 py-0.5 rounded text-[10px] font-bold text-rose-300 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 hover:border-rose-500 transition-colors cursor-pointer"
            >
              [ABORT]
            </button>
          )}

          {/* Copy Logs Button */}
          <button
            onClick={handleCopyLogs}
            title="Copy logs to clipboard"
            className="px-2 py-0.5 rounded text-[10px] text-slate-300 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition-colors cursor-pointer"
          >
            {copied ? "✓ COPIED" : "COPY TRACE"}
          </button>
        </div>
      </div>

      {/* 2. AGENT LIVE COGNITION / ACTIVE THOUGHT STREAM BANNER */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-sky-950/50 via-slate-900/60 to-indigo-950/50 border-b border-slate-800/80 flex items-start gap-3">
        <div className="mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs">
          {isStreaming ? (
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
          ) : (
            "🧠"
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-sky-400">
              Agent Cognitive Focus
            </span>
            {activeStage && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-900/40 text-sky-300 border border-sky-700/40">
                Phase 0{activeStage}/08
              </span>
            )}
            {latestEvent?.source_name && (
              <span className="text-[9px] text-slate-400">
                via {latestEvent.source_name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-200 mt-0.5 leading-relaxed font-sans truncate sm:whitespace-normal">
            {activeThought}
          </p>
        </div>
      </div>

      {/* 3. INTERACTIVE CONTROLS / FILTER BAR */}
      {showControls && (
        <div className="bg-slate-900/80 border-b border-slate-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Filter Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterCategory("all")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                filterCategory === "all"
                  ? "bg-sky-500 text-slate-950 font-bold"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              All ({events.length})
            </button>
            <button
              onClick={() => setFilterCategory("agent")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                filterCategory === "agent"
                  ? "bg-fuchsia-500 text-slate-950 font-bold"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Reasoning
            </button>
            <button
              onClick={() => setFilterCategory("sensor")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                filterCategory === "sensor"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Sensors & APIs
            </button>
            <button
              onClick={() => setFilterCategory("geometry")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                filterCategory === "geometry"
                  ? "bg-cyan-500 text-slate-950 font-bold"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Corridors
            </button>
            <button
              onClick={() => setFilterCategory("compute")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                filterCategory === "compute"
                  ? "bg-emerald-500 text-slate-950 font-bold"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Scoring
            </button>
          </div>

          {/* Search Box & AutoScroll Toggle */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter logs..."
                className="w-32 sm:w-44 bg-slate-950 border border-slate-700/60 rounded px-2 py-0.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>

            <label className="flex items-center gap-1 text-[10px] text-slate-400 cursor-pointer select-none hover:text-slate-200">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="w-3 h-3 rounded bg-slate-950 border-slate-700 text-sky-500 focus:ring-0"
              />
              <span>Auto-scroll</span>
            </label>
          </div>
        </div>
      )}

      {/* 4. TERMINAL LOG STREAM BODY */}
      <div className="relative flex-1">
        <div
          ref={terminalBodyRef}
          onScroll={handleScroll}
          style={{ maxHeight }}
          className="p-3.5 overflow-y-auto space-y-1.5 text-xs bg-slate-950/95 scroll-smooth"
        >
          {/* Empty connecting state */}
          {events.length === 0 && isStreaming && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 space-y-2">
              <div className="w-6 h-6 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
              <span className="text-xs text-sky-300 font-semibold">
                Initializing Agent Communication Bus...
              </span>
              <span className="text-[10px] text-slate-500">
                Awaiting SSE packet handshake at /analyze/stream
              </span>
            </div>
          )}

          {/* No results from filter */}
          {events.length > 0 && filteredEvents.length === 0 && (
            <div className="py-8 text-center text-slate-500 text-xs">
              No log events matching "{searchQuery}" in category "{filterCategory}".
            </div>
          )}

          {/* Render event rows */}
          {filteredEvents.map((evt, idx) => {
            const stageCfg = STAGE_CONFIG[evt.step] || {
              tag: evt.step.toUpperCase(),
              color: "text-sky-400",
              bg: "bg-sky-950/70",
              border: "border-sky-800/60",
              icon: "●",
            };
            const isExpanded = expandedIndices.has(idx);
            const hasDetails = Boolean(
              evt.agent_thought ||
                (evt.metrics && Object.keys(evt.metrics).length > 0) ||
                evt.launch ||
                evt.destination ||
                evt.tiers
            );

            return (
              <div
                key={idx}
                className={`group rounded-md border transition-all duration-150 ${
                  isExpanded
                    ? "bg-slate-900/90 border-slate-700/80 shadow-md"
                    : "bg-slate-900/40 border-slate-900 hover:bg-slate-900/80 hover:border-slate-800"
                }`}
              >
                {/* Main Log Row */}
                <div
                  onClick={() => hasDetails && toggleExpand(idx)}
                  className={`p-2 flex items-start gap-2.5 ${
                    hasDetails ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  {/* Step Index */}
                  <span className="text-slate-600 text-[10px] shrink-0 font-bold w-5 pt-0.5">
                    {String(idx + 1).padStart(2, "0")}
                  </span>

                  {/* Stage Badge */}
                  <div
                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${stageCfg.bg} ${stageCfg.color} ${stageCfg.border}`}
                  >
                    <span>{stageCfg.icon}</span>
                    <span className="tracking-wide uppercase">{stageCfg.tag}</span>
                  </div>

                  {/* Source Name pill if available */}
                  {evt.source_name && (
                    <span className="hidden md:inline-block shrink-0 text-[9px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/40">
                      {evt.source_name}
                    </span>
                  )}

                  {/* Message content */}
                  <div className="flex-1 min-w-0 text-slate-200 leading-relaxed font-sans text-xs">
                    <span className={evt.level === "warning" ? "text-amber-300 font-medium" : evt.level === "error" ? "text-rose-400 font-medium" : "text-slate-200"}>
                      {evt.message}
                    </span>
                  </div>

                  {/* Latency / Elapsed time */}
                  {evt.elapsed_ms !== undefined && (
                    <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                      +{evt.elapsed_ms}ms
                    </span>
                  )}

                  {/* Timestamp */}
                  <span className="text-slate-600 text-[10px] shrink-0 hidden sm:inline">
                    {evt.timestamp}
                  </span>

                  {/* Details toggle chevron */}
                  {hasDetails && (
                    <button
                      aria-label="Toggle details"
                      className="text-slate-500 group-hover:text-slate-300 text-[10px] shrink-0 px-1"
                    >
                      {isExpanded ? "▲" : "▼"}
                    </button>
                  )}
                </div>

                {/* Expanded Telemetry & Structured JSON Drawer */}
                {isExpanded && hasDetails && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-800/80 bg-slate-950/60 rounded-b-md space-y-2 text-xs">
                    {/* Agent Thought */}
                    {evt.agent_thought && (
                      <div className="p-2 rounded bg-sky-950/30 border border-sky-800/40 text-sky-200 text-[11px] font-sans flex items-start gap-2">
                        <span className="text-sky-400 font-bold shrink-0">🧠 Reasoning:</span>
                        <span>{evt.agent_thought}</span>
                      </div>
                    )}

                    {/* Metrics / Key-Value Badges */}
                    {evt.metrics && Object.keys(evt.metrics).length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                          Extracted Telemetry Metrics
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(evt.metrics).map(([k, v]) => (
                            <div
                              key={k}
                              className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 flex items-center gap-1.5 text-[10px]"
                            >
                              <span className="text-slate-400">{k.replace(/_/g, " ")}:</span>
                              <span className="text-sky-300 font-bold font-mono">
                                {String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tiers summary if present */}
                    {evt.tiers && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-slate-400 font-bold">Corridor Tiers:</span>
                        {Object.entries(evt.tiers).map(([c, t]) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.2 rounded bg-purple-950/60 border border-purple-800/60 text-purple-300 font-mono"
                          >
                            {c.replace("corridor_", "Corridor ").toUpperCase()}: {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Active pulse loader while streaming */}
          {isStreaming && events.length > 0 && (
            <div className="flex items-center gap-2 text-sky-400 text-xs pt-2 px-2">
              <span className="inline-block w-2 h-3.5 bg-sky-400 animate-pulse rounded-xs" />
              <span className="text-slate-400 text-[11px]">
                Computing next multi-corridor safety vector...
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Floating "New logs received ↓" indicator when scrolled up */}
        {isUserScrolledUp && isStreaming && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-3 right-4 px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-full shadow-lg border border-sky-400/50 flex items-center gap-1.5 animate-bounce cursor-pointer z-10"
          >
            <span>↓ New stream events</span>
          </button>
        )}
      </div>
    </div>
  );
};
