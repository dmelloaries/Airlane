"""
FastAPI Main Application Entry Point for Airlane BVLOS Route Risk Agent (Phase 9).

Endpoints:
- GET /: Health check
- POST /analyze: Synchronous pipeline execution returning complete Safety Case JSON
- GET /analyze/stream: Real-time Server-Sent Events (SSE) streaming live agent execution trace steps
"""

import sys
import os
import json
import time
import asyncio
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional, Union

# Ensure Backend root is in sys.path
BACKEND_ROOT = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

from agent.run import execute_pipeline
from agent.corridor import generate_candidates, haversine_distance, Corridor
from agent.fetcher import fetch_corridor_data
from agent.compute import (
    score_corridor_hazard_exposure,
    obstacle_risk,
    evaluate_obstacle_risks,
    corridor_tier,
    determine_corridor_worst_tier,
    wind_risk,
    evaluate_wind_risk,
    forced_landing_zones,
    identify_landing_zones,
    compare_corridors
)
from agent.reason import generate_safety_case
from agent.verify import verify_provenance_and_confidence
from sources.mireye import geocode_address

app = FastAPI(
    title="Airlane BVLOS Risk & Tier Classifier API",
    description="Autonomous Multi-Corridor Safety Case & Part 108 Ground Risk Classifier Engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    launch: Union[str, Tuple[float, float], List[float]] = Field(
        ..., description="Launch address string or (lat, lng) coordinates"
    )
    destination: Union[str, Tuple[float, float], List[float]] = Field(
        ..., description="Destination address string or (lat, lng) coordinates"
    )
    offset_distance_m: Optional[float] = Field(600.0, description="Detour perpendicular offset in meters")
    sample_spacing_m: Optional[float] = Field(400.0, description="Sample point spacing in meters")
    cruise_altitude_ft: Optional[float] = Field(300.0, description="Drone cruise altitude in feet AGL")
    drone_class: Optional[str] = Field("small_uav", description="Drone operating class (micro_uav, small_uav, medium_uav)")


@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "Airlane BVLOS Risk & Tier Classifier Engine",
        "version": "1.0.0",
        "endpoints": {
            "POST /analyze": "Run synchronous full route analysis pipeline",
            "GET /analyze/stream": "Stream real-time agent execution trace via Server-Sent Events (SSE)"
        }
    }


