/**
 * Airlane BVLOS Safety Engine API Service
 * Handles SSE Live Trace Streaming and Synchronous Safety Case Analysis
 */

import type { AnalysisResult, MissionInputPayload, TraceEvent } from "../types/airlane";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function checkHealth(): Promise<{ status: string; service: string }> {
  const response = await fetch(`${API_BASE_URL}/`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }
  return response.json();
}

export async function analyzePipelineSync(payload: MissionInputPayload): Promise<AnalysisResult> {
  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Analysis failed (${response.status}): ${errorBody}`);
  }

  return response.json();
}

export interface StreamCallbacks {
  onTrace: (event: TraceEvent) => void;
  onComplete: (result: AnalysisResult) => void;
  onError: (error: string) => void;
}

export function streamAnalysis(
  payload: MissionInputPayload,
  callbacks: StreamCallbacks
): () => void {
  const queryParams = new URLSearchParams({
    launch: payload.launch,
    destination: payload.destination,
    offset_distance_m: (payload.offset_distance_m ?? 600).toString(),
    sample_spacing_m: (payload.sample_spacing_m ?? 400).toString(),
    cruise_altitude_ft: (payload.cruise_altitude_ft ?? 300).toString(),
    drone_class: payload.drone_class ?? "small_uav",
  });

  const url = `${API_BASE_URL}/analyze/stream?${queryParams.toString()}`;
  let eventSource: EventSource | null = null;
  let isClosed = false;

  try {
    eventSource = new EventSource(url);

    eventSource.addEventListener("trace", (e: MessageEvent) => {
      if (isClosed) return;
      try {
        const data = JSON.parse(e.data);
        callbacks.onTrace({
          ...data,
          timestamp: data.timestamp || new Date().toLocaleTimeString(),
          raw_payload: data,
        });
      } catch (err) {
        console.error("Failed to parse trace event", err);
      }
    });

    eventSource.addEventListener("complete", (e: MessageEvent) => {
      if (isClosed) return;
      try {
        const result: AnalysisResult = JSON.parse(e.data);
        callbacks.onComplete(result);
        if (eventSource) {
          eventSource.close();
          isClosed = true;
        }
      } catch (err) {
        callbacks.onError("Failed to parse complete event payload");
      }
    });

    eventSource.addEventListener("error", (e: MessageEvent) => {
      if (isClosed) return;
      try {
        if (e.data) {
          const parsed = JSON.parse(e.data);
          callbacks.onError(parsed.error || "Streaming error received from server");
        } else {
          callbacks.onError("Connection dropped or failed to reach backend API at " + API_BASE_URL);
        }
      } catch {
        callbacks.onError("Connection to agent stream lost.");
      }
      if (eventSource) {
        eventSource.close();
        isClosed = true;
      }
    });

    eventSource.onerror = () => {
      if (!isClosed) {
        callbacks.onError("Lost connection to live agent stream. Please verify backend is running on port 8000.");
        if (eventSource) {
          eventSource.close();
          isClosed = true;
        }
      }
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to open EventSource stream";
    callbacks.onError(errorMsg);
  }

  // Return unsubscribe / cancel handler
  return () => {
    isClosed = true;
    if (eventSource) {
      eventSource.close();
    }
  };
}

import type { PlaceSuggestion } from "../types/airlane";

export const CURATED_PRESET_PLACES: PlaceSuggestion[] = [
  {
    label: "Cubberley Community Center, Palo Alto",
    secondary: "4000 Middlefield Rd, Palo Alto, CA 94303",
    lat: 37.4172,
    lng: -122.1084,
    category: "campus",
    badge: "ORIGIN HUB",
  },
  {
    label: "Byxbee Park, Baylands Palo Alto",
    secondary: "2380 Embarcadero Rd, Palo Alto, CA 94303",
    lat: 37.4481,
    lng: -122.1063,
    category: "safe_zone",
    badge: "RECOVERY ZONE",
  },
  {
    label: "Stanford Research Park, Palo Alto",
    secondary: "3000 Hanover St, Palo Alto, CA 94304",
    lat: 37.4241,
    lng: -122.148,
    category: "campus",
    badge: "INNOVATION HUB",
  },
  {
    label: "Moffett Federal Airfield Hub",
    secondary: "Mountain View / Sunnyvale, CA 94035",
    lat: 37.4161,
    lng: -122.0493,
    category: "airport",
    badge: "CLASS D AIRSPACE",
  },
  {
    label: "Palo Alto Airport (KPAO)",
    secondary: "1903 Embarcadero Rd, Palo Alto, CA 94303",
    lat: 37.4611,
    lng: -122.115,
    category: "airport",
    badge: "FAA AIRPORT",
  },
  {
    label: "480 Berdoll Ln, Cedar Creek TX",
    secondary: "Cedar Creek, TX 78612 (LCRA Power Grid)",
    lat: 30.1395,
    lng: -97.5462,
    category: "infrastructure",
    badge: "POWER GRID",
  },
  {
    label: "912 Elm St, Cedar Creek TX",
    secondary: "Cedar Creek, TX 78612 (Safe Corridor Endpoint)",
    lat: 30.17,
    lng: -97.497,
    category: "safe_zone",
    badge: "RECOVERY POINT",
  },
  {
    label: "Googleplex HQ, Mountain View",
    secondary: "1600 Amphitheatre Pkwy, Mountain View, CA 94043",
    lat: 37.422,
    lng: -122.0841,
    category: "campus",
    badge: "TECH CAMPUS",
  },
  {
    label: "Apple Park Campus, Cupertino",
    secondary: "1 Apple Park Way, Cupertino, CA 95014",
    lat: 37.3346,
    lng: -122.009,
    category: "campus",
    badge: "TECH CAMPUS",
  },
  {
    label: "Shoreline Amphitheatre Park, Mountain View",
    secondary: "1 Amphitheatre Pkwy, Mountain View, CA 94043",
    lat: 37.4277,
    lng: -122.0805,
    category: "safe_zone",
    badge: "OPEN FIELD",
  },
  {
    label: "San Carlos Airport (KSQL)",
    secondary: "620 Airport Way, San Carlos, CA 94070",
    lat: 37.5119,
    lng: -122.2494,
    category: "airport",
    badge: "FAA AIRPORT",
  },
  {
    label: "Austin-Bergstrom International Airport (KAUS)",
    secondary: "3600 Presidential Blvd, Austin, TX 78719",
    lat: 30.1975,
    lng: -97.6664,
    category: "airport",
    badge: "CLASS C AIRSPACE",
  },
  {
    label: "NASA Ames Research Center",
    secondary: "Moffett Blvd, Mountain View, CA 94035",
    lat: 37.4089,
    lng: -122.0644,
    category: "campus",
    badge: "FEDERAL FACILITY",
  },
];

/**
 * Real-time location search with dual-tier fallback:
 * 1. Backend `/places/autocomplete`
 * 2. Photon OpenStreetMap geocoding fallback
 * 3. Curated local presets matching
 */
export async function fetchPlaceSuggestions(
  query: string,
  limit: number = 6
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return CURATED_PRESET_PLACES.slice(0, limit);
  }

  // Coordinate check
  const coordRegex = /^\s*\(?\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)?\s*$/;
  const match = trimmed.match(coordRegex);
  const directCoordItem: PlaceSuggestion | null = match
    ? {
        label: `GPS: (${parseFloat(match[1]).toFixed(4)}, ${parseFloat(match[2]).toFixed(4)})`,
        secondary: "Direct Geographic Coordinates",
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2]),
        category: "coordinate",
        badge: "COORDINATES",
      }
    : null;

  // Try Backend Autocomplete Endpoint
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(
      `${API_BASE_URL}/places/autocomplete?q=${encodeURIComponent(trimmed)}&limit=${limit}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch {
    // Backend fetch failed or timed out, gracefully fall through to client fallback
  }

  // Client-side Fallback: Local Curated Match
  const lower = trimmed.toLowerCase();
  const matchedPresets = CURATED_PRESET_PLACES.filter(
    (p) =>
      p.label.toLowerCase().includes(lower) ||
      (p.secondary && p.secondary.toLowerCase().includes(lower))
  );

  const results: PlaceSuggestion[] = [];
  if (directCoordItem) {
    results.push(directCoordItem);
  }
  for (const p of matchedPresets) {
    if (!results.some((r) => r.label === p.label)) {
      results.push(p);
      if (results.length >= limit) break;
    }
  }

  // Client-side Fallback: Live Photon OSM query
  if (results.length < limit && trimmed.length >= 2) {
    try {
      const photonResp = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=${limit}`
      );
      if (photonResp.ok) {
        const photonData = await photonResp.json();
        const features = photonData?.features || [];
        for (const f of features) {
          const props = f.properties || {};
          const coords = f.geometry?.coordinates || [0, 0];
          const name = props.name || props.street || trimmed;
          const city = props.city || props.county || "";
          const state = props.state || props.country || "";
          const secParts = [props.street, city, state, props.postcode].filter(
            (s) => s && s !== name
          );
          const secondary = secParts.join(", ") || state;

          const osmVal = (props.osm_value || "").toLowerCase();
          const osmKey = (props.osm_key || "").toLowerCase();

          let category: PlaceSuggestion["category"] = "address";
          let badge = "LOCATION";

          if (
            osmVal.includes("aerodrome") ||
            osmVal.includes("airport") ||
            osmVal.includes("helipad")
          ) {
            category = "airport";
            badge = "AIRPORT";
          } else if (
            osmKey.includes("power") ||
            osmVal.includes("substation") ||
            osmVal.includes("line")
          ) {
            category = "infrastructure";
            badge = "INFRASTRUCTURE";
          } else if (
            osmVal.includes("park") ||
            osmVal.includes("pitch") ||
            osmVal.includes("garden") ||
            osmVal.includes("nature")
          ) {
            category = "safe_zone";
            badge = "OPEN FIELD";
          } else if (
            osmVal.includes("university") ||
            osmVal.includes("college") ||
            osmVal.includes("commercial") ||
            osmVal.includes("industrial")
          ) {
            category = "campus";
            badge = "CAMPUS";
          }

          const item: PlaceSuggestion = {
            label: name,
            secondary,
            lat: coords[1],
            lng: coords[0],
            category,
            badge,
          };

          if (
            !results.some(
              (r) =>
                r.label.toLowerCase() === item.label.toLowerCase() ||
                (Math.abs(r.lat - item.lat) < 0.001 &&
                  Math.abs(r.lng - item.lng) < 0.001)
            )
          ) {
            results.push(item);
            if (results.length >= limit) break;
          }
        }
      }
    } catch {
      // Ignore network errors on fallback
    }
  }

  return results.length > 0 ? results : matchedPresets.slice(0, limit);
}

