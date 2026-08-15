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
    bg: "bg-[#181818]",
    border: "border-[#333333]",
    icon: "📍",
  },
  corridor_generation: {
    tag: "GEOMETRY",
    color: "text-cyan-400",
    bg: "bg-[#181818]",
    border: "border-[#333333]",
    icon: "📐",
  },
  data_ingestion: {
    tag: "SENSOR HUB",
    color: "text-indigo-400",
    bg: "bg-[#181818]",
    border: "border-[#333333]",
    icon: "⚡",
  },
  mireye_hazards: {
    tag: "MIREYE 345kV",
    color: "text-amber-400",
    bg: "bg-[#1c1810]",
    border: "border-[#3d321d]",
    icon: "⚠️",
  },
  faa_airspace: {
    tag: "FAA UASFM",
    color: "text-blue-400",
    bg: "bg-[#181818]",
    border: "border-[#333333]",
    icon: "🛡️",
  },
  population_density: {
    tag: "CENSUS TIER",
    color: "text-purple-400",
    bg: "bg-[#181818]",
    border: "border-[#333333]",
    icon: "👥",
  },
  noaa_wind: {
    tag: "NOAA METAR",
    color: "text-teal-400",
    bg: "bg-[#181818]",
    border: "border-[#333333]",
    icon: "💨",
  },
  compute_engine: {
    tag: "COMPUTE RANK",
    color: "text-emerald-400",
    bg: "bg-[#121c15]",
    border: "border-[#1d3d24]",
    icon: "⚖️",
  },
  reasoning_layer: {
    tag: "SAFETY REASON",
    color: "text-fuchsia-400",
    bg: "bg-[#181818]",
    border: "border-[#333333]",
    icon: "🧠",
  },
  verification: {
    tag: "PROVENANCE",
    color: "text-lime-400",
    bg: "bg-[#181818]",
    border: "border-[#333333]",
    icon: "✓",
  },
  complete: {
    tag: "COMPLETE",
    color: "text-emerald-300",
    bg: "bg-[#121c15]",
    border: "border-[#1d3d24]",
    icon: "🏁",
  },
  error: {
    tag: "ERROR",
    color: "text-rose-400",
    bg: "bg-[#1c1212]",
    border: "border-[#3d1d1d]",
    icon: "✖",
  },
};

