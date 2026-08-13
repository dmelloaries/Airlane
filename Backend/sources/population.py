"""
US Census API & Part 108 Ground Risk Tier Classifier.

Pipeline:
1. Geocode coordinate (lat, lng) -> Census Tract FIPS & Land Area (AREALAND)
2. Query Census ACS5 API (B01003_001E) for tract total population estimate
3. Compute exact density (people per sq mile = population / land_area_sq_mi)
4. Classify Part 108 ground risk tier against data/part108_tiers.json
"""

import os
import json
import time
import threading
from datetime import datetime
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Tuple
from pathlib import Path
from db import get_cached_response, set_cached_response, get_cached_grid_batch, set_cached_grid_batch
from agent.corridor import haversine_distance

CENSUS_API_KEY = os.getenv("CENSUS_API_KEY", "")
TIERS_FILE = Path(__file__).parent.parent / "data" / "part108_tiers.json"


def load_tier_rules() -> list:
    """Load Part 108 ground risk tier thresholds from part108_tiers.json."""
    if TIERS_FILE.exists():
        with open(TIERS_FILE, "r") as f:
            return json.load(f).get("tiers", [])
    return []


def classify_tier(density_sq_mi: float) -> Dict[str, Any]:
    """Map population density (people/sq mi) to Part 108 risk tier."""
    tiers = load_tier_rules()
    for t in tiers:
        if t["min_density_sq_mi"] <= density_sq_mi < t["max_density_sq_mi"]:
            return t
    return {
        "tier": "Tier 1",
        "name": "Sparsely Populated / Rural",
        "description": "Default rural classification"
    }


# In-memory tract population cache to avoid redundant ACS5 API calls for points in the same tract
_TRACT_POP_CACHE: Dict[str, float] = {}

# Thread-safe in-memory spatial geocode cache (~333m grid cells: 0.003 deg resolution)
_GEOCODE_SPATIAL_LOCK = threading.Lock()
_GEOCODE_SPATIAL_CACHE: Dict[str, Dict[str, Any]] = {}


def make_spatial_grid_key(lat: float, lng: float) -> str:
    """Round coordinate to ~333m grid cell (0.003 deg resolution) for geocoding spatial memoization."""
    grid_lat = round(lat / 0.003) * 0.003
    grid_lng = round(lng / 0.003) * 0.003
    return f"census_grid_{grid_lat:.4f}_{grid_lng:.4f}"


def geocode_census_tract(lat: float, lng: float, point_info: str = "") -> Dict[str, Any]:
    """
    Step 1: Standalone Census Geocoder lookup.
    Queries geocoding.geo.census.gov with (lng, lat) coordinates to extract Census Tract FIPS & Land Area.
    Features:
    - DB response cache check
    - Spatial memoization (~333m grid cell in-memory cache)
    - Explicit start/end timestamp & latency logging per call
    """
    prefix = f"{point_info}: " if point_info else ""

    # 1. DB Cache check
    cache_key = f"census_geo_{round(lat, 4)}_{round(lng, 4)}"
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    # 2. In-memory spatial memoization check (~333m grid cell)
    grid_key = make_spatial_grid_key(lat, lng)
    with _GEOCODE_SPATIAL_LOCK:
        if grid_key in _GEOCODE_SPATIAL_CACHE:
            print(
                f"  [Census Geocode SPATIAL REUSE] {prefix}({lat:.4f}, {lng:.4f}) -> "
                f"reused tract from grid cell {grid_key}",
                flush=True
            )
            return _GEOCODE_SPATIAL_CACHE[grid_key]

    # 3. Live Geocoder API call with explicit start/end timestamp & latency logging
    geo_url = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
    geo_params = {
        "x": lng,
        "y": lat,
        "benchmark": "Public_AR_Current",
        "vintage": "Current_Current",
        "format": "json"
    }

    t0 = time.time()
    start_ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"  [Census Geocode START] {prefix}Geocoding ({lat:.4f}, {lng:.4f}) at {start_ts}...", flush=True)

    try:
        resp = requests.get(geo_url, params=geo_params, timeout=10)
        t1 = time.time()
        end_ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        elapsed_ms = (t1 - t0) * 1000.0

        print(
            f"  [Census Geocode END]   {prefix}Geocoding ({lat:.4f}, {lng:.4f}) at {end_ts} "
            f"(took {elapsed_ms:.1f}ms | status={resp.status_code})",
            flush=True
        )

        if resp.status_code == 200:
            data = resp.json()
            geographies = data.get("result", {}).get("geographies", {})
            tracts = geographies.get("Census Tracts", [])
            if tracts:
                tract_data = tracts[0]
                state_fips = tract_data.get("STATE", "")
                county_fips = tract_data.get("COUNTY", "")
                tract_code = tract_data.get("TRACT", "")
                geoid = tract_data.get("GEOID", f"{state_fips}{county_fips}{tract_code}")
                arealand_sq_m = float(tract_data.get("AREALAND", 3884982))
                land_area_sq_mi = round(arealand_sq_m / 2589988.11, 4)

                result = {
                    "state_fips": state_fips,
                    "county_fips": county_fips,
                    "tract_code": tract_code,
                    "tract_fips": geoid,
                    "arealand_sq_m": arealand_sq_m,
                    "land_area_sq_mi": land_area_sq_mi,
                    "source": "US Census Geocoder API",
                    "status": "OK"
                }

                # Store in spatial in-memory cache
                with _GEOCODE_SPATIAL_LOCK:
                    _GEOCODE_SPATIAL_CACHE[grid_key] = result

                # Log DB write latency
                t_db0 = time.time()
                set_cached_response(cache_key, "census_geo", result)
                t_db1 = time.time()
                db_ms = (t_db1 - t_db0) * 1000.0
                print(f"  [Census DB Cache Write] {prefix}wrote census_geo cache in {db_ms:.1f}ms", flush=True)

                return result
        else:
            print(f"  [Census Warning] HTTP {resp.status_code} geocoding ({lat:.4f}, {lng:.4f})", flush=True)
    except requests.exceptions.Timeout:
        t1 = time.time()
        end_ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"  [Census Timeout] Timed out (10s) geocoding ({lat:.4f}, {lng:.4f}) at {end_ts}", flush=True)
    except Exception as e:
        t1 = time.time()
        end_ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"  [Census Geocoder Warning] {e} at ({lat:.4f}, {lng:.4f}) at {end_ts}", flush=True)

    return {
        "state_fips": "",
        "county_fips": "",
        "tract_code": "",
        "tract_fips": "UNKNOWN",
        "arealand_sq_m": 0,
        "land_area_sq_mi": 1.5,
        "source": "US Census Geocoder API",
        "status": "UNKNOWN"
    }


