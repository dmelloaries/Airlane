"""
Data Fetcher agent module.
Coordinates batch and parallel fetching across 4 sources (Mireye, FAA Airspace, Census Population, NOAA Wind)
for all sample points in candidate corridors.
"""

import asyncio
from typing import List, Dict, Any
from sources.mireye import fetch_batch_points as fetch_mireye_batch
from sources.faa_airspace import fetch_batch_ceilings as fetch_faa_batch
from sources.population import fetch_batch_population_density as fetch_census_batch
from sources.noaa_wind import fetch_wind as fetch_noaa
from agent.corridor import Corridor, SamplePoint


async def fetch_corridor_data(corridor: Corridor) -> Dict[str, Any]:
    """
    Fetch all environmental and airspace data for a single corridor's sample points.
    Uses batched calls for Mireye, FAA Airspace, and Census Population to leverage grid cache batch lookups.
    """
    points = corridor.sample_points

    # Midpoint coordinate for wind fetch
    mid_pt = points[len(points) // 2]
    loop = asyncio.get_event_loop()

    # Launch wind, Mireye batch, FAA batch, and Census batch tasks concurrently
    wind_task = loop.run_in_executor(None, fetch_noaa, mid_pt.lat, mid_pt.lng)

    coords = [(pt.lat, pt.lng) for pt in points]
    mireye_task = loop.run_in_executor(None, fetch_mireye_batch, coords)
    faa_task = loop.run_in_executor(None, fetch_faa_batch, coords)
    census_task = loop.run_in_executor(None, fetch_census_batch, coords)

    wind_data, mireye_results, faa_results, census_results = await asyncio.gather(
        wind_task,
        mireye_task,
        faa_task,
        census_task
    )

    return {
        "corridor": corridor,
        "wind": wind_data,
        "mireye_points": mireye_results,
        "faa_points": faa_results,
        "census_points": census_results
    }
