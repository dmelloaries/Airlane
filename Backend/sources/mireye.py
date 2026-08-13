"""
Mireye Earth API Client (Infrastructure & Hazards).

Performs batched fetches to /v1/fetch with grid disk caching.
Parses Mireye's nested response schema: response["fields"][field_name] -> {value, source, confidence, unit, status}.
Preserves value, source, and confidence for every field to support citations and auditability.
"""

import os
import requests
from typing import Dict, Any, List, Tuple
from db import get_cached_response, set_cached_response, get_cached_grid_batch, set_cached_grid_batch

MIREYE_API_KEY = os.getenv("MIREYE_API_KEY") or os.getenv("MIREYE_API_TOKEN", "")
MIREYE_BASE_URL = os.getenv("MIREYE_BASE_URL", "https://api.mireye.com/v1")

FETCH_FIELDS = [
    "nearest_substation_distance_m",
    "nearest_substation_max_voltage_kv",
    "nearest_transmission_line_distance_m",
    "nearest_transmission_line_voltage_kv",
    "nearest_airport_distance_m",
    "fema_flood_zone",
    "elevation",
    "slope_degrees"
]


def make_grid_key(lat: float, lng: float) -> str:
    """Round coordinate to ~100m grid cell (0.001 deg resolution ~ 111m)."""
    return f"mireye_grid_{round(lat, 3)}_{round(lng, 3)}"


def extract_field_info(fields_dict: Dict[str, Any], field_name: str) -> Dict[str, Any]:
    """
    Extract value, source, confidence, unit, status, and notes for a field from Mireye's nested response.
    Mireye schema: fields[field_name] -> { "value": ..., "source": ..., "confidence": ..., "unit": ..., "status": ..., "notes": ... }
    Preserves exact value (including None) without filling placeholder defaults.
    """
    f_obj = fields_dict.get(field_name, {})
    if not isinstance(f_obj, dict):
        f_obj = {}

    return {
        "value": f_obj.get("value"),
        "source": f_obj.get("source", "Mireye Earth API"),
        "confidence": f_obj.get("confidence", "unknown"),
        "unit": f_obj.get("unit"),
        "notes": f_obj.get("notes"),
        "status": f_obj.get("status", "ok" if f_obj.get("value") is not None else "unknown")
    }


