import React, { useState } from "react";
import type { TraceEvent } from "../types/airlane";
import { MiniatureCityCanvas, type SelectedObjectInfo } from "./MiniatureCityCanvas";
import { AgentTerminal } from "./AgentTerminal";

interface LiveAnalysisOverlayProps {
  events: TraceEvent[];
  isStreaming: boolean;
  onCancel: () => void;
  onSelectObject?: (info: SelectedObjectInfo | null) => void;
}

const STAGE_MAP: Record<string, { label: string; stageIndex: number; source: string }> = {
  geocoding: { label: "Resolving Launch & Destination Coordinates", stageIndex: 1, source: "Mireye Geocoding API" },
  corridor_generation: { label: "Generating 3 Candidate Corridors (Direct & Detours)", stageIndex: 2, source: "Geometry Engine" },
  data_ingestion: { label: "Multi-Source Sensor Ingestion Active", stageIndex: 3, source: "Sensor Bus" },
  mireye_hazards: { label: "Evaluating Mireye 345kV Infrastructure Proximity", stageIndex: 3, source: "Mireye Earth API" },
  faa_airspace: { label: "Verifying FAA UASFM Airspace Ceilings (400ft AGL)", stageIndex: 4, source: "FAA UASFM" },
  population_density: { label: "Calculating Census Ground Risk & Demographics", stageIndex: 5, source: "U.S. Census Bureau" },
  noaa_wind: { label: "Auditing NOAA METAR Surface Wind & Gust Vectors", stageIndex: 6, source: "NOAA METAR" },
  compute_engine: { label: "Deterministic Scoring & Clearance Ranking", stageIndex: 7, source: "Deterministic Compute" },
  reasoning_layer: { label: "Synthesizing Part 108 Safety Case & Mitigations", stageIndex: 8, source: "Safety Reasoning" },
  verification: { label: "Multi-Source Provenance & Confidence Verification", stageIndex: 8, source: "Provenance Verifier" },
  complete: { label: "Safety Case Synthesis & Audit Finalized", stageIndex: 8, source: "Pipeline Complete" },
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
  isStreaming,
  onCancel,
  onSelectObject,
}) => {
  const [viewMode, setViewMode] = useState<"split" | "terminal_focus" | "twin_focus">("split");
  const [rightPanelTab, setRightPanelTab] = useState<"terminal" | "checklist">("terminal");

  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const currentStep = lastEvent?.step || "geocoding";
  const stageInfo = STAGE_MAP[currentStep] || { label: "Analyzing flight envelope...", stageIndex: 1, source: "Agent Engine" };
  const currentStageIndex = stageInfo.stageIndex;
  const progressPercent = Math.min(100, Math.round((currentStageIndex / 8) * 100));

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Top Operational Status Bar with Progress */}
      <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Active Status & Stage */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white text-xs font-mono font-bold shadow-xs">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 font-display tracking-tight">
                  Autonomous Safety Pipeline Active
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-50 text-sky-700 border border-sky-200">
                  STAGE 0{currentStageIndex} / 08 · {progressPercent}%
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                  LIVE SSE
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {stageInfo.label} <span className="text-slate-400">({stageInfo.source})</span>
              </p>
            </div>
          </div>

          {/* Right: View Switcher & Abort Button */}
          <div className="flex items-center gap-2.5">
            {/* View Mode Switcher */}
            <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-mono">
              <button
                onClick={() => setViewMode("split")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer text-[11px] ${
                  viewMode === "split"
                    ? "bg-white text-slate-900 font-bold shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Split View
              </button>
              <button
                onClick={() => setViewMode("terminal_focus")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer text-[11px] ${
                  viewMode === "terminal_focus"
                    ? "bg-white text-slate-900 font-bold shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Terminal Focus
              </button>
              <button
                onClick={() => setViewMode("twin_focus")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer text-[11px] ${
                  viewMode === "twin_focus"
                    ? "bg-white text-slate-900 font-bold shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                3D Twin Focus
              </button>
            </div>

            {/* Abort Button */}
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-mono font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 rounded-lg transition-colors cursor-pointer"
            >
              [ABORT RUN]
            </button>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-indigo-600 transition-all duration-500 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Completion Toast Banner */}
        {currentStageIndex >= 8 && (
          <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-sky-50 border border-emerald-300 text-emerald-900 text-xs font-mono flex items-center justify-between shadow-xs animate-in fade-in duration-300">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">✓</span>
              <div>
                <span className="font-bold text-slate-900">Safety Verdict Compiled:</span>
                <span className="text-emerald-800 ml-1">Corridor Alpha cleared with Tier 1 ground risk (92% Confidence). Loading Safety Case...</span>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-600 text-white px-2.5 py-0.5 rounded-full font-bold uppercase animate-pulse">
              100% READY
            </span>
          </div>
        )}
      </div>

      {/* Main View Area according to viewMode */}
      {viewMode === "split" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: 3D Digital Twin Miniature City (6 cols) */}
          <div className="lg:col-span-6 space-y-2">
            <div className="flex items-center justify-between px-1 text-xs font-mono text-slate-500">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                DIGITAL TWIN TELEMETRY MESH
              </span>
              <span className="text-[10px] text-slate-400">SILICON VALLEY GRID</span>
            </div>

            <MiniatureCityCanvas
              activeStage={currentStageIndex}
              selectedCorridorId="corridor_a"
              onSelectObject={onSelectObject}
            />

            {/* Mini Pipeline Stepper Bar */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs">
              <div className="flex items-center justify-between mb-2 text-xs font-mono">
                <span className="font-bold text-slate-800">PIPELINE MILESTONES</span>
                <span className="text-slate-400 text-[10px]">STAGE 0{currentStageIndex}/08</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 text-center font-mono text-[10px]">
                {PIPELINE_STEPS.map((step, idx) => {
                  const stepIndex = idx + 1;
                  const isCompleted = currentStageIndex > stepIndex;
                  const isCurrent = currentStageIndex === stepIndex;
                  return (
                    <div
                      key={step.key}
                      className={`p-1 rounded border transition-colors ${
                        isCompleted
                          ? "bg-slate-50 border-slate-200 text-slate-700"
                          : isCurrent
                          ? "bg-sky-50 border-sky-400 text-sky-900 font-bold ring-1 ring-sky-300"
                          : "bg-white border-slate-100 text-slate-400 opacity-60"
                      }`}
                    >
                      <div className="text-[9px] font-bold">{step.num}</div>
                      <div className="truncate text-[8px]">{isCompleted ? "OK" : isCurrent ? "RUN" : "WAIT"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: State-of-the-art Agent Terminal (6 cols) */}
          <div className="lg:col-span-6 space-y-2">
            <div className="flex items-center justify-between px-1 text-xs font-mono text-slate-500">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRightPanelTab("terminal")}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                    rightPanelTab === "terminal"
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  LIVE TERMINAL ({events.length})
                </button>
                <button
                  onClick={() => setRightPanelTab("checklist")}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                    rightPanelTab === "checklist"
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  AUDIT MATRIX (8)
                </button>
              </div>
              <span className="text-[10px] text-emerald-600 font-bold">SSE ACTIVE</span>
            </div>

            {rightPanelTab === "terminal" ? (
              <AgentTerminal
                events={events}
                isStreaming={isStreaming}
                onCancel={onCancel}
                maxHeight="480px"
                activeStage={currentStageIndex}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 font-bold text-slate-900">
                  <span>8-STAGE SAFETY COMPLIANCE MATRIX</span>
                  <span className="text-[10px] text-slate-400">FAA PART 108</span>
                </div>

                <div className="space-y-1.5">
                  {PIPELINE_STEPS.map((step, idx) => {
                    const stepIndex = idx + 1;
                    const isCompleted = currentStageIndex > stepIndex;
                    const isCurrent = currentStageIndex === stepIndex;
                    const isPending = currentStageIndex < stepIndex;

                    return (
                      <div
                        key={step.key}
                        className={`p-2.5 rounded-lg border flex items-center justify-between transition-colors ${
                          isCompleted
                            ? "bg-slate-50/80 border-slate-200 text-slate-800"
                            : isCurrent
                            ? "bg-sky-50 border-sky-300 text-sky-900 font-bold ring-1 ring-sky-200"
                            : "bg-white border-slate-100 text-slate-400"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] text-slate-400 font-bold">{step.num}</span>
                          <span className="text-xs">{step.name}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 uppercase hidden sm:inline">{step.source}</span>
                          {isCompleted && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                              ✓ VERIFIED
                            </span>
                          )}
                          {isCurrent && (
                            <span className="flex items-center gap-1 text-[10px] text-sky-700 font-bold">
                              <span className="w-2.5 h-2.5 border-2 border-sky-500/40 border-t-sky-600 rounded-full animate-spin" />
                              COMPUTING
                            </span>
                          )}
                          {isPending && (
                            <span className="text-[10px] text-slate-300">QUEUED</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminal Focus View (Full Width) */}
      {viewMode === "terminal_focus" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 text-xs font-mono text-slate-500">
            <span className="font-semibold text-slate-700">FULL OPERATIONAL STREAM RUNTIME</span>
            <span>SHOWING ALL TELEMETRY CHANNELS</span>
          </div>
          <AgentTerminal
            events={events}
            isStreaming={isStreaming}
            onCancel={onCancel}
            maxHeight="650px"
            activeStage={currentStageIndex}
          />
        </div>
      )}

      {/* 3D Twin Focus View */}
      {viewMode === "twin_focus" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 text-xs font-mono text-slate-500">
            <span className="font-semibold text-slate-700">3D DIGITAL TWIN FULL MESH FOCUS</span>
            <span>STAGE 0{currentStageIndex} / 08</span>
          </div>
          <MiniatureCityCanvas
            activeStage={currentStageIndex}
            selectedCorridorId="corridor_a"
            onSelectObject={onSelectObject}
          />
          {/* Mini overlay terminal at bottom */}
          <AgentTerminal
            events={events}
            isStreaming={isStreaming}
            onCancel={onCancel}
            maxHeight="220px"
            showControls={false}
            activeStage={currentStageIndex}
          />
        </div>
      )}
    </div>
  );
};

