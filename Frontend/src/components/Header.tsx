import React from "react";

interface HeaderProps {
  serverStatus: "checking" | "online" | "offline";
  onReset?: () => void;
  activeView: "input" | "executing" | "results";
}

export const Header: React.FC<HeaderProps> = ({
  serverStatus,
  onReset,
  activeView,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.03)] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4">
        {/* LEFT: BRAND IDENTITY & PHYSICAL WORLD AI AGENT BADGE */}
        <div className="flex items-center gap-3.5">
          <div
            onClick={onReset}
            className="flex items-center gap-3 cursor-pointer group select-none"
            title="AirLane — Return to Mission Planner"
          >
            {/* Logo Container with Subtle Glow */}
            <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-xs border border-slate-200/80 bg-white flex items-center justify-center group-hover:scale-105 group-hover:border-sky-300 transition-all shrink-0">
              <img
                src="/logo.png"
                alt="AirLane Logo"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-sky-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Typography Brand & Sub-Badge */}
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-slate-950 tracking-tight font-instrument leading-none">
                  AirLane
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200/80 text-[9px] font-mono font-bold text-sky-800 tracking-wide uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                  AI Agent
                </span>
              </div>
              <p className="text-[10.5px] text-slate-500 hidden md:block font-mono tracking-tight mt-0.5">
                Physical World Infrastructure · FAA Part 108 Engine
              </p>
            </div>
          </div>
        </div>

        {/* CENTER: AGENT REASONING PIPELINE STAGES */}
        <div className="hidden xl:flex items-center gap-1 bg-slate-100/80 border border-slate-200/90 p-1 rounded-lg text-[11px] font-mono">
          {/* Step 1: Input */}
          <div
            onClick={onReset}
            className={`px-3 py-1 rounded-md flex items-center gap-1.5 cursor-pointer transition-all ${
              activeView === "input"
                ? "bg-white text-slate-950 font-bold shadow-xs border border-slate-200/80"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeView === "input" ? "bg-sky-600" : "bg-slate-400"}`} />
            <span>01 MISSION PLAN</span>
          </div>

          <span className="text-slate-300 px-0.5">→</span>

          {/* Step 2: Reasoning Stream */}
          <div
            className={`px-3 py-1 rounded-md flex items-center gap-1.5 transition-all ${
              activeView === "executing"
                ? "bg-white text-sky-900 font-bold shadow-xs border border-sky-200"
                : "text-slate-500"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeView === "executing" ? "bg-sky-600 animate-ping" : "bg-slate-300"}`} />
            <span>02 AGENT REASONING</span>
          </div>

          <span className="text-slate-300 px-0.5">→</span>

          {/* Step 3: Verdict & Safety Case */}
          <div
            className={`px-3 py-1 rounded-md flex items-center gap-1.5 transition-all ${
              activeView === "results"
                ? "bg-white text-emerald-950 font-bold shadow-xs border border-emerald-200"
                : "text-slate-500"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeView === "results" ? "bg-emerald-600" : "bg-slate-300"}`} />
            <span>03 PART 108 VERDICT</span>
          </div>
        </div>

        {/* RIGHT: LIVE TELEMETRY STATUS & AGENT HEALTH */}
        <div className="flex items-center gap-3">
          {/* Geolocation & Telemetry Badge (Desktop) */}
          <div className="hidden lg:flex items-center gap-2.5 px-3 py-1 rounded-md bg-white border border-slate-200 text-[11px] font-mono text-slate-600 shadow-2xs">
            <span className="text-slate-400">SECTOR:</span>
            <span className="font-semibold text-slate-800">37.42° N, 122.10° W</span>
            <span className="text-slate-300">|</span>
            <span className="text-emerald-700 font-bold">4 FEEDS SYNCED</span>
          </div>

          {/* Agent Engine Status Indicator */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-white border border-slate-200/90 text-xs text-slate-700 shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  serverStatus === "online"
                    ? "bg-emerald-400"
                    : serverStatus === "checking"
                    ? "bg-amber-400"
                    : "bg-sky-400"
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  serverStatus === "online"
                    ? "bg-emerald-500"
                    : serverStatus === "checking"
                    ? "bg-amber-500"
                    : "bg-sky-500"
                }`}
              />
            </span>
            <span className="font-mono text-[11px] font-semibold text-slate-800">
              {serverStatus === "online"
                ? "Agent Active"
                : serverStatus === "checking"
                ? "Connecting..."
                : "Sim Engine"}
            </span>
          </div>

          {/* New Mission Action Button (When in Results View) */}
          {activeView === "results" && (
            <button
              onClick={onReset}
              className="px-3 py-1.5 text-xs font-mono font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-md shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>↺ NEW MISSION</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
