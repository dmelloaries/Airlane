"""
FAA Airspace Client (UAS Facility Maps & Airspace Ceilings).

Queries the FAA ArcGIS FeatureServer endpoint per sample point to determine
ceiling (ft AGL), airspace class, and grid ID for flight corridor coordinates.
Preserves official FAA disclaimers and supports parallel batch fetching with disk caching.
"""

import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Tuple
from db import get_cached_response, set_cached_response, get_cached_grid_batch, set_cached_grid_batch
from agent.corridor import haversine_distance
from sources.mireye import get_field_val

FAA_UAS_FEATURE_SERVER = (
    "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/"
    "FAA_UAS_FacilityMap_Data/FeatureServer/0/query"
)

DISCLAIMER = "map not updated in real time, not FAA authorization"


def make_faa_cache_key(lat: float, lng: float) -> str:
    """Round coordinate to 4 decimal places (~11m resolution) for FAA lookup caching."""
    return f"faa_{round(lat, 4)}_{round(lng, 4)}"


def fetch_ceiling(lat: float, lng: float) -> Dict[str, Any]:
    """
    Fetch FAA UAS Facility Map ceiling (ft AGL) and airspace attributes for a single point.
    Checks cache first, fetches from API if missing, and saves to cache if status is valid.
    """
    cache_key = make_faa_cache_key(lat, lng)
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    result = _fetch_ceiling_from_api(lat, lng)
    if result.get("status") not in ("UNKNOWN", "FAILED"):
        set_cached_response(cache_key, "faa_airspace", result)
    return result


