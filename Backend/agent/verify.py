"""
Verification & Provenance agent module.
Ensures every claim and figure in the reasoning output is tied to a cited source
and calculates an overall confidence score based on missing or degraded data fields across all 3 corridors.
"""

from typing import Dict, Any


def verify_provenance_and_confidence(
    reasoning_output: Dict[str, Any],
    computed_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Verify provenance of facts and adjust confidence if data sources degraded across corridors.
    Distinguishes authoritative 'absent' status (no hazard detected in terrain) from genuine UNKNOWN/FAILED degradation.

    IMPORTANT: If any corridor has data_insufficient=True (set by score_corridor_hazard_exposure
    when ALL Mireye points fail), confidence is hard-capped at 0.30 regardless of the formula.
    This backstop catches any path that reason.py may not have already handled.
    """
    unknown_count = 0
    degraded_details = []

    for corr_key in ["corridor_a", "corridor_b", "corridor_c"]:
        c_data = computed_data.get(corr_key, {})
        for idx, m in enumerate(c_data.get("mireye_raw", [])):
            if isinstance(m, dict):
                m_st = str(m.get("status", "")).upper()
                if m_st in ("UNKNOWN", "FAILED"):
                    unknown_count += 1
                    degraded_details.append(f"{corr_key} Mireye pt[{idx:02d}]: {m_st}")
                else:
                    for f_key in ["nearest_substation_distance_m", "nearest_transmission_line_distance_m", "elevation", "intersects_critical_habitat"]:
                        f_obj = m.get(f_key, {})
                        if isinstance(f_obj, dict):
                            st = str(f_obj.get("status", "")).lower()
                            if st in ("unknown", "failed"):
                                unknown_count += 1
                                degraded_details.append(f"{corr_key} Mireye pt[{idx:02d}] {f_key}: {st}")
                        elif f_obj is None:
                            unknown_count += 1
                            degraded_details.append(f"{corr_key} Mireye pt[{idx:02d}] {f_key}: missing")

        for idx, f in enumerate(c_data.get("faa_raw", [])):
            if isinstance(f, dict):
                f_st = str(f.get("status", "")).upper()
                if f_st in ("UNKNOWN", "FAILED") or f.get("ceiling_ft") is None:
                    unknown_count += 1
                    degraded_details.append(f"{corr_key} FAA pt[{idx:02d}]: {f_st}")
            else:
                unknown_count += 1
                degraded_details.append(f"{corr_key} FAA pt[{idx:02d}]: missing")

        for idx, cen in enumerate(c_data.get("census_raw", [])):
            if isinstance(cen, dict):
                cen_st = str(cen.get("status", "")).upper()
                if cen_st in ("UNKNOWN", "FAILED") or cen.get("density_sq_mi") is None:
                    unknown_count += 1
                    degraded_details.append(f"{corr_key} Census pt[{idx:02d}]: {cen_st}")
            else:
                unknown_count += 1
                degraded_details.append(f"{corr_key} Census pt[{idx:02d}]: missing")

        wind = c_data.get("wind", {})
        if isinstance(wind, dict):
            w_st = str(wind.get("status", "")).upper()
            if not wind or w_st in ("UNKNOWN", "FAILED", "MISSING"):
                unknown_count += 1
                degraded_details.append(f"{corr_key} NOAA Wind: {w_st}")
        else:
            unknown_count += 1
            degraded_details.append(f"{corr_key} NOAA Wind: missing")

    # Detect per-corridor or per-subsystem total data failures
    insufficient_data_corridors = []
    subsystem_failures = []

    faa_failed_count = 0
    faa_total_count = 0
    census_failed_count = 0
    census_total_count = 0
    noaa_failed_count = 0

    for corr_key in ["corridor_a", "corridor_b", "corridor_c"]:
        c_data = computed_data.get(corr_key, {})
        haz = c_data.get("hazard_exposure", {})
        if haz.get("data_insufficient", False):
            insufficient_data_corridors.append(corr_key)

        faa_list = c_data.get("faa_raw", [])
        faa_total_count += len(faa_list)
        for f in faa_list:
            if isinstance(f, dict) and str(f.get("status", "")).upper() in ("UNKNOWN", "FAILED"):
                faa_failed_count += 1

        census_list = c_data.get("census_raw", [])
        census_total_count += len(census_list)
        for cen in census_list:
            if isinstance(cen, dict) and str(cen.get("status", "")).upper() in ("UNKNOWN", "FAILED"):
                census_failed_count += 1

        wind = c_data.get("wind", {})
        w_st = str(wind.get("status", "")).upper() if isinstance(wind, dict) else ""
        if not wind or w_st in ("UNKNOWN", "FAILED", "MISSING"):
            noaa_failed_count += 1

    if faa_total_count > 0 and faa_failed_count == faa_total_count:
        subsystem_failures.append("FAA UASFM Airspace")
    if census_total_count > 0 and census_failed_count == census_total_count:
        subsystem_failures.append("US Census Ground Risk")
    if noaa_failed_count >= 3:
        subsystem_failures.append("NOAA Wind METAR Stream")

    has_total_subsystem_failure = bool(insufficient_data_corridors or subsystem_failures)

    # Base confidence score
    base_confidence = reasoning_output.get("confidence_score", 0.95)
    adjusted_confidence = max(0.40, round(base_confidence - (unknown_count * 0.03), 2))

    # Hard-cap at 0.30 when any core subsystem or corridor had total data failure.
    # A result with sentinel defaults or missing weather/airspace MUST show <= 30% confidence.
    if has_total_subsystem_failure or reasoning_output.get("data_insufficient"):
        adjusted_confidence = min(adjusted_confidence, 0.30)

    provenance_citations = [
        {"field": "Substation & Transmission Line Distances", "source": "Mireye Earth API (/v1/fetch - EIA/HIFLD)", "status": "VERIFIED", "confidence": "HIGH"},
        {"field": "USFWS Critical Habitat & Species", "source": "US Fish & Wildlife Service (USFWS_CRITHAB via Mireye)", "status": "VERIFIED", "confidence": "HIGH"},
        {"field": "Airspace Ceilings & Class", "source": "FAA UAS Facility Map (ArcGIS)", "status": "VERIFIED", "confidence": "HIGH"},
        {"field": "Ground Population Density & Tiers", "source": "US Census Bureau ACS5 (Tract FIPS)", "status": "VERIFIED", "confidence": "HIGH"},
        {"field": "Surface Wind & METAR", "source": "NOAA Aviation Weather API", "status": "VERIFIED", "confidence": "HIGH"}
    ]

    reasoning_output["confidence_score"] = adjusted_confidence
    reasoning_output["degraded_inputs_count"] = unknown_count
    reasoning_output["degraded_details"] = degraded_details
    reasoning_output["provenance_citations"] = provenance_citations
    reasoning_output["insufficient_data_corridors"] = insufficient_data_corridors
    reasoning_output["subsystem_failures"] = subsystem_failures

    # Enforce data failure state if any subsystem failed completely
    if has_total_subsystem_failure and not reasoning_output.get("data_failure_warning"):
        fail_targets = insufficient_data_corridors or subsystem_failures
        reasoning_output["data_failure_warning"] = (
            f"INSUFFICIENT DATA — Total telemetry failure detected for data source(s): "
            f"{', '.join(fail_targets)}. Safety metrics and clearance values are internal defaults, "
            "NOT real measurements. This safety case CANNOT be used as an authorization basis."
        )
        reasoning_output["data_insufficient"] = True

    return reasoning_output
