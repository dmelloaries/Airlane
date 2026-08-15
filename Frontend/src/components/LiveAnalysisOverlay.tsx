import React from "react";
import type { TraceEvent } from "../types/airlane";
import { MiniatureCityCanvas, type SelectedObjectInfo } from "./MiniatureCityCanvas";

interface LiveAnalysisOverlayProps {
  events: TraceEvent[];
  isStreaming: boolean;
  onCancel: () => void;
  onSelectObject?: (info: SelectedObjectInfo | null) => void;
}

const STAGE_MAP: Record<string, { label: string; stageIndex: number; icon: string }> = {
  geocoding: { label: "Resolving addresses & geocoding", stageIndex: 1, icon: "📍" },
  corridor_generation: { label: "Generating 3 candidate corridors", stageIndex: 2, icon: "🛣️" },
  mireye_hazards: { label: "Fetching Mireye infrastructure data (345kV lines)", stageIndex: 3, icon: "⚡" },
  faa_airspace: { label: "Fetching FAA airspace ceilings (400ft UASFM)", stageIndex: 4, icon: "🛡️" },
  population_density: { label: "Fetching Census population density (Part 108 Tiers)", stageIndex: 5, icon: "👥" },
  noaa_wind: { label: "Fetching NOAA wind & weather conditions", stageIndex: 6, icon: "💨" },
  compute_engine: { label: "Scoring and comparing candidate corridors", stageIndex: 7, icon: "⚙️" },
  reasoning_layer: { label: "Generating Part 108 safety case reasoning", stageIndex: 8, icon: "🧠" },
  verification: { label: "Verifying multi-source provenance & citations", stageIndex: 8, icon: "✅" },
  complete: { label: "Analysis complete — Corridor Alpha recommended", stageIndex: 8, icon: "🎯" },
};

export const LiveAnalysisOverlay: React.FC<LiveAnalysisOverlayProps> = ({
  events,
  isStreaming,
  onCancel,
  onSelectObject,
}) => {
  // Determine current active stage
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const currentStep = lastEvent?.step || "geocoding";
  const stageInfo = STAGE_MAP[currentStep] || { label: "Analyzing flight envelope...", stageIndex: 1, icon: "⚡" };
  const currentStageIndex = stageInfo.stageIndex;

  const PIPELINE_STEPS = [
    { key: "geocoding", name: "Resolve Launch & Destination Endpoints", icon: "📍" },
    { key: "corridor_generation", name: "Generate 3 Candidate Corridors", icon: "🛣️" },
    { key: "mireye_hazards", name: "Fetch Mireye Infrastructure (Powerlines & Obstacles)", icon: "⚡" },
    { key: "faa_airspace", name: "Fetch FAA Airspace Ceilings (Class D / UASFM)", icon: "🛡️" },
    { key: "population_density", name: "Fetch Census Population Density & Ground Tiers", icon: "👥" },
    { key: "noaa_wind", name: "Fetch NOAA Wind Vectors & Surface Gusts", icon: "💨" },
    { key: "compute_engine", name: "Score Risk Exposure & Emergency Landing Zones", icon: "⚙️" },
    { key: "reasoning_layer", name: "Synthesize Part 108 Safety Case & Verdict", icon: "🧠" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200/90 shadow-lg shadow-slate-200/40">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center text-white shadow-md shadow-sky-500/30">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight font-display">
                Airlane is analyzing your flight
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-sky-100 text-sky-700 border border-sky-200">
                LIVE PIPELINE
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              The digital twin environment updates in real time as data layers are fetched and evaluated
            </p>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
        >
          Cancel Mission Analysis
        </button>
      </div>

      {/* Main Grid: Live Digital Twin with Dynamic Layer Reveal + Live Trace Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Active Miniature Canvas (7 cols) */}
        <div className="lg:col-span-7 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700 font-display flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
              Dynamic Digital Twin Layer Activation
            </span>
            <span className="text-[11px] font-mono font-medium text-sky-600">
              Stage {currentStageIndex} of 8
            </span>
          </div>

          <MiniatureCityCanvas
            activeStage={currentStageIndex}
            selectedCorridorId="corridor_a"
            onSelectObject={onSelectObject}
          />
        </div>

        {/* Right: Live Trace Event Log (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xl shadow-slate-200/50 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 font-display">
                Real-Time Execution Steps
              </h3>
              <p className="text-[11px] text-slate-500">
                Authoritative backend pipeline trace
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              SSE Stream
            </span>
          </div>

          {/* Stepper Checklist */}
          <div className="space-y-2.5">
            {PIPELINE_STEPS.map((step, idx) => {
              const stepIndex = idx + 1;
              const isCompleted = currentStageIndex > stepIndex;
              const isCurrent = currentStageIndex === stepIndex;
              const isPending = currentStageIndex < stepIndex;

              return (
                <div
                  key={step.key}
                  className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                    isCompleted
                      ? "bg-emerald-50/60 border-emerald-200/80 text-emerald-900 font-medium"
                      : isCurrent
                      ? "bg-sky-50 border-sky-300 text-sky-900 font-semibold shadow-xs"
                      : "bg-slate-50/50 border-slate-200/50 text-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{step.icon}</span>
                    <span>{step.name}</span>
                  </div>

                  <div>
                    {isCompleted && (
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                        ✓
                      </span>
                    )}
                    {isCurrent && (
                      <span className="w-4 h-4 border-2 border-sky-500/30 border-t-sky-600 rounded-full animate-spin" />
                    )}
                    {isPending && (
                      <span className="text-[10px] font-mono text-slate-400">⏳</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Raw Message Log Drawer */}
          {events.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Latest Agent Output
              </label>
              <div className="p-3 rounded-xl bg-slate-900 text-sky-400 font-mono text-[11px] max-h-32 overflow-y-auto space-y-1 leading-relaxed">
                {events.slice(-4).map((e, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-slate-500 shrink-0">[{e.timestamp || "12:00:00"}]</span>
                    <span className="text-slate-200">{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
