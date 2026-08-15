import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { AnalysisResult } from "../types/airlane";

interface MapViewProps {
  result: AnalysisResult;
}

export const MapView: React.FC<MapViewProps> = ({ result }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);

  const [showHazards, setShowHazards] = useState(true);
  const [showLandingZones, setShowLandingZones] = useState(true);
  const [showAlternatives, setShowAlternatives] = useState(true);

  const { launch, destination, corridors, computed, safety_case: sc } = result;
  const recommendedCorridorId = sc.recommended_corridor;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Leaflet map if not already created
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([launch.lat, launch.lng], 13);

      // Add zoom control in top-right
      L.control.zoom({ position: "topright" }).addTo(map);

      // Dark Matter tile layer for aerospace mission control aesthetic
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
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

    // Custom Takeoff Pin
    const launchIcon = L.divIcon({
      className: "custom-map-pin",
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: #06b6d4;
          border: 2px solid #ffffff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 16px rgba(6, 182, 212, 0.8);
          color: #0f172a;
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
          border: 2px solid #ffffff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 16px rgba(16, 185, 129, 0.8);
          color: #0f172a;
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
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a;">
          <strong style="color: #0891b2; font-size: 13px;">🚀 Launch Origin (Takeoff)</strong><br/>
          <strong>Address:</strong> ${launch.normalized_address}<br/>
          <strong>Coords:</strong> ${launch.lat.toFixed(5)}, ${launch.lng.toFixed(5)}
        </div>
      `);
    layersGroup.addLayer(launchMarker);

    const destMarker = L.marker(destLatLng, { icon: destIcon })
      .bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a;">
          <strong style="color: #059669; font-size: 13px;">🎯 Destination (Recovery)</strong><br/>
          <strong>Address:</strong> ${destination.normalized_address}<br/>
          <strong>Coords:</strong> ${destination.lat.toFixed(5)}, ${destination.lng.toFixed(5)}
        </div>
      `);
    layersGroup.addLayer(destMarker);

    // 2. Draw Corridor Polylines from Real Sampled Coordinates
    corridors.forEach((corr) => {
      const isWinner = corr.id === recommendedCorridorId;
      if (!isWinner && !showAlternatives) return;

      const polylineCoords: [number, number][] = corr.sample_points.map((pt) => [pt.lat, pt.lng]);
      polylineCoords.forEach((pt) => allLatLngs.push(pt));

      if (isWinner) {
        // Winning corridor: Glow shadow + solid green polyline
        const glowLine = L.polyline(polylineCoords, {
          color: "#10b981",
          weight: 10,
          opacity: 0.3,
          lineCap: "round",
          lineJoin: "round",
        });
        layersGroup.addLayer(glowLine);

        const mainLine = L.polyline(polylineCoords, {
          color: "#10b981",
          weight: 4.5,
          opacity: 1.0,
          lineCap: "round",
          lineJoin: "round",
        }).bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; color: #0f172a;">
            <strong style="color: #059669; font-size: 13px;">★ RECOMMENDED CORRIDOR</strong><br/>
            <strong>Name:</strong> ${corr.name}<br/>
            <strong>Distance:</strong> ${(corr.total_distance_m / 1609.34).toFixed(2)} miles (${Math.round(corr.total_distance_m)}m)<br/>
            <strong>Sample Points:</strong> ${corr.sample_points.length} points
          </div>
        `);
        layersGroup.addLayer(mainLine);
      } else {
        // Alternative corridor: Dashed grey polyline
        const altLine = L.polyline(polylineCoords, {
          color: corr.id === "corridor_a" ? "#94a3b8" : "#64748b",
          weight: 3,
          opacity: 0.75,
          dashArray: "6, 8",
          lineCap: "round",
          lineJoin: "round",
        }).bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; color: #0f172a;">
            <strong>ALTERNATIVE ROUTE</strong><br/>
            <strong>Name:</strong> ${corr.name}<br/>
            <strong>Distance:</strong> ${(corr.total_distance_m / 1609.34).toFixed(2)} miles<br/>
            <strong>Status:</strong> Rejected candidate
          </div>
        `);
        layersGroup.addLayer(altLine);
      }
    });

    // 3. Draw Mireye Hazard Markers at Real Returned Coordinates
    if (showHazards) {
      // Gather unique obstacles across corridors
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

        const isHighSeverity = obs.severity === "HIGH" || (obs.distance_m < 30);
        const markerColor = isHighSeverity ? "#f43f5e" : "#f59e0b";

        const hazardIcon = L.divIcon({
          className: "custom-hazard-pin",
          html: `
            <div style="
              width: 24px;
              height: 24px;
              background: ${markerColor};
              border: 2px solid #ffffff;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 0 12px ${markerColor};
              color: #ffffff;
              font-weight: bold;
              font-size: 11px;
            ">
              ⚡
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const hazardMarker = L.marker([obs.lat, obs.lng], { icon: hazardIcon })
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; max-width: 240px;">
              <strong style="color: ${markerColor}; font-size: 13px;">⚠️ ${obs.obstacle_type}</strong><br/>
              <strong>Severity:</strong> <span style="color: ${markerColor}; font-weight: bold;">${obs.severity}</span><br/>
              <strong>Infrastructure Distance:</strong> ${obs.distance_m.toFixed(1)}m from route<br/>
              ${obs.voltage_kv ? `<strong>Voltage:</strong> ${obs.voltage_kv} kV<br/>` : ""}
              <strong>Source:</strong> ${obs.source}<br/>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #475569;">${obs.description}</p>
            </div>
          `);
        layersGroup.addLayer(hazardMarker);
      });
    }

    // 4. Draw Landing Zone Markers at Real Identified Coordinates
    if (showLandingZones) {
      const winnerLandingZones = computed[recommendedCorridorId]?.landing_zones || [];

      winnerLandingZones.forEach((lz, idx) => {
        allLatLngs.push([lz.lat, lz.lng]);

        const lzIcon = L.divIcon({
          className: "custom-lz-pin",
          html: `
            <div style="
              width: 24px;
              height: 24px;
              background: #06b6d4;
              border: 2px solid #ffffff;
              border-radius: 6px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 0 10px rgba(6, 182, 212, 0.8);
              color: #ffffff;
              font-weight: bold;
              font-size: 11px;
            ">
              H
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        // Clearance buffer circle around landing zone
        const lzCircle = L.circle([lz.lat, lz.lng], {
          radius: Math.min(lz.infrastructure_clearance_m, 150),
          color: "#06b6d4",
          fillColor: "#06b6d4",
          fillOpacity: 0.15,
          weight: 1.5,
          dashArray: "4, 4",
        });
        layersGroup.addLayer(lzCircle);

        const lzMarker = L.marker([lz.lat, lz.lng], { icon: lzIcon })
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; max-width: 220px;">
              <strong style="color: #0891b2; font-size: 13px;">📍 Forced Landing Zone #${idx + 1}</strong><br/>
              <strong>Mile:</strong> ${lz.distance_along_route_miles.toFixed(2)}<br/>
              <strong>Obstacle Clearance:</strong> ${Math.round(lz.infrastructure_clearance_m)}m<br/>
              <strong>Terrain Slope:</strong> ${lz.slope_degrees.toFixed(1)}°<br/>
              <strong>Elevation:</strong> ${Math.round(lz.elevation_m)}m AGL<br/>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #475569;">${lz.description}</p>
            </div>
          `);
        layersGroup.addLayer(lzMarker);
      });
    }

    // 5. Auto-fit Map to Bounding Box
    if (allLatLngs.length > 0) {
      const bounds = L.latLngBounds(allLatLngs);
      map.fitBounds(bounds, {
        padding: [60, 60],
        maxZoom: 15,
        animate: true,
      });
    }
  }, [result, showHazards, showLandingZones, showAlternatives]);

  return (
    <div className="relative w-full h-[520px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Layer Visibility Toggles Overlay */}
      <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3 rounded-xl shadow-xl flex flex-col gap-2 text-xs">
        <span className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider mb-0.5">
          Map Layers & Overlays
        </span>
        <label className="flex items-center gap-2 text-slate-200 cursor-pointer hover:text-white transition-colors">
          <input
            type="checkbox"
            checked={showAlternatives}
            onChange={(e) => setShowAlternatives(e.target.checked)}
            className="accent-emerald-400 rounded cursor-pointer"
          />
          <span>Alternative Corridors</span>
        </label>
        <label className="flex items-center gap-2 text-slate-200 cursor-pointer hover:text-white transition-colors">
          <input
            type="checkbox"
            checked={showHazards}
            onChange={(e) => setShowHazards(e.target.checked)}
            className="accent-rose-400 rounded cursor-pointer"
          />
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            Infrastructure Hazards
          </span>
        </label>
        <label className="flex items-center gap-2 text-slate-200 cursor-pointer hover:text-white transition-colors">
          <input
            type="checkbox"
            checked={showLandingZones}
            onChange={(e) => setShowLandingZones(e.target.checked)}
            className="accent-cyan-400 rounded cursor-pointer"
          />
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
            Emergency Landing Sites
          </span>
        </label>
      </div>

      {/* Corridor Legend Overlay */}
      <div className="absolute bottom-4 right-4 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3.5 py-2.5 rounded-xl shadow-xl flex items-center gap-4 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-1 bg-emerald-400 rounded-full inline-block shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="text-slate-200 font-sans text-[11px] font-semibold">
            {sc.recommended_name} (Winning)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 border-t-2 border-dashed border-slate-500 inline-block" />
          <span className="text-slate-400 font-sans text-[11px]">Rejected Alternative</span>
        </div>
      </div>
    </div>
  );
};
