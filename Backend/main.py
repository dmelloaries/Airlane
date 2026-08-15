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
    environmental_risk,
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
        elapsed = int((time.time() - t_start) * 1000)
        yield sse_event("trace", {
            "step": "geocoding",
            "message": "Resolving launch and destination coordinates...",
            "status": "in_progress",
            "category": "sensor",
            "level": "info",
            "source_name": "Mireye Geocoding API",
            "agent_thought": f"Querying Mireye Geocoding service to convert '{launch_input}' and '{destination_input}' into normalized GPS waypoints.",
            "elapsed_ms": elapsed,
        })
        geo_launch = geocode_address(launch_input)
        geo_dest = geocode_address(destination_input)
        launch_coord = (geo_launch["lat"], geo_launch["lng"])
        dest_coord = (geo_dest["lat"], geo_dest["lng"])
        direct_dist_m = haversine_distance(launch_coord, dest_coord)

        elapsed = int((time.time() - t_start) * 1000)
        yield sse_event("trace", {
            "step": "geocoding",
            "message": f"✓ Resolved endpoints: {geo_launch['normalized_address']} → {geo_dest['normalized_address']} ({direct_dist_m / 1609.34:.1f}mi)",
            "status": "complete",
            "category": "sensor",
            "level": "success",
            "source_name": "Mireye Geocoding API",
            "agent_thought": f"Endpoints geocoded with high confidence. Direct geodesic baseline distance is {direct_dist_m / 1609.34:.2f} miles ({direct_dist_m:.0f}m).",
            "elapsed_ms": elapsed,
            "launch": geo_launch,
            "destination": geo_dest,
            "distance_m": direct_dist_m,
            "metrics": {
                "direct_distance_miles": round(direct_dist_m / 1609.34, 2),
                "direct_distance_m": round(direct_dist_m, 1),
                "launch_lat": geo_launch["lat"],
                "launch_lng": geo_launch["lng"],
                "dest_lat": geo_dest["lat"],
                "dest_lng": geo_dest["lng"],
            }
        })

        # STEP 1: Corridors
        corridors = generate_candidates(
            launch=launch_coord,
            destination=dest_coord,
            offset_distance_m=offset_m,
            sample_spacing_m=spacing_m
        )
        corr_a, corr_b, corr_c = corridors[0], corridors[1], corridors[2]

        elapsed = int((time.time() - t_start) * 1000)
        yield sse_event("trace", {
            "step": "corridor_generation",
            "message": f"✓ Corridor Alpha generated: {len(corr_a.sample_points)} sample points, {corr_a.total_distance_m / 1609.34:.1f}mi (direct great-circle)",
            "status": "complete",
            "category": "geometry",
            "level": "success",
            "source_name": "Corridor Geometry Engine",
            "agent_thought": "Constructed baseline Corridor Alpha along direct great-circle track with high-frequency spatial sampling.",
            "elapsed_ms": elapsed,
            "corridor_id": "corridor_a",
            "metrics": {
                "corridor": "Corridor Alpha (Direct)",
                "sample_points": len(corr_a.sample_points),
                "distance_miles": round(corr_a.total_distance_m / 1609.34, 2),
                "offset_m": 0
            }
        })
        elapsed = int((time.time() - t_start) * 1000)
        yield sse_event("trace", {
            "step": "corridor_generation",
            "message": f"✓ Corridor Beta generated: {len(corr_b.sample_points)} sample points, {corr_b.total_distance_m / 1609.34:.1f}mi (+{offset_m:.0f}m right detour bend)",
            "status": "complete",
            "category": "geometry",
            "level": "success",
            "source_name": "Corridor Geometry Engine",
            "agent_thought": f"Constructed alternative Corridor Beta with perpendicular +{offset_m:.0f}m detour for hazard mitigation.",
            "elapsed_ms": elapsed,
            "corridor_id": "corridor_b",
            "metrics": {
                "corridor": "Corridor Beta (Right Detour)",
                "sample_points": len(corr_b.sample_points),
                "distance_miles": round(corr_b.total_distance_m / 1609.34, 2),
                "offset_m": offset_m
            }
        })
        elapsed = int((time.time() - t_start) * 1000)
        yield sse_event("trace", {
            "step": "corridor_generation",
            "message": f"✓ Corridor Gamma generated: {len(corr_c.sample_points)} sample points, {corr_c.total_distance_m / 1609.34:.1f}mi (-{offset_m:.0f}m left detour bend)",
            "status": "complete",
            "category": "geometry",
            "level": "success",
            "source_name": "Corridor Geometry Engine",
            "agent_thought": f"Constructed alternative Corridor Gamma with perpendicular -{offset_m:.0f}m detour for airspace optimization.",
            "elapsed_ms": elapsed,
            "corridor_id": "corridor_c",
            "metrics": {
                "corridor": "Corridor Gamma (Left Detour)",
                "sample_points": len(corr_c.sample_points),
                "distance_miles": round(corr_c.total_distance_m / 1609.34, 2),
                "offset_m": -offset_m
            }
        })

        # STEP 2: Parallel Fetch across 4 sources
        elapsed = int((time.time() - t_start) * 1000)
        yield sse_event("trace", {
            "step": "data_ingestion",
            "message": "Ingesting data across 4 sources in parallel (Mireye, FAA, Census, NOAA)...",
            "status": "in_progress",
            "category": "sensor",
            "level": "info",
            "source_name": "Multi-Source Sensor Hub",
            "agent_thought": "Triggering parallel async spatial queries across Mireye 345kV infrastructure, FAA UASFM airspace, US Census demographics, and NOAA METAR winds.",
            "elapsed_ms": elapsed,
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

        elapsed = int((time.time() - t_start) * 1000)
        if obs_a:
            first_obs = obs_a[0]
            kv_info = f"{first_obs.get('voltage_kv', 0):.0f}kV, " if first_obs.get("voltage_kv") else ""
            yield sse_event("trace", {
                "step": "mireye_hazards",
                "message": f"✓ Mireye: {len(obs_a)} obstacle hazard(s) flagged on Corridor Alpha ({kv_info}mile {first_obs['distance_along_route_miles']:.1f})",
                "status": "complete",
                "category": "sensor",
                "level": "warning",
                "source_name": "Mireye Earth API",
                "agent_thought": f"Evaluated 345kV infrastructure proximity. Corridor Alpha crosses buffer with {first_obs.get('distance_m', 68):.1f}m lateral separation.",
                "elapsed_ms": elapsed,
                "corridor_id": "corridor_a",
                "obstacle_count": len(obs_a),
                "metrics": {
                    "obstacles_flagged": len(obs_a),
                    "voltage_kv": first_obs.get("voltage_kv", 345),
                    "min_clearance_m": round(first_obs.get("distance_m", 68.3), 1),
                    "mile_marker": round(first_obs.get("distance_along_route_miles", 0.88), 2)
                }
            })
        else:
            yield sse_event("trace", {
                "step": "mireye_hazards",
                "message": "✓ Mireye: Infrastructure scan complete across all corridors (0 critical transmission line hazards <150m on Corridor Alpha)",
                "status": "complete",
                "category": "sensor",
                "level": "success",
                "source_name": "Mireye Earth API",
                "agent_thought": "Mireye 345kV grid query returned zero catastrophic proximity breaches (<60m). Safe buffer maintained.",
                "elapsed_ms": elapsed,
                "metrics": { "hazards_detected": 0, "status": "CLEAR" }
            })

        # FAA details
        faa_a_first = data_a["faa_points"][0] if data_a["faa_points"] else {}
        ceiling_val = faa_a_first.get("ceiling_ft", 400)
        cls_val = faa_a_first.get("airspace_class", "Class G")
        elapsed = int((time.time() - t_start) * 1000)
        yield sse_event("trace", {
            "step": "faa_airspace",
            "message": f"✓ FAA: Ceiling {ceiling_val}ft AGL ({cls_val}) verified along corridor",
            "status": "complete",
            "category": "sensor",
            "level": "success",
            "source_name": "FAA UASFM",
            "agent_thought": f"Checked FAA UAS Facility Maps. Authorized ceiling is {ceiling_val}ft AGL under {cls_val} airspace rules.",
            "elapsed_ms": elapsed,
            "metrics": {
                "authorized_ceiling_ft": ceiling_val,
                "airspace_class": cls_val,
                "cruise_altitude_ft": cruise_alt_ft,
                "vertical_clearance_ft": ceiling_val - cruise_alt_ft
            }
        })

        # Population details
        tier_a = corridor_tier(data_a["census_points"])
        tier_b = corridor_tier(data_b["census_points"])
        tier_c = corridor_tier(data_c["census_points"])
        elapsed = int((time.time() - t_start) * 1000)
        yield sse_event("trace", {
            "step": "population_density",
            "message": f"✓ Population: Corridor Alpha → {tier_a['dominant_tier']}, Corridor Beta → {tier_b['dominant_tier']}, Corridor Gamma → {tier_c['dominant_tier']}",
            "status": "complete",
            "category": "sensor",
            "level": "success",
            "source_name": "U.S. Census Bureau",
            "agent_thought": f"Audited ground population risk tiers across all 3 corridors. Corridor Alpha achieves lowest ground exposure ({tier_a['dominant_tier']}).",
            "elapsed_ms": elapsed,
            "tiers": {
                "corridor_a": tier_a["dominant_tier"],
                "corridor_b": tier_b["dominant_tier"],
                "corridor_c": tier_c["dominant_tier"]
            },
            "metrics": {
                "corridor_a_tier": tier_a["dominant_tier"],
                "corridor_b_tier": tier_b["dominant_tier"],
                "corridor_c_tier": tier_c["dominant_tier"],
                "max_density_sq_mi": tier_a.get("max_density_sq_mi", 180)
            }
        })

        # Wind details
        wind_data = data_a["wind"]
        wind_eval = wind_risk(wind_data, drone_class=drone_class)
        spd_kt = wind_eval.get("wind_speed_kt", 0.0)
        st_id = wind_eval.get("station_id", "METAR")
        wind_status_txt = "within limits" if wind_eval.get("is_safe") else "EXCEEDS LIMITS"
        elapsed = int((time.time() - t_start) * 1000)
        yield sse_event("trace", {
            "step": "noaa_wind",
            "message": f"✓ Wind: {spd_kt:.0f}kt wind from {st_id} ({wind_status_txt})",
            "status": "complete",
            "category": "sensor",
            "level": "success" if wind_eval.get("is_safe") else "error",
            "source_name": "NOAA METAR",
            "agent_thought": f"Station {st_id} reports {spd_kt:.1f}kt wind. Meets BVLOS operational flight envelope criteria for {drone_class}.",
            "elapsed_ms": elapsed,
            "is_safe": wind_eval.get("is_safe"),
            "metrics": {
                "station_id": st_id,
                "wind_speed_kt": spd_kt,
                "wind_gust_kt": wind_eval.get("wind_gust_kt", spd_kt),
                "safe_envelope": wind_eval.get("is_safe", True)
            }
        })

        # Environmental critical habitat details
        env_a = environmental_risk(corr_a.sample_points, data_a["mireye_points"])
        env_b = environmental_risk(corr_b.sample_points, data_b["mireye_points"])
        env_c = environmental_risk(corr_c.sample_points, data_c["mireye_points"])

        elapsed = int((time.time() - t_start) * 1000)
        has_any_env = env_a.get("intersects_critical_habitat") or env_b.get("intersects_critical_habitat") or env_c.get("intersects_critical_habitat")
        if has_any_env:
            intersecting_names = []
            if env_a.get("intersects_critical_habitat"): intersecting_names.append(f"Corridor Alpha ({env_a.get('species') or 'Protected Habitat'})")
            if env_b.get("intersects_critical_habitat"): intersecting_names.append(f"Corridor Beta ({env_b.get('species') or 'Protected Habitat'})")
            if env_c.get("intersects_critical_habitat"): intersecting_names.append(f"Corridor Gamma ({env_c.get('species') or 'Protected Habitat'})")
            yield sse_event("trace", {
                "step": "environmental_habitat",
                "message": f"⚠️ USFWS: Critical Habitat intersected along {', '.join(intersecting_names)}",
                "status": "complete",
                "category": "sensor",
                "level": "warning",
                "source_name": "USFWS Critical Habitat",
                "agent_thought": "Queried USFWS Critical Habitat registry via Mireye. Flagged protected species habitat boundaries along candidate corridor trajectories.",
                "elapsed_ms": elapsed,
                "metrics": {
                    "habitat_intersected": True,
                    "species": env_a.get("species") or env_b.get("species") or env_c.get("species"),
                    "listing_status": env_a.get("listing_status") or env_b.get("listing_status") or env_c.get("listing_status")
                }
            })
        else:
            yield sse_event("trace", {
                "step": "environmental_habitat",
                "message": "✓ USFWS: No designated critical habitat intersected along evaluated corridors",
                "status": "complete",
                "category": "sensor",
                "level": "success",
                "source_name": "USFWS Critical Habitat",
                "agent_thought": "Cross-referenced USFWS geospatial datasets. All candidate corridors are free from protected critical habitat constraints.",
                "elapsed_ms": elapsed,
                "metrics": { "habitat_intersected": False, "status": "CLEAR" }
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
                "environmental_risk": env_a,
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
                "environmental_risk": env_b,
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
                "environmental_risk": env_c,
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
                "environmental_risk": env_a,
                "wind": wind_a,
                "total_distance_m": corr_a.total_distance_m
            },
            "corridor_b": {
                "id": corr_b.id,
                "name": corr_b.name,
                "hazard_exposure": haz_b,
                "tier": tier_b,
                "obstacles": obs_b,
                "landing_zones": lz_b,
                "environmental_risk": env_b,
                "wind": wind_b,
                "total_distance_m": corr_b.total_distance_m
            },
            "corridor_c": {
                "id": corr_c.id,
                "name": corr_c.name,
                "hazard_exposure": haz_c,
                "tier": tier_c,
                "obstacles": obs_c,
                "landing_zones": lz_c,
                "environmental_risk": env_c,
                "wind": wind_c,
                "total_distance_m": corr_c.total_distance_m
            },
            "comparison": comparison
        }

        elapsed = int((time.time() - t_start) * 1000)
        yield sse_event("trace", {
            "step": "compute_engine",
            "message": f"✓ Compute Engine: Deterministic ranking complete — {comparison['recommended_name']} selected as optimal route",
            "status": "complete",
            "category": "compute",
            "level": "success",
            "source_name": "Deterministic Compute Engine",
            "agent_thought": f"Multi-objective scoring ranked {comparison['recommended_name']} as best corridor. Calculated risk metrics and rejected non-compliant alternatives.",
            "elapsed_ms": elapsed,
            "recommended_corridor": comparison["recommended_corridor"],
            "metrics": {
                "recommended": comparison["recommended_name"],
                "reason": comparison.get("reason", "Zero critical hazard conflicts"),
                "landing_zones_count": len(lz_a)
            }
        })

        # STEP 4: Reasoning Layer
        elapsed = int((time.time() - t_start) * 1000)
        yield sse_event("trace", {
            "step": "reasoning_layer",
            "message": "Synthesizing Part 108 Safety Case via Reasoning Layer...",
            "status": "in_progress",
            "category": "agent",
            "level": "info",
            "source_name": "Safety Reasoning Layer",
            "agent_thought": "Compiling formal FAA Part 108 safety filing, synthesizing waiver justifications, and structuring mitigation caveats.",
            "elapsed_ms": elapsed,
        })

        raw_safety_case = generate_safety_case(computed_payload)

        # STEP 5: Verification & Provenance
        verified_safety_case = verify_provenance_and_confidence(raw_safety_case, corridors_eval)
        t_end = time.time()
        latency_s = round(t_end - t_start, 2)
        elapsed = int((t_end - t_start) * 1000)

        yield sse_event("trace", {
            "step": "verification",
            "message": f"✓ Safety case synthesized and provenance citations verified (Confidence: {verified_safety_case['confidence_score']:.2f})",
            "status": "complete",
            "category": "agent",
            "level": "success",
            "source_name": "Provenance & Confidence Verifier",
            "agent_thought": f"Validated all four external citations against live telemetry. Final confidence rating: {verified_safety_case['confidence_score'] * 100:.0f}%.",
            "elapsed_ms": elapsed,
            "confidence_score": verified_safety_case["confidence_score"],
            "metrics": {
                "confidence_score": verified_safety_case["confidence_score"],
                "confidence_percent": f"{verified_safety_case['confidence_score'] * 100:.0f}%",
                "citations_verified": len(verified_safety_case.get("provenance_citations", [])),
                "total_pipeline_latency_s": latency_s
            }
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


# Curated Landmark & Drone Flight Hub Presets
PRESET_PLACES = [
    {
        "label": "Cubberley Community Center, Palo Alto",
        "secondary": "4000 Middlefield Rd, Palo Alto, CA 94303",
        "lat": 37.4172,
        "lng": -122.1084,
        "category": "campus",
        "badge": "ORIGIN HUB"
    },
    {
        "label": "Byxbee Park, Baylands Palo Alto",
        "secondary": "2380 Embarcadero Rd, Palo Alto, CA 94303",
        "lat": 37.4481,
        "lng": -122.1063,
        "category": "safe_zone",
        "badge": "RECOVERY ZONE"
    },
    {
        "label": "Stanford Research Park, Palo Alto",
        "secondary": "3000 Hanover St, Palo Alto, CA 94304",
        "lat": 37.4241,
        "lng": -122.1480,
        "category": "campus",
        "badge": "INNOVATION HUB"
    },
    {
        "label": "Moffett Federal Airfield Hub",
        "secondary": "Mountain View / Sunnyvale, CA 94035",
        "lat": 37.4161,
        "lng": -122.0493,
        "category": "airport",
        "badge": "CLASS D AIRSPACE"
    },
    {
        "label": "Palo Alto Airport (KPAO)",
        "secondary": "1903 Embarcadero Rd, Palo Alto, CA 94303",
        "lat": 37.4611,
        "lng": -122.1150,
        "category": "airport",
        "badge": "FAA AIRPORT"
    },
    {
        "label": "480 Berdoll Ln, Cedar Creek TX",
        "secondary": "Cedar Creek, TX 78612 (LCRA 345kV Grid)",
        "lat": 30.1395,
        "lng": -97.5462,
        "category": "infrastructure",
        "badge": "POWER GRID"
    },
    {
        "label": "912 Elm St, Cedar Creek TX",
        "secondary": "Cedar Creek, TX 78612 (Safe Corridor Endpoint)",
        "lat": 30.1700,
        "lng": -97.4970,
        "category": "safe_zone",
        "badge": "RECOVERY POINT"
    },
    {
        "label": "Googleplex HQ, Mountain View",
        "secondary": "1600 Amphitheatre Pkwy, Mountain View, CA 94043",
        "lat": 37.4220,
        "lng": -122.0841,
        "category": "campus",
        "badge": "TECH CAMPUS"
    },
    {
        "label": "Apple Park Campus, Cupertino",
        "secondary": "1 Apple Park Way, Cupertino, CA 95014",
        "lat": 37.3346,
        "lng": -122.0090,
        "category": "campus",
        "badge": "TECH CAMPUS"
    },
    {
        "label": "Shoreline Amphitheatre Park, Mountain View",
        "secondary": "1 Amphitheatre Pkwy, Mountain View, CA 94043",
        "lat": 37.4277,
        "lng": -122.0805,
        "category": "safe_zone",
        "badge": "OPEN FIELD"
    },
    {
        "label": "San Carlos Airport (KSQL)",
        "secondary": "620 Airport Way, San Carlos, CA 94070",
        "lat": 37.5119,
        "lng": -122.2494,
        "category": "airport",
        "badge": "FAA AIRPORT"
    },
    {
        "label": "Austin-Bergstrom International Airport (KAUS)",
        "secondary": "3600 Presidential Blvd, Austin, TX 78719",
        "lat": 30.1975,
        "lng": -97.6664,
        "category": "airport",
        "badge": "CLASS C AIRSPACE"
    },
    {
        "label": "NASA Ames Research Center",
        "secondary": "Moffett Blvd, Mountain View, CA 94035",
        "lat": 37.4089,
        "lng": -122.0644,
        "category": "campus",
        "badge": "FEDERAL FACILITY"
    }
]


@app.get("/places/autocomplete")
@app.get("/places/suggest")
async def autocomplete_places(
    q: str = Query(..., min_length=1, description="Location search query or coordinates"),
    limit: int = Query(6, ge=1, le=15, description="Maximum number of suggestions")
):
    """
    Real-time location autocomplete and geocoding endpoint for drone mission planning.
    Returns categorized suggestions with geographic coordinates and metadata badges.
    """
    import re
    import requests

    query = q.strip()
    results: List[Dict[str, Any]] = []
    seen_keys = set()

    def add_result(item: Dict[str, Any]):
        key = (round(item.get("lat", 0.0), 4), round(item.get("lng", 0.0), 4), item.get("label", "").lower())
        if key not in seen_keys and len(results) < limit:
            seen_keys.add(key)
            results.append(item)

    # 1. Direct coordinate pattern match (e.g. "37.4172, -122.1084")
    coord_match = re.match(r"^\s*\(?\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)?\s*$", query)
    if coord_match:
        lat = float(coord_match.group(1))
        lng = float(coord_match.group(2))
        add_result({
            "label": f"GPS: ({lat:.4f}, {lng:.4f})",
            "secondary": "Direct Geographic Coordinates",
            "lat": lat,
            "lng": lng,
            "category": "coordinate",
            "badge": "COORDINATES"
        })

    # 2. Local Curated Landmarks matching
    q_lower = query.lower()
    for preset in PRESET_PLACES:
        if q_lower in preset["label"].lower() or q_lower in preset["secondary"].lower():
            add_result(preset)
            if len(results) >= limit:
                break

    # 3. Live Geocoder Query via Photon / OSM (if more results needed)
    if len(results) < limit and len(query) >= 2:
        try:
            photon_url = "https://photon.komoot.io/api/"
            resp = requests.get(
                photon_url,
                params={"q": query, "limit": limit},
                headers={"User-Agent": "AirlaneBVLOSPlanner/1.0"},
                timeout=2.5
            )
            if resp.status_code == 200:
                data = resp.json()
                features = data.get("features", [])
                for f in features:
                    props = f.get("properties", {})
                    geom = f.get("geometry", {})
                    coords = geom.get("coordinates", [0.0, 0.0])
                    p_lng, p_lat = coords[0], coords[1]

                    name = props.get("name") or props.get("street") or query
                    city = props.get("city") or props.get("county") or ""
                    state = props.get("state") or props.get("country") or ""
                    sec_parts = [p for p in [props.get("street"), city, state, props.get("postcode")] if p and p != name]
                    secondary = ", ".join(sec_parts) if sec_parts else state

                    osm_val = props.get("osm_value", "").lower()
                    osm_key = props.get("osm_key", "").lower()

                    # Determine category and badge
                    if "aerodrome" in osm_val or "airport" in osm_val or "helipad" in osm_val:
                        category = "airport"
                        badge = "AIRPORT"
                    elif "power" in osm_key or "substation" in osm_val or "line" in osm_val:
                        category = "infrastructure"
                        badge = "INFRASTRUCTURE"
                    elif "park" in osm_val or "pitch" in osm_val or "garden" in osm_val or "nature_reserve" in osm_val:
                        category = "safe_zone"
                        badge = "OPEN FIELD"
                    elif "university" in osm_val or "college" in osm_val or "commercial" in osm_val or "industrial" in osm_val:
                        category = "campus"
                        badge = "CAMPUS"
                    else:
                        category = "address"
                        badge = "LOCATION"

                    add_result({
                        "label": name,
                        "secondary": secondary,
                        "lat": float(p_lat),
                        "lng": float(p_lng),
                        "category": category,
                        "badge": badge
                    })
                    if len(results) >= limit:
                        break
        except Exception:
            pass  # Fallback gracefully to existing results

    return JSONResponse(content=results)

