import React from "react";
import type { TraceEvent } from "../types/airlane";
import { MiniatureCityCanvas, type SelectedObjectInfo } from "./MiniatureCityCanvas";

interface LiveAnalysisOverlayProps {
  events: TraceEvent[];
  isStreaming: boolean;
  onCancel: () => void;
  onSelectObject?: (info: SelectedObjectInfo | null) => void;
}

const STAGE_MAP: Record<string, { label: string; stageIndex: number }> = {
  geocoding: { label: "Resolving Launch & Destination Endpoints", stageIndex: 1 },
  corridor_generation: { label: "Generating 3 Candidate Corridors", stageIndex: 2 },
  data_ingestion: { label: "Parallel Data Ingestion Active", stageIndex: 3 },
  mireye_hazards: { label: "Evaluating Mireye 345kV Infrastructure", stageIndex: 3 },
  faa_airspace: { label: "Verifying FAA UASFM Airspace Ceilings", stageIndex: 4 },
  population_density: { label: "Calculating Census Ground Risk Tiers", stageIndex: 5 },
  noaa_wind: { label: "Auditing NOAA METAR Wind Vectors", stageIndex: 6 },
  compute_engine: { label: "Deterministic Scoring & Clearance Ranking", stageIndex: 7 },
  reasoning_layer: { label: "Synthesizing Part 108 Safety Case", stageIndex: 8 },
  verification: { label: "Multi-Source Provenance Verification", stageIndex: 8 },
  complete: { label: "Safety Case Verification Complete", stageIndex: 8 },
};

const PIPELINE_STEPS = [
  { key: "geocoding", num: "01", name: "RESOLVING ENDPOINTS", source: "GEOCODING" },
  { key: "corridor_generation", num: "02", name: "GENERATING CORRIDORS", source: "GEOMETRY" },
  { key: "mireye_hazards", num: "03", name: "MIREYE INFRASTRUCTURE (345kV)", source: "MIREYE API" },
  { key: "faa_airspace", num: "04", name: "FAA AIRSPACE CEILINGS (400ft)", source: "FAA UASFM" },
  { key: "population_density", num: "05", name: "CENSUS POPULATION TIERS", source: "US CENSUS" },
  { key: "noaa_wind", num: "06", name: "NOAA WIND & METAR VECTORS", source: "NOAA METAR" },
  { key: "compute_engine", num: "07", name: "DETERMINISTIC SCORING", source: "COMPUTE ENGINE" },
  { key: "reasoning_layer", num: "08", name: "PART 108 SAFETY CASE SYNTHESIS", source: "SAFETY REASONING" },
];

export const LiveAnalysisOverlay: React.FC<LiveAnalysisOverlayProps> = ({
  events,
  onCancel,
  onSelectObject,
}) => {
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const currentStep = lastEvent?.step || "geocoding";
  const stageInfo = STAGE_MAP[currentStep] || { label: "Analyzing flight envelope...", stageIndex: 1 };
  const currentStageIndex = stageInfo.stageIndex;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Operational Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-white border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-sky-600 flex items-center justify-center text-white text-xs font-mono font-bold">
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900 font-display">
                Autonomous Safety Pipeline Active
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-sky-50 text-sky-700 border border-sky-200">
                STAGE 0{currentStageIndex} / 08
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">
              {stageInfo.label}
            </p>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs font-mono text-slate-500 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-md transition-colors cursor-pointer"
        >
          [ABORT PIPELINE]
        </button>
      </div>

      {/* Main Grid: Living 3D Twin (7 cols) + Engineering Execution Log (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Active Miniature Canvas */}
        <div className="lg:col-span-7 space-y-1.5">
          <div className="flex items-center justify-between px-1 text-xs font-mono text-slate-500">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
              DIGITAL TWIN LAYER REVEAL
            </span>
            <span>REAL-TIME TELEMETRY</span>
          </div>

          <MiniatureCityCanvas
            activeStage={currentStageIndex}
            selectedCorridorId="corridor_a"
            onSelectObject={onSelectObject}
          />
        </div>

        {/* Right: Operational Engineering Log */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 font-mono text-xs">
            <span className="font-bold text-slate-900">ENGINEERING TRACE LOG</span>
            <span className="text-slate-400 text-[10px]">SSE / STREAM</span>
          </div>

          {/* Stepper Checklist */}
          <div className="space-y-1 font-mono text-xs">
            {PIPELINE_STEPS.map((step, idx) => {
              const stepIndex = idx + 1;
              const isCompleted = currentStageIndex > stepIndex;
              const isCurrent = currentStageIndex === stepIndex;
              const isPending = currentStageIndex < stepIndex;

              return (
                <div
                  key={step.key}
                  className={`px-2.5 py-1.5 rounded border flex items-center justify-between transition-colors ${
                    isCompleted
                      ? "bg-slate-50 border-slate-200 text-slate-800"
                      : isCurrent
                      ? "bg-sky-50 border-sky-300 text-sky-900 font-bold"
                      : "bg-white border-transparent text-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-semibold">{step.num}</span>
                    <span className="text-[11px] truncate">{step.name}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] text-slate-400 uppercase hidden sm:inline">{step.source}</span>
                    {isCompleted && (
                      <span className="text-emerald-600 font-bold text-[10px]">
                        [OK]
                      </span>
                    )}
                    {isCurrent && (
                      <span className="w-3 h-3 border-2 border-sky-500/30 border-t-sky-600 rounded-full animate-spin" />
                    )}
                    {isPending && (
                      <span className="text-[10px] text-slate-300">···</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Message Output */}
          {events.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                Live Trace Output
              </span>
              <div className="p-2.5 rounded bg-slate-900 text-slate-200 font-mono text-[11px] max-h-28 overflow-y-auto space-y-1 leading-normal">
                {events.slice(-5).map((e, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <span className="text-slate-500 shrink-0">[{e.timestamp || "00:00"}]</span>
                    <span className="text-sky-300">{e.message}</span>
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
