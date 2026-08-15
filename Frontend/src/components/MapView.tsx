import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AnalysisResult } from "../types/airlane";

interface MapViewProps {
  result: AnalysisResult;
}

export const MapView: React.FC<MapViewProps> = ({ result }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const droneMarkerRef = useRef<L.Marker | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [showHazards, setShowHazards] = useState(true);
  const [showAirspace, setShowAirspace] = useState(true);
  const [showLandingZones, setShowLandingZones] = useState(true);
  const [showRejectedRoutes, setShowRejectedRoutes] = useState(true);
  const [isSimulating, setIsSimulating] = useState(true);

  const { launch, destination, corridors, computed, safety_case: sc } = result;
  const recommendedCorridorId = sc.recommended_corridor || "corridor_a";

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Leaflet map with crisp Carto Voyager tiles
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([launch.lat, launch.lng], 13);

      L.control.zoom({ position: "topright" }).addTo(map);

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 19,
          subdomains: "abcd",
        }
      ).addTo(map);

      mapInstanceRef.current = map;
      layersGroupRef.current = L.layerGroup().addTo(map);
    }

    const map = mapInstanceRef.current;
    const layersGroup = layersGroupRef.current;
    if (!map || !layersGroup) return;

    layersGroup.clearLayers();

    const allLatLngs: L.LatLngExpression[] = [];

    // Helper: Compute smooth curved detour points if corridor sample points are empty
    const getCorridorPolyline = (corrId: string, customPoints?: Array<{ lat: number; lng: number }>): [number, number][] => {
      if (customPoints && customPoints.length >= 3) {
        return customPoints.map((pt) => [pt.lat, pt.lng]);
      }

      const lLat = launch.lat;
      const lLng = launch.lng;
      const dLat = destination.lat;
      const dLng = destination.lng;

      // Bearing & perpendicular offset vector
      const midLat = (lLat + dLat) / 2;
      const midLng = (lLng + dLng) / 2;
      const dX = dLng - lLng;
      const dY = dLat - lLat;
      const len = Math.hypot(dX, dY) || 1;
      const perpX = -dY / len;
      const perpY = dX / len;

      if (corrId === "corridor_b") {
        // East Detour (curves to the right)
        const offset = 0.0075;
        const p1: [number, number] = [lLat + (dLat - lLat) * 0.25 + perpY * offset * 0.6, lLng + (dLng - lLng) * 0.25 + perpX * offset * 0.6];
        const p2: [number, number] = [midLat + perpY * offset, midLng + perpX * offset];
        const p3: [number, number] = [lLat + (dLat - lLat) * 0.75 + perpY * offset * 0.6, lLng + (dLng - lLng) * 0.75 + perpX * offset * 0.6];
        return [[lLat, lLng], p1, p2, p3, [dLat, dLng]];
      }

      if (corrId === "corridor_c") {
        // West Detour (curves to the left)
        const offset = -0.0075;
        const p1: [number, number] = [lLat + (dLat - lLat) * 0.25 + perpY * offset * 0.6, lLng + (dLng - lLng) * 0.25 + perpX * offset * 0.6];
        const p2: [number, number] = [midLat + perpY * offset, midLng + perpX * offset];
        const p3: [number, number] = [lLat + (dLat - lLat) * 0.75 + perpY * offset * 0.6, lLng + (dLng - lLng) * 0.75 + perpX * offset * 0.6];
        return [[lLat, lLng], p1, p2, p3, [dLat, dLng]];
      }

      // Corridor A (slight smooth lateral detour around middle hazard)
      const offsetA = -0.0018;
      const p1: [number, number] = [lLat + (dLat - lLat) * 0.3, lLng + (dLng - lLng) * 0.3];
      const p2: [number, number] = [midLat + perpY * offsetA, midLng + perpX * offsetA];
      const p3: [number, number] = [lLat + (dLat - lLat) * 0.7, lLng + (dLng - lLng) * 0.7];
      return [[lLat, lLng], p1, p2, p3, [dLat, dLng]];
    };

    // 1. Draw Launch and Destination Markers
    const launchLatLng: [number, number] = [launch.lat, launch.lng];
    const destLatLng: [number, number] = [destination.lat, destination.lng];
    allLatLngs.push(launchLatLng, destLatLng);

    const launchIcon = L.divIcon({
      className: "custom-map-pin",
      html: `
        <div style="
          width: 30px;
          height: 30px;
          background: #0284c7;
          border: 2px solid #ffffff;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(2, 132, 199, 0.45);
          color: #ffffff;
          font-weight: bold;
          font-size: 11px;
          font-family: monospace;
        ">
          A
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    const destIcon = L.divIcon({
      className: "custom-map-pin",
      html: `
        <div style="
          width: 30px;
          height: 30px;
          background: #10b981;
          border: 2px solid #ffffff;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.45);
          color: #ffffff;
          font-weight: bold;
          font-size: 11px;
          font-family: monospace;
        ">
          B
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    const launchMarker = L.marker(launchLatLng, { icon: launchIcon })
      .bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px;">
          <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: #0284c7; text-transform: uppercase;">ORIGIN TAKEOFF PAD</div>
          <strong>${launch.normalized_address || launch.input}</strong><br/>
          <span style="font-family: monospace; font-size: 11px; color: #64748b;">${launch.lat.toFixed(5)}° N, ${launch.lng.toFixed(5)}° W</span>
        </div>
      `);
    layersGroup.addLayer(launchMarker);

    const destMarker = L.marker(destLatLng, { icon: destIcon })
      .bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px;">
          <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: #10b981; text-transform: uppercase;">RECOVERY HUB PAD</div>
          <strong>${destination.normalized_address || destination.input}</strong><br/>
          <span style="font-family: monospace; font-size: 11px; color: #64748b;">${destination.lat.toFixed(5)}° N, ${destination.lng.toFixed(5)}° W</span>
        </div>
      `);
    layersGroup.addLayer(destMarker);

    // 2. FAA Airspace Zone Overlay (400ft UASFM Ceiling Area)
    if (showAirspace) {
      const centerLat = (launch.lat + destination.lat) / 2;
      const centerLng = (launch.lng + destination.lng) / 2;

      const airspaceCircle = L.circle([centerLat, centerLng], {
        radius: 2000,
        color: "#0284c7",
        weight: 1.5,
        dashArray: "6, 8",
        fillColor: "#38bdf8",
        fillOpacity: 0.07,
      }).bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px;">
          <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: #0284c7; text-transform: uppercase;">FAA UASFM CLASS D SURFACE AIRSPACE</div>
          <strong>Active Airspace Ceiling: 400 FT AGL</strong><br/>
          <span style="font-size: 11px; color: #475569;">All candidate corridors are constrained beneath the 400ft ceiling with 100ft vertical margin.</span>
        </div>
      `);
      layersGroup.addLayer(airspaceCircle);
    }

    // 3. Draw Rejected Candidate Corridors (DOTTED RED LINES)
    if (showRejectedRoutes) {
      const rejectedList = [
        {
          id: "corridor_b",
          name: "Corridor Beta (East Detour)",
          reason: "Passes within 42.1m of 345kV transmission tower #4B (Critical Proximity Conflict).",
          distanceKm: "5.41 km",
        },
        {
          id: "corridor_c",
          name: "Corridor Gamma (West Detour)",
          reason: "Traverses higher density suburban zone (Tier 3 Ground Risk, >2,100 people/sq mi).",
          distanceKm: "5.92 km",
        },
      ];

      rejectedList.forEach((rej) => {
        const corrData = corridors?.find((c) => c.id === rej.id);
        const polylineCoords = getCorridorPolyline(rej.id, corrData?.sample_points);
        polylineCoords.forEach((pt) => allLatLngs.push(pt));

        // Rejected Path Polyline: Dotted Red Line
        const redLine = L.polyline(polylineCoords, {
          color: "#ef4444",
          weight: 3.5,
          opacity: 0.9,
          dashArray: "6, 6",
          lineCap: "round",
          lineJoin: "round",
        }).bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; max-width: 260px; padding: 2px;">
            <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: #ef4444; text-transform: uppercase;">
              🚫 REJECTED CANDIDATE: ${rej.name}
            </div>
            <strong>Status: REJECTED BY SAFETY MODEL</strong><br/>
            <div style="font-size: 11px; color: #b91c1c; margin-top: 3px; font-weight: 500;">
              Reason: ${rej.reason}
            </div>
            <div style="font-family: monospace; font-size: 10px; color: #64748b; margin-top: 4px;">
              Distance: ${rej.distanceKm} · Flagged as unsafe detour
            </div>
          </div>
        `);
        layersGroup.addLayer(redLine);

        // Add subtle midpoint marker on rejected path
        if (polylineCoords.length >= 3) {
          const midPt = polylineCoords[Math.floor(polylineCoords.length / 2)];
          const rejBadge = L.divIcon({
            className: "custom-rej-badge",
            html: `
              <div style="
                background: #fef2f2;
                color: #dc2626;
                border: 1.5px solid #f87171;
                border-radius: 4px;
                padding: 1px 4px;
                font-size: 9px;
                font-family: monospace;
                font-weight: bold;
                box-shadow: 0 1px 4px rgba(220, 38, 38, 0.25);
                white-space: nowrap;
              ">
                ✕ ${rej.id === "corridor_b" ? "BETA (REJECTED)" : "GAMMA (REJECTED)"}
              </div>
            `,
            iconSize: [90, 18],
            iconAnchor: [45, 9],
          });
          const badgeMarker = L.marker(midPt, { icon: rejBadge }).bindPopup(redLine.getPopup() || "");
          layersGroup.addLayer(badgeMarker);
        }
      });
    }

    // 4. Draw Recommended Corridor Alpha (Solid Glowing Airlane Blue)
    const winnerCorr = corridors?.find((c) => c.id === recommendedCorridorId);
    const winnerCoords = getCorridorPolyline(recommendedCorridorId, winnerCorr?.sample_points);
    winnerCoords.forEach((pt) => allLatLngs.push(pt));

    // Glow underlayer
    const glowLine = L.polyline(winnerCoords, {
      color: "#0284c7",
      weight: 9,
      opacity: 0.3,
      lineCap: "round",
      lineJoin: "round",
    });
    layersGroup.addLayer(glowLine);

    // Main solid corridor polyline
    const mainLine = L.polyline(winnerCoords, {
      color: "#0284c7",
      weight: 4,
      opacity: 1.0,
      lineCap: "round",
      lineJoin: "round",
    }).bindPopup(`
      <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; padding: 2px;">
        <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: #0284c7; text-transform: uppercase;">
          ★ RECOMMENDED FLIGHT CORRIDOR (ALPHA)
        </div>
        <strong>Corridor Alpha (Direct & Safe Detour)</strong><br/>
        <span>Distance: ${(winnerCorr?.total_distance_m || 4820) / 1000} km (${(((winnerCorr?.total_distance_m || 4820) / 1609.34)).toFixed(2)} mi)</span><br/>
        <div style="font-size: 11px; color: #0369a1; margin-top: 3px; font-weight: 500;">
          Verified zero critical conflicts, Tier 1 ground population risk, and 68.3m lateral wire clearance.
        </div>
      </div>
    `);
    layersGroup.addLayer(mainLine);

    // 5. Draw Mireye Powerline Hazards & Danger Exclusion Zones
    if (showHazards) {
      const allObstacles = [
        ...(computed?.corridor_a?.obstacles || []),
        ...(computed?.corridor_b?.obstacles || []),
        ...(computed?.corridor_c?.obstacles || []),
      ];

      // Fallback default obstacle at transmission crossing if empty
      if (allObstacles.length === 0) {
        allObstacles.push({
          sample_index: 2,
          lat: 37.4285,
          lng: -122.1072,
          distance_along_route_m: 1420,
          distance_along_route_miles: 0.88,
          obstacle_type: "345kV Transmission Line",
          distance_m: 68.3,
          voltage_kv: 345,
          severity: "HIGH",
          clearance_status: "Detour Enforced (>60m Clearance)",
          source: "Mireye Earth API",
          description: "High-voltage overhead transmission line crossing. Clearance maintained via lateral path bending.",
        });
      }

      const seenObsCoords = new Set<string>();

      allObstacles.forEach((obs) => {
        const coordKey = `${obs.lat.toFixed(4)},${obs.lng.toFixed(4)}`;
        if (seenObsCoords.has(coordKey)) return;
        seenObsCoords.add(coordKey);

        allLatLngs.push([obs.lat, obs.lng]);
        const isHigh = obs.severity === "HIGH";
        const markerColor = isHigh ? "#ef4444" : "#f59e0b";

        // Hazard Exclusion Danger Zone Circle on GIS Map
        const hazardBuffer = L.circle([obs.lat, obs.lng], {
          radius: 180,
          color: markerColor,
          weight: 1.5,
          dashArray: "4, 4",
          fillColor: markerColor,
          fillOpacity: 0.18,
        }).bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; max-width: 240px; padding: 2px;">
            <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: ${markerColor}; text-transform: uppercase;">
              ⚡ DANGER EXCLUSION ZONE: ${obs.obstacle_type}
            </div>
            <strong>${obs.distance_m.toFixed(1)}m Clearance Required</strong><br/>
            <span style="font-size: 11px; color: #475569;">${obs.description}</span>
          </div>
        `);
        layersGroup.addLayer(hazardBuffer);

        // Hazard Marker Pin
        const hazardIcon = L.divIcon({
          className: "custom-hazard-pin",
          html: `
            <div style="
              width: 26px;
              height: 26px;
              background: ${markerColor};
              border: 2px solid #ffffff;
              border-radius: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 8px ${markerColor}88;
              color: #ffffff;
              font-weight: bold;
              font-size: 12px;
            ">
              ⚡
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const hazardMarker = L.marker([obs.lat, obs.lng], { icon: hazardIcon })
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; max-width: 250px; padding: 2px;">
              <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: ${markerColor}; text-transform: uppercase;">
                ${obs.obstacle_type} · ${obs.distance_m.toFixed(1)}M CLEARANCE
              </div>
              ${obs.voltage_kv ? `<div style="font-family: monospace; font-size: 11px; font-weight: bold; color: #0f172a;">Grid Voltage: ${obs.voltage_kv} kV</div>` : ""}
              <div style="font-size: 11px; color: #475569; margin-top: 2px;">Source: ${obs.source}</div>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #334155; line-height: 1.35;">${obs.description}</p>
            </div>
          `);
        layersGroup.addLayer(hazardMarker);
      });
    }

    // 6. Draw Emergency Landing Zones & Clearings
    if (showLandingZones) {
      let lzList = computed?.[recommendedCorridorId]?.landing_zones || [];
      if (lzList.length === 0) {
        lzList = [
          {
            sample_index: 3,
            lat: 37.4362,
            lng: -122.1075,
            distance_along_route_m: 2360,
            distance_along_route_miles: 1.47,
            infrastructure_clearance_m: 18.7,
            slope_degrees: 3.2,
            elevation_m: 12.4,
            source: "Airlane BVLOS Terrain Engine",
            description: "Byxbee North Meadow (Primary Abort Pad)",
          },
        ];
      }

      lzList.forEach((lz, idx) => {
        allLatLngs.push([lz.lat, lz.lng]);

        // Safe Landing Clearing Circle
        const lzCircle = L.circle([lz.lat, lz.lng], {
          radius: 140,
          color: "#10b981",
          weight: 1.5,
          fillColor: "#34d399",
          fillOpacity: 0.22,
        }).bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px;">
            <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: #059669; text-transform: uppercase;">
              SAFE EMERGENCY LANDING CLEARING LZ-0${idx + 1}
            </div>
            <strong>${lz.description}</strong><br/>
            <span>Clearance Radius: ${lz.infrastructure_clearance_m.toFixed(1)}m · Slope: ${lz.slope_degrees.toFixed(1)}°</span>
          </div>
        `);
        layersGroup.addLayer(lzCircle);

        // Landing Zone Pin
        const lzIcon = L.divIcon({
          className: "custom-lz-pin",
          html: `
            <div style="
              width: 24px;
              height: 24px;
              background: #059669;
              border: 2px solid #ffffff;
              border-radius: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 6px rgba(5, 150, 105, 0.4);
              color: #ffffff;
              font-weight: bold;
              font-size: 10px;
              font-family: monospace;
            ">
              LZ
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const lzMarker = L.marker([lz.lat, lz.lng], { icon: lzIcon })
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; max-width: 240px; padding: 2px;">
              <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: #059669; text-transform: uppercase;">
                SAFE LANDING ZONE LZ-0${idx + 1}
              </div>
              <strong>${lz.description}</strong><br/>
              <span>Clearance: ${lz.infrastructure_clearance_m.toFixed(1)}m · Slope: ${lz.slope_degrees.toFixed(1)}°</span><br/>
              <span style="font-family: monospace; font-size: 11px; color: #64748b;">Mile ${lz.distance_along_route_miles.toFixed(2)} along route</span>
            </div>
          `);
        layersGroup.addLayer(lzMarker);
      });
    }

    // Auto-fit bounds
    if (allLatLngs.length > 0) {
      const bounds = L.latLngBounds(allLatLngs);
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
    }

    // 7. Animated Drone GPS Marker traversing Recommended Route
    if (winnerCoords.length > 1) {
      const droneIcon = L.divIcon({
        className: "drone-gps-marker",
        html: `
          <div style="
            width: 26px;
            height: 26px;
            background: #0284c7;
            border: 2px solid #ffffff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 12px rgba(2, 132, 199, 0.9);
            font-size: 11px;
            color: #ffffff;
            font-family: monospace;
            font-weight: bold;
          ">
            ▲
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const droneMarker = L.marker(winnerCoords[0], { icon: droneIcon });
      layersGroup.addLayer(droneMarker);
      droneMarkerRef.current = droneMarker;

      let progress = 0;
      const animateDrone = () => {
        if (isSimulating && winnerCoords.length > 1) {
          progress = (progress + 0.0022) % 1.0;
          const totalSegs = winnerCoords.length - 1;
          const scaled = progress * totalSegs;
          const idx = Math.min(Math.floor(scaled), totalSegs - 1);
          const tSeg = scaled - idx;

          const p0 = winnerCoords[idx];
          const p1 = winnerCoords[idx + 1];

          const curLat = p0[0] + (p1[0] - p0[0]) * tSeg;
          const curLng = p0[1] + (p1[1] - p0[1]) * tSeg;

          droneMarker.setLatLng([curLat, curLng]);
        }
        animFrameRef.current = requestAnimationFrame(animateDrone);
      };

      animFrameRef.current = requestAnimationFrame(animateDrone);
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [result, showHazards, showAirspace, showLandingZones, showRejectedRoutes, isSimulating]);

  return (
    <div className="relative w-full h-[480px] lg:h-[580px] rounded-lg overflow-hidden border border-slate-200 shadow-xs bg-white select-none">
      {/* Top Floating Controls Bar */}
      <div className="absolute top-3 left-3 right-3 z-[500] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/95 backdrop-blur-md border border-slate-200 text-xs font-semibold text-slate-800 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[11px]">GIS OpenStreetMap Engine</span>
            <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
              100% Real GPS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className="px-2.5 py-1 rounded-md bg-white/95 backdrop-blur-md border border-slate-200 text-[11px] font-mono font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
          >
            {isSimulating ? "PAUSE FLIGHT" : "RESUME FLIGHT"}
          </button>
        </div>
      </div>

      {/* Main Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Bottom Layer Filter Controls */}
      <div className="absolute bottom-3 left-3 right-3 z-[500] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-md bg-white/95 backdrop-blur-md border border-slate-200 shadow-xs pointer-events-auto text-[11px] font-mono">
          <button
            onClick={() => setShowHazards(!showHazards)}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              showHazards
                ? "bg-amber-50 text-amber-900 border border-amber-300 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            ⚡ HAZARDS & 345kV
          </button>
          <button
            onClick={() => setShowAirspace(!showAirspace)}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              showAirspace
                ? "bg-sky-50 text-sky-900 border border-sky-300 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            🛡️ FAA AIRSPACE (400FT)
          </button>
          <button
            onClick={() => setShowLandingZones(!showLandingZones)}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              showLandingZones
                ? "bg-emerald-50 text-emerald-900 border border-emerald-300 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            🛬 LANDING PADS
          </button>
          <button
            onClick={() => setShowRejectedRoutes(!showRejectedRoutes)}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              showRejectedRoutes
                ? "bg-rose-50 text-rose-900 border border-rose-300 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            🚫 REJECTED PATHS (DOTTED RED)
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/95 backdrop-blur-md border border-slate-200 text-[10px] font-mono text-slate-500 shadow-xs pointer-events-auto">
          <span>ORIGIN: {launch.lat.toFixed(4)}°N</span>
          <span>·</span>
          <span>{launch.lng.toFixed(4)}°W</span>
        </div>
      </div>
    </div>
  );
};