def normalize_mireye_item(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize raw Mireye point payload into structured object preserving value, source, and confidence per field.
    Reads response["fields"][field_name] nested structure.
    """
    fields_dict = data.get("fields", {}) if isinstance(data, dict) else {}

    sub_dist = extract_field_info(fields_dict, "nearest_substation_distance_m")
    sub_kv = extract_field_info(fields_dict, "nearest_substation_max_voltage_kv")
    trans_dist = extract_field_info(fields_dict, "nearest_transmission_line_distance_m")
    trans_kv = extract_field_info(fields_dict, "nearest_transmission_line_voltage_kv")
    airport_dist = extract_field_info(fields_dict, "nearest_airport_distance_m")
    flood_zone = extract_field_info(fields_dict, "fema_flood_zone")
    elevation = extract_field_info(fields_dict, "elevation")
    slope = extract_field_info(fields_dict, "slope_degrees")

    return {
        # Rich field objects containing value, source, and confidence for audit citations
        "nearest_substation_distance_m": sub_dist,
        "nearest_substation_max_voltage_kv": sub_kv,
        "nearest_transmission_line_distance_m": trans_dist,
        "nearest_transmission_line_voltage_kv": trans_kv,
        "nearest_airport_distance_m": airport_dist,
        "fema_flood_zone": flood_zone,
        "elevation": elevation,
        "slope_degrees": slope,
        # Conveniences for numeric calculations
        "lat": data.get("lat"),
        "lng": data.get("lng"),
        "source": "Mireye Earth API (/v1/fetch)",
        "status": "OK",
        "raw_response": data
    }


def get_field_val(mireye_item: Dict[str, Any], key: str, default: Any = None) -> Any:
    """Helper to safely extract numeric/string value from a normalized field dict."""
    field_obj = mireye_item.get(key)
    if isinstance(field_obj, dict) and "value" in field_obj:
        val = field_obj["value"]
        return val if val is not None else default
    elif field_obj is not None:
        return field_obj
    return default


def fetch_single_point_from_api(lat: float, lng: float, max_retries: int = 4) -> Dict[str, Any]:
    """
    Execute single HTTP POST to Mireye /v1/fetch for one (lat, lng) point.
    Retries automatically on 429 (rate limit) with backoff using the server's
    retry_after_s hint.  RAISES RuntimeError on non-200/non-429 responses.
    """
    import time as _time

    headers = {
        "Authorization": f"Bearer {MIREYE_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "lat": lat,
        "lng": lng,
        "fields": FETCH_FIELDS
    }

    for attempt in range(max_retries):
        resp = requests.post(
            f"{MIREYE_BASE_URL}/fetch", json=payload,
            headers=headers, timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            return normalize_mireye_item(data)

        if resp.status_code == 429:
            # Rate limited — parse server hint and sleep
            try:
                detail = resp.json().get("detail", {})
                retry_after = float(detail.get("retry_after_s", 3))
            except Exception:
                retry_after = 3.0
            wait = retry_after + 0.5 * (attempt + 1)   # progressive backoff
            _time.sleep(wait)
            continue

        # Any other HTTP error — raise immediately
        raise RuntimeError(
            f"Mireye API Error (HTTP {resp.status_code}): {resp.text}\n"
            f"Sent Payload: {payload}"
        )

    raise RuntimeError(
        f"Mireye API still rate-limited after {max_retries} retries for ({lat}, {lng})"
    )


def fetch_batch_points(points: List[Tuple[float, float]], max_workers: int = 4) -> List[Dict[str, Any]]:
    """
    Fetch Mireye hazard metrics for a list of (lat, lng) points.

    1. Checks disk cache (fetch_cache) first for ~100m grid cells.
    2. Sends individual /v1/fetch requests for cache misses via a
       ThreadPoolExecutor (reduced to 4 workers to avoid bursting
       past the 20 RPM Free-plan rate limit).
    3. Each request has built-in 429 retry with backoff — rate-limited
       calls automatically wait and succeed instead of crashing.
    4. Stores valid returned results into fetch_cache.
    5. Returns results in exact input order.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    if not points:
        return []

    grid_keys = [make_grid_key(lat, lng) for lat, lng in points]
    cached_map = get_cached_grid_batch(grid_keys)

    results = [None] * len(points)
    missing_tasks = []  # tuples of (index, lat, lng, grid_key)

    for idx, (lat, lng) in enumerate(points):
        g_key = grid_keys[idx]
        if g_key in cached_map:
            results[idx] = cached_map[g_key]
        else:
            missing_tasks.append((idx, lat, lng, g_key))

    if missing_tasks:
        newly_fetched_items = []
        errors = []

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_task = {
                executor.submit(fetch_single_point_from_api, lat, lng): (idx, lat, lng, g_key)
                for idx, lat, lng, g_key in missing_tasks
            }

            for future in as_completed(future_to_task):
                idx, lat, lng, g_key = future_to_task[future]
                try:
                    norm_item = future.result()
                    results[idx] = norm_item
                    newly_fetched_items.append((g_key, "mireye_fetch", norm_item))
                except Exception as exc:
                    errors.append(str(exc))

        if errors:
            raise RuntimeError(f"Failed to fetch {len(errors)} point(s) from Mireye API:\n" + "\n".join(errors))

        if newly_fetched_items:
            set_cached_grid_batch(newly_fetched_items)

    return results


def fetch_at_point(lat: float, lng: float) -> Dict[str, Any]:
    """Single point helper utilizing the batch grid cache pipeline."""
    res_list = fetch_batch_points([(lat, lng)])
    return res_list[0] if res_list else {}


def geocode_address(address: str) -> Dict[str, Any]:
    """
    Geocode a raw address string to (lat, lng) coordinates using Mireye /v1/geocode.
    Raises RuntimeError on non-200 responses.
    """
    clean_addr = address.strip().lower()
    cache_key = f"mireye_geocode_{clean_addr}"
    cached = get_cached_response(cache_key)
    if cached and cached.get("status") == "OK":
        return cached

    headers = {
        "Authorization": f"Bearer {MIREYE_API_KEY}",
        "Content-Type": "application/json"
    }

    resp = requests.post(
        f"{MIREYE_BASE_URL}/geocode",
        json={"address": address},
        headers=headers,
        timeout=10
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Mireye Geocode Error (HTTP {resp.status_code}): {resp.text}")

    data = resp.json()
    result = {
        "lat": float(data.get("lat", 0.0)),
        "lng": float(data.get("lng", 0.0)),
        "normalized_address": data.get("normalized_address", address),
        "source": "Mireye Earth API (/v1/geocode)",
        "status": "OK"
    }
    set_cached_response(cache_key, "mireye_geocode", result)
    return result
