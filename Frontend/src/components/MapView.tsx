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
  const [showLandingZones, setShowLandingZones] = useState(true);
  const [showAlternatives, setShowAlternatives] = useState(true);
  const [isSimulating, setIsSimulating] = useState(true);

  const { launch, destination, corridors, computed, safety_case: sc } = result;
  const recommendedCorridorId = sc.recommended_corridor;

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

    // 1. Launch and Destination Markers
    const launchLatLng: [number, number] = [launch.lat, launch.lng];
    const destLatLng: [number, number] = [destination.lat, destination.lng];
    allLatLngs.push(launchLatLng, destLatLng);

    // Launch Pin
    const launchIcon = L.divIcon({
      className: "custom-map-pin",
      html: `
        <div style="
          width: 28px;
          height: 28px;
          background: #0284c7;
          border: 2px solid #ffffff;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
          color: #ffffff;
          font-weight: bold;
          font-size: 11px;
          font-family: monospace;
        ">
          A
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const destIcon = L.divIcon({
      className: "custom-map-pin",
      html: `
        <div style="
          width: 28px;
          height: 28px;
          background: #10b981;
          border: 2px solid #ffffff;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
          color: #ffffff;
          font-weight: bold;
          font-size: 11px;
          font-family: monospace;
        ">
          B
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
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

    // 2. Real GPS Corridor Polylines
    let winnerSamplePoints: Array<[number, number]> = [];

    corridors.forEach((corr) => {
      const isWinner = corr.id === recommendedCorridorId;
      if (!isWinner && !showAlternatives) return;

      const polylineCoords: [number, number][] =
        corr.sample_points && corr.sample_points.length > 0
          ? corr.sample_points.map((pt) => [pt.lat, pt.lng])
          : [launchLatLng, destLatLng];

      polylineCoords.forEach((pt) => allLatLngs.push(pt));

      if (isWinner) {
        winnerSamplePoints = polylineCoords;
        // Glow layer for recommended corridor
        const glowLine = L.polyline(polylineCoords, {
          color: "#0284c7",
          weight: 8,
          opacity: 0.25,
          lineCap: "round",
          lineJoin: "round",
        });
        layersGroup.addLayer(glowLine);

        const mainLine = L.polyline(polylineCoords, {
          color: "#0284c7",
          weight: 3.5,
          opacity: 1.0,
          lineCap: "round",
          lineJoin: "round",
        }).bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; padding: 2px;">
            <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: #0284c7; text-transform: uppercase;">RECOMMENDED FLIGHT CORRIDOR</div>
            <strong>${corr.name}</strong><br/>
            <span>Distance: ${(corr.total_distance_m / 1609.34).toFixed(2)} mi (${(corr.total_distance_m / 1000).toFixed(2)} km)</span><br/>
            <span style="font-family: monospace; font-size: 11px; color: #64748b;">${corr.sample_points?.length || 2} verified GPS waypoints</span>
          </div>
        `);
        layersGroup.addLayer(mainLine);
      } else {
        // Alternative corridor: thin dashed gray
        const altLine = L.polyline(polylineCoords, {
          color: "#94a3b8",
          weight: 2,
          opacity: 0.7,
          dashArray: "5, 7",
          lineCap: "round",
          lineJoin: "round",
        }).bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; padding: 2px;">
            <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">CANDIDATE DETOUR (REJECTED)</div>
            <strong>${corr.name}</strong><br/>
            <span>Distance: ${(corr.total_distance_m / 1000).toFixed(2)} km</span>
          </div>
        `);
        layersGroup.addLayer(altLine);
      }
    });

    // 3. Physical Hazard Annotations
    if (showHazards) {
      const allObstacles = [
        ...(computed.corridor_a?.obstacles || []),
        ...(computed.corridor_b?.obstacles || []),
        ...(computed.corridor_c?.obstacles || []),
      ];

      const seenObsCoords = new Set<string>();

      allObstacles.forEach((obs) => {
        const coordKey = `${obs.lat.toFixed(5)},${obs.lng.toFixed(5)}`;
        if (seenObsCoords.has(coordKey)) return;
        seenObsCoords.add(coordKey);

        allLatLngs.push([obs.lat, obs.lng]);
        const isHigh = obs.severity === "HIGH";
        const markerColor = isHigh ? "#ef4444" : "#f59e0b";

        const hazardIcon = L.divIcon({
          className: "custom-hazard-pin",
          html: `
            <div style="
              width: 22px;
              height: 22px;
              background: ${markerColor};
              border: 2px solid #ffffff;
              border-radius: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 6px ${markerColor}66;
              color: #ffffff;
              font-weight: bold;
              font-size: 11px;
            ">
              ⚡
            </div>
          `,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        const hazardMarker = L.marker([obs.lat, obs.lng], { icon: hazardIcon })
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; max-width: 240px; padding: 2px;">
              <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: ${markerColor}; text-transform: uppercase;">
                ${obs.obstacle_type} · ${obs.distance_m.toFixed(1)}M CLEARANCE
              </div>
              ${obs.voltage_kv ? `<div style="font-family: monospace; font-size: 11px; font-weight: bold;">Grid Voltage: ${obs.voltage_kv} kV</div>` : ""}
              <div style="font-size: 11px; color: #475569; margin-top: 2px;">Source: ${obs.source}</div>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #334155;">${obs.description}</p>
            </div>
          `);
        layersGroup.addLayer(hazardMarker);
      });
    }

    // 4. Emergency Landing Zone Callouts
    if (showLandingZones) {
      const winnerLandingZones = computed[recommendedCorridorId]?.landing_zones || [];

      winnerLandingZones.forEach((lz, idx) => {
        allLatLngs.push([lz.lat, lz.lng]);

        const lzIcon = L.divIcon({
          className: "custom-lz-pin",
          html: `
            <div style="
              width: 22px;
              height: 22px;
              background: #059669;
              border: 2px solid #ffffff;
              border-radius: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 6px rgba(5, 150, 105, 0.35);
              color: #ffffff;
              font-weight: bold;
              font-size: 10px;
              font-family: monospace;
            ">
              LZ
            </div>
          `,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        const lzMarker = L.marker([lz.lat, lz.lng], { icon: lzIcon })
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; max-width: 240px; padding: 2px;">
              <div style="font-family: monospace; font-size: 10px; font-weight: bold; color: #059669; text-transform: uppercase;">
                EMERGENCY LANDING ZONE LZ-0${idx + 1}
              </div>
              <strong>${lz.description}</strong><br/>
              <span>Clearance: ${lz.infrastructure_clearance_m.toFixed(1)}m radius · Slope: ${lz.slope_degrees.toFixed(1)}°</span><br/>
              <span style="font-family: monospace; font-size: 11px; color: #64748b;">Mile ${lz.distance_along_route_miles.toFixed(2)} along corridor</span>
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

    // 5. Animated Drone GPS Marker
    if (winnerSamplePoints.length > 1) {
      const droneIcon = L.divIcon({
        className: "drone-gps-marker",
        html: `
          <div style="
            width: 24px;
            height: 24px;
            background: #0284c7;
            border: 2px solid #ffffff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 10px rgba(2, 132, 199, 0.8);
            font-size: 10px;
            color: #ffffff;
            font-family: monospace;
            font-weight: bold;
          ">
            ▲
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const droneMarker = L.marker(winnerSamplePoints[0], { icon: droneIcon });
      layersGroup.addLayer(droneMarker);
      droneMarkerRef.current = droneMarker;

      let progress = 0;
      const animateDrone = () => {
        if (isSimulating && winnerSamplePoints.length > 1) {
          progress = (progress + 0.0025) % 1.0;
          const totalSegs = winnerSamplePoints.length - 1;
          const scaled = progress * totalSegs;
          const idx = Math.min(Math.floor(scaled), totalSegs - 1);
          const tSeg = scaled - idx;

          const p0 = winnerSamplePoints[idx];
          const p1 = winnerSamplePoints[idx + 1];

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
  }, [result, showHazards, showLandingZones, showAlternatives, isSimulating]);

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
            className="px-2.5 py-1 rounded-md bg-white/95 backdrop-blur-md border border-slate-200 text-[11px] font-mono font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
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
            className={`px-2 py-0.5 rounded transition-colors ${
              showHazards
                ? "bg-amber-50 text-amber-800 border border-amber-300 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            ⚡ HAZARDS
          </button>
          <button
            onClick={() => setShowLandingZones(!showLandingZones)}
            className={`px-2 py-0.5 rounded transition-colors ${
              showLandingZones
                ? "bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            🛬 LANDING PADS
          </button>
          <button
            onClick={() => setShowAlternatives(!showAlternatives)}
            className={`px-2 py-0.5 rounded transition-colors ${
              showAlternatives
                ? "bg-sky-50 text-sky-800 border border-sky-300 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            🛣️ DETOUR ROUTES
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