export const AgentTerminal: React.FC<AgentTerminalProps> = ({
  events,
  isStreaming,
  onCancel,
  title,
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
  const startTimeRef = useRef<number | null>(null);

  // Live timer during streaming
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
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

  // Handle auto-scroll inside the terminal container ONLY (without scrolling the outer window)
  useEffect(() => {
    if (autoScroll && !isUserScrolledUp && terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [events, autoScroll, isUserScrolledUp]);

  // Check scroll position to determine if user scrolled away from bottom
  const handleScroll = () => {
    if (!terminalBodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalBodyRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 35;
    setIsUserScrolledUp(!isAtBottom);
  };

  const scrollToBottom = () => {
    setIsUserScrolledUp(false);
    if (terminalBodyRef.current) {
      terminalBodyRef.current.scrollTo({
        top: terminalBodyRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
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
    <div className="w-full rounded-2xl bg-[#000000] border border-[#262626] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden font-mono flex flex-col transition-all duration-300 ring-1 ring-white/5">
      {/* 1. MACBOOK PRO macOS TERMINAL TITLE BAR (Pure Apple Dark Graphite) */}
      <div className="bg-[#181818] border-b border-[#262626] px-4 py-3 flex flex-wrap items-center justify-between gap-3 select-none backdrop-blur-xl relative">
        {/* Left: macOS Traffic Light Buttons */}
        <div className="flex items-center gap-2 group">
          <button
            onClick={onCancel}
            title={isStreaming ? "Abort mission" : "Close"}
            className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] flex items-center justify-center text-[8px] text-black/80 font-bold opacity-90 group-hover:opacity-100 hover:brightness-110 cursor-pointer shadow-xs"
          >
            <span className="opacity-0 group-hover:opacity-100 transition-opacity leading-none">✕</span>
          </button>
          <button
            title="Minimize"
            className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] flex items-center justify-center text-[8px] text-black/80 font-bold opacity-90 group-hover:opacity-100 hover:brightness-110 cursor-pointer shadow-xs"
          >
            <span className="opacity-0 group-hover:opacity-100 transition-opacity leading-none">–</span>
          </button>
          <button
            title="Maximize / Fullscreen"
            className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] flex items-center justify-center text-[8px] text-black/80 font-bold opacity-90 group-hover:opacity-100 hover:brightness-110 cursor-pointer shadow-xs"
          >
            <span className="opacity-0 group-hover:opacity-100 transition-opacity leading-none">+</span>
          </button>
        </div>

        {/* Center: macOS Terminal Title & Host Info */}
        <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold tracking-wide">
          <span className="text-slate-400"></span>
          <span className="text-slate-200">airlane@macbook-pro:</span>
          <span className="text-sky-400 font-bold">{title || "~/bvlos-stream"}</span>
          <span className="text-[10px] text-slate-400 bg-black/60 px-2 py-0.5 rounded-full border border-[#333333] font-mono">
            zsh · arm64
          </span>
        </div>

        {/* Right: Live Stream Status, Elapsed Timer & Actions */}
        <div className="flex items-center gap-2.5">
          {/* Live SSE Status Pill */}
          {isStreaming ? (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold tracking-wide animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>LIVE SSE STREAM</span>
            </div>
          ) : events.length > 0 ? (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-[10px] font-bold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>TRACE COMPLETE ({events.length})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#222222] text-slate-400 text-[10px]">
              <span>IDLE</span>
            </div>
          )}

          {/* Elapsed Timer */}
          <div className="text-[11px] text-slate-300 bg-[#0d0d0d] px-2.5 py-0.5 rounded-md border border-[#2a2a2a] font-mono">
            ⏱ {elapsedTimer}
          </div>

          {/* Abort Button (during streaming) */}
          {isStreaming && onCancel && (
            <button
              onClick={onCancel}
              className="px-2 py-0.5 rounded-md text-[10px] font-bold text-rose-300 bg-[#251010] hover:bg-rose-900 border border-rose-600/50 hover:border-rose-400 transition-colors cursor-pointer"
            >
              KILL
            </button>
          )}

          {/* Copy Logs Button */}
          <button
            onClick={handleCopyLogs}
            title="Copy logs to clipboard"
            className="px-2.5 py-0.5 rounded-md text-[10px] text-slate-200 bg-[#242424] hover:bg-[#303030] border border-[#333333] hover:border-[#444444] transition-colors cursor-pointer shadow-xs"
          >
            {copied ? "✓ COPIED" : "COPY"}
          </button>
        </div>
      </div>

      {/* 2. macOS ZSH COMMAND PROMPT BAR */}
      <div className="px-4 py-2.5 bg-[#111111] border-b border-[#222222] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 overflow-x-auto text-[11px]">
          <span className="text-emerald-400 font-bold">➜</span>
          <span className="text-cyan-400 font-bold">airlane-engine</span>
          <span className="text-fuchsia-400 font-semibold">git:(<span className="text-rose-400">main</span>)</span>
          <span className="text-slate-500">✗</span>
          <span className="text-slate-300 font-mono">
            curl -N -H "Accept: text/event-stream" /analyze/stream
          </span>
        </div>

        {activeStage && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#181818] text-sky-400 border border-[#333333] font-bold">
              PHASE 0{activeStage}/08
            </span>
          </div>
        )}
      </div>

      {/* 3. AGENT COGNITION STREAM BANNER (Pure Black Background) */}
      <div className="px-4 py-2.5 bg-[#0a0a0a] border-b border-[#222222] flex items-start gap-3">
        <div className="mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-lg bg-[#181818] border border-[#333333] text-sky-400 text-xs shadow-inner">
          {isStreaming ? (
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
          ) : (
            "🧠"
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-sky-400">
              Agent Cognitive Stream
            </span>
            {latestEvent?.source_name && (
              <span className="text-[9px] text-slate-400">
                • {latestEvent.source_name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-200 mt-0.5 leading-relaxed font-sans truncate sm:whitespace-normal">
            {activeThought}
          </p>
        </div>
      </div>

      {/* 4. INTERACTIVE CONTROLS / FILTER BAR */}
      {showControls && (
        <div className="bg-[#111111] border-b border-[#222222] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Filter Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterCategory("all")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                filterCategory === "all"
                  ? "bg-sky-500 text-black font-bold"
                  : "bg-[#1c1c1c] text-slate-400 hover:text-slate-200 border border-[#2a2a2a]"
              }`}
            >
              All ({events.length})
            </button>
            <button
              onClick={() => setFilterCategory("agent")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                filterCategory === "agent"
                  ? "bg-fuchsia-500 text-black font-bold"
                  : "bg-[#1c1c1c] text-slate-400 hover:text-slate-200 border border-[#2a2a2a]"
              }`}
            >
              Reasoning
            </button>
            <button
              onClick={() => setFilterCategory("sensor")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                filterCategory === "sensor"
                  ? "bg-amber-500 text-black font-bold"
                  : "bg-[#1c1c1c] text-slate-400 hover:text-slate-200 border border-[#2a2a2a]"
              }`}
            >
              Sensors & APIs
            </button>
            <button
              onClick={() => setFilterCategory("geometry")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                filterCategory === "geometry"
                  ? "bg-cyan-500 text-black font-bold"
                  : "bg-[#1c1c1c] text-slate-400 hover:text-slate-200 border border-[#2a2a2a]"
              }`}
            >
              Corridors
            </button>
            <button
              onClick={() => setFilterCategory("compute")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                filterCategory === "compute"
                  ? "bg-emerald-500 text-black font-bold"
                  : "bg-[#1c1c1c] text-slate-400 hover:text-slate-200 border border-[#2a2a2a]"
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
                className="w-32 sm:w-44 bg-black border border-[#333333] rounded px-2 py-0.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
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
                className="w-3 h-3 rounded bg-black border-[#333333] text-sky-500 focus:ring-0"
              />
              <span>Auto-scroll</span>
            </label>
          </div>
        </div>
      )}

      {/* 5. TERMINAL LOG STREAM BODY (Pure Jet Black #000000) */}
      <div className="relative flex-1 bg-black">
        <div
          ref={terminalBodyRef}
          onScroll={handleScroll}
          style={{ maxHeight }}
          className="p-3.5 overflow-y-auto space-y-1.5 text-xs bg-black scroll-smooth"
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
              bg: "bg-[#181818]",
              border: "border-[#333333]",
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
                    ? "bg-[#141414] border-[#383838] shadow-md"
                    : "bg-[#0d0d0d] border-[#1c1c1c] hover:bg-[#161616] hover:border-[#2a2a2a]"
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
                    <span className="hidden md:inline-block shrink-0 text-[9px] text-slate-400 bg-[#1c1c1c] px-1.5 py-0.5 rounded border border-[#2a2a2a]">
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
                  <div className="px-3 pb-3 pt-1 border-t border-[#262626] bg-[#080808] rounded-b-md space-y-2 text-xs">
                    {/* Agent Thought */}
                    {evt.agent_thought && (
                      <div className="p-2 rounded bg-[#111111] border border-[#262626] text-sky-200 text-[11px] font-sans flex items-start gap-2">
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
                              className="px-2 py-0.5 rounded bg-[#161616] border border-[#2a2a2a] flex items-center gap-1.5 text-[10px]"
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
                            className="px-1.5 py-0.2 rounded bg-[#181818] border border-[#333333] text-purple-300 font-mono"
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
        </div>

        {/* Floating "New logs received ↓" indicator when scrolled up */}
        {isUserScrolledUp && isStreaming && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-3 right-4 px-3 py-1 bg-[#222222] hover:bg-[#2c2c2c] text-white text-xs font-bold rounded-full shadow-lg border border-[#444444] flex items-center gap-1.5 animate-bounce cursor-pointer z-10"
          >
            <span>↓ New stream events</span>
          </button>
        )}
      </div>
    </div>
  );
};