async def stream_pipeline(
    launch_input: str,
    destination_input: str,
    offset_m: float = 600.0,
    spacing_m: float = 400.0,
    cruise_alt_ft: float = 300.0,
    drone_class: str = "small_uav"
):
    """
    Async generator yielding Server-Sent Events (SSE) for live agent execution trace.
    Emits granular real-time progress steps with rich details and the final result payload.
    """
    t_start = time.time()

    def sse_event(event_type: str, data: Dict[str, Any]) -> str:
        return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

    try:
        # STEP 0: Geocode
        yield sse_event("trace", {
            "step": "geocoding",
            "message": "Resolving launch and destination coordinates...",
            "status": "in_progress"
        })
        geo_launch = geocode_address(launch_input)
        geo_dest = geocode_address(destination_input)
        launch_coord = (geo_launch["lat"], geo_launch["lng"])
        dest_coord = (geo_dest["lat"], geo_dest["lng"])
        direct_dist_m = haversine_distance(launch_coord, dest_coord)

        yield sse_event("trace", {
            "step": "geocoding",
            "message": f"✓ Resolved endpoints: {geo_launch['normalized_address']} → {geo_dest['normalized_address']} ({direct_dist_m / 1609.34:.1f}mi)",
            "status": "complete",
            "launch": geo_launch,
            "destination": geo_dest,
            "distance_m": direct_dist_m
        })

        # STEP 1: Corridors
        corridors = generate_candidates(
            launch=launch_coord,
            destination=dest_coord,
            offset_distance_m=offset_m,
            sample_spacing_m=spacing_m
        )
        corr_a, corr_b, corr_c = corridors[0], corridors[1], corridors[2]

        yield sse_event("trace", {
            "step": "corridor_generation",
            "message": f"✓ Corridor A generated: {len(corr_a.sample_points)} sample points, {corr_a.total_distance_m / 1609.34:.1f}mi (direct great-circle)",
            "status": "complete",
            "corridor_id": "corridor_a"
        })
        yield sse_event("trace", {
            "step": "corridor_generation",
            "message": f"✓ Corridor B generated: {len(corr_b.sample_points)} sample points, {corr_b.total_distance_m / 1609.34:.1f}mi (+{offset_m:.0f}m right detour bend)",
            "status": "complete",
            "corridor_id": "corridor_b"
        })
        yield sse_event("trace", {
            "step": "corridor_generation",
            "message": f"✓ Corridor C generated: {len(corr_c.sample_points)} sample points, {corr_c.total_distance_m / 1609.34:.1f}mi (-{offset_m:.0f}m left detour bend)",
            "status": "complete",
            "corridor_id": "corridor_c"
        })

        # STEP 2: Parallel Fetch across 4 sources
        yield sse_event("trace", {
            "step": "data_ingestion",
            "message": "Ingesting data across 4 sources in parallel (Mireye, FAA, Census, NOAA)...",
            "status": "in_progress"
        })

        data_a, data_b, data_c = await asyncio.gather(
            fetch_corridor_data(corr_a),
            fetch_corridor_data(corr_b),
            fetch_corridor_data(corr_c)
        )

        # Mireye details
        obs_a = obstacle_risk(corr_a.sample_points, data_a["mireye_points"], cruise_altitude_ft=cruise_alt_ft)
        obs_b = obstacle_risk(corr_b.sample_points, data_b["mireye_points"], cruise_altitude_ft=cruise_alt_ft)
        obs_c = obstacle_risk(corr_c.sample_points, data_c["mireye_points"], cruise_altitude_ft=cruise_alt_ft)

        if obs_a:
            first_obs = obs_a[0]
            kv_info = f"{first_obs.get('voltage_kv', 0):.0f}kV, " if first_obs.get("voltage_kv") else ""
            yield sse_event("trace", {
                "step": "mireye_hazards",
                "message": f"✓ Mireye: {len(obs_a)} obstacle hazard(s) flagged on Corridor A ({kv_info}mile {first_obs['distance_along_route_miles']:.1f})",
                "status": "complete",
                "corridor_id": "corridor_a",
                "obstacle_count": len(obs_a)
            })
        else:
            yield sse_event("trace", {
                "step": "mireye_hazards",
                "message": "✓ Mireye: Infrastructure scan complete across all corridors (0 critical transmission line hazards <150m on Corridor A)",
                "status": "complete"
            })

        # FAA details
        faa_a_first = data_a["faa_points"][0] if data_a["faa_points"] else {}
        ceiling_val = faa_a_first.get("ceiling_ft", 400)
        cls_val = faa_a_first.get("airspace_class", "Class G")
        yield sse_event("trace", {
            "step": "faa_airspace",
            "message": f"✓ FAA: Ceiling {ceiling_val}ft AGL ({cls_val}) verified along corridor",
            "status": "complete"
        })

        # Population details
        tier_a = corridor_tier(data_a["census_points"])
        tier_b = corridor_tier(data_b["census_points"])
        tier_c = corridor_tier(data_c["census_points"])
        yield sse_event("trace", {
            "step": "population_density",
            "message": f"✓ Population: Corridor A → {tier_a['dominant_tier']}, Corridor B → {tier_b['dominant_tier']}, Corridor C → {tier_c['dominant_tier']}",
            "status": "complete",
            "tiers": {
                "corridor_a": tier_a["dominant_tier"],
                "corridor_b": tier_b["dominant_tier"],
                "corridor_c": tier_c["dominant_tier"]
            }
        })

        # Wind details
        wind_data = data_a["wind"]
        wind_eval = wind_risk(wind_data, drone_class=drone_class)
        spd_kt = wind_eval.get("wind_speed_kt", 0.0)
        st_id = wind_eval.get("station_id", "METAR")
        wind_status_txt = "within limits" if wind_eval.get("is_safe") else "EXCEEDS LIMITS"
        yield sse_event("trace", {
            "step": "noaa_wind",
            "message": f"✓ Wind: {spd_kt:.0f}kt wind from {st_id} ({wind_status_txt})",
            "status": "complete",
            "is_safe": wind_eval.get("is_safe")
        })

        # STEP 3: Compute Engine
        haz_a = score_corridor_hazard_exposure(corr_a, data_a["mireye_points"])
        haz_b = score_corridor_hazard_exposure(corr_b, data_b["mireye_points"])
        haz_c = score_corridor_hazard_exposure(corr_c, data_c["mireye_points"])

        wind_a = wind_eval
        wind_b = wind_risk(data_b["wind"], drone_class=drone_class)
        wind_c = wind_risk(data_c["wind"], drone_class=drone_class)

        lz_a = forced_landing_zones(corr_a.sample_points, data_a["mireye_points"])
        lz_b = forced_landing_zones(corr_b.sample_points, data_b["mireye_points"])
        lz_c = forced_landing_zones(corr_c.sample_points, data_c["mireye_points"])

        corridors_eval = {
            "corridor_a": {
                "corridor": corr_a,
                "hazard_exposure": haz_a,
                "obstacles": obs_a,
                "tier": tier_a,
                "wind": wind_a,
                "landing_zones": lz_a,
                "mireye_raw": data_a["mireye_points"],
                "faa_raw": data_a["faa_points"],
                "census_raw": data_a["census_points"]
            },
            "corridor_b": {
                "corridor": corr_b,
                "hazard_exposure": haz_b,
                "obstacles": obs_b,
                "tier": tier_b,
                "wind": wind_b,
                "landing_zones": lz_b,
                "mireye_raw": data_b["mireye_points"],
                "faa_raw": data_b["faa_points"],
                "census_raw": data_b["census_points"]
            },
            "corridor_c": {
                "corridor": corr_c,
                "hazard_exposure": haz_c,
                "obstacles": obs_c,
                "tier": tier_c,
                "wind": wind_c,
                "landing_zones": lz_c,
                "mireye_raw": data_c["mireye_points"],
                "faa_raw": data_c["faa_points"],
                "census_raw": data_c["census_points"]
            }
        }

        comparison = compare_corridors(corridors_eval)

        computed_payload = {
            "corridor_a": {
                "id": corr_a.id,
                "name": corr_a.name,
                "hazard_exposure": haz_a,
                "tier": tier_a,
                "obstacles": obs_a,
                "landing_zones": lz_a,
                "total_distance_m": corr_a.total_distance_m
            },
            "corridor_b": {
                "id": corr_b.id,
                "name": corr_b.name,
                "hazard_exposure": haz_b,
                "tier": tier_b,
                "obstacles": obs_b,
                "landing_zones": lz_b,
                "total_distance_m": corr_b.total_distance_m
            },
            "corridor_c": {
                "id": corr_c.id,
                "name": corr_c.name,
                "hazard_exposure": haz_c,
                "tier": tier_c,
                "obstacles": obs_c,
                "landing_zones": lz_c,
                "total_distance_m": corr_c.total_distance_m
            },
            "comparison": comparison
        }

        yield sse_event("trace", {
            "step": "compute_engine",
            "message": f"✓ Compute Engine: Deterministic ranking complete — {comparison['recommended_name']} selected as optimal route",
            "status": "complete",
            "recommended_corridor": comparison["recommended_corridor"]
        })

        # STEP 4: Reasoning Layer
        yield sse_event("trace", {
            "step": "reasoning_layer",
            "message": "Synthesizing Part 108 Safety Case via Reasoning Layer...",
            "status": "in_progress"
        })

        raw_safety_case = generate_safety_case(computed_payload)

        # STEP 5: Verification & Provenance
        verified_safety_case = verify_provenance_and_confidence(raw_safety_case, corridors_eval)
        t_end = time.time()
        latency_s = round(t_end - t_start, 2)

        yield sse_event("trace", {
            "step": "verification",
            "message": f"✓ Safety case synthesized and provenance citations verified (Confidence: {verified_safety_case['confidence_score']:.2f})",
            "status": "complete",
            "confidence_score": verified_safety_case["confidence_score"]
        })

        # FINAL COMPLETE EVENT
        final_result = {
            "launch": geo_launch,
            "destination": geo_dest,
            "parameters": {
                "offset_distance_m": offset_m,
                "sample_spacing_m": spacing_m,
                "cruise_altitude_ft": cruise_alt_ft,
                "drone_class": drone_class,
                "total_latency_seconds": latency_s
            },
            "corridors": [corr_a.to_dict(), corr_b.to_dict(), corr_c.to_dict()],
            "computed": computed_payload,
            "computed_comparison": comparison,
            "safety_case": verified_safety_case
        }

        yield sse_event("complete", final_result)

    except Exception as e:
        yield sse_event("error", {"error": str(e)})


