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
          timestamp: new Date().toLocaleTimeString(),
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
