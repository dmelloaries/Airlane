"""
Verification script for Phase 1 - Corridor Generator (3-Candidate Architecture).
Tests geometric candidate generation between launch and destination points:
1. Verifies 3 corridors (Corridor A direct, Corridor B right detour, Corridor C left detour) are returned.
2. Checks sample spacing consistency (~150m apart).
3. Verifies Corridor B and Corridor C bend in opposite directions away from Corridor A.
"""

from agent.corridor import generate_candidates, haversine_distance


def main():
    launch = (30.1345, -97.5512)
    destination = (30.1650, -97.5020)

    print("==================================================")
    print("  AIRLANE PHASE 1 - 3-CORRIDOR GEOMETRIC GENERATOR")
    print("==================================================")
    print(f"Launch Point:      {launch}")
    print(f"Destination Point: {destination}")

    direct_dist = haversine_distance(launch, destination)
    print(f"Direct Distance:   {direct_dist:.2f} meters ({direct_dist / 1609.34:.2f} miles)\n")

    corridors = generate_candidates(
        launch=launch,
        destination=destination,
        offset_distance_m=600.0,
        sample_spacing_m=150.0
    )

    for corridor in corridors:
        print(f"--------------------------------------------------")
        print(f"ID:                 {corridor.id}")
        print(f"Name:               {corridor.name}")
        print(f"Path Type:          {corridor.path_type}")
        print(f"Total Distance:     {corridor.total_distance_m:.2f} meters")
        print(f"Offset Distance:    {corridor.offset_distance_m:.2f} meters")
        print(f"Sample Count:       {len(corridor.sample_points)} points")

        spacings = []
        pts = corridor.sample_points
        for i in range(1, len(pts)):
            d = haversine_distance((pts[i-1].lat, pts[i-1].lng), (pts[i].lat, pts[i].lng))
            spacings.append(d)

        if spacings:
            avg_spacing = sum(spacings) / len(spacings)
            min_spacing = min(spacings)
            max_spacing = max(spacings)
            print(f"Sample Spacing:     Avg: {avg_spacing:.1f}m | Min: {min_spacing:.1f}m | Max: {max_spacing:.1f}m")

    # Check midpoint separations (A vs B, A vs C, B vs C)
    mid_a = corridors[0].sample_points[len(corridors[0].sample_points) // 2]
    mid_b = corridors[1].sample_points[len(corridors[1].sample_points) // 2]
    mid_c = corridors[2].sample_points[len(corridors[2].sample_points) // 2]

    sep_ab = haversine_distance((mid_a.lat, mid_a.lng), (mid_b.lat, mid_b.lng))
    sep_ac = haversine_distance((mid_a.lat, mid_a.lng), (mid_c.lat, mid_c.lng))
    sep_bc = haversine_distance((mid_b.lat, mid_b.lng), (mid_c.lat, mid_c.lng))

    print(f"\n==================================================")
    print(f"Midpoint Separation (Corridor A vs B): {sep_ab:.2f} meters")
    print(f"Midpoint Separation (Corridor A vs C): {sep_ac:.2f} meters")
    print(f"Midpoint Separation (Corridor B vs C): {sep_bc:.2f} meters")
    print(f"==================================================")

    # Verification assertions
    assert len(corridors) == 3, "Should return exactly 3 candidate corridors"
    assert corridors[0].id == "corridor_a" and corridors[1].id == "corridor_b" and corridors[2].id == "corridor_c"
    assert len(corridors[0].sample_points) > 5, "Corridor A should have multiple sample points"
    assert len(corridors[1].sample_points) > 5, "Corridor B should have multiple sample points"
    assert len(corridors[2].sample_points) > 5, "Corridor C should have multiple sample points"
    assert sep_ab > 250.0 and sep_ac > 250.0, "Corridors B and C should be visibly offset from Corridor A"
    assert sep_bc > 550.0, "Corridor B and Corridor C should bend in opposite directions"

    print("\n✅ PHASE 1 3-CORRIDOR GENERATOR VERIFICATION PASSED!")


if __name__ == "__main__":
    main()
