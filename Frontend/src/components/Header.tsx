import React from "react";

interface HeaderProps {
  serverStatus: "checking" | "online" | "offline";
  onReset?: () => void;
  activeView: "input" | "executing" | "results";
}

export const Header: React.FC<HeaderProps> = ({ serverStatus, onReset, activeView }) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-400 via-cyan-500 to-blue-600 p-[1.5px] shadow-lg shadow-cyan-500/20">
          <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
            <svg
              className="w-5 h-5 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-cyan-300 to-sky-400">
              AIRLANE
            </span>
            <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Part 108 Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">
            BVLOS Route Risk & Autonomous Ground Tier Safety Case Classifier
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Backend status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium">
          <span
            className={`w-2 h-2 rounded-full ${
              serverStatus === "online"
                ? "bg-emerald-400 animate-pulse"
                : serverStatus === "checking"
                ? "bg-amber-400 animate-ping"
                : "bg-rose-500"
            }`}
          />
          <span className="text-slate-300">
            {serverStatus === "online"
              ? "Engine Online"
              : serverStatus === "checking"
              ? "Connecting..."
              : "Engine Offline"}
          </span>
        </div>

        {activeView === "results" && (
          <button
            onClick={onReset}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            New Mission
          </button>
        )}
      </div>
    </header>
  );
};
