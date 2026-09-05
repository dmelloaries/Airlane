import { CURATED_PRESET_PLACES } from "../services/api";

export const MAX_FLIGHT_DISTANCE_KM = 5.0;

/**
 * Calculates Great-Circle distance in kilometers between two GPS coordinate pairs using Haversine formula.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371.0088; // Earth mean radius in kilometers
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) *
      Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return R * c;
}

/**
 * Parses user input strings for direct "lat, lng" coordinate notation.
 * e.g. "37.4172, -122.1084" or "(37.4172, -122.1084)"
 */
export function parseCoordinateString(
  input: string
): { lat: number; lng: number } | null {
  if (!input || !input.trim()) return null;
  const match = input.match(
    /^\s*\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?\s*$/
  );
  if (!match) return null;

  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);

  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

/**
 * Attempts to extract or look up coordinates from a given address or place text.
 */
export function resolveCoordinates(
  text: string
): { lat: number; lng: number } | null {
  if (!text || !text.trim()) return null;

  // 1. Direct coordinate format
  const parsed = parseCoordinateString(text);
  if (parsed) return parsed;

  // 2. Curated preset search
  const clean = text.trim().toLowerCase();
  const matched = CURATED_PRESET_PLACES.find(
    (p) =>
      p.label.toLowerCase() === clean ||
      clean.includes(p.label.toLowerCase()) ||
      (p.secondary && p.secondary.toLowerCase().includes(clean))
  );

  if (matched) {
    return { lat: matched.lat, lng: matched.lng };
  }

  return null;
}
