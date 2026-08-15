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

    // Initialize Leaflet map with Light Silicon Valley Carto Voyager tiles
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([launch.lat, launch.lng], 13);

      L.control.zoom({ position: "topright" }).addTo(map);

      // Light Carto Voyager tiles for crisp daylight startup map aesthetic
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

    // Clear previous vector layers and markers
    layersGroup.clearLayers();

    const allLatLngs: L.LatLngExpression[] = [];

    // 1. Draw Launch and Destination Markers
    const launchLatLng: [number, number] = [launch.lat, launch.lng];
    const destLatLng: [number, number] = [destination.lat, destination.lng];
    allLatLngs.push(launchLatLng, destLatLng);

    // Custom Launch Pin
    const launchIcon = L.divIcon({
      className: "custom-map-pin",
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: #0284c7;
          border: 2.5px solid #ffffff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(2, 132, 199, 0.45);
          color: #ffffff;
          font-weight: bold;
          font-size: 14px;
        ">
          🛫
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const destIcon = L.divIcon({
      className: "custom-map-pin",
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: #10b981;
          border: 2.5px solid #ffffff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.45);
          color: #ffffff;
          font-weight: bold;
          font-size: 14px;
        ">
          🛬
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const launchMarker = L.marker(launchLatLng, { icon: launchIcon })
      .bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px;">
          <strong style="color: #0284c7; font-size: 13px;">🚀 Real Launch Location</strong><br/>
          <strong>Input:</strong> ${launch.input}<br/>
          <strong>Normalized:</strong> ${launch.normalized_address}<br/>
          <strong>GPS:</strong> ${launch.lat.toFixed(5)}° N, ${launch.lng.toFixed(5)}° W
        </div>
      `);
    layersGroup.addLayer(launchMarker);

    const destMarker = L.marker(destLatLng, { icon: destIcon })
      .bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px;">
          <strong style="color: #10b981; font-size: 13px;">🎯 Real Destination Location</strong><br/>
          <strong>Input:</strong> ${destination.input}<br/>
          <strong>Normalized:</strong> ${destination.normalized_address}<br/>
          <strong>GPS:</strong> ${destination.lat.toFixed(5)}° N, ${destination.lng.toFixed(5)}° W
        </div>
      `);
    layersGroup.addLayer(destMarker);

    // 2. Draw Real GPS Corridor Polylines
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
        // Winning corridor: Glow shadow + solid electric blue polyline
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
          weight: 4,
          opacity: 1.0,
          lineCap: "round",
          lineJoin: "round",
        }).bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; padding: 2px;">
            <strong style="color: #0284c7; font-size: 13px;">★ RECOMMENDED CORRIDOR (ALPHA)</strong><br/>
            <strong>Name:</strong> ${corr.name}<br/>
            <strong>Distance:</strong> ${(corr.total_distance_m / 1000).toFixed(2)} km (${(corr.total_distance_m / 1609.34).toFixed(2)} mi)<br/>
            <strong>Sample Points:</strong> ${corr.sample_points?.length || 2} verified GPS waypoints
          </div>
        `);
        layersGroup.addLayer(mainLine);
      } else {
        // Alternative corridor: Dashed grey polyline
        const altLine = L.polyline(polylineCoords, {
          color: "#94a3b8",
          weight: 2.5,
          opacity: 0.8,
          dashArray: "6, 8",
          lineCap: "round",
          lineJoin: "round",
        }).bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; padding: 2px;">
            <strong style="color: #64748b;">ALTERNATIVE CANDIDATE ROUTE</strong><br/>
            <strong>Name:</strong> ${corr.name}<br/>
            <strong>Distance:</strong> ${(corr.total_distance_m / 1000).toFixed(2)} km<br/>
            <strong>Status:</strong> Rejected candidate
          </div>
        `);
        layersGroup.addLayer(altLine);
      }
    });

    // 3. Draw Real Mireye Powerline / Infrastructure Hazards
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
              width: 26px;
              height: 26px;
              background: ${markerColor};
              border: 2px solid #ffffff;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 8px ${markerColor}66;
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
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; max-width: 240px; padding: 2px;">
              <strong style="color: ${markerColor}; font-size: 13px;">⚠️ ${obs.obstacle_type}</strong><br/>
              <strong>Severity:</strong> <span style="color: ${markerColor}; font-weight: bold;">${obs.severity}</span><br/>
              <strong>Distance:</strong> ${obs.distance_m.toFixed(1)}m from route<br/>
              ${obs.voltage_kv ? `<strong>Voltage:</strong> ${obs.voltage_kv} kV<br/>` : ""}
              <strong>Source:</strong> ${obs.source}<br/>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #475569;">${obs.description}</p>
            </div>
          `);
        layersGroup.addLayer(hazardMarker);
      });
    }

    // 4. Draw Real Emergency Landing Zones
    if (showLandingZones) {
      const winnerLandingZones = computed[recommendedCorridorId]?.landing_zones || [];

      winnerLandingZones.forEach((lz, idx) => {
        allLatLngs.push([lz.lat, lz.lng]);

        const lzIcon = L.divIcon({
          className: "custom-lz-pin",
          html: `
            <div style="
              width: 26px;
              height: 26px;
              background: #059669;
              border: 2px solid #ffffff;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 8px rgba(5, 150, 105, 0.4);
              color: #ffffff;
              font-weight: bold;
              font-size: 11px;
            ">
              🛬
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const lzMarker = L.marker([lz.lat, lz.lng], { icon: lzIcon })
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; max-width: 240px; padding: 2px;">
              <strong style="color: #059669; font-size: 13px;">🛡️ Safe Landing Zone LZ-0${idx + 1}</strong><br/>
              <strong>Site:</strong> ${lz.description}<br/>
              <strong>Clearance:</strong> ${lz.infrastructure_clearance_m.toFixed(1)}m radius<br/>
              <strong>Terrain Slope:</strong> ${lz.slope_degrees.toFixed(1)}°<br/>
              <strong>Route Distance:</strong> ${lz.distance_along_route_miles.toFixed(2)} mi (${Math.round(lz.distance_along_route_m)}m)<br/>
              <strong>Source:</strong> ${lz.source}
            </div>
          `);
        layersGroup.addLayer(lzMarker);
      });
    }

    // Auto-fit bounds to real coordinates
    if (allLatLngs.length > 0) {
      const bounds = L.latLngBounds(allLatLngs);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }

    // 5. Animated Drone Marker flying along the REAL GPS waypoints
    if (winnerSamplePoints.length > 1) {
      const droneIcon = L.divIcon({
        className: "drone-gps-marker",
        html: `
          <div style="
            width: 28px;
            height: 28px;
            background: #facc15;
            border: 2px solid #0f172a;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 12px rgba(250, 204, 21, 0.9);
            font-size: 13px;
          ">
            🛸
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const droneMarker = L.marker(winnerSamplePoints[0], { icon: droneIcon });
      layersGroup.addLayer(droneMarker);
      droneMarkerRef.current = droneMarker;

      let progress = 0;
      const animateDrone = () => {
        if (isSimulating && winnerSamplePoints.length > 1) {
          progress = (progress + 0.003) % 1.0;
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
    <div className="relative w-full h-[520px] lg:h-[600px] rounded-2xl overflow-hidden border border-slate-200 shadow-xl bg-white select-none">
      {/* Top Floating Controls Bar */}
      <div className="absolute top-4 left-4 right-4 z-[500] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm text-xs font-semibold text-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Real-World GIS Map (Carto / OSM)</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              100% Real GPS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className="px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {isSimulating ? "⏸️ Pause Drone" : "▶️ Resume Flight"}
          </button>
        </div>
      </div>

      {/* Main Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Bottom Layer Controls */}
      <div className="absolute bottom-4 left-4 right-4 z-[500] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm pointer-events-auto">
          <button
            onClick={() => setShowHazards(!showHazards)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              showHazards
                ? "bg-amber-50 text-amber-800 border border-amber-300 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            ⚡ Mireye Hazards
          </button>
          <button
            onClick={() => setShowLandingZones(!showLandingZones)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              showLandingZones
                ? "bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            🛬 Safe Landing Sites
          </button>
          <button
            onClick={() => setShowAlternatives(!showAlternatives)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              showAlternatives
                ? "bg-sky-50 text-sky-800 border border-sky-300 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            🛣️ Alternative Routes
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm text-xs font-mono text-slate-600 pointer-events-auto">
          <span>Lat: {launch.lat.toFixed(4)}°N</span>
          <span>•</span>
          <span>Lng: {launch.lng.toFixed(4)}°W</span>
        </div>
      </div>
    </div>
  );
};
