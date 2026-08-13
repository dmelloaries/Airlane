"""
Compute Engine module for BVLOS Drone Route Evaluation.

Contains pure, deterministic mathematical functions to compute distance-based hazard
exposure scores, Part 108 ground risk tiers, wind safety limits, emergency forced
landing zones, and multi-corridor comparisons.
"""

from typing import List, Dict, Any, Tuple
from agent.corridor import Corridor, SamplePoint, haversine_distance


from sources.mireye import get_field_val


def score_corridor_hazard_exposure(
    corridor: Corridor,
    mireye_data_list: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Score corridor hazard exposure based on distance-based hazard metrics from Mireye.
    Inverse of nearest_substation_distance_m and nearest_transmission_line_distance_m
    is calculated for each sample point (closer infrastructure = higher risk score).

    Returns a comparable score per corridor — lower is safer.
    """
    total_hazard_score = 0.0
    max_point_score = 0.0

    substation_distances = []
    transmission_distances = []
    point_hazard_breakdown = []

    for pt, mireye in zip(corridor.sample_points, mireye_data_list):
        sub_dist_val = get_field_val(mireye, "nearest_substation_distance_m", 9999.0)
        trans_dist_val = get_field_val(mireye, "nearest_transmission_line_distance_m", 9999.0)

        sub_dist = float(sub_dist_val) if sub_dist_val is not None else 9999.0
        trans_dist = float(trans_dist_val) if trans_dist_val is not None else 9999.0

        substation_distances.append(sub_dist)
        transmission_distances.append(trans_dist)

        # Inverse distance scoring (only score within 2000m threshold)
        sub_score = (1000.0 / max(sub_dist, 10.0)) if sub_dist < 2000.0 else 0.0
        trans_score = (1000.0 / max(trans_dist, 10.0)) if trans_dist < 2000.0 else 0.0

        pt_score = sub_score + trans_score
        total_hazard_score += pt_score
        if pt_score > max_point_score:
            max_point_score = pt_score

        point_hazard_breakdown.append({
            "sample_index": pt.index,
            "distance_from_start_m": pt.distance_from_start_m,
            "substation_distance_m": sub_dist,
            "transmission_distance_m": trans_dist,
            "point_risk_score": round(pt_score, 2)
        })

    min_sub_dist = min(substation_distances) if substation_distances else 9999.0
    min_trans_dist = min(transmission_distances) if transmission_distances else 9999.0
    avg_sub_dist = sum(substation_distances) / len(substation_distances) if substation_distances else 9999.0
    avg_trans_dist = sum(transmission_distances) / len(transmission_distances) if transmission_distances else 9999.0

    return {
        "corridor_id": corridor.id,
        "hazard_exposure_score": round(total_hazard_score, 2),
        "max_point_hazard_score": round(max_point_score, 2),
        "min_substation_distance_m": round(min_sub_dist, 1),
        "min_transmission_distance_m": round(min_trans_dist, 1),
        "avg_substation_distance_m": round(avg_sub_dist, 1),
        "avg_transmission_distance_m": round(avg_trans_dist, 1),
        "point_breakdown": point_hazard_breakdown
    }


def evaluate_obstacle_risks(
    sample_points: List[SamplePoint],
    mireye_data_list: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Flag sample points with close proximity (< 150m) to substations or transmission lines.
    """
    flagged_obstacles = []

    for pt, mireye in zip(sample_points, mireye_data_list):
        sub_dist_val = get_field_val(mireye, "nearest_substation_distance_m", 9999.0)
        trans_dist_val = get_field_val(mireye, "nearest_transmission_line_distance_m", 9999.0)
        trans_kv_val = get_field_val(mireye, "nearest_transmission_line_voltage_kv", 0.0)

        sub_dist = float(sub_dist_val) if sub_dist_val is not None else 9999.0
        trans_dist = float(trans_dist_val) if trans_dist_val is not None else 9999.0
        trans_kv = float(trans_kv_val) if trans_kv_val is not None else 0.0

        if trans_dist < 150.0:
            flagged_obstacles.append({
                "sample_index": pt.index,
                "lat": pt.lat,
                "lng": pt.lng,
                "distance_from_start_m": pt.distance_from_start_m,
                "obstacle_type": "High-Voltage Transmission Proximity",
                "distance_m": round(trans_dist, 1),
                "voltage_kv": trans_kv,
                "severity": "HIGH",
                "description": f"Transmission line within {trans_dist:.0f}m at mile {pt.distance_from_start_m/1609.34:.2f}."
            })
        elif sub_dist < 200.0:
            flagged_obstacles.append({
                "sample_index": pt.index,
                "lat": pt.lat,
                "lng": pt.lng,
                "distance_from_start_m": pt.distance_from_start_m,
                "obstacle_type": "Substation Proximity",
                "distance_m": round(sub_dist, 1),
                "severity": "MEDIUM",
                "description": f"Substation within {sub_dist:.0f}m at mile {pt.distance_from_start_m/1609.34:.2f}."
            })

    return flagged_obstacles


def determine_corridor_worst_tier(census_data_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Determine the maximum (worst-case) Part 108 ground risk tier across all sample points.
    """
    tier_rank = {"Tier 1": 1, "Tier 2": 2, "Tier 3": 3, "Tier 4": 4, "Tier 5": 5}
    highest_tier_name = "Tier 1"
    highest_rank = 0
    worst_point_info = None

    for c in census_data_list:
        t_name = c.get("tier", "Tier 1")
        rank = tier_rank.get(t_name, 1)
        if rank > highest_rank:
            highest_rank = rank
            highest_tier_name = t_name
            worst_point_info = c

    return {
        "dominant_tier": highest_tier_name,
        "tier_rank": highest_rank,
        "tier_name": worst_point_info.get("tier_name", "Rural") if worst_point_info else "Rural",
        "description": worst_point_info.get("tier_description", "") if worst_point_info else ""
    }


def evaluate_wind_risk(wind_data: Dict[str, Any], max_crosswind_kt: float = 20.0) -> Dict[str, Any]:
    """
    Check surface wind limits for small drones (< 55 lbs).
    """
    spd = wind_data.get("wind_speed_kt", 0.0)
    is_safe = spd <= max_crosswind_kt
    return {
        "wind_speed_kt": spd,
        "max_limit_kt": max_crosswind_kt,
        "is_safe": is_safe,
        "warning": None if is_safe else f"Wind speed {spd} kt exceeds recommended limit of {max_crosswind_kt} kt."
    }


def identify_landing_zones(
    sample_points: List[SamplePoint],
    mireye_data_list: List[Dict[str, Any]],
    top_n: int = 2
) -> List[Dict[str, Any]]:
    """
    Identify sample points with maximal distance from infrastructure and gentle terrain for emergency landing.
    """
    candidates = []

    for pt, mireye in zip(sample_points, mireye_data_list):
        sub_dist = float(mireye.get("nearest_substation_distance_m", 9999.0))
        trans_dist = float(mireye.get("nearest_transmission_line_distance_m", 9999.0))
        slope = float(mireye.get("slope_degrees", 0.0))

        if sub_dist > 400.0 and trans_dist > 300.0 and slope < 5.0:
            candidates.append({
                "sample_index": pt.index,
                "lat": pt.lat,
                "lng": pt.lng,
                "distance_from_start_m": pt.distance_from_start_m,
                "suitability": "HIGH",
                "slope_degrees": slope,
                "infrastructure_clearance_m": round(min(sub_dist, trans_dist), 1)
            })

    # Pick spaced candidates
    selected = []
    min_spacing_m = 800.0
    for c in candidates:
        if not selected:
            selected.append(c)
        else:
            last_selected = selected[-1]
            dist = haversine_distance((c["lat"], c["lng"]), (last_selected["lat"], last_selected["lng"]))
            if dist >= min_spacing_m:
                selected.append(c)
        if len(selected) >= top_n:
            break

    return selected


def compare_corridors(corridors_eval: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """
    Itemized deterministic safety comparison across 3 candidate corridors (A, B, C).
    Ranked primarily by hazard exposure score (lower is safer), secondarily by Part 108 Tier rank.

    Explicitly returns the recommended corridor and rejection reasons for the 2 losing corridors.
    """
    tier_rank_map = {"Tier 1": 1, "Tier 2": 2, "Tier 3": 3, "Tier 4": 4, "Tier 5": 5}

    ranked = []
    for c_id, data in corridors_eval.items():
        h_score = data["hazard_exposure"]["hazard_exposure_score"]
        t_rank = tier_rank_map.get(data["tier"]["dominant_tier"], 1)
        dist = data["corridor"].total_distance_m

        ranked.append({
            "id": c_id,
            "name": data["corridor"].name,
            "hazard_score": h_score,
            "tier": data["tier"]["dominant_tier"],
            "tier_rank": t_rank,
            "distance_m": dist,
            "min_trans_m": data["hazard_exposure"]["min_transmission_distance_m"],
            "min_sub_m": data["hazard_exposure"]["min_substation_distance_m"]
        })

    # Sort: 1st by hazard score (asc), 2nd by tier rank (asc), 3rd by distance (asc)
    ranked.sort(key=lambda x: (x["hazard_score"], x["tier_rank"], x["distance_m"]))

    winner = ranked[0]
    losers = ranked[1:]

    rejected_corridors = []
    for loser in losers:
        reasons = []
        if loser["hazard_score"] > winner["hazard_score"]:
            reasons.append(
                f"Higher hazard exposure score ({loser['hazard_score']:.1f} vs {winner['hazard_score']:.1f}) "
                f"due to closer infrastructure proximity (min transmission line: {loser['min_trans_m']}m vs {winner['min_trans_m']}m)."
            )
        if loser["tier_rank"] > winner["tier_rank"]:
            reasons.append(
                f"Operates in a higher Part 108 ground risk tier ({loser['tier']} vs {winner['tier']})."
            )
        if loser["distance_m"] > winner["distance_m"] and not reasons:
            reasons.append(
                f"Longer flight distance ({loser['distance_m']:.0f}m vs {winner['distance_m']:.0f}m) with equivalent risk."
            )
        if not reasons:
            reasons.append("Secondary candidate route rejected in favor of primary optimal corridor.")

        rejected_corridors.append({
            "id": loser["id"],
            "name": loser["name"],
            "hazard_score": loser["hazard_score"],
            "tier": loser["tier"],
            "reason": " ".join(reasons)
        })

    return {
        "recommended_corridor": winner["id"],
        "recommended_name": winner["name"],
        "comparison_reason": (
            f"{winner['name']} selected with lowest hazard exposure score ({winner['hazard_score']:.1f}) "
            f"and lowest ground risk ({winner['tier']})."
        ),
        "rejected_corridors": rejected_corridors,
        "scored_metrics": {r["id"]: {
            "hazard_score": r["hazard_score"],
            "tier": r["tier"],
            "distance_m": r["distance_m"],
            "min_transmission_distance_m": r["min_trans_m"],
            "min_substation_distance_m": r["min_sub_m"]
        } for r in ranked}
    }
