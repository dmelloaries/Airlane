"""
Airlane BVLOS Route Risk & Tier Classifier — CLI Runner (Phase 8).

Usage:
    python -m agent.run "480 Berdoll Ln, Cedar Creek TX" "912 Elm St, Cedar Creek TX"
    python -m agent.run "37.4172, -122.1084" "37.4481, -122.1063" --offset 600 --spacing 400
    python -m agent.run "Cubberley Community Center" "Byxbee Park" --json
"""

import sys
import os
import time
import json
import argparse
import asyncio
from pathlib import Path
from typing import Dict, Any, Tuple, List, Optional

# Ensure UTF-8 output encoding for Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure Backend root is in sys.path
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Load .env variables
def _load_env():
    env_path = BACKEND_ROOT / ".env"
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip("'").strip('"'))

_load_env()

from agent.corridor import generate_candidates, haversine_distance, Corridor
from agent.fetcher import fetch_corridor_data
from agent.compute import (
    score_corridor_hazard_exposure,
    obstacle_risk,
    corridor_tier,
    wind_risk,
    forced_landing_zones,
    environmental_risk,
    compare_corridors
)
from agent.reason import generate_safety_case
from agent.verify import verify_provenance_and_confidence
from sources.mireye import geocode_address


def print_banner():
    banner = """
╔══════════════════════════════════════════════════════════════════════════════╗
║     AIRLANE BVLOS ROUTE RISK & PART 108 GROUND TIER CLASSIFIER ENGINE        ║
║     Autonomous Multi-Corridor Safety Case & Ground Truth Risk Screening      ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""
    print(banner)


async def execute_pipeline(
    launch_input: str,
    destination_input: str,
    offset_m: float = 600.0,
    spacing_m: float = 400.0,
    cruise_alt_ft: float = 300.0,
    drone_class: str = "small_uav",
    quiet: bool = False
) -> Dict[str, Any]:
    """
    Executes the end-to-end 7-phase analysis pipeline.
    """
    t_start = time.time()

    def log(msg: str):
        if not quiet:
            print(msg, flush=True)

    # -------------------------------------------------------------------------
    # STEP 0: Geocode Launch and Destination
    # -------------------------------------------------------------------------
    log("▶ [Step 0/5] Resolving Launch & Destination Coordinates...")
    t_geo_0 = time.time()
    geo_launch = geocode_address(launch_input)
    geo_dest = geocode_address(destination_input)
    t_geo_1 = time.time()

    launch_coord = (geo_launch["lat"], geo_launch["lng"])
    dest_coord = (geo_dest["lat"], geo_dest["lng"])
    direct_dist_m = haversine_distance(launch_coord, dest_coord)

    log(f"  • Launch:      {geo_launch['normalized_address']} -> ({launch_coord[0]:.4f}, {launch_coord[1]:.4f})")
    log(f"  • Destination: {geo_dest['normalized_address']} -> ({dest_coord[0]:.4f}, {dest_coord[1]:.4f})")
    log(f"  • Distance:    {direct_dist_m:.0f}m ({direct_dist_m / 1609.34:.2f} miles)")
    log(f"  ✓ Geocoding completed in {t_geo_1 - t_geo_0:.2f}s.\n")

    # -------------------------------------------------------------------------
    # STEP 1: Generate 3 Geometric Corridors
    # -------------------------------------------------------------------------
    log("▶ [Step 1/5] Generating 3 Geometric Candidate Corridors (Phase 1)...")
    t_gen_0 = time.time()
    corridors = generate_candidates(
        launch=launch_coord,
        destination=dest_coord,
        offset_distance_m=offset_m,
        sample_spacing_m=spacing_m
    )
    corr_a, corr_b, corr_c = corridors[0], corridors[1], corridors[2]
    t_gen_1 = time.time()
    log(f"  ✓ {corr_a.name}: {len(corr_a.sample_points)} points | {corr_a.total_distance_m:.0f}m | direct great-circle")
    log(f"  ✓ {corr_b.name}: {len(corr_b.sample_points)} points | {corr_b.total_distance_m:.0f}m | +{offset_m:.0f}m right detour bend")
    log(f"  ✓ {corr_c.name}: {len(corr_c.sample_points)} points | {corr_c.total_distance_m:.0f}m | -{offset_m:.0f}m left detour bend")
    log(f"  ✓ Corridors generated in {(t_gen_1 - t_gen_0) * 1000:.1f}ms.\n")

    # -------------------------------------------------------------------------
    # STEP 2: Parallel Multi-Source Fetch across all 3 Corridors
    # -------------------------------------------------------------------------
    log("▶ [Step 2/5] Parallel Fetching Data across 4 Sources (Mireye, FAA, Census, NOAA)...")
    t_fetch_0 = time.time()
    data_a, data_b, data_c = await asyncio.gather(
        fetch_corridor_data(corr_a),
        fetch_corridor_data(corr_b),
        fetch_corridor_data(corr_c)
    )
    t_fetch_1 = time.time()
    log(f"  ✓ Concurrent data ingestion completed across all 3 corridors in {t_fetch_1 - t_fetch_0:.2f}s.\n")

    # -------------------------------------------------------------------------
    # STEP 3: Pure Deterministic Compute Engine Scoring (Phase 6)
    # -------------------------------------------------------------------------
    log("▶ [Step 3/5] Running Pure Deterministic Compute Engine (Phase 6)...")
    t_comp_0 = time.time()
    # Corridor A
    haz_a = score_corridor_hazard_exposure(corr_a, data_a["mireye_points"])
    obs_a = obstacle_risk(corr_a.sample_points, data_a["mireye_points"], cruise_altitude_ft=cruise_alt_ft)
    tier_a = corridor_tier(data_a["census_points"])
    wind_a = wind_risk(data_a["wind"], drone_class=drone_class)
    lz_a = forced_landing_zones(corr_a.sample_points, data_a["mireye_points"])
    env_a = environmental_risk(corr_a.sample_points, data_a["mireye_points"])

    # Corridor B
    haz_b = score_corridor_hazard_exposure(corr_b, data_b["mireye_points"])
    obs_b = obstacle_risk(corr_b.sample_points, data_b["mireye_points"], cruise_altitude_ft=cruise_alt_ft)
    tier_b = corridor_tier(data_b["census_points"])
    wind_b = wind_risk(data_b["wind"], drone_class=drone_class)
    lz_b = forced_landing_zones(corr_b.sample_points, data_b["mireye_points"])
    env_b = environmental_risk(corr_b.sample_points, data_b["mireye_points"])

    # Corridor C
    haz_c = score_corridor_hazard_exposure(corr_c, data_c["mireye_points"])
    obs_c = obstacle_risk(corr_c.sample_points, data_c["mireye_points"], cruise_altitude_ft=cruise_alt_ft)
    tier_c = corridor_tier(data_c["census_points"])
    wind_c = wind_risk(data_c["wind"], drone_class=drone_class)
    lz_c = forced_landing_zones(corr_c.sample_points, data_c["mireye_points"])
    env_c = environmental_risk(corr_c.sample_points, data_c["mireye_points"])

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
    t_comp_1 = time.time()

    computed_payload = {
        "corridor_a": {
            "id": corr_a.id,
            "name": corr_a.name,
            "hazard_exposure": haz_a,
            "tier": tier_a,
            "obstacles": obs_a,
            "landing_zones": lz_a,
            "environmental_risk": env_a,
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
            "total_distance_m": corr_c.total_distance_m
        },
        "comparison": comparison
    }

    log(f"  ✓ Multi-criteria ranking completed: Winner -> {comparison['recommended_name']}")
    log(f"  ✓ Dimension breakdown: Tier Winner: {comparison['dimension_winners']['tier_winner']} | Hazard Winner: {comparison['dimension_winners']['hazard_exposure_winner']}")
    log(f"  ✓ Compute engine evaluation completed in {(t_comp_1 - t_comp_0) * 1000:.1f}ms.\n")

    # -------------------------------------------------------------------------
    # STEP 4: Reasoning Layer (Phase 7)
    # -------------------------------------------------------------------------
    log("▶ [Step 4/5] Generating Structured Safety Case via Reasoning Layer (Phase 7)...")
    t_reason_0 = time.time()
    raw_safety_case = generate_safety_case(computed_payload)
    t_reason_1 = time.time()
    log(f"  ✓ Reasoning Layer synthesis completed in {t_reason_1 - t_reason_0:.2f}s.\n")

    # -------------------------------------------------------------------------
    # STEP 5: Verification & Provenance (Phase 7)
    # -------------------------------------------------------------------------
    log("▶ [Step 5/5] Verifying Provenance Citations & Calculating Confidence Score...")
    t_ver_0 = time.time()
    verified_safety_case = verify_provenance_and_confidence(raw_safety_case, corridors_eval)
    t_ver_1 = time.time()
    log(f"  ✓ Provenance verification completed in {(t_ver_1 - t_ver_0) * 1000:.1f}ms.\n")

    t_end = time.time()
    total_latency_s = round(t_end - t_start, 2)
    log(f"  ✓ Mission Safety Case end-to-end pipeline finished in {total_latency_s}s.\n")

    return {
        "launch": geo_launch,
        "destination": geo_dest,
        "parameters": {
            "offset_distance_m": offset_m,
            "sample_spacing_m": spacing_m,
            "cruise_altitude_ft": cruise_alt_ft,
            "drone_class": drone_class,
            "total_latency_seconds": total_latency_s
        },
        "corridors": [corr_a.to_dict(), corr_b.to_dict(), corr_c.to_dict()],
        "computed": computed_payload,
        "computed_comparison": comparison,
        "safety_case": verified_safety_case
    }


def render_terminal_report(result: Dict[str, Any]):
    """
    Renders a formatted terminal report of the final safety case.
    """
    sc = result["safety_case"]
    comp = result["computed_comparison"]
    params = result["parameters"]
    launch = result["launch"]
    dest = result["destination"]

    print_banner()

    print("MISSION METADATA:")
    print(f"  • Launch:        {launch['normalized_address']} ({launch['lat']:.4f}, {launch['lng']:.4f})")
    print(f"  • Destination:   {dest['normalized_address']} ({dest['lat']:.4f}, {dest['lng']:.4f})")
    print(f"  • Parameters:    Detour Offset: ±{params['offset_distance_m']:.0f}m | Spacing: {params['sample_spacing_m']:.0f}m | Cruise Altitude: {params['cruise_altitude_ft']:.0f}ft AGL")
    print(f"  • Execution Time:{params['total_latency_seconds']}s")
    print("-" * 78)

    # 3-Corridor Comparison Table
    print("\nCANDIDATE CORRIDORS COMPARATIVE ANALYSIS:")
    print(f"{'Corridor':<28} | {'Distance':<9} | {'Part 108':<8} | {'Hazard':<8} | {'Obstacles':<9} | {'Wind':<6} | {'Landing Zones'}")
    print("-" * 78)
    for c_id, metrics in comp["scored_metrics"].items():
        name = "Corridor A (Direct)" if c_id == "corridor_a" else ("Corridor B (Right)" if c_id == "corridor_b" else "Corridor C (Left)")
        dist_str = f"{metrics['distance_m']:.0f}m"
        tier_str = metrics["tier"]
        haz_str = f"{metrics['hazard_score']:.1f}"
        obs_str = f"{metrics['obstacle_count']} flagged"
        wind_str = "SAFE" if metrics["wind_safe"] else "WARN"
        lz_count = len(result.get("computed", {}).get(c_id, {}).get("landing_zones", []))
        lz_str = f"{lz_count} spot(s)"
        print(f"{name:<28} | {dist_str:<9} | {tier_str:<8} | {haz_str:<8} | {obs_str:<9} | {wind_str:<6} | {lz_str}")
    print("-" * 78)

    # Corridor Completeness & Data Quality
    print("\nCORRIDOR COMPLETENESS & DATA QUALITY:")
    for cid, c_comp in comp.get("completeness", {}).items():
        c_name = "Corridor A (Direct)" if cid == "corridor_a" else ("Corridor B (Right)" if cid == "corridor_b" else "Corridor C (Left)")
        ratio_pct = c_comp.get("completeness_ratio", 1.0) * 100
        print(f"  • {c_name:<26}: {ratio_pct:.1f}% ratio ({c_comp.get('complete_inputs')}/{c_comp.get('total_inputs')} complete) | "
              f"Incomplete: {c_comp.get('incomplete_inputs', 0)} | Quality: {c_comp.get('confidence_level', 'HIGH')}")

    # Approved Route Verdict Card
    conf = sc.get("confidence_score", 0.95)
    conf_label = "HIGH" if conf >= 0.9 else ("MEDIUM" if conf >= 0.7 else "LOW")

    print("\n╔══════════════════════════════════════════════════════════════════════════════╗")
    print(f"║  VERDICT: {sc.get('verdict_title', 'Route Safety Case'):<66}║")
    print("╠══════════════════════════════════════════════════════════════════════════════╣")
    print(f"║  RECOMMENDED ROUTE:  {sc.get('recommended_name', sc.get('recommended_corridor')):<52}║")
    print(f"║  PART 108 TIER:      {sc.get('part108_tier'):<52}║")
    print(f"║  CONFIDENCE SCORE:   {conf:.2f} ({conf_label}){' ' * (44 - len(conf_label))}║")
    print("╚══════════════════════════════════════════════════════════════════════════════╝")

    print("\nPRIMARY JUSTIFICATION:")
    print(f"  {sc.get('primary_justification')}")

    print("\nREJECTED CORRIDORS:")
    for rej in sc.get("rejected_corridors", []):
        print(f"  ✗ [{rej.get('name', rej.get('id'))}]: {rej.get('reason')}")

    print("\nFLAGGED RISKS & GROUNDED HAZARD CITATIONS:")
    for risk in sc.get("flagged_risks", []):
        print(f"  ⚠️  {risk}")

    print("\nEMERGENCY FORCED LANDING ZONES:")
    print(f"  📍 {sc.get('landing_zones_summary')}")

    print("\nOPERATIONAL CAVEATS & DISCLAIMERS:")
    for caveat in sc.get("caveats", []):
        print(f"  ℹ️  {caveat}")

    print("\nDATA PROVENANCE & AUDIT TRAIL:")
    for cit in sc.get("provenance_citations", []):
        print(f"  ✓ {cit.get('field'):<38} -> {cit.get('source')} [{cit.get('status')}]")
    print("=" * 78 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="Airlane BVLOS Route Risk & Tier Classifier CLI (Phase 8)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m agent.run "480 Berdoll Ln, Cedar Creek TX" "912 Elm St, Cedar Creek TX"
  python -m agent.run "37.4172, -122.1084" "37.4481, -122.1063" --offset 600 --spacing 400
  python -m agent.run "Cubberley Community Center" "Byxbee Park" --json
        """
    )

    parser.add_argument("launch", type=str, help="Launch address or '(lat, lng)' coordinate")
    parser.add_argument("destination", type=str, help="Destination address or '(lat, lng)' coordinate")
    parser.add_argument("--offset", "-o", type=float, default=600.0, help="Perpendicular detour bend offset in meters (default: 600.0)")
    parser.add_argument("--spacing", "-s", type=float, default=400.0, help="Sample point spacing in meters (default: 400.0)")
    parser.add_argument("--altitude", "-a", type=float, default=300.0, help="Cruise altitude in feet AGL (default: 300.0)")
    parser.add_argument("--drone-class", type=str, default="small_uav", choices=["micro_uav", "small_uav", "medium_uav"], help="Drone operating class (default: small_uav)")
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON safety case to stdout")
    parser.add_argument("--quiet", "-q", action="store_true", help="Suppress intermediate progress trace logs")

    args = parser.parse_args()

    try:
        result = asyncio.run(
            execute_pipeline(
                launch_input=args.launch,
                destination_input=args.destination,
                offset_m=args.offset,
                spacing_m=args.spacing,
                cruise_alt_ft=args.altitude,
                drone_class=args.drone_class,
                quiet=args.quiet or args.json
            )
        )

        if args.json:
            print(json.dumps(result, indent=2))
        else:
            render_terminal_report(result)

    except KeyboardInterrupt:
        print("\n[Airlane CLI] Process interrupted by user.")
        sys.exit(130)
    except Exception as e:
        print(f"\n[Airlane CLI Error] Execution failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
