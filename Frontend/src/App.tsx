import { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { MissionInputForm } from "./components/MissionInputForm";
import { LiveTracePanel } from "./components/LiveTracePanel";
import { VerdictCard } from "./components/VerdictCard";
import { MapView } from "./components/MapView";
import { CorridorTable } from "./components/CorridorTable";
import { FlaggedRisksList } from "./components/FlaggedRisksList";
import { LandingZonesList } from "./components/LandingZonesList";
import { ProvenanceAudit } from "./components/ProvenanceAudit";
import {
  checkHealth,
  streamAnalysis,
  analyzePipelineSync,
} from "./services/api";
import type {
  AnalysisResult,
  MissionInputPayload,
  TraceEvent,
} from "./types/airlane";

export default function App() {
  const [activeView, setActiveView] = useState<"input" | "executing" | "results">("input");
  const [serverStatus, setServerStatus] = useState<"checking" | "online" | "offline">("checking");
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancelStream, setCancelStream] = useState<(() => void) | null>(null);

  // Check backend server health on mount
  useEffect(() => {
    let isMounted = true;
    checkHealth()
      .then(() => {
        if (isMounted) setServerStatus("online");
      })
      .catch(() => {
        if (isMounted) setServerStatus("offline");
      });

    const interval = setInterval(() => {
      checkHealth()
        .then(() => {
          if (isMounted) setServerStatus("online");
        })
        .catch(() => {
          if (isMounted) setServerStatus("offline");
        });
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleStartMission = (payload: MissionInputPayload) => {
    setErrorMessage(null);
    setTraceEvents([]);
    setIsStreaming(true);
    setActiveView("executing");

    // Open SSE live stream
    const unsubscribe = streamAnalysis(payload, {
      onTrace: (event: TraceEvent) => {
        setTraceEvents((prev) => [...prev, event]);
      },
      onComplete: (result: AnalysisResult) => {
        setAnalysisResult(result);
        setIsStreaming(false);
        setActiveView("results");
      },
      onError: async (errorStr: string) => {
        console.warn("Live SSE stream encountered issue, attempting synchronous fallback...", errorStr);
        try {
          // Attempt fallback to synchronous POST /analyze
          const syncResult = await analyzePipelineSync(payload);
          setAnalysisResult(syncResult);
          setIsStreaming(false);
          setActiveView("results");
        } catch (syncErr: unknown) {
          const syncMsg = syncErr instanceof Error ? syncErr.message : "Analysis pipeline failed";
          setErrorMessage(`Analysis failed: ${syncMsg}. Please ensure the backend server is running on port 8000.`);
          setIsStreaming(false);
          setActiveView("input");
        }
      },
    });

    setCancelStream(() => unsubscribe);
  };

  const handleCancel = () => {
    if (cancelStream) {
      cancelStream();
    }
    setIsStreaming(false);
    setActiveView("input");
  };

  const handleReset = () => {
    if (cancelStream) {
      cancelStream();
    }
    setIsStreaming(false);
    setTraceEvents([]);
    setAnalysisResult(null);
    setErrorMessage(null);
    setActiveView("input");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200">
      <Header
        serverStatus={serverStatus}
        onReset={handleReset}
        activeView={activeView}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs text-rose-400 hover:text-white px-2 py-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* SCREEN 1: MISSION PLANNING INPUT FORM */}
        {activeView === "input" && (
          <div className="py-6 sm:py-10">
            <MissionInputForm
              onSubmit={handleStartMission}
              isLoading={isStreaming}
            />
          </div>
        )}

        {/* SCREEN 1.5: LIVE AGENT EXECUTION TRACE STREAM (SSE) */}
        {activeView === "executing" && (
          <div className="py-6 sm:py-10 space-y-6">
            <LiveTracePanel
              events={traceEvents}
              isStreaming={isStreaming}
              onCancel={handleCancel}
            />
          </div>
        )}

        {/* SCREEN 2: SAFETY CASE & MISSION RESULTS DASHBOARD */}
        {activeView === "results" && analysisResult && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Top Row: Mission Verdict Card */}
            <VerdictCard
              safetyCase={analysisResult.safety_case}
              comparison={analysisResult.computed_comparison}
            />

            {/* Middle Row: Phase 11 Geospatial Leaflet Map */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    BVLOS Geospatial Route Map & Hazard Visualizer
                  </h3>
                  <p className="text-xs text-slate-400">
                    Real sampled coordinate polylines, Mireye powerline hazard pins, and safe emergency landing sites
                  </p>
                </div>
              </div>
              <MapView result={analysisResult} />
            </div>

            {/* Candidate Corridors Comparative Matrix */}
            <CorridorTable result={analysisResult} />

            {/* Two-Column Detail Grid: Flagged Hazards & Landing Zones */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <FlaggedRisksList
                flaggedRisks={analysisResult.safety_case.flagged_risks}
              />
              <LandingZonesList
                landingZones={
                  analysisResult.computed[analysisResult.safety_case.recommended_corridor]?.landing_zones || []
                }
              />
            </div>

            {/* Bottom Row: Provenance Audit Trail & Caveats */}
            <ProvenanceAudit
              caveats={analysisResult.safety_case.caveats}
              provenanceCitations={analysisResult.safety_case.provenance_citations}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 py-6 px-4 text-center text-xs text-slate-600 font-mono">
        Airlane BVLOS Route Risk & Part 108 Ground Tier Safety Case Engine • 100% Grounded Multi-Source Analysis
      </footer>
    </div>
  );
}
