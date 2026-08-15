import React from "react";

interface HeaderProps {
  serverStatus: "checking" | "online" | "offline";
  onReset?: () => void;
  activeView: "input" | "executing" | "results";
  onTabChange?: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  serverStatus,
  onReset,
  activeView,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div
          onClick={onReset}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          {/* Custom Silicon Valley Style Drone Icon */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              <circle cx="12" cy="12" r="3" fill="white" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-slate-900 tracking-tight font-display">
                Airlane
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-200">
                Silicon Valley Ed.
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 hidden sm:block">
              Autonomous Flight Corridors & Part 108 Digital Twin
            </p>
          </div>
        </div>
      </div>

      {/* Center Navigation Links (Minimal Silicon Valley style) */}
      <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 text-xs font-semibold text-slate-600">
        <button
          onClick={onReset}
          className={`px-3 py-1.5 rounded-lg transition-all ${
            activeView === "input"
              ? "bg-white text-sky-600 shadow-xs font-bold"
              : "hover:text-slate-900"
          }`}
        >
          Plan Route
        </button>
        <button
          onClick={() => {}}
          className={`px-3 py-1.5 rounded-lg transition-all ${
            activeView === "results"
              ? "bg-white text-sky-600 shadow-xs font-bold"
              : "hover:text-slate-900"
          }`}
        >
          Corridor Digital Twin
        </button>
        <button
          onClick={() => {}}
          className="px-3 py-1.5 rounded-lg hover:text-slate-900 transition-all text-slate-500"
        >
          Intelligence Layers
        </button>
        <button
          onClick={() => {}}
          className="px-3 py-1.5 rounded-lg hover:text-slate-900 transition-all text-slate-500"
        >
          Settings
        </button>
      </nav>

      {/* Right Controls: Engine Status & New Mission CTA */}
      <div className="flex items-center gap-3">
        {/* Backend status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-700 shadow-xs">
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
              ? "Engine Active (FastAPI)"
              : serverStatus === "checking"
              ? "Connecting..."
              : "Simulation Ready"}
          </span>
        </div>

        {activeView === "results" && (
          <button
            onClick={onReset}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-sm shadow-sky-600/20 rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>New Route</span>
          </button>
        )}
      </div>
    </header>
  );
};
