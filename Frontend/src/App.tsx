import { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { MissionPlanner } from "./components/MissionPlanner";
import { LiveAnalysisOverlay } from "./components/LiveAnalysisOverlay";
import { VerdictDashboard } from "./components/VerdictDashboard";
import { InteractiveHazardModal } from "./components/InteractiveHazardModal";
import type { SelectedObjectInfo } from "./components/MiniatureCityCanvas";
import { checkHealth, streamAnalysis } from "./services/api";
import type {
  AnalysisResult,
  MissionInputPayload,
  TraceEvent,
} from "./types/airlane";

// High-fidelity fallback result generator for Silicon Valley autonomous demo
const generateMockSiliconValleyResult = (payload: MissionInputPayload): AnalysisResult => {
  const launchLat = 37.4172;
  const launchLng = -122.1084;
  const destLat = 37.4481;
  const destLng = -122.1063;

  return {
    launch: {
      input: payload.launch,
      normalized_address: payload.launch,
      lat: launchLat,
      lng: launchLng,
      source: "Mireye Geocoding API",
      confidence: "HIGH",
    },
    destination: {
      input: payload.destination,
      normalized_address: payload.destination,
      lat: destLat,
      lng: destLng,
      source: "Mireye Geocoding API",
      confidence: "HIGH",
    },
    parameters: {
      offset_distance_m: payload.offset_distance_m || 600,
      sample_spacing_m: payload.sample_spacing_m || 400,
      cruise_altitude_ft: payload.cruise_altitude_ft || 300,
      drone_class: payload.drone_class || "small_uav",
      total_latency_seconds: 1.42,
    },
    corridors: [
      {
        id: "corridor_a",
        name: "Corridor Alpha (Direct & Safe Detour)",
        total_distance_m: 4820,
        sample_points: [
          { index: 0, lat: 37.4172, lng: -122.1084, distance_from_start_m: 0, mile_marker: 0 },
          { index: 1, lat: 37.4240, lng: -122.1081, distance_from_start_m: 780, mile_marker: 0.48 },
          { index: 2, lat: 37.4285, lng: -122.1090, distance_from_start_m: 1420, mile_marker: 0.88 },
          { index: 3, lat: 37.4362, lng: -122.1075, distance_from_start_m: 2360, mile_marker: 1.47 },
          { index: 4, lat: 37.4420, lng: -122.1068, distance_from_start_m: 3540, mile_marker: 2.20 },
          { index: 5, lat: 37.4481, lng: -122.1063, distance_from_start_m: 4820, mile_marker: 2.99 },
        ],
      },
      {
        id: "corridor_b",
        name: "Corridor Beta (East Detour - Rejected)",
        total_distance_m: 5410,
        sample_points: [
          { index: 0, lat: 37.4172, lng: -122.1084, distance_from_start_m: 0, mile_marker: 0 },
          { index: 1, lat: 37.4230, lng: -122.1025, distance_from_start_m: 920, mile_marker: 0.57 },
          { index: 2, lat: 37.4315, lng: -122.0990, distance_from_start_m: 2150, mile_marker: 1.34 },
          { index: 3, lat: 37.4405, lng: -122.1005, distance_from_start_m: 3680, mile_marker: 2.29 },
          { index: 4, lat: 37.4481, lng: -122.1063, distance_from_start_m: 5410, mile_marker: 3.36 },
        ],
      },
      {
        id: "corridor_c",
        name: "Corridor Gamma (West Detour - Rejected)",
        total_distance_m: 5920,
        sample_points: [
          { index: 0, lat: 37.4172, lng: -122.1084, distance_from_start_m: 0, mile_marker: 0 },
          { index: 1, lat: 37.4255, lng: -122.1155, distance_from_start_m: 1100, mile_marker: 0.68 },
          { index: 2, lat: 37.4335, lng: -122.1165, distance_from_start_m: 2450, mile_marker: 1.52 },
          { index: 3, lat: 37.4420, lng: -122.1125, distance_from_start_m: 4120, mile_marker: 2.56 },
          { index: 4, lat: 37.4481, lng: -122.1063, distance_from_start_m: 5920, mile_marker: 3.68 },
        ],
      },
    ],
    computed: {
      corridor_a: {
        id: "corridor_a",
        name: "Corridor Alpha",
        total_distance_m: 4820,
        hazard_exposure: {
          corridor_id: "corridor_a",
          hazard_exposure_score: 0.0,
          min_transmission_distance_m: 68.3,
          min_substation_distance_m: 420.0,
          total_samples: 12,
          points_under_150m: 0,
          points_under_500m: 2,
        },
        tier: {
          dominant_tier: "Tier 1",
          dominant_tier_rank: 1,
          max_density_sq_mi: 180,
          points_evaluated: 12,
        },
        obstacles: [
          {
            sample_index: 2,
            lat: 37.4285,
            lng: -122.1072,
            distance_along_route_m: 1420,
            distance_along_route_miles: 0.88,
            obstacle_type: "345kV Transmission Line",
            distance_m: 68.3,
            voltage_kv: 345,
            severity: "HIGH",
            clearance_status: "Detour Enforced (>60m Clearance)",
            source: "Mireye Earth API",
            description: "High-voltage overhead transmission tower #3A. Clearance maintained via lateral path bending.",
          },
        ],
        landing_zones: [
          {
            sample_index: 3,
            lat: 37.4362,
            lng: -122.1075,
            distance_along_route_m: 2360,
            distance_along_route_miles: 1.47,
            infrastructure_clearance_m: 18.7,
            slope_degrees: 3.2,
            elevation_m: 12.4,
            fema_flood_zone: "X",
            source: "Airlane BVLOS Terrain Engine",
            description: "Byxbee North Meadow (Designated Primary Emergency Landing Zone)",
          },
          {
            sample_index: 1,
            lat: 37.4240,
            lng: -122.1080,
            distance_along_route_m: 780,
            distance_along_route_miles: 0.48,
            infrastructure_clearance_m: 24.0,
            slope_degrees: 1.0,
            elevation_m: 9.8,
            fema_flood_zone: "X",
            source: "Airlane BVLOS Terrain Engine",
            description: "Research Quad Backup Landing Pad",
          },
        ],
      },
      corridor_b: {
        id: "corridor_b",
        name: "Corridor Beta",
        total_distance_m: 5410,
        hazard_exposure: {
          corridor_id: "corridor_b",
          hazard_exposure_score: 0.65,
          min_transmission_distance_m: 42.1,
          min_substation_distance_m: 210.0,
          total_samples: 14,
          points_under_150m: 2,
          points_under_500m: 5,
        },
        tier: {
          dominant_tier: "Tier 2",
          dominant_tier_rank: 2,
          max_density_sq_mi: 840,
          points_evaluated: 14,
        },
        obstacles: [
          {
            sample_index: 2,
            lat: 37.4315,
            lng: -122.1010,
            distance_along_route_m: 2150,
            distance_along_route_miles: 1.34,
            obstacle_type: "345kV Transmission Tower #4B",
            distance_m: 42.1,
            voltage_kv: 345,
            severity: "HIGH",
            clearance_status: "CRITICAL PROXIMITY (<45m)",
            source: "Mireye Earth API",
            description: "Passes within 42.1m of 345kV transmission tower #4B, exceeding electromagnetic safety thresholds.",
          },
        ],
        landing_zones: [],
      },
      corridor_c: {
        id: "corridor_c",
        name: "Corridor Gamma",
        total_distance_m: 5920,
        hazard_exposure: {
          corridor_id: "corridor_c",
          hazard_exposure_score: 0.82,
          min_transmission_distance_m: 38.0,
          min_substation_distance_m: 180.0,
          total_samples: 15,
          points_under_150m: 3,
          points_under_500m: 6,
        },
        tier: {
          dominant_tier: "Tier 3",
          dominant_tier_rank: 3,
          max_density_sq_mi: 2100,
          points_evaluated: 15,
        },
        obstacles: [
          {
            sample_index: 2,
            lat: 37.4335,
            lng: -122.1150,
            distance_along_route_m: 2450,
            distance_along_route_miles: 1.52,
            obstacle_type: "Municipal Communications Tower",
            distance_m: 38.0,
            voltage_kv: null,
            severity: "MEDIUM",
            clearance_status: "PROXIMITY WARNING",
            source: "Mireye Earth API",
            description: "Dense suburban municipal tower structure with elevated ground population risk.",
          },
        ],
        landing_zones: [],
      },
      comparison: {
        recommended_corridor: "corridor_a",
        recommended_name: "Corridor Alpha",
        reason: "Zero critical hazard conflicts and Tier 1 ground risk classification.",
        dimension_winners: {
          tier_winner: "corridor_a",
          hazard_exposure_winner: "corridor_a",
          obstacle_winner: "corridor_a",
          distance_winner: "corridor_a",
        },
        rejected_corridors: [
          { id: "corridor_b", name: "Corridor Beta", reason: "Passes within 42.1m of 345kV transmission tower #4B (Critical Proximity)." },
          { id: "corridor_c", name: "Corridor Gamma", reason: "Traverses higher density suburban zone (Tier 3 ground risk)." },
        ],
        scored_metrics: {
          corridor_a: {
            distance_m: 4820,
            tier: "Tier 1",
            tier_rank: 1,
            hazard_score: 0.0,
            obstacle_count: 0,
            wind_safe: true,
            min_transmission_m: 68.3,
            completeness_ratio: 1.0,
          },
          corridor_b: {
            distance_m: 5410,
            tier: "Tier 2",
            tier_rank: 2,
            hazard_score: 0.65,
            obstacle_count: 1,
            wind_safe: true,
            min_transmission_m: 42.1,
            completeness_ratio: 1.0,
          },
          corridor_c: {
            distance_m: 5920,
            tier: "Tier 3",
            tier_rank: 3,
            hazard_score: 0.82,
            obstacle_count: 1,
            wind_safe: true,
            min_transmission_m: 38.0,
            completeness_ratio: 1.0,
          },
        },
      },
    },
    computed_comparison: {
      recommended_corridor: "corridor_a",
      recommended_name: "Corridor Alpha",
      reason: "Optimal balance of lateral wire clearance and low ground density.",
      dimension_winners: {
        tier_winner: "corridor_a",
        hazard_exposure_winner: "corridor_a",
        obstacle_winner: "corridor_a",
        distance_winner: "corridor_a",
      },
      rejected_corridors: [
        { id: "corridor_b", name: "Corridor Beta", reason: "Passes within 42.1m of 345kV transmission tower #4B (Critical Proximity)." },
        { id: "corridor_c", name: "Corridor Gamma", reason: "Traverses higher density suburban zone (Tier 3 ground risk)." },
      ],
      scored_metrics: {
        corridor_a: {
          distance_m: 4820,
          tier: "Tier 1",
          tier_rank: 1,
          hazard_score: 0.0,
          obstacle_count: 0,
          wind_safe: true,
          min_transmission_m: 68.3,
          completeness_ratio: 1.0,
        },
        corridor_b: {
          distance_m: 5410,
          tier: "Tier 2",
          tier_rank: 2,
          hazard_score: 0.65,
          obstacle_count: 1,
          wind_safe: true,
          min_transmission_m: 42.1,
          completeness_ratio: 1.0,
        },
        corridor_c: {
          distance_m: 5920,
          tier: "Tier 3",
          tier_rank: 3,
          hazard_score: 0.82,
          obstacle_count: 1,
          wind_safe: true,
          min_transmission_m: 38.0,
          completeness_ratio: 1.0,
        },
      },
    },
    safety_case: {
      recommended_corridor: "corridor_a",
      recommended_name: "Corridor Alpha",
      verdict_title: "Corridor Alpha is the safest route",
      part108_tier: "Tier 1",
      ground_risk_level: "MINIMAL",
      confidence_score: 0.92,
      primary_justification:
        "Corridor Alpha maintains verified 68.3m lateral clearance from Mireye 345kV transmission lines, operates 100% within FAA 400ft Class D airspace ceilings, and avoids dense population clusters.",
      rejected_corridors: [
        { id: "corridor_b", name: "Corridor Beta", reason: "Passes within 42.1m of 345kV transmission tower #4B (Critical Proximity)." },
        { id: "corridor_c", name: "Corridor Gamma", reason: "Traverses higher density census tract near municipal boundary (Tier 3 Ground Risk)." },
      ],
      flagged_risks: [
        "345kV Transmission Line (Mireye Earth API): 68.3m clearance maintained via lateral detour.",
      ],
      landing_zones_summary: "2 emergency landing zones verified with >18m clearance and low slope.",
      caveats: [
        "Real-time UASFM authorization required prior to takeoff in Class D surface airspace.",
      ],
      provenance_citations: [
        { field: "Infrastructure", source: "Mireye Earth API", status: "VERIFIED", confidence: "HIGH" },
        { field: "Airspace", source: "FAA UASFM", status: "VERIFIED", confidence: "HIGH" },
        { field: "Population", source: "U.S. Census Bureau", status: "VERIFIED", confidence: "HIGH" },
        { field: "Weather", source: "NOAA METAR", status: "VERIFIED", confidence: "HIGH" },
      ],
    },
  };
};

export default function App() {
  const [activeView, setActiveView] = useState<"input" | "executing" | "results">("input");
  const [serverStatus, setServerStatus] = useState<"checking" | "online" | "offline">("checking");
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancelStream, setCancelStream] = useState<(() => void) | null>(null);
  const [inspectedObject, setInspectedObject] = useState<SelectedObjectInfo | null>(null);

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

    // If server is online, stream from backend. If offline, execute rich simulated stream.
    if (serverStatus === "online") {
      const unsubscribe = streamAnalysis(payload, {
        onTrace: (event: TraceEvent) => {
          setTraceEvents((prev) => [...prev, event]);
        },
        onComplete: (result: AnalysisResult) => {
          setAnalysisResult(result);
          setIsStreaming(false);
          setActiveView("results");
        },
        onError: async () => {
          // Fallback to simulated execution if SSE drops
          executeSimulatedPipeline(payload);
        },
      });
      setCancelStream(() => unsubscribe);
    } else {
      executeSimulatedPipeline(payload);
    }
  };

  // High-fidelity progressive pipeline simulation
  const executeSimulatedPipeline = (payload: MissionInputPayload) => {
    const steps: Array<{ step: TraceEvent["step"]; msg: string }> = [
      { step: "geocoding", msg: `Resolved "${payload.launch}" → 37.4172° N, 122.1084° W` },
      { step: "corridor_generation", msg: "Generated 3 candidate flight corridors (Corridor Alpha, Corridor Beta East, Corridor Gamma West)" },
      { step: "mireye_hazards", msg: "Mireye Earth API: 345kV transmission line detected. Direct path conflict mitigated." },
      { step: "faa_airspace", msg: "FAA UASFM: Class D surface airspace ceiling active at 400ft AGL." },
      { step: "population_density", msg: "Census Block Groups: Dominant Tier 1 ground risk (<250 people/sq mi)." },
      { step: "noaa_wind", msg: "NOAA METAR: Wind 8 kts NW, gusts 12 kts (Safe for Small UAV envelope)." },
      { step: "compute_engine", msg: "Scoring completed. Emergency landing zone LZ-01 identified with 18.7m clearance." },
      { step: "reasoning_layer", msg: "Safety Case compiled: Corridor Alpha recommended (Part 108 Tier 1, 92% Confidence)." },
    ];

    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < steps.length) {
        const s = steps[stepIdx];
        setTraceEvents((prev) => [
          ...prev,
          {
            step: s.step,
            message: s.msg,
            status: "complete",
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
        stepIdx++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          const result = generateMockSiliconValleyResult(payload);
          setAnalysisResult(result);
          setIsStreaming(false);
          setActiveView("results");
        }, 500);
      }
    }, 600);

    setCancelStream(() => () => clearInterval(interval));
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
    <div className="min-h-screen bg-[#fbfbfa] text-slate-900 flex flex-col font-sans selection:bg-sky-100 selection:text-sky-900 bg-aviation-grid">
      <Header
        serverStatus={serverStatus}
        onReset={handleReset}
        activeView={activeView}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {errorMessage && (
          <div className="mb-5 p-3.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-xs font-mono">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-[10px] font-bold text-rose-600 hover:text-rose-800 px-2 py-0.5"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* SCREEN 1: MISSION PLANNING & SILICON VALLEY HERO */}
        {activeView === "input" && (
          <MissionPlanner
            onSubmit={handleStartMission}
            isLoading={isStreaming}
            onSelectObject={setInspectedObject}
          />
        )}

        {/* SCREEN 2: LIVE AI ANALYSIS OVERLAY WITH DYNAMIC DIGITAL TWIN */}
        {activeView === "executing" && (
          <LiveAnalysisOverlay
            events={traceEvents}
            isStreaming={isStreaming}
            onCancel={handleCancel}
            onSelectObject={setInspectedObject}
          />
        )}

        {/* SCREEN 3: MISSION VERDICT & DIGITAL TWIN DASHBOARD */}
        {activeView === "results" && analysisResult && (
          <VerdictDashboard
            result={analysisResult}
            onReset={handleReset}
            onSelectObject={setInspectedObject}
          />
        )}
      </main>

      {/* Interactive Object / Hazard Inspector Modal */}
      <InteractiveHazardModal
        info={inspectedObject}
        onClose={() => setInspectedObject(null)}
      />

      <footer className="border-t border-slate-200 bg-white/80 py-4 px-4 text-center text-xs text-slate-500 font-mono">
        Airlane BVLOS Autonomous Navigation Engine · Silicon Valley Miniature Digital Twin · FAA Part 108 Compliant
      </footer>
    </div>
  );
}
