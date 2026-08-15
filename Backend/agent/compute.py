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


def get_field_info(mireye_item: Dict[str, Any], key: str, default_val: Any = None) -> Tuple[Any, str]:
    """
    Safely extract (value, status_str) from a Mireye point dictionary.
    Status defaults to 'ok' if value exists, or 'unknown' / 'absent' if missing.
    """
    if not isinstance(mireye_item, dict):
        return default_val, "unknown"

    field_obj = mireye_item.get(key)
    if isinstance(field_obj, dict):
        val = field_obj.get("value")
        status = str(field_obj.get("status", "ok" if val is not None else "unknown")).lower()
        if val is None:
            val = default_val
        return val, status
    elif field_obj is not None:
        return field_obj, "ok"

    return default_val, "unknown"


def score_corridor_hazard_exposure(
    corridor: Corridor,
    mireye_data_list: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Score corridor hazard exposure based on distance-based hazard metrics from Mireye.
    Inverse of nearest_substation_distance_m and nearest_transmission_line_distance_m
    is calculated for each sample point (closer infrastructure = higher risk score).

    Explicitly excludes 'absent' status fields from scoring and distance aggregation.
    Returns a comparable score per corridor — lower is safer.

    IMPORTANT: When ALL points have absent/unknown/failed status (total data fetch failure),
    'data_insufficient' is set to True and display distance fields are set to None.
    The internal sentinel 9999.0 is used only for scoring comparisons and MUST NOT be
    displayed to users or included in safety case output as a real distance value.
    Pure, deterministic function.
    """
    total_hazard_score = 0.0
    max_point_score = 0.0

    substation_distances = []
    transmission_distances = []
    point_hazard_breakdown = []
    # Count points with genuine data failures (unknown/failed) vs. legitimate absent
    failed_point_count = 0
    total_point_count = len(list(zip(corridor.sample_points, mireye_data_list)))

    for pt, mireye in zip(corridor.sample_points, mireye_data_list):
        sub_val, sub_status = get_field_info(mireye, "nearest_substation_distance_m", None)
        trans_val, trans_status = get_field_info(mireye, "nearest_transmission_line_distance_m", None)

        # Track whether this point has a genuine data failure (not just legitimate 'absent')
        point_is_failed = (
            (sub_status in ("unknown", "failed") or sub_val is None) and
            (trans_status in ("unknown", "failed") or trans_val is None)
        )
        if point_is_failed:
            failed_point_count += 1

        sub_score = 0.0
        # Internal sentinel 9999.0 used ONLY for scoring math, never for display
        sub_dist_display = 9999.0  # internal sentinel — do not expose in display fields
        if sub_status != "absent" and sub_val is not None:
            sub_dist = float(sub_val)
            substation_distances.append(sub_dist)
            sub_dist_display = sub_dist
            if sub_dist < 2000.0:
                sub_score = (1000.0 / max(sub_dist, 10.0))

        trans_score = 0.0
        trans_dist_display = 9999.0  # internal sentinel — do not expose in display fields
        if trans_status != "absent" and trans_val is not None:
            trans_dist = float(trans_val)
            transmission_distances.append(trans_dist)
            trans_dist_display = trans_dist
            if trans_dist < 2000.0:
                trans_score = (1000.0 / max(trans_dist, 10.0))

        pt_score = sub_score + trans_score
        total_hazard_score += pt_score
        if pt_score > max_point_score:
            max_point_score = pt_score

        point_hazard_breakdown.append({
            "sample_index": pt.index,
            "distance_from_start_m": pt.distance_from_start_m,
            # Use None for sentinel values in breakdown — frontend must handle None gracefully
            "substation_distance_m": round(sub_dist_display, 1) if sub_dist_display < 9000.0 else None,
            "transmission_distance_m": round(trans_dist_display, 1) if trans_dist_display < 9000.0 else None,
            "point_risk_score": round(pt_score, 2),
            "data_status": "failed" if point_is_failed else "ok"
        })

    # data_insufficient = True when ALL points have no real data (total fetch failure)
    # This is the critical flag that prevents false "verified safe" output
    data_insufficient = (total_point_count > 0 and len(substation_distances) == 0 and len(transmission_distances) == 0)
    data_sufficient_points = total_point_count - failed_point_count

    # Internal sentinel values for scoring comparisons only — NEVER display these to users
    _min_sub_sentinel = min(substation_distances) if substation_distances else 9999.0
    _min_trans_sentinel = min(transmission_distances) if transmission_distances else 9999.0
    _avg_sub_sentinel = sum(substation_distances) / len(substation_distances) if substation_distances else 9999.0
    _avg_trans_sentinel = sum(transmission_distances) / len(transmission_distances) if transmission_distances else 9999.0

    return {
        "corridor_id": corridor.id,
        "hazard_exposure_score": round(total_hazard_score, 2),
        "max_point_hazard_score": round(max_point_score, 2),
        # Display fields: None when no real data exists (sentinel must not be shown to users)
        "min_substation_distance_m": round(_min_sub_sentinel, 1) if substation_distances else None,
        "min_transmission_distance_m": round(_min_trans_sentinel, 1) if transmission_distances else None,
        "avg_substation_distance_m": round(_avg_sub_sentinel, 1) if substation_distances else None,
        "avg_transmission_distance_m": round(_avg_trans_sentinel, 1) if transmission_distances else None,
        # Internal scoring sentinels (safe to use for compare_corridors math only)
        "_min_substation_sentinel": _min_sub_sentinel,
        "_min_transmission_sentinel": _min_trans_sentinel,
        # Data quality metadata
        "data_insufficient": data_insufficient,
        "data_sufficient_points": data_sufficient_points,
        "total_points": total_point_count,
        "failed_points": failed_point_count,
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

    Explicitly excludes 'absent' status fields from scoring.
    Returns a list of flagged obstacle risk points with distance-along-route.
    Pure, deterministic function.
    """
    if isinstance(corridor_or_points, Corridor):
        sample_points = corridor_or_points.sample_points
    else:
        sample_points = corridor_or_points

    flagged_obstacles = []

    for pt, mireye in zip(sample_points, mireye_data_list):
        sub_val, sub_status = get_field_info(mireye, "nearest_substation_distance_m", None)
        trans_val, trans_status = get_field_info(mireye, "nearest_transmission_line_distance_m", None)
        trans_kv_val, _ = get_field_info(mireye, "nearest_transmission_line_voltage_kv", 0.0)

        trans_dist = float(trans_val) if (trans_status != "absent" and trans_val is not None) else 9999.0
        sub_dist = float(sub_val) if (sub_status != "absent" and sub_val is not None) else 9999.0
        trans_kv = float(trans_kv_val) if trans_kv_val is not None else 0.0

        mile_marker = pt.distance_from_start_m / 1609.34

        # Check transmission line clearance hazard (< 150m proximity)
        if trans_status != "absent" and trans_dist < 150.0:
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
                "source": "Mireye Earth API",
                "description": f"Transmission line ({trans_kv:.0f}kV) within {trans_dist:.0f}m at mile {mile_marker:.2f}. Cruise altitude {cruise_altitude_ft:.0f}ft AGL requires heightened clearance."
            })
        elif sub_status != "absent" and sub_dist < 200.0:
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
                "source": "Mireye Earth API",
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
        "tier_histogram": tier_counts,
        "source": "US Census Bureau ACS5"
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

    spd = float(wind_data.get("wind_speed_kt") or 0.0)
    gust = float(wind_data.get("wind_gust_kt") or 0.0)
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

    Explicitly excludes points with any 'absent' status fields from qualifying as landing zones.
    Pure, deterministic function.
    """
    if isinstance(corridor_or_points, Corridor):
        sample_points = corridor_or_points.sample_points
    else:
        sample_points = corridor_or_points

    candidates = []
    for pt, mireye in zip(sample_points, mireye_data_list):
        sub_val, sub_status = get_field_info(mireye, "nearest_substation_distance_m", None)
        trans_val, trans_status = get_field_info(mireye, "nearest_transmission_line_distance_m", None)
        slope_val, slope_status = get_field_info(mireye, "slope_degrees", None)

        # Absent-data points CANNOT qualify as a forced landing zone
        if sub_status == "absent" or trans_status == "absent" or slope_status == "absent":
            continue
        if sub_val is None or trans_val is None or slope_val is None:
            continue

        sub_dist = float(sub_val)
        trans_dist = float(trans_val)
        slope = float(slope_val)

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
                "source": "Mireye Earth API",
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


def environmental_risk(
    corridor_or_points: Union[Corridor, List[SamplePoint]],
    mireye_data_list: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Evaluate USFWS Critical Habitat intersection and environmental risk along corridor sample points.
    Checks Mireye 'intersects_critical_habitat', 'critical_habitat_species',
    'critical_habitat_listing_status', and 'critical_habitat_status'.

    Kept as a distinct risk dimension separate from physical infrastructure hazards.
    Pure, deterministic function.
    """
    if isinstance(corridor_or_points, Corridor):
        sample_points = corridor_or_points.sample_points
    else:
        sample_points = corridor_or_points

    intersecting_points = []
    detected_species = set()
    detected_listings = set()
    detected_statuses = set()

    for pt, mireye in zip(sample_points, mireye_data_list):
        crit_val, crit_status = get_field_info(mireye, "intersects_critical_habitat", False)

        is_intersecting = (crit_val is True) or (isinstance(crit_val, str) and crit_val.lower() == "true")

        if is_intersecting and crit_status != "failed":
            species_val, _ = get_field_info(mireye, "critical_habitat_species", None)
            listing_val, _ = get_field_info(mireye, "critical_habitat_listing_status", None)
            status_val, _ = get_field_info(mireye, "critical_habitat_status", None)

            if species_val:
                detected_species.add(species_val)
            if listing_val:
                detected_listings.add(listing_val)
            if status_val:
                detected_statuses.add(status_val)

            mile_marker = pt.distance_from_start_m / 1609.34
            intersecting_points.append({
                "sample_index": pt.index,
                "lat": pt.lat,
                "lng": pt.lng,
                "distance_from_start_m": round(pt.distance_from_start_m, 1),
                "distance_along_route_miles": round(mile_marker, 2),
                "species": species_val,
                "listing_status": listing_val,
                "habitat_status": status_val,
                "source": "USFWS Critical Habitat (Fish & Wildlife Service)"
            })

    has_intersection = len(intersecting_points) > 0
    species_list = sorted(list(detected_species))
    species_str = ", ".join(species_list) if species_list else None
    listing_str = ", ".join(sorted(list(detected_listings))) if detected_listings else None
    status_str = ", ".join(sorted(list(detected_statuses))) if detected_statuses else None

    if has_intersection:
        desc = (
            f"Corridor intersects designated USFWS Critical Habitat at {len(intersecting_points)} sample point(s). "
            f"Species: {species_str or 'Protected Species'} (Listing: {listing_str or 'Designated'}, Status: {status_str or 'Final'})."
        )
    else:
        desc = "No designated critical habitat intersected along evaluated corridor."

    return {
        "intersects_critical_habitat": has_intersection,
        "has_risk": has_intersection,
        "species": species_str,
        "species_list": species_list,
        "listing_status": listing_str,
        "habitat_status": status_str,
        "intersecting_points_count": len(intersecting_points),
        "intersecting_points": intersecting_points,
        "description": desc,
        "source": "USFWS Critical Habitat (Fish & Wildlife Service)"
    }


