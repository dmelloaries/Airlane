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
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div
          onClick={onReset}
          className="flex items-center gap-3 sm:gap-3.5 cursor-pointer group select-none"
        >
          {/* AirLane Drone Navigation Brand Logo */}
          <div className="w-11 h-11 rounded-xl overflow-hidden shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
            <img
              src="/logo.png"
              alt="AirLane Logo"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col justify-center">
            <span className="text-2xl font-bold text-slate-900 tracking-tight font-instrument leading-none">
              AirLane
            </span>
            <p className="text-[11px] text-slate-500 hidden sm:block font-mono tracking-tight mt-1">
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