def fetch_population_density_and_tier(lat: float, lng: float, idx: int = 0, total: int = 0) -> Dict[str, Any]:
    """
    Full Phase 4 Pipeline:
    1. Geocode lat/lng coordinate -> Census Tract & Land Area
    2. Query Census ACS5 API for tract population estimate (B01003_001E)
    3. Compute exact population density (people / sq mile)
    4. Map density to Part 108 Tier
    """
    cache_key = f"census_full_{round(lat, 4)}_{round(lng, 4)}"
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    point_info = f"Point {idx+1}/{total}" if total > 0 else f"Point {idx+1}"

    # Step 1: Census Geocoder
    geo = geocode_census_tract(lat, lng, point_info=point_info)
    if geo["status"] != "OK" or not geo["tract_code"]:
        fallback_tier = classify_tier(250.0)
        return {
            "population": 500,
            "density_sq_mi": 250.0,
            "tier": fallback_tier["tier"],
            "tier_name": fallback_tier["name"],
            "tier_description": fallback_tier.get("description", ""),
            "tract_fips": "UNKNOWN",
            "source": "US Census Bureau (Fallback)",
            "status": "UNKNOWN"
        }

    # Step 2: Query Census ACS5 API (or check in-memory tract cache)
    state_fips = geo["state_fips"]
    county_fips = geo["county_fips"]
    tract_code = geo["tract_code"]
    tract_fips = geo["tract_fips"]
    land_area_sq_mi = geo["land_area_sq_mi"]

    # Check in-memory tract population cache
    if tract_fips in _TRACT_POP_CACHE:
        print(f"  [Census ACS5] Tract {tract_fips} already cached, skipping API call", flush=True)
        pop_estimate = _TRACT_POP_CACHE[tract_fips]
        density = pop_estimate / land_area_sq_mi if land_area_sq_mi > 0 else 500.0
        tier_info = classify_tier(density)
        result = {
            "population": int(pop_estimate),
            "density_sq_mi": round(density, 1),
            "land_area_sq_mi": land_area_sq_mi,
            "tier": tier_info["tier"],
            "tier_name": tier_info["name"],
            "tier_description": tier_info.get("description", ""),
            "tract_fips": tract_fips,
            "source": "US Census Bureau ACS5 (Cached Tract)",
            "status": "OK"
        }
        set_cached_response(cache_key, "census_full", result)
        return result

    print(f"  [Census ACS5] {point_info}: querying ACS5 for tract {tract_fips}...", flush=True)

    acs_url = "https://api.census.gov/data/2021/acs/acs5"
    acs_params = {
        "get": "B01003_001E",
        "for": f"tract:{tract_code}",
        "in": f"state:{state_fips} county:{county_fips}"
    }
    if CENSUS_API_KEY:
        acs_params["key"] = CENSUS_API_KEY

    try:
        resp = requests.get(acs_url, params=acs_params, timeout=10)
        if resp.status_code == 200:
            acs_json = resp.json()
            if len(acs_json) > 1:
                pop_estimate = float(acs_json[1][0])

                # Memoize tract population
                _TRACT_POP_CACHE[tract_fips] = pop_estimate

                density = pop_estimate / land_area_sq_mi if land_area_sq_mi > 0 else 500.0
                tier_info = classify_tier(density)

                result = {
                    "population": int(pop_estimate),
                    "density_sq_mi": round(density, 1),
                    "land_area_sq_mi": land_area_sq_mi,
                    "tier": tier_info["tier"],
                    "tier_name": tier_info["name"],
                    "tier_description": tier_info.get("description", ""),
                    "tract_fips": tract_fips,
                    "source": "US Census Bureau ACS5 (2021)",
                    "status": "OK"
                }
                set_cached_response(cache_key, "census_full", result)
                return result
        else:
            print(f"  [Census Warning] HTTP {resp.status_code} querying ACS5 for tract {tract_fips}", flush=True)
    except requests.exceptions.Timeout:
        print(f"  [Census Timeout] Timed out (10s) querying ACS5 for tract {tract_fips}", flush=True)
    except Exception as e:
        print(f"  [Census ACS5 Warning] {e} at ({lat:.4f}, {lng:.4f})", flush=True)

    fallback_tier = classify_tier(350.0)
    return {
        "population": 700,
        "density_sq_mi": 350.0,
        "tier": fallback_tier["tier"],
        "tier_name": fallback_tier["name"],
        "tier_description": fallback_tier.get("description", ""),
        "tract_fips": geo["tract_fips"],
        "source": "US Census Bureau (Estimated)",
        "status": "UNKNOWN"
    }