# Backward-compatibility alias
evaluate_environmental_risk = environmental_risk


def calculate_corridor_completeness(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate completeness score and ratio for a corridor evaluation by checking input statuses.
    Counts total input data points/fields and identifies genuine UNKNOWN/FAILED degradation.
    Authoritative 'absent' status (hazard evaluated and confirmed absent) is considered complete.
    intersects_critical_habitat=false is also a complete, honest answer, not missing data.
    """
    total_inputs = 0
    incomplete_inputs = 0

    # 1. Mireye hazard points (including intersects_critical_habitat)
    mireye_list = data.get("mireye_raw") or data.get("mireye_points") or data.get("mireye") or []
    if isinstance(mireye_list, list):
        for pt in mireye_list:
            if isinstance(pt, dict):
                m_st = str(pt.get("status", "")).upper()
                for f_key in ["nearest_substation_distance_m", "nearest_transmission_line_distance_m", "slope_degrees", "intersects_critical_habitat"]:
                    total_inputs += 1
                    if m_st in ("UNKNOWN", "FAILED"):
                        incomplete_inputs += 1
                        continue
                    f_obj = pt.get(f_key)
                    if isinstance(f_obj, dict):
                        st = str(f_obj.get("status", "")).lower()
                        if st in ("unknown", "failed"):
                            incomplete_inputs += 1
                    elif f_obj is None:
                        incomplete_inputs += 1

    # 2. FAA airspace points
    faa_list = data.get("faa_raw") or data.get("faa_points") or data.get("faa") or []
    if isinstance(faa_list, list):
        for pt in faa_list:
            total_inputs += 1
            if isinstance(pt, dict):
                st = str(pt.get("status", "")).upper()
                if st in ("UNKNOWN", "FAILED"):
                    incomplete_inputs += 1
            else:
                incomplete_inputs += 1

    # 3. Census ground risk points
    census_list = data.get("census_raw") or data.get("census_points") or data.get("census") or []
    if isinstance(census_list, list):
        for pt in census_list:
            total_inputs += 1
            if isinstance(pt, dict):
                st = str(pt.get("status", "")).upper()
                if st in ("UNKNOWN", "FAILED"):
                    incomplete_inputs += 1
            else:
                incomplete_inputs += 1

    # 4. NOAA Wind observation
    wind_obj = data.get("wind", {})
    total_inputs += 1
    if isinstance(wind_obj, dict):
        st = str(wind_obj.get("status", "")).upper()
        if not wind_obj or st in ("UNKNOWN", "FAILED", "MISSING"):
            incomplete_inputs += 1
    else:
        incomplete_inputs += 1

    # Fallback if no raw point lists were supplied
    if total_inputs == 1 and not mireye_list and not faa_list and not census_list:
        tier_obj = data.get("tier", {})
        if isinstance(tier_obj, dict) and str(tier_obj.get("status", "")).upper() in ("UNKNOWN", "FAILED"):
            incomplete_inputs += 1
        total_inputs = 2

    completeness_ratio = (total_inputs - incomplete_inputs) / total_inputs if total_inputs > 0 else 1.0
    completeness_ratio = round(max(0.0, min(1.0, completeness_ratio)), 4)

    return {
        "total_inputs": total_inputs,
        "incomplete_inputs": incomplete_inputs,
        "complete_inputs": total_inputs - incomplete_inputs,
        "completeness_ratio": completeness_ratio,
        "confidence_level": "HIGH" if completeness_ratio >= 0.9 else ("MEDIUM" if completeness_ratio >= 0.7 else "LOW")
    }


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
    detailed rejection reasons for all losing candidate routes. Includes completeness/confidence metrics.
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

        haz_exposure = data.get("hazard_exposure", {})
        h_score = haz_exposure.get("hazard_exposure_score", 0.0)
        t_obj = data.get("tier", {})
        t_dominant = t_obj.get("dominant_tier", "Tier 1")
        t_rank = tier_rank_map.get(t_dominant, 1)

        obstacles = data.get("obstacles", [])
        obs_count = len(obstacles)

        # Use internal sentinels for sort math — these are not display values
        min_trans = haz_exposure.get("_min_transmission_sentinel", haz_exposure.get("min_transmission_distance_m") or 9999.0)
        min_sub = haz_exposure.get("_min_substation_sentinel", haz_exposure.get("min_substation_distance_m") or 9999.0)

        # Detect total data failure for this corridor
        data_insufficient = bool(haz_exposure.get("data_insufficient", False))

        wind_data = data.get("wind", {})
        wind_status = str(wind_data.get("status", "")).upper()
        if not wind_data or wind_status in ("FAILED", "UNKNOWN", "MISSING") or "is_safe" not in wind_data:
            wind_safe = wind_data.get("is_safe", False)
        else:
            wind_safe = wind_data.get("is_safe", True)

        env_risk = data.get("environmental_risk") or data.get("environmental")
        if not env_risk:
            m_raw = data.get("mireye_raw") or data.get("mireye_points")
            if corr and m_raw:
                env_risk = environmental_risk(corr, m_raw)
            else:
                env_risk = {
                    "intersects_critical_habitat": False,
                    "has_risk": False,
                    "species": None,
                    "listing_status": None,
                    "habitat_status": None,
                    "intersecting_points_count": 0,
                    "source": "USFWS Critical Habitat (Fish & Wildlife Service)"
                }

        completeness_info = calculate_corridor_completeness(data)

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
            "wind_safe": wind_safe,
            "environmental_risk": env_risk,
            "completeness": completeness_info,
            "data_insufficient": data_insufficient
        })

    # Strict multi-criteria deterministic sorting.
    # Data-insufficient corridors are always ranked LAST regardless of their numeric scores,
    # because a score of 0.0 on absent data must never be treated as "safest".
    # 1. Data failure (True = penalized to last), 2. Ground Risk Tier (asc),
    # 3. Environmental Habitat Intersection (asc), 4. Hazard Exposure Score (asc),
    # 5. Obstacle Count (asc), 6. Distance (asc)
    ranked.sort(key=lambda x: (
        1 if x["data_insufficient"] else 0,
        x["tier_rank"],
        1 if x["environmental_risk"].get("intersects_critical_habitat") else 0,
        x["hazard_score"],
        x["obstacle_count"],
        x["distance_m"]
    ))

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
        if loser["environmental_risk"].get("intersects_critical_habitat") and not winner["environmental_risk"].get("intersects_critical_habitat"):
            sp = loser["environmental_risk"].get("species") or "Designated Protected Habitat"
            reasons.append(
                f"Intersects USFWS Critical Habitat ({sp})."
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
            "environmental_risk": loser["environmental_risk"],
            "reason": " ".join(reasons)
        })

    # Data quality summary — which corridors had total data failure
    data_quality_flags = {r["id"]: r["data_insufficient"] for r in ranked}
    any_corridor_data_insufficient = any(data_quality_flags.values())

    comparison_reason = (
        f"{winner['name']} selected as optimal BVLOS flight corridor: "
        f"lowest ground risk ({winner['tier']}) and lowest hazard exposure score ({winner['hazard_score']:.1f})."
    )
    if winner["data_insufficient"]:
        comparison_reason = (
            f"WARNING: {winner['name']} selected by default — ALL corridors returned insufficient data. "
            f"Hazard scores are sentinel defaults and DO NOT represent real safety measurements."
        )

    return {
        "recommended_corridor": winner["id"],
        "recommended_name": winner["name"],
        "comparison_reason": comparison_reason,
        "dimension_winners": {
            "tier_winner": tier_winner,
            "hazard_exposure_winner": hazard_winner,
            "obstacle_winner": obs_winner,
            "distance_winner": dist_winner
        },
        "rejected_corridors": rejected_corridors,
        "environmental_risks": {r["id"]: r["environmental_risk"] for r in ranked},
        "completeness": {r["id"]: r["completeness"] for r in ranked},
        "data_quality_flags": data_quality_flags,
        "any_corridor_data_insufficient": any_corridor_data_insufficient,
        "scored_metrics": {r["id"]: {
            "hazard_score": r["hazard_score"],
            "tier": r["tier"],
            "tier_rank": r["tier_rank"],
            "obstacle_count": r["obstacle_count"],
            "distance_m": r["distance_m"],
            # Display fields: None when no real data (sentinel must not be shown to users)
            "min_transmission_distance_m": None if r["data_insufficient"] else r["min_trans_m"],
            "min_substation_distance_m": None if r["data_insufficient"] else r["min_sub_m"],
            "wind_safe": r["wind_safe"],
            "environmental_risk": r["environmental_risk"],
            "completeness_ratio": r["completeness"]["completeness_ratio"],
            "completeness": r["completeness"],
            "data_insufficient": r["data_insufficient"]
        } for r in ranked}
    }
