"""
FastAPI Main Application Entry Point for Airlane BVLOS Route Risk Agent.

Endpoints:
- GET /: Health check
- POST /analyze: Analyze 3 geometric flight corridors between launch and destination coordinates
- GET /analyze/stream: SSE stream of live agent execution trace steps
"""

import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Tuple, Dict, Any, Optional

from agent.corridor import generate_candidates, Corridor
from agent.fetcher import fetch_corridor_data
from agent.compute import (
    score_corridor_hazard_exposure,
    evaluate_obstacle_risks,
    determine_corridor_worst_tier,
    evaluate_wind_risk,
    identify_landing_zones,
    compare_corridors
)
from agent.reason import generate_safety_case
from agent.verify import verify_provenance_and_confidence

app = FastAPI(
    title="Airlane BVLOS Risk & Tier Classifier API",
    description="BVLOS Drone Flight Corridor Safety & Part 108 Risk Tier Classifier Engine",
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
    launch: Tuple[float, float]
    destination: Tuple[float, float]
    offset_distance_m: Optional[float] = 600.0
    sample_spacing_m: Optional[float] = 400.0


@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "Airlane BVLOS Risk Classifier Engine",
        "version": "1.0.0"
    }


async def run_pipeline(launch: Tuple[float, float], destination: Tuple[float, float], offset_m: float = 600.0, spacing_m: float = 400.0):
    # Step 1: 3 Geometric Corridor Candidates
    corridors = generate_candidates(launch, destination, offset_distance_m=offset_m, sample_spacing_m=spacing_m)
    corridor_a, corridor_b, corridor_c = corridors[0], corridors[1], corridors[2]

    # Step 2: Parallel Fetch across all 3 corridors
    data_a, data_b, data_c = await asyncio.gather(
        fetch_corridor_data(corridor_a),
        fetch_corridor_data(corridor_b),
        fetch_corridor_data(corridor_c)
    )

    # Step 3: Compute Engine & Hazard Exposure Scoring
    hazard_score_a = score_corridor_hazard_exposure(corridor_a, data_a["mireye_points"])
    hazard_score_b = score_corridor_hazard_exposure(corridor_b, data_b["mireye_points"])
    hazard_score_c = score_corridor_hazard_exposure(corridor_c, data_c["mireye_points"])

    obs_a = evaluate_obstacle_risks(corridor_a.sample_points, data_a["mireye_points"])
    obs_b = evaluate_obstacle_risks(corridor_b.sample_points, data_b["mireye_points"])
    obs_c = evaluate_obstacle_risks(corridor_c.sample_points, data_c["mireye_points"])

    tier_a = determine_corridor_worst_tier(data_a["census_points"])
    tier_b = determine_corridor_worst_tier(data_b["census_points"])
    tier_c = determine_corridor_worst_tier(data_c["census_points"])

    wind_a = evaluate_wind_risk(data_a["wind"])
    wind_b = evaluate_wind_risk(data_b["wind"])
    wind_c = evaluate_wind_risk(data_c["wind"])

    lz_a = identify_landing_zones(corridor_a.sample_points, data_a["mireye_points"])
    lz_b = identify_landing_zones(corridor_b.sample_points, data_b["mireye_points"])
    lz_c = identify_landing_zones(corridor_c.sample_points, data_c["mireye_points"])

    corridors_eval = {
        "corridor_a": {
            "corridor": corridor_a,
            "hazard_exposure": hazard_score_a,
            "obstacles": obs_a,
            "tier": tier_a,
            "wind": wind_a,
            "landing_zones": lz_a,
            "mireye_raw": data_a["mireye_points"],
            "faa_raw": data_a["faa_points"],
            "census_raw": data_a["census_points"]
        },
        "corridor_b": {
            "corridor": corridor_b,
            "hazard_exposure": hazard_score_b,
            "obstacles": obs_b,
            "tier": tier_b,
            "wind": wind_b,
            "landing_zones": lz_b,
            "mireye_raw": data_b["mireye_points"],
            "faa_raw": data_b["faa_points"],
            "census_raw": data_b["census_points"]
        },
        "corridor_c": {
            "corridor": corridor_c,
            "hazard_exposure": hazard_score_c,
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
            "id": corridor_a.id,
            "name": corridor_a.name,
            "hazard_exposure": hazard_score_a,
            "tier": tier_a,
            "obstacles": obs_a,
            "landing_zones": lz_a,
            "total_distance_m": corridor_a.total_distance_m
        },
        "corridor_b": {
            "id": corridor_b.id,
            "name": corridor_b.name,
            "hazard_exposure": hazard_score_b,
            "tier": tier_b,
            "obstacles": obs_b,
            "landing_zones": lz_b,
            "total_distance_m": corridor_b.total_distance_m
        },
        "corridor_c": {
            "id": corridor_c.id,
            "name": corridor_c.name,
            "hazard_exposure": hazard_score_c,
            "tier": tier_c,
            "obstacles": obs_c,
            "landing_zones": lz_c,
            "total_distance_m": corridor_c.total_distance_m
        },
        "comparison": comparison
    }

    # Step 4 & 5: Reason & Verify
    reasoning = generate_safety_case(computed_payload)
    final_verdict = verify_provenance_and_confidence(reasoning, corridors_eval)

    return {
        "corridors": [corridor_a.to_dict(), corridor_b.to_dict(), corridor_c.to_dict()],
        "computed": computed_payload,
        "verdict": final_verdict
    }


@app.post("/analyze")
async def analyze_corridors(req: AnalyzeRequest):
    try:
        res = await run_pipeline(req.launch, req.destination, req.offset_distance_m, req.sample_spacing_m)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
