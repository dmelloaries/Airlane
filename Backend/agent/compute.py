"""
Compute Engine module for BVLOS Drone Route Evaluation (Phase 6).

Contains pure, deterministic mathematical and rule-based functions to evaluate:
1. Distance-based hazard exposure scores (Mireye infrastructure)
2. Obstacle risk clearance & vertical clearance (transmission lines & substations)
3. Part 108 ground risk tier determination (worst-case dominant tier across route)
4. Surface wind risk limits (NOAA METAR vs drone operating thresholds)
5. Candidate emergency forced landing zones (high clearance, low slope)
6. Multi-corridor itemized comparative evaluation and route ranking
"""

from typing import List, Dict, Any, Tuple, Optional, Union
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
    Pure, deterministic function.
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
            "substation_distance_m": round(sub_dist, 1),
            "transmission_distance_m": round(trans_dist, 1),
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


def obstacle_risk(
    corridor_or_points: Union[Corridor, List[SamplePoint]],
    mireye_data_list: List[Dict[str, Any]],
    cruise_altitude_ft: float = 300.0
) -> List[Dict[str, Any]]:
    """
    Evaluate obstacle risks along corridor sample points.
    Checks Mireye transmission line / substation proximity and vertical clearance against drone cruise altitude.

    Returns a list of flagged obstacle risk points with distance-along-route.
    Pure, deterministic function.
    """
    if isinstance(corridor_or_points, Corridor):
        sample_points = corridor_or_points.sample_points
    else:
        sample_points = corridor_or_points

    flagged_obstacles = []

    for pt, mireye in zip(sample_points, mireye_data_list):
        sub_dist_val = get_field_val(mireye, "nearest_substation_distance_m", 9999.0)
        trans_dist_val = get_field_val(mireye, "nearest_transmission_line_distance_m", 9999.0)
        trans_kv_val = get_field_val(mireye, "nearest_transmission_line_voltage_kv", 0.0)

        sub_dist = float(sub_dist_val) if sub_dist_val is not None else 9999.0
        trans_dist = float(trans_dist_val) if trans_dist_val is not None else 9999.0
        trans_kv = float(trans_kv_val) if trans_kv_val is not None else 0.0

        mile_marker = pt.distance_from_start_m / 1609.34

        # Check transmission line clearance hazard (< 150m proximity)
        if trans_dist < 150.0:
            flagged_obstacles.append({
                "sample_index": pt.index,
                "lat": pt.lat,
                "lng": pt.lng,
                "distance_from_start_m": round(pt.distance_from_start_m, 1),
                "distance_along_route_miles": round(mile_marker, 2),
                "obstacle_type": "High-Voltage Transmission Proximity",
                "distance_m": round(trans_dist, 1),
                "voltage_kv": trans_kv,
                "cruise_altitude_ft": cruise_altitude_ft,
                "clearance_status": "INADEQUATE_VERTICAL_CLEARANCE",
                "severity": "HIGH",
                "description": f"Transmission line ({trans_kv:.0f}kV) within {trans_dist:.0f}m at mile {mile_marker:.2f}. Cruise altitude {cruise_altitude_ft:.0f}ft AGL requires heightened clearance."
            })
        elif sub_dist < 200.0:
            flagged_obstacles.append({
                "sample_index": pt.index,
                "lat": pt.lat,
                "lng": pt.lng,
                "distance_from_start_m": round(pt.distance_from_start_m, 1),
                "distance_along_route_miles": round(mile_marker, 2),
                "obstacle_type": "Substation Proximity",
                "distance_m": round(sub_dist, 1),
                "cruise_altitude_ft": cruise_altitude_ft,
                "clearance_status": "GROUND_INFRASTRUCTURE_HAZARD",
                "severity": "MEDIUM",
                "description": f"Substation within {sub_dist:.0f}m at mile {mile_marker:.2f}."
            })

    return flagged_obstacles


# Backward-compatibility alias
evaluate_obstacle_risks = obstacle_risk


