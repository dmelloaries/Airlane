/**
 * Airlane BVLOS Route Risk & Part 108 Safety Case - TypeScript Interfaces
 */

export interface SamplePoint {
  index: number;
  lat: number;
  lng: number;
  distance_from_start_m: number;
  mile_marker: number;
}

export interface CorridorData {
  id: string;
  name: string;
  total_distance_m: number;
  sample_points: SamplePoint[];
  detour_offset_m?: number;
  corridor_type?: "direct" | "offset";
  bbox?: {
    min_lat: number;
    max_lat: number;
    min_lng: number;
    max_lng: number;
  };
}

export interface GeocodedLocation {
  input: string;
  normalized_address: string;
  lat: number;
  lng: number;
  source?: string;
  confidence?: string;
}

export interface ObstacleRisk {
  sample_index: number;
  lat: number;
  lng: number;
  distance_along_route_m: number;
  distance_along_route_miles: number;
  obstacle_type: string;
  distance_m: number;
  voltage_kv?: number | null;
  severity: "HIGH" | "MEDIUM" | "LOW";
  clearance_status: string;
  source: string;
  description: string;
}

export interface LandingZone {
  sample_index: number;
  lat: number;
  lng: number;
  distance_along_route_m: number;
  distance_along_route_miles: number;
  infrastructure_clearance_m: number;
  slope_degrees: number;
  elevation_m: number;
  fema_flood_zone?: string | null;
  source: string;
  description: string;
}

export interface TierEvaluation {
  dominant_tier: "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Tier 5";
  dominant_tier_rank: number;
  max_density_sq_mi: number;
  points_evaluated: number;
  risk_level?: string;
  source?: string;
}

export interface WindEvaluation {
  is_safe: boolean;
  station_id: string;
  wind_speed_kt: number;
  wind_gust_kt: number;
  drone_class: string;
  source?: string;
}

export interface HazardExposure {
  corridor_id: string;
  hazard_exposure_score: number;
  min_transmission_distance_m: number;
  min_substation_distance_m: number;
  total_samples: number;
  points_under_150m: number;
  points_under_500m: number;
  source?: string;
}

export interface ScoredCorridorMetrics {
  distance_m: number;
  tier: string;
  tier_rank: number;
  hazard_score: number;
  obstacle_count: number;
  wind_safe: boolean;
  min_transmission_m: number;
  completeness_ratio: number;
}

export interface DimensionWinners {
  tier_winner: string;
  hazard_exposure_winner: string;
  obstacle_winner: string;
  distance_winner: string;
}

export interface CompletenessQuality {
  completeness_ratio: number;
  total_inputs: number;
  complete_inputs: number;
  incomplete_inputs: number;
  confidence_level: "HIGH" | "MEDIUM" | "LOW";
}

export interface ComputedComparison {
  recommended_corridor: "corridor_a" | "corridor_b" | "corridor_c";
  recommended_name: string;
  reason: string;
  dimension_winners: DimensionWinners;
  rejected_corridors: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
  scored_metrics: Record<string, ScoredCorridorMetrics>;
  completeness?: Record<string, CompletenessQuality>;
}

export interface ProvenanceCitation {
  field: string;
  source: string;
  status: string;
  confidence: string;
}

export interface SafetyCase {
  recommended_corridor: "corridor_a" | "corridor_b" | "corridor_c";
  recommended_name: string;
  verdict_title: string;
  part108_tier: "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Tier 5";
  ground_risk_level: string;
  confidence_score: number;
  primary_justification: string;
  rejected_corridors: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
  flagged_risks: string[];
  landing_zones_summary: string;
  caveats: string[];
  provenance_citations: ProvenanceCitation[];
}

export interface AnalysisParameters {
  offset_distance_m: number;
  sample_spacing_m: number;
  cruise_altitude_ft: number;
  drone_class: string;
  total_latency_seconds?: number;
}

export interface AnalysisResult {
  launch: GeocodedLocation;
  destination: GeocodedLocation;
  parameters: AnalysisParameters;
  corridors: CorridorData[];
  computed: {
    corridor_a: {
      id: string;
      name: string;
      hazard_exposure: HazardExposure;
      tier: TierEvaluation;
      obstacles: ObstacleRisk[];
      landing_zones: LandingZone[];
      total_distance_m: number;
    };
    corridor_b: {
      id: string;
      name: string;
      hazard_exposure: HazardExposure;
      tier: TierEvaluation;
      obstacles: ObstacleRisk[];
      landing_zones: LandingZone[];
      total_distance_m: number;
    };
    corridor_c: {
      id: string;
      name: string;
      hazard_exposure: HazardExposure;
      tier: TierEvaluation;
      obstacles: ObstacleRisk[];
      landing_zones: LandingZone[];
      total_distance_m: number;
    };
    comparison: ComputedComparison;
  };
  computed_comparison: ComputedComparison;
  safety_case: SafetyCase;
}

export interface TraceEvent {
  step:
    | "geocoding"
    | "corridor_generation"
    | "data_ingestion"
    | "mireye_hazards"
    | "faa_airspace"
    | "population_density"
    | "noaa_wind"
    | "compute_engine"
    | "reasoning_layer"
    | "verification"
    | "complete"
    | "error";
  message: string;
  status: "in_progress" | "complete" | "failed";
  timestamp: string;
  category?: "agent" | "sensor" | "geometry" | "compute" | "system";
  level?: "info" | "success" | "warning" | "error";
  source_name?: string;
  agent_thought?: string;
  elapsed_ms?: number;
  corridor_id?: string;
  obstacle_count?: number;
  tiers?: Record<string, string>;
  is_safe?: boolean;
  confidence_score?: number;
  recommended_corridor?: string;
  launch?: GeocodedLocation;
  destination?: GeocodedLocation;
  distance_m?: number;
  metrics?: Record<string, string | number | boolean | null>;
  raw_payload?: Record<string, any>;
}

export interface MissionInputPayload {
  launch: string;
  destination: string;
  offset_distance_m?: number;
  sample_spacing_m?: number;
  cruise_altitude_ft?: number;
  drone_class?: "micro_uav" | "small_uav" | "medium_uav";
}

export interface PlaceSuggestion {
  label: string;
  secondary?: string;
  lat: number;
  lng: number;
  category: "airport" | "infrastructure" | "safe_zone" | "campus" | "address" | "coordinate";
  badge?: string;
}

export const AIRLANE_VERSION = "1.0.0";