def fetch_batch_population_density(points: List[Tuple[float, float]], max_workers: int = 10) -> List[Dict[str, Any]]:
    """
    Fetch population density and Part 108 tiers for a list of (lat, lng) points in parallel.
    Uses generalized batch cache retrieval to avoid 40 sequential DB lookups.
    """
    if not points:
        return []

    results = [None] * len(points)
    keys = [f"census_full_{round(lat, 4)}_{round(lng, 4)}" for lat, lng in points]
    cached_map = get_cached_grid_batch(keys)

    missing_tasks = []
    for idx, (lat, lng) in enumerate(points):
        c_key = keys[idx]
        if c_key in cached_map:
            results[idx] = cached_map[c_key]
        else:
            missing_tasks.append((idx, lat, lng))

    if missing_tasks:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_task = {
                executor.submit(fetch_population_density_and_tier, lat, lng, idx, len(points)): idx
                for idx, lat, lng in missing_tasks
            }

            for future in as_completed(future_to_task):
                idx = future_to_task[future]
                try:
                    results[idx] = future.result()
                except Exception as exc:
                    results[idx] = {
                        "population": 0,
                        "density_sq_mi": 0.0,
                        "tier": "Tier 1",
                        "tier_name": "Rural",
                        "tier_description": f"Error: {exc}",
                        "tract_fips": "UNKNOWN",
                        "source": "US Census Bureau",
                        "status": "UNKNOWN"
                    }

    return results


def fetch_corridor_census_downsampled(
    sample_points: List[Any],
    max_workers: int = 10
) -> List[Dict[str, Any]]:
    """
    Fetch Census population density and Part 108 tiers with corridor sampling optimization:
    - Base sampling: Every 4th point along each corridor (indices 0, 4, 8, 12, ...).
    - For skipped points, assigns the nearest sampled Census result based on spatial distance.

    Returns:
        List[Dict[str, Any]]: Census tier dicts for all sample points in exact order.
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

    # Every 4th point sampling (indices 0, 4, 8, 12, ...)
    sampled_indices = [idx for idx in range(n_pts) if idx % 4 == 0]
    if not sampled_indices:
        sampled_indices = [0]

    sampled_coords = [coords[i] for i in sampled_indices]
    sampled_census_results = fetch_batch_population_density(sampled_coords, max_workers=max_workers)

    sampled_map = {}
    for idx, res in zip(sampled_indices, sampled_census_results):
        res_copy = dict(res)
        res_copy["sampled"] = True
        sampled_map[idx] = res_copy

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