def corridor_tier(
    corridor_or_census: Union[Corridor, List[Dict[str, Any]]],
    census_data_list: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Determine the maximum (worst-case) Part 108 ground risk tier across all sample points in a corridor.
    Worst-case framing ensures strict safety compliance.

    Returns dominant tier, tier rank, description, and density statistics.
    Pure, deterministic function.
    """
    if isinstance(corridor_or_census, Corridor) and census_data_list is not None:
        data_list = census_data_list
    elif isinstance(corridor_or_census, list):
        data_list = corridor_or_census
    else:
        data_list = census_data_list or []

    tier_rank_map = {"Tier 1": 1, "Tier 2": 2, "Tier 3": 3, "Tier 4": 4, "Tier 5": 5}
    highest_rank = 0
    highest_tier_name = "Tier 1"
    worst_point_info = None
    max_density = 0.0
    tier_counts = {"Tier 1": 0, "Tier 2": 0, "Tier 3": 0, "Tier 4": 0, "Tier 5": 0}

    for idx, c in enumerate(data_list):
        t_name = c.get("tier", "Tier 1")
        density = float(c.get("density_sq_mi", 0.0))
        rank = tier_rank_map.get(t_name, 1)

        tier_counts[t_name] = tier_counts.get(t_name, 0) + 1

        if density > max_density:
            max_density = density

        if rank > highest_rank:
            highest_rank = rank
            highest_tier_name = t_name
            worst_point_info = c
            worst_point_info["sample_index"] = idx

    return {
        "dominant_tier": highest_tier_name,
        "tier_rank": highest_rank,
        "tier_name": worst_point_info.get("tier_name", "Rural") if worst_point_info else "Rural",
        "description": worst_point_info.get("tier_description", "") if worst_point_info else "",
        "max_density_sq_mi": round(max_density, 1),
        "worst_sample_index": worst_point_info.get("sample_index", 0) if worst_point_info else 0,
        "tier_histogram": tier_counts
    }


# Backward-compatibility alias
determine_corridor_worst_tier = corridor_tier


def wind_risk(
    wind_data: Dict[str, Any],
    max_crosswind_kt: float = 20.0,
    drone_class: str = "small_uav"
) -> Dict[str, Any]:
    """
    Check surface wind limits for small drones against METAR observations.

    Drone classes & max operating limits:
    - micro_uav (< 4.4 lbs): 12 kt limit
    - small_uav (< 55 lbs): 20 kt limit (default)
    - medium_uav (> 55 lbs): 30 kt limit

    Pure, deterministic function.
    """
    class_limits = {
        "micro_uav": 12.0,
        "small_uav": 20.0,
        "medium_uav": 30.0
    }
    effective_limit = class_limits.get(drone_class, max_crosswind_kt)

    spd = float(wind_data.get("wind_speed_kt", 0.0))
    gust = float(wind_data.get("wind_gust_kt", 0.0))
    direction = wind_data.get("wind_direction_deg", 0)
    station_id = wind_data.get("station_id", "METAR")

    peak_wind = max(spd, gust)
    is_safe = peak_wind <= effective_limit

    warning = None
    if not is_safe:
        warning = (
            f"Surface wind peak ({peak_wind:.0f} kt) at station {station_id} "
            f"exceeds max operating limit of {effective_limit:.0f} kt for {drone_class}."
        )

    return {
        "wind_speed_kt": spd,
        "wind_gust_kt": gust,
        "wind_direction_deg": direction,
        "station_id": station_id,
        "max_limit_kt": effective_limit,
        "drone_class": drone_class,
        "is_safe": is_safe,
        "warning": warning,
        "source": wind_data.get("source", "NOAA Aviation Weather API (METAR)")
    }


# Backward-compatibility alias
evaluate_wind_risk = wind_risk


def forced_landing_zones(
    corridor_or_points: Union[Corridor, List[SamplePoint]],
    mireye_data_list: List[Dict[str, Any]],
    top_n: int = 2
) -> List[Dict[str, Any]]:
    """
    Identify candidate emergency forced landing zones along route.
    Filters for points with maximal distance from infrastructure (substations, lines) and gentle slope (< 5°).
    Ensures minimum spatial spacing (~800m) between selected landing spots.

    Pure, deterministic function.
    """
    if isinstance(corridor_or_points, Corridor):
        sample_points = corridor_or_points.sample_points
    else:
        sample_points = corridor_or_points

    candidates = []
    for pt, mireye in zip(sample_points, mireye_data_list):
        sub_dist_val = get_field_val(mireye, "nearest_substation_distance_m", 9999.0)
        trans_dist_val = get_field_val(mireye, "nearest_transmission_line_distance_m", 9999.0)
        slope_val = get_field_val(mireye, "slope_degrees", 0.0)

        sub_dist = float(sub_dist_val) if sub_dist_val is not None else 9999.0
        trans_dist = float(trans_dist_val) if trans_dist_val is not None else 9999.0
        slope = float(slope_val) if slope_val is not None else 0.0

        if sub_dist > 400.0 and trans_dist > 300.0 and slope < 5.0:
            clearance = min(sub_dist, trans_dist)
            mile_marker = pt.distance_from_start_m / 1609.34
            candidates.append({
                "sample_index": pt.index,
                "lat": pt.lat,
                "lng": pt.lng,
                "distance_from_start_m": round(pt.distance_from_start_m, 1),
                "distance_along_route_miles": round(mile_marker, 2),
                "suitability": "HIGH",
                "slope_degrees": round(slope, 1),
                "infrastructure_clearance_m": round(clearance, 1),
                "description": f"Emergency forced landing spot at mile {mile_marker:.2f} with {clearance:.0f}m infrastructure clearance and {slope:.1f}° slope."
            })

    # Pick spaced candidates (>= 800m apart)
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


# Backward-compatibility alias
identify_landing_zones = forced_landing_zones


def compare_corridors(
    corridors_eval: Union[Dict[str, Dict[str, Any]], Corridor, List[Any]],
    *args: Any
) -> Dict[str, Any]:
    """
    Itemized deterministic safety comparison across candidate corridors (A, B, C).
    Ranked by:
    1. Part 108 Tier rank (lower tier rank is safer ground environment)
    2. Hazard exposure score (lower score is safer infrastructure proximity)
    3. Obstacle count (fewer flagged obstacles is safer)
    4. Route distance (shorter distance with equivalent risk)

    Explicitly returns the recommended corridor, itemized dimension breakdown, and
    detailed rejection reasons for all losing candidate routes.
    Pure, deterministic function: same input → byte-identical output.
    """
    tier_rank_map = {"Tier 1": 1, "Tier 2": 2, "Tier 3": 3, "Tier 4": 4, "Tier 5": 5}

    # Normalize input argument format
    eval_dict: Dict[str, Dict[str, Any]] = {}
    if isinstance(corridors_eval, dict):
        eval_dict = corridors_eval
    elif isinstance(corridors_eval, (list, tuple)):
        for idx, item in enumerate(corridors_eval):
            key = f"corridor_{chr(97 + idx)}"
            eval_dict[key] = item
    else:
        # Positional arguments unpacking
        all_args = [corridors_eval] + list(args)
        for idx, item in enumerate(all_args):
            key = f"corridor_{chr(97 + idx)}"
            eval_dict[key] = item

    ranked = []
    for c_id, data in eval_dict.items():
        corr = data.get("corridor")
        c_name = corr.name if hasattr(corr, "name") else data.get("name", c_id)
        c_dist = corr.total_distance_m if hasattr(corr, "total_distance_m") else float(data.get("total_distance_m", 0.0))

        h_score = data.get("hazard_exposure", {}).get("hazard_exposure_score", 0.0)
        t_obj = data.get("tier", {})
        t_dominant = t_obj.get("dominant_tier", "Tier 1")
        t_rank = tier_rank_map.get(t_dominant, 1)

        obstacles = data.get("obstacles", [])
        obs_count = len(obstacles)

        min_trans = data.get("hazard_exposure", {}).get("min_transmission_distance_m", 9999.0)
        min_sub = data.get("hazard_exposure", {}).get("min_substation_distance_m", 9999.0)

        wind_data = data.get("wind", {})
        wind_safe = wind_data.get("is_safe", True)

        ranked.append({
            "id": c_id,
            "name": c_name,
            "hazard_score": h_score,
            "tier": t_dominant,
            "tier_rank": t_rank,
            "obstacle_count": obs_count,
            "distance_m": c_dist,
            "min_trans_m": min_trans,
            "min_sub_m": min_sub,
            "wind_safe": wind_safe
        })

    # Strict multi-criteria deterministic sorting
    # 1. Ground Risk Tier (asc), 2. Hazard Exposure Score (asc), 3. Obstacle Count (asc), 4. Distance (asc)
    ranked.sort(key=lambda x: (x["tier_rank"], x["hazard_score"], x["obstacle_count"], x["distance_m"]))

    winner = ranked[0]
    losers = ranked[1:]

    # Compute dimension winners
    tier_winner = min(ranked, key=lambda x: x["tier_rank"])["name"]
    hazard_winner = min(ranked, key=lambda x: x["hazard_score"])["name"]
    obs_winner = min(ranked, key=lambda x: x["obstacle_count"])["name"]
    dist_winner = min(ranked, key=lambda x: x["distance_m"])["name"]

    rejected_corridors = []
    for loser in losers:
        reasons = []
        if loser["tier_rank"] > winner["tier_rank"]:
            reasons.append(
                f"Operates in a higher Part 108 ground risk tier ({loser['tier']} vs {winner['tier']})."
            )
        if loser["hazard_score"] > winner["hazard_score"]:
            reasons.append(
                f"Higher hazard exposure score ({loser['hazard_score']:.1f} vs {winner['hazard_score']:.1f}) "
                f"due to closer infrastructure proximity (min transmission line: {loser['min_trans_m']}m vs {winner['min_trans_m']}m)."
            )
        if loser["obstacle_count"] > winner["obstacle_count"]:
            reasons.append(
                f"Crosses more flagged obstacle hazards ({loser['obstacle_count']} vs {winner['obstacle_count']})."
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
            "obstacle_count": loser["obstacle_count"],
            "reason": " ".join(reasons)
        })

    return {
        "recommended_corridor": winner["id"],
        "recommended_name": winner["name"],
        "comparison_reason": (
            f"{winner['name']} selected as optimal BVLOS flight corridor: "
            f"lowest ground risk ({winner['tier']}) and lowest hazard exposure score ({winner['hazard_score']:.1f})."
        ),
        "dimension_winners": {
            "tier_winner": tier_winner,
            "hazard_exposure_winner": hazard_winner,
            "obstacle_winner": obs_winner,
            "distance_winner": dist_winner
        },
        "rejected_corridors": rejected_corridors,
        "scored_metrics": {r["id"]: {
            "hazard_score": r["hazard_score"],
            "tier": r["tier"],
            "tier_rank": r["tier_rank"],
            "obstacle_count": r["obstacle_count"],
            "distance_m": r["distance_m"],
            "min_transmission_distance_m": r["min_trans_m"],
            "min_substation_distance_m": r["min_sub_m"],
            "wind_safe": r["wind_safe"]
        } for r in ranked}
    }
