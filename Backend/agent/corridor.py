"""
Corridor Generator module for BVLOS Drone Route Planning.

Generates candidate flight corridors between launch and destination coordinates:
- Corridor A: Direct great-circle path sampled every ~400m.
- Corridor B: Curved path offset at the midpoint using a quadratic Bezier curve,
  sampled every ~400m to create a genuinely distinct route.
"""

import math
from dataclasses import dataclass, asdict
from typing import List, Tuple, Dict, Any, Union

# Earth radius in meters
EARTH_RADIUS_M = 6371000.0


@dataclass
class SamplePoint:
    index: int
    lat: float
    lng: float
    distance_from_start_m: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Corridor:
    id: str
    name: str
    path_type: str  # "direct" or "offset"
    total_distance_m: float
    sample_points: List[SamplePoint]
    offset_distance_m: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "path_type": self.path_type,
            "total_distance_m": round(self.total_distance_m, 2),
            "offset_distance_m": round(self.offset_distance_m, 2),
            "sample_count": len(self.sample_points),
            "sample_points": [p.to_dict() for p in self.sample_points]
        }


def haversine_distance(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    """
    Calculate the great-circle distance between two (lat, lng) points in meters using Haversine formula.
    """
    lat1, lng1 = p1
    lat2, lng2 = p2

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return EARTH_RADIUS_M * c


def intermediate_point(p1: Tuple[float, float], p2: Tuple[float, float], fraction: float) -> Tuple[float, float]:
    """
    Calculate intermediate point on great circle path at given fraction f (0 <= f <= 1).
    Uses spherical interpolation (slerp).
    """
    if fraction <= 0.0:
        return p1
    if fraction >= 1.0:
        return p2

    lat1, lng1 = math.radians(p1[0]), math.radians(p1[1])
    lat2, lng2 = math.radians(p2[0]), math.radians(p2[1])

    delta = haversine_distance(p1, p2) / EARTH_RADIUS_M

    if delta < 1e-9:
        return p1

    sin_delta = math.sin(delta)
    a = math.sin((1.0 - fraction) * delta) / sin_delta
    b = math.sin(fraction * delta) / sin_delta

    x = a * math.cos(lat1) * math.cos(lng1) + b * math.cos(lat2) * math.cos(lng2)
    y = a * math.cos(lat1) * math.sin(lng1) + b * math.cos(lat2) * math.sin(lng2)
    z = a * math.sin(lat1) + b * math.sin(lat2)

    lat_i = math.atan2(z, math.sqrt(x * x + y * y))
    lng_i = math.atan2(y, x)

    return (math.degrees(lat_i), math.degrees(lng_i))


def interpolate_direct_path(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    sample_spacing_m: float = 400.0
) -> Tuple[List[SamplePoint], float]:
    """
    Generate sample points along a direct great-circle path from p1 to p2.
    """
    total_dist = haversine_distance(p1, p2)
    if total_dist <= 0:
        point = SamplePoint(index=0, lat=p1[0], lng=p1[1], distance_from_start_m=0.0)
        return [point], 0.0

    num_samples = max(1, int(round(total_dist / sample_spacing_m)))
    sample_points = []

    for i in range(num_samples + 1):
        f = i / float(num_samples)
        lat, lng = intermediate_point(p1, p2, f)
        dist_m = f * total_dist
        sample_points.append(
            SamplePoint(
                index=i,
                lat=round(lat, 6),
                lng=round(lng, 6),
                distance_from_start_m=round(dist_m, 2)
            )
        )

    return sample_points, total_dist


def compute_bezier_control_point(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    offset_distance_m: float = 600.0,
    offset_direction: int = 1
) -> Tuple[float, float]:
    """
    Compute a Bezier control point offset perpendicular to the midpoint of p1 -> p2.
    offset_direction: +1 for right/outward bend, -1 for left bend.
    """
    mid_lat = (p1[0] + p2[0]) / 2.0
    mid_lng = (p1[1] + p2[1]) / 2.0

    # Vector from p1 to p2 in meters approximation
    lat_deg_to_m = 111139.0
    lng_deg_to_m = 111139.0 * math.cos(math.radians(mid_lat))

    d_lat_m = (p2[0] - p1[0]) * lat_deg_to_m
    d_lng_m = (p2[1] - p1[1]) * lng_deg_to_m

    vector_len = math.sqrt(d_lat_m ** 2 + d_lng_m ** 2)
    if vector_len < 1e-6:
        return (mid_lat, mid_lng)

    # Perpendicular unit vector (-d_lng_m, d_lat_m)
    perp_lat_unit = (-d_lng_m / vector_len) * offset_direction
    perp_lng_unit = (d_lat_m / vector_len) * offset_direction

    # Apply offset distance in meters to control point
    control_lat = mid_lat + (perp_lat_unit * offset_distance_m) / lat_deg_to_m
    control_lng = mid_lng + (perp_lng_unit * offset_distance_m) / lng_deg_to_m

    return (control_lat, control_lng)


def evaluate_quadratic_bezier(
    p0: Tuple[float, float],
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    t: float
) -> Tuple[float, float]:
    """
    Evaluate quadratic Bezier curve B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
    """
    one_minus_t = 1.0 - t
    lat = (one_minus_t ** 2) * p0[0] + 2.0 * one_minus_t * t * p1[0] + (t ** 2) * p2[0]
    lng = (one_minus_t ** 2) * p0[1] + 2.0 * one_minus_t * t * p1[1] + (t ** 2) * p2[1]
    return (lat, lng)


def interpolate_offset_path(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    offset_distance_m: float = 600.0,
    sample_spacing_m: float = 400.0,
    offset_direction: int = 1
) -> Tuple[List[SamplePoint], float]:
    """
    Generate sample points along a curved Bezier detour route offset outward at the midpoint.
    Points are resampled to maintain consistent ~400m spacing.
    """
    control_p = compute_bezier_control_point(p1, p2, offset_distance_m, offset_direction)

    # High-resolution sampling to compute arc length and resample evenly
    fine_steps = 300
    fine_points = [evaluate_quadratic_bezier(p1, control_p, p2, k / float(fine_steps)) for k in range(fine_steps + 1)]

    # Calculate cumulative distance along curve
    cum_distances = [0.0]
    for k in range(1, len(fine_points)):
        step_dist = haversine_distance(fine_points[k - 1], fine_points[k])
        cum_distances.append(cum_distances[-1] + step_dist)

    total_dist = cum_distances[-1]
    if total_dist <= 0:
        point = SamplePoint(index=0, lat=p1[0], lng=p1[1], distance_from_start_m=0.0)
        return [point], 0.0

    num_samples = max(1, int(round(total_dist / sample_spacing_m)))

    sample_points = []
    fine_idx = 0

    for i in range(num_samples + 1):
        target_dist = (i / float(num_samples)) * total_dist

        # Find position along fine_points matching target_dist
        while fine_idx < len(cum_distances) - 1 and cum_distances[fine_idx + 1] < target_dist:
            fine_idx += 1

        if fine_idx >= len(cum_distances) - 1:
            lat, lng = fine_points[-1]
        else:
            d0, d1 = cum_distances[fine_idx], cum_distances[fine_idx + 1]
            seg_len = d1 - d0
            frac = (target_dist - d0) / seg_len if seg_len > 1e-6 else 0.0
            p_a, p_b = fine_points[fine_idx], fine_points[fine_idx + 1]
            lat = p_a[0] + frac * (p_b[0] - p_a[0])
            lng = p_a[1] + frac * (p_b[1] - p_a[1])

        sample_points.append(
            SamplePoint(
                index=i,
                lat=round(lat, 6),
                lng=round(lng, 6),
                distance_from_start_m=round(target_dist, 2)
            )
        )

    return sample_points, total_dist


def parse_coordinate(coord: Union[Tuple[float, float], Dict[str, float], List[float]]) -> Tuple[float, float]:
    """Helper to parse flexible coordinate inputs into (lat, lng) tuple."""
    if isinstance(coord, (tuple, list)) and len(coord) >= 2:
        return (float(coord[0]), float(coord[1]))
    elif isinstance(coord, dict):
        lat = coord.get("lat") or coord.get("latitude")
        lng = coord.get("lng") or coord.get("longitude") or coord.get("lon")
        if lat is not None and lng is not None:
            return (float(lat), float(lng))
    raise ValueError(f"Invalid coordinate format: {coord}. Expected (lat, lng) tuple or dict with 'lat' and 'lng'.")


def generate_candidates(
    launch: Union[Tuple[float, float], Dict[str, float], List[float]],
    destination: Union[Tuple[float, float], Dict[str, float], List[float]],
    offset_distance_m: float = 600.0,
    sample_spacing_m: float = 400.0
) -> List[Corridor]:
    """
    Generate 3 geometric candidate flight corridors between launch and destination:
    - Corridor A: Straight-line great-circle path
    - Corridor B: Curved detour bend outward to the right (+1 offset direction)
    - Corridor C: Curved detour bend outward to the left (-1 offset direction)

    These are pure geometric paths — no Mireye calls are needed to generate them.

    Returns:
        List[Corridor]: [Corridor A (Direct), Corridor B (Right Detour), Corridor C (Left Detour)]
    """
    p1 = parse_coordinate(launch)
    p2 = parse_coordinate(destination)

    # Corridor A: Direct Great-Circle Path
    points_a, dist_a = interpolate_direct_path(p1, p2, sample_spacing_m=sample_spacing_m)
    corridor_a = Corridor(
        id="corridor_a",
        name="Corridor A (Direct Path)",
        path_type="direct",
        total_distance_m=dist_a,
        sample_points=points_a,
        offset_distance_m=0.0
    )

    # Corridor B: Right Detour Path (+1 offset direction)
    points_b, dist_b = interpolate_offset_path(
        p1, p2,
        offset_distance_m=offset_distance_m,
        sample_spacing_m=sample_spacing_m,
        offset_direction=1
    )
    corridor_b = Corridor(
        id="corridor_b",
        name="Corridor B (Right Detour)",
        path_type="offset",
        total_distance_m=dist_b,
        sample_points=points_b,
        offset_distance_m=offset_distance_m
    )

    # Corridor C: Left Detour Path (-1 offset direction)
    points_c, dist_c = interpolate_offset_path(
        p1, p2,
        offset_distance_m=offset_distance_m,
        sample_spacing_m=sample_spacing_m,
        offset_direction=-1
    )
    corridor_c = Corridor(
        id="corridor_c",
        name="Corridor C (Left Detour)",
        path_type="offset",
        total_distance_m=dist_c,
        sample_points=points_c,
        offset_distance_m=-offset_distance_m
    )

    return [corridor_a, corridor_b, corridor_c]
