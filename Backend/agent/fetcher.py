"""
Data Fetcher agent module.
Coordinates batch and parallel fetching across 4 sources (Mireye, FAA Airspace, Census Population, NOAA Wind)
for all sample points in candidate corridors.
"""

import asyncio
from typing import List, Dict, Any
from sources.mireye import fetch_batch_points as fetch_mireye_batch
from sources.faa_airspace import fetch_ceiling as fetch_faa
from sources.population import fetch_population_density_and_tier as fetch_census
from sources.noaa_wind import fetch_wind as fetch_noaa
from agent.corridor import Corridor, SamplePoint


async def fetch_corridor_data(corridor: Corridor) -> Dict[str, Any]:
    """
    Fetch all environmental and airspace data for a single corridor's sample points.
    Uses ONE batched call to Mireye /v1/fetch with grid disk caching.
    """
    points = corridor.sample_points

    # Midpoint coordinate for wind fetch
    mid_pt = points[len(points) // 2]
    wind_data = fetch_noaa(mid_pt.lat, mid_pt.lng)

    loop = asyncio.get_event_loop()

    # Mireye batch fetch for all sample points in corridor (1 HTTP request or 0 if cached)
    coords = [(pt.lat, pt.lng) for pt in points]
    mireye_results = await loop.run_in_executor(None, fetch_mireye_batch, coords)

    # FAA & Census parallel fetch per sample point
    faa_tasks = [loop.run_in_executor(None, fetch_faa, pt.lat, pt.lng) for pt in points]
    census_tasks = [loop.run_in_executor(None, fetch_census, pt.lat, pt.lng) for pt in points]

    faa_results = await asyncio.gather(*faa_tasks)
    census_results = await asyncio.gather(*census_tasks)

    return {
        "corridor": corridor,
        "wind": wind_data,
        "mireye_points": mireye_results,
        "faa_points": faa_results,
        "census_points": census_results
    }