def _fetch_ceiling_from_api(lat: float, lng: float) -> Dict[str, Any]:
    """Pure API fetch for FAA UAS Facility Map ceiling without DB write (thread-safe)."""
    params = {
        "geometry": f"{lng},{lat}",
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "f": "json"
    }

    print(f"  [FAA Fetch] Requesting point ({lat:.4f}, {lng:.4f})...")

    try:
        resp = requests.get(FAA_UAS_FEATURE_SERVER, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            features = data.get("features", [])
            if features:
                attributes = features[0].get("attributes", {})
                ceiling_raw = attributes.get("CEILING")
                try:
                    ceiling_ft = int(ceiling_raw) if ceiling_raw is not None else 400
                except (ValueError, TypeError):
                    ceiling_ft = 400

                airspace_cls = attributes.get("CLASS") or attributes.get("AIRSPACE_CLASS") or "Controlled Airspace"
                grid_id = attributes.get("GRID_ID") or attributes.get("OBJECTID") or "UASFM_GRID"
                airport_name = attributes.get("AIRPORT_NAME") or attributes.get("ARPORT_NAME") or ""

                note_str = f"{airspace_cls} ceiling {ceiling_ft}ft AGL"
                if airport_name:
                    note_str += f" ({airport_name})"

                return {
                    "ceiling_ft": ceiling_ft,
                    "source": "FAA UAS Facility Map (ArcGIS)",
                    "note": note_str,
                    "disclaimer": DISCLAIMER,
                    "airspace_class": airspace_cls,
                    "grid_id": str(grid_id),
                    "status": "OK"
                }
            else:
                # Open / uncontrolled airspace (zero results returned by ArcGIS)
                return {
                    "ceiling_ft": 400,
                    "source": "FAA UAS Facility Map (ArcGIS)",
                    "note": "uncontrolled/no restriction (Class G airspace)",
                    "disclaimer": DISCLAIMER,
                    "airspace_class": "Class G (Uncontrolled)",
                    "grid_id": "UNCONTROLLED",
                    "status": "OK"
                }
        else:
            print(f"  [FAA Warning] HTTP {resp.status_code} at ({lat:.4f}, {lng:.4f})")
    except requests.exceptions.Timeout:
        print(f"  [FAA Timeout] Timed out (10s) fetching point ({lat:.4f}, {lng:.4f})")
    except Exception as e:
        print(f"  [FAA Error] {e} at ({lat:.4f}, {lng:.4f})")

    return {
        "ceiling_ft": 400,
        "source": "FAA UAS Facility Map (ArcGIS)",
        "note": "FAA airspace check unavailable (fallback default)",
        "disclaimer": DISCLAIMER,
        "airspace_class": "UNKNOWN",
        "grid_id": "UNKNOWN",
        "status": "UNKNOWN"
    }


def fetch_batch_ceilings(points: List[Tuple[float, float]], max_workers: int = 5) -> List[Dict[str, Any]]:
    """
    Fetch FAA airspace ceiling metrics for a list of (lat, lng) points in parallel.
    Uses generalized batch cache retrieval to avoid 40 sequential DB lookups.
    Filters out UNKNOWN/FAILED status items from being cached.
    """
    if not points:
        return []

    results = [None] * len(points)
    keys = [make_faa_cache_key(lat, lng) for lat, lng in points]
    cached_map = get_cached_grid_batch(keys)

    missing_tasks = []
    for idx, (lat, lng) in enumerate(points):
        c_key = keys[idx]
        if c_key in cached_map:
            results[idx] = cached_map[c_key]
        else:
            missing_tasks.append((idx, lat, lng, c_key))

    if missing_tasks:
        newly_fetched = []
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_task = {
                executor.submit(_fetch_ceiling_from_api, lat, lng): (idx, c_key)
                for idx, lat, lng, c_key in missing_tasks
            }

            for future in as_completed(future_to_task):
                idx, c_key = future_to_task[future]
                try:
                    res = future.result()
                    results[idx] = res
                    if res.get("status") not in ("UNKNOWN", "FAILED"):
                        newly_fetched.append((c_key, "faa_airspace", res))
                except Exception as exc:
                    err_res = {
                        "ceiling_ft": 400,
                        "source": "FAA UAS Facility Map (ArcGIS)",
                        "note": f"Error: {exc}",
                        "disclaimer": DISCLAIMER,
                        "airspace_class": "UNKNOWN",
                        "grid_id": "UNKNOWN",
                        "status": "UNKNOWN"
                    }
                    results[idx] = err_res

        if newly_fetched:
            set_cached_grid_batch(newly_fetched)

    return results


def fetch_corridor_ceilings_downsampled(
    sample_points: List[Any],
    mireye_results: List[Dict[str, Any]],
    airport_threshold_m: float = 3000.0,
    max_workers: int = 5
) -> List[Dict[str, Any]]:
    """
    Fetch FAA airspace ceilings with corridor sampling optimization:
    - Base sampling: Every 2nd point along each corridor (indices 0, 2, 4, 6, ...).
    - Full-resolution exception: Any point within 3km (3000m) of a known airport
      (via Mireye's nearest_airport_distance_m) is explicitly sampled.
    - For skipped points, assigns the nearest sampled FAA result based on spatial distance.

    Returns:
        List[Dict[str, Any]]: FAA ceiling dicts for all sample points in exact order.
    """
    if not sample_points:
        return []

    # Extract (lat, lng) tuples
    coords = []
    for pt in sample_points:
        if hasattr(pt, "lat") and hasattr(pt, "lng"):
            coords.append((float(pt.lat), float(pt.lng)))
        elif isinstance(pt, (tuple, list)) and len(pt) >= 2:
            coords.append((float(pt[0]), float(pt[1])))
        elif isinstance(pt, dict):
            coords.append((float(pt.get("lat", 0.0)), float(pt.get("lng", 0.0))))
        else:
            raise ValueError(f"Invalid sample point element: {pt}")

    n_pts = len(coords)

    # Determine which indices to sample from FAA API/cache
    sampled_indices = []
    for idx in range(n_pts):
        is_every_2nd = (idx % 2 == 0)

        is_near_airport = False
        if mireye_results and idx < len(mireye_results):
            m_item = mireye_results[idx]
            airport_dist = get_field_val(m_item, "nearest_airport_distance_m", None)
            if airport_dist is not None:
                try:
                    is_near_airport = (float(airport_dist) <= airport_threshold_m)
                except (ValueError, TypeError):
                    is_near_airport = False

        if is_every_2nd or is_near_airport:
            sampled_indices.append(idx)

    if not sampled_indices:
        sampled_indices = [0]

    # Fetch FAA ceilings only for sampled coordinates
    sampled_coords = [coords[i] for i in sampled_indices]
    sampled_faa_results = fetch_batch_ceilings(sampled_coords, max_workers=max_workers)

    # Build index to result mapping
    sampled_map = {}
    for idx, res in zip(sampled_indices, sampled_faa_results):
        res_copy = dict(res)
        res_copy["sampled"] = True
        sampled_map[idx] = res_copy

    # Assign results to all corridor points (nearest sampled value for skipped points)
    final_results = [None] * n_pts
    for idx in range(n_pts):
        if idx in sampled_map:
            final_results[idx] = sampled_map[idx]
        else:
            cur_coord = coords[idx]
            best_idx = min(
                sampled_indices,
                key=lambda s_idx: (
                    haversine_distance(cur_coord, coords[s_idx]),
                    abs(idx - s_idx)
                )
            )
            nearest_res = dict(sampled_map[best_idx])
            nearest_res["sampled"] = False
            final_results[idx] = nearest_res

    return final_results
