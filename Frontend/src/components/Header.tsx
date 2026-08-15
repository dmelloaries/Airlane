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
    <header className="sticky top-0 z-40 bg-[#fbfbfa]/95 backdrop-blur-md border-b border-slate-200/90 px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div
          onClick={onReset}
          className="flex items-center gap-2.5 cursor-pointer group select-none"
        >
          {/* Silicon Valley Drone Navigation Icon */}
          <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white shadow-xs group-hover:bg-sky-700 transition-colors">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              <circle cx="12" cy="12" r="2.5" fill="white" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-slate-900 tracking-tight font-display">
                Airlane
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                BVLOS v1.0
              </span>
            </div>
            <p className="text-[10px] text-slate-500 hidden sm:block font-mono">
              Autonomous Flight Corridors · FAA Part 108 Digital Twin
            </p>
          </div>
        </div>
      </div>

      {/* Center Status: Coordinate Readout & Mode */}
      <div className="hidden lg:flex items-center gap-4 text-xs font-mono text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">BAY AREA SECTOR:</span>
          <span className="font-semibold text-slate-700">37.42° N, 122.10° W</span>
        </div>
        <span className="text-slate-300">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">AIRSPACE:</span>
          <span className="font-semibold text-slate-700">FAA CLASS D & G (400 FT AGL)</span>
        </div>
      </div>

      {/* Right Controls: Engine Status & Action */}
      <div className="flex items-center gap-2.5">
        {/* Backend status indicator */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs text-slate-700 shadow-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              serverStatus === "online"
                ? "bg-emerald-500 animate-pulse"
                : serverStatus === "checking"
                ? "bg-amber-400 animate-ping"
                : "bg-sky-400"
            }`}
          />
          <span className="font-mono text-[11px]">
            {serverStatus === "online"
              ? "Engine Active"
              : serverStatus === "checking"
              ? "Connecting..."
              : "Sim Engine"}
          </span>
        </div>

        {activeView === "results" && (
          <button
            onClick={onReset}
            className="px-3 py-1 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>New Mission</span>
            <span>→</span>
          </button>
        )}
      </div>
    </header>
  );
};