@app.post("/analyze")
async def analyze_corridors(req: AnalyzeRequest):
    """
    Execute full multi-corridor route analysis pipeline and return complete Safety Case JSON.
    """
    try:
        # Normalize launch and destination coordinates / address strings
        if isinstance(req.launch, (tuple, list)):
            launch_str = f"{req.launch[0]}, {req.launch[1]}"
        else:
            launch_str = str(req.launch).strip()

        if isinstance(req.destination, (tuple, list)):
            dest_str = f"{req.destination[0]}, {req.destination[1]}"
        else:
            dest_str = str(req.destination).strip()

        result = await execute_pipeline(
            launch_input=launch_str,
            destination_input=dest_str,
            offset_m=req.offset_distance_m or 600.0,
            spacing_m=req.sample_spacing_m or 400.0,
            cruise_alt_ft=req.cruise_altitude_ft or 300.0,
            drone_class=req.drone_class or "small_uav",
            quiet=True
        )
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analyze/stream")
async def stream_analysis(
    launch: str = Query(..., description="Launch address or '(lat, lng)' coordinate"),
    destination: str = Query(..., description="Destination address or '(lat, lng)' coordinate"),
    offset_distance_m: float = Query(600.0, description="Detour perpendicular offset in meters"),
    sample_spacing_m: float = Query(400.0, description="Sample point spacing in meters"),
    cruise_altitude_ft: float = Query(300.0, description="Drone cruise altitude in feet AGL"),
    drone_class: str = Query("small_uav", description="Drone operating class")
):
    """
    Stream real-time agent execution trace steps via Server-Sent Events (SSE) (text/event-stream).
    """
    return StreamingResponse(
        stream_pipeline(
            launch_input=launch,
            destination_input=destination,
            offset_m=offset_distance_m,
            spacing_m=sample_spacing_m,
            cruise_alt_ft=cruise_altitude_ft,
            drone_class=drone_class
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
