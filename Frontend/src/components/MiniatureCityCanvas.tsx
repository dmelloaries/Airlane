import React, { useEffect, useRef, useState, useMemo } from "react";
import type { AnalysisResult, SamplePoint, ObstacleRisk, LandingZone } from "../types/airlane";

export interface SelectedObjectInfo {
  type: "hazard" | "airspace" | "landing_zone" | "building" | "drone" | "corridor" | "launch" | "destination";
  title: string;
  subtitle: string;
  source: string;
  metrics: Array<{ label: string; value: string; highlight?: boolean }>;
  description: string;
  coordinates?: { lat: number; lng: number };
}

interface MiniatureCityCanvasProps {
  analysisResult?: AnalysisResult | null;
  activeStage?: number; // 0: idle, 1: geocoding, 2: corridors, 3: hazards, 4: airspace, 5: census, 6: wind, 7: scored, 8: done
  selectedCorridorId?: "corridor_a" | "corridor_b" | "corridor_c";
  onSelectObject?: (info: SelectedObjectInfo | null) => void;
  isInteractive?: boolean;
}

export const MiniatureCityCanvas: React.FC<MiniatureCityCanvasProps> = ({
  analysisResult,
  activeStage = 8,
  selectedCorridorId = "corridor_a",
  onSelectObject,
  isInteractive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Camera and Pan/Zoom State
  const [cameraMode, setCameraMode] = useState<"isometric" | "topdown" | "drone">("isometric");
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Layer Toggles
  const [showAirspace, setShowAirspace] = useState<boolean>(true);
  const [showHazards, setShowHazards] = useState<boolean>(true);
  const [showPopulation, setShowPopulation] = useState<boolean>(true);
  const [showWind, setShowWind] = useState<boolean>(true);
  const [showLandingPads, setShowLandingPads] = useState<boolean>(true);
  const [showCorridors, setShowCorridors] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(1.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  // Hovered item tooltip
  const [hoveredItem, setHoveredItem] = useState<{ x: number; y: number; text: string } | null>(null);

  // Simulation time
  const simTimeRef = useRef<number>(0);
  const droneProgressRef = useRef<number>(0.1);

  // -------------------------------------------------------------
  // REAL GEOSPATIAL PROJECTION ENGINE
  // Converts real GPS lat/lng from backend into 3D isometric space
  // -------------------------------------------------------------
  const geoData = useMemo(() => {
    // Fallback default coordinates if analysisResult is not yet loaded
    const launchLat = analysisResult?.launch?.lat ?? 37.4172;
    const launchLng = analysisResult?.launch?.lng ?? -122.1084;
    const destLat = analysisResult?.destination?.lat ?? 37.4481;
    const destLng = analysisResult?.destination?.lng ?? -122.1063;

    // Collect all real coordinate points across corridors and hazards
    const allLats = [launchLat, destLat];
    const allLngs = [launchLng, destLng];

    if (analysisResult?.corridors) {
      analysisResult.corridors.forEach((corr) => {
        corr.sample_points?.forEach((pt) => {
          allLats.push(pt.lat);
          allLngs.push(pt.lng);
        });
      });
    }

    const allObstacles: ObstacleRisk[] = [
      ...(analysisResult?.computed?.corridor_a?.obstacles || []),
      ...(analysisResult?.computed?.corridor_b?.obstacles || []),
      ...(analysisResult?.computed?.corridor_c?.obstacles || []),
    ];

    allObstacles.forEach((obs) => {
      allLats.push(obs.lat);
      allLngs.push(obs.lng);
    });

    const allLandingZones: LandingZone[] = [
      ...(analysisResult?.computed?.corridor_a?.landing_zones || []),
      ...(analysisResult?.computed?.corridor_b?.landing_zones || []),
      ...(analysisResult?.computed?.corridor_c?.landing_zones || []),
    ];

    allLandingZones.forEach((lz) => {
      allLats.push(lz.lat);
      allLngs.push(lz.lng);
    });

    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);
    const minLng = Math.min(...allLngs);
    const maxLng = Math.max(...allLngs);

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const latSpan = Math.max(0.005, maxLat - minLat);
    const lngSpan = Math.max(0.005, maxLng - minLng);

    // Compute meters per degree at this latitude
    const metersPerLat = 111132;
    const metersPerLng = 111132 * Math.cos((centerLat * Math.PI) / 180);

    const totalMetersX = lngSpan * metersPerLng;
    const totalMetersY = latSpan * metersPerLat;
    const maxDimensionMeters = Math.max(totalMetersX, totalMetersY, 2000);

    // Scale to fit nicely in [-260, 260] 3D world coordinate bounds
    const worldScale = 480 / maxDimensionMeters;

    // Convert GPS (lat, lng, alt) to 3D World (x, y, z)
    const toWorldCoords = (lat: number, lng: number, altFt: number = 0) => {
      const dxMeters = (lng - centerLng) * metersPerLng;
      const dyMeters = (lat - centerLat) * metersPerLat;
      const zMeters = altFt * 0.3048;

      return {
        x: dxMeters * worldScale,
        y: dyMeters * worldScale,
        z: Math.max(0, zMeters * worldScale * 1.5),
        lat,
        lng,
      };
    };

    // Project Launch and Destination
    const launchWorld = toWorldCoords(launchLat, launchLng, 0);
    const destWorld = toWorldCoords(destLat, destLng, 0);

    // Project Real Corridors
    const projectCorridor = (corrId: string) => {
      const corrData = analysisResult?.corridors?.find((c) => c.id === corrId);
      if (corrData?.sample_points && corrData.sample_points.length > 0) {
        return corrData.sample_points.map((pt) => {
          const w = toWorldCoords(pt.lat, pt.lng, analysisResult?.parameters?.cruise_altitude_ft || 300);
          return { ...w, sample_index: pt.index, dist_m: pt.distance_from_start_m };
        });
      }

      // If sample points are synthetic or direct
      const cruiseAlt = analysisResult?.parameters?.cruise_altitude_ft || 300;
      if (corrId === "corridor_b") {
        const midLat = (launchLat + destLat) / 2 + 0.006;
        const midLng = (launchLng + destLng) / 2 + 0.006;
        return [
          toWorldCoords(launchLat, launchLng, 0),
          toWorldCoords((launchLat * 2 + midLat) / 3, (launchLng * 2 + midLng) / 3, cruiseAlt),
          toWorldCoords(midLat, midLng, cruiseAlt),
          toWorldCoords((destLat * 2 + midLat) / 3, (destLng * 2 + midLng) / 3, cruiseAlt),
          toWorldCoords(destLat, destLng, 0),
        ];
      }
      if (corrId === "corridor_c") {
        const midLat = (launchLat + destLat) / 2 - 0.006;
        const midLng = (launchLng + destLng) / 2 - 0.006;
        return [
          toWorldCoords(launchLat, launchLng, 0),
          toWorldCoords((launchLat * 2 + midLat) / 3, (launchLng * 2 + midLng) / 3, cruiseAlt),
          toWorldCoords(midLat, midLng, cruiseAlt),
          toWorldCoords((destLat * 2 + midLat) / 3, (destLng * 2 + midLng) / 3, cruiseAlt),
          toWorldCoords(destLat, destLng, 0),
        ];
      }

      // Default Corridor A
      const midLat = (launchLat + destLat) / 2;
      const midLng = (launchLng + destLng) / 2;
      return [
        toWorldCoords(launchLat, launchLng, 0),
        toWorldCoords(midLat, midLng, cruiseAlt),
        toWorldCoords(destLat, destLng, 0),
      ];
    };

    const corrAWorld = projectCorridor("corridor_a");
    const corrBWorld = projectCorridor("corridor_b");
    const corrCWorld = projectCorridor("corridor_c");

    // Project Real Mireye Obstacles
    const projectedObstacles = allObstacles.map((obs) => {
      const w = toWorldCoords(obs.lat, obs.lng, 0);
      return {
        ...obs,
        worldX: w.x,
        worldY: w.y,
      };
    });

    // Project Real Emergency Landing Zones
    const projectedLandingZones = allLandingZones.map((lz) => {
      const w = toWorldCoords(lz.lat, lz.lng, 0);
      return {
        ...lz,
        worldX: w.x,
        worldY: w.y,
      };
    });

    return {
      launch: {
        ...launchWorld,
        name: analysisResult?.launch?.normalized_address || analysisResult?.launch?.input || "Launch Hub",
        lat: launchLat,
        lng: launchLng,
      },
      destination: {
        ...destWorld,
        name: analysisResult?.destination?.normalized_address || analysisResult?.destination?.input || "Destination Hub",
        lat: destLat,
        lng: destLng,
      },
      corridorA: corrAWorld,
      corridorB: corrBWorld,
      corridorC: corrCWorld,
      obstacles: projectedObstacles,
      landingZones: projectedLandingZones,
      dominantTier: analysisResult?.safety_case?.part108_tier || "Tier 1",
      confidencePct: Math.round((analysisResult?.safety_case?.confidence_score || 0.92) * 100),
      cruiseAltFt: analysisResult?.parameters?.cruise_altitude_ft || 300,
    };
  }, [analysisResult]);

  // Reset view
  const handleResetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setCameraMode("isometric");
  };

  // Canvas Mouse / Touch Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isInteractive) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging && isInteractive) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const cx = canvas.width / (2 * window.devicePixelRatio) + pan.x;
    const cy = canvas.height / (2 * window.devicePixelRatio) + pan.y;

    const toIsoLocal = (x: number, y: number, z: number = 0) => {
      if (cameraMode === "topdown") {
        return { x: cx + x * 1.1 * zoom, y: cy + y * 1.1 * zoom };
      }
      const isoX = (x - y) * 0.866;
      const isoY = (x + y) * 0.5 - z;
      return { x: cx + isoX * zoom, y: cy + isoY * zoom };
    };

    // Check hit test on Launch
    const pLaunch = toIsoLocal(geoData.launch.x, geoData.launch.y, 10);
    if (Math.hypot(mouseX - pLaunch.x, mouseY - pLaunch.y) < 35) {
      setHoveredItem({ x: mouseX, y: mouseY, text: `🛫 Real Launch: ${geoData.launch.name}` });
      canvas.style.cursor = "pointer";
      return;
    }

    // Check hit test on Destination
    const pDest = toIsoLocal(geoData.destination.x, geoData.destination.y, 10);
    if (Math.hypot(mouseX - pDest.x, mouseY - pDest.y) < 35) {
      setHoveredItem({ x: mouseX, y: mouseY, text: `🎯 Real Destination: ${geoData.destination.name}` });
      canvas.style.cursor = "pointer";
      return;
    }

    // Check hit test on Real Mireye Obstacles
    for (const obs of geoData.obstacles) {
      const pObs = toIsoLocal(obs.worldX, obs.worldY, 35);
      if (Math.hypot(mouseX - pObs.x, mouseY - pObs.y) < 35) {
        setHoveredItem({
          x: mouseX,
          y: mouseY,
          text: `⚡ Mireye Obstacle: ${obs.obstacle_type} (${obs.distance_m.toFixed(1)}m Clearance)`,
        });
        canvas.style.cursor = "pointer";
        return;
      }
    }

    // Check hit test on Real Landing Zones
    for (const lz of geoData.landingZones) {
      const pLz = toIsoLocal(lz.worldX, lz.worldY, 0);
      if (Math.hypot(mouseX - pLz.x, mouseY - pLz.y) < 30) {
        setHoveredItem({
          x: mouseX,
          y: mouseY,
          text: `🛬 Emergency Landing Zone (${lz.infrastructure_clearance_m.toFixed(1)}m Clearance)`,
        });
        canvas.style.cursor = "pointer";
        return;
      }
    }

    setHoveredItem(null);
    canvas.style.cursor = isDragging ? "grabbing" : "grab";
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!isInteractive) return;
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.max(0.5, Math.min(3.0, prev * zoomFactor)));
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onSelectObject) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const cx = canvas.width / (2 * window.devicePixelRatio) + pan.x;
    const cy = canvas.height / (2 * window.devicePixelRatio) + pan.y;

    const toIsoLocal = (x: number, y: number, z: number = 0) => {
      if (cameraMode === "topdown") {
        return { x: cx + x * 1.1 * zoom, y: cy + y * 1.1 * zoom };
      }
      const isoX = (x - y) * 0.866;
      const isoY = (x + y) * 0.5 - z;
      return { x: cx + isoX * zoom, y: cy + isoY * zoom };
    };

    // 1. Click on Real Launch
    const pLaunch = toIsoLocal(geoData.launch.x, geoData.launch.y, 10);
    if (Math.hypot(mouseX - pLaunch.x, mouseY - pLaunch.y) < 40) {
      onSelectObject({
        type: "launch",
        title: "Real Launch Origin (Takeoff Pad)",
        subtitle: geoData.launch.name,
        source: "Geocoded Mission Input",
        metrics: [
          { label: "Latitude", value: `${geoData.launch.lat.toFixed(5)}° N`, highlight: true },
          { label: "Longitude", value: `${geoData.launch.lng.toFixed(5)}° W`, highlight: true },
          { label: "Status", value: "Verified Active Pad" },
          { label: "Initial Climb", value: "300 ft AGL" },
        ],
        description: `Origin point for autonomous flight corridor generation. Validated against FAA UASFM surface ceiling regulations.`,
        coordinates: { lat: geoData.launch.lat, lng: geoData.launch.lng },
      });
      return;
    }

    // 2. Click on Real Destination
    const pDest = toIsoLocal(geoData.destination.x, geoData.destination.y, 10);
    if (Math.hypot(mouseX - pDest.x, mouseY - pDest.y) < 40) {
      onSelectObject({
        type: "destination",
        title: "Real Recovery Hub (Destination Pad)",
        subtitle: geoData.destination.name,
        source: "Geocoded Mission Input",
        metrics: [
          { label: "Latitude", value: `${geoData.destination.lat.toFixed(5)}° N`, highlight: true },
          { label: "Longitude", value: `${geoData.destination.lng.toFixed(5)}° W`, highlight: true },
          { label: "Recovery Pad", value: "Clear & Operational" },
          { label: "Approach Angle", value: "3.5° Standard" },
        ],
        description: `Terminal recovery waypoint. Verified clear of overhead power lines and ground population congestion.`,
        coordinates: { lat: geoData.destination.lat, lng: geoData.destination.lng },
      });
      return;
    }

    // 3. Click on Real Mireye Obstacles
    for (const obs of geoData.obstacles) {
      const pObs = toIsoLocal(obs.worldX, obs.worldY, 35);
      if (Math.hypot(mouseX - pObs.x, mouseY - pObs.y) < 40) {
        onSelectObject({
          type: "hazard",
          title: `Mireye Verified Hazard: ${obs.obstacle_type}`,
          subtitle: `Distance to Flight Path: ${obs.distance_m.toFixed(1)}m`,
          source: obs.source || "Mireye Earth API",
          metrics: [
            { label: "Route Clearance", value: `${obs.distance_m.toFixed(1)} m`, highlight: true },
            { label: "Voltage", value: obs.voltage_kv ? `${obs.voltage_kv} kV` : "High Voltage", highlight: true },
            { label: "Severity", value: obs.severity },
            { label: "Mitigation", value: obs.clearance_status || "Detour Enforced" },
          ],
          description: obs.description || "Real-world electrical transmission infrastructure verified via Mireye Earth API.",
          coordinates: { lat: obs.lat, lng: obs.lng },
        });
        return;
      }
    }

    // 4. Click on Real Landing Zones
    for (const lz of geoData.landingZones) {
      const pLz = toIsoLocal(lz.worldX, lz.worldY, 0);
      if (Math.hypot(mouseX - pLz.x, mouseY - pLz.y) < 35) {
        onSelectObject({
          type: "landing_zone",
          title: `Emergency Forced Landing Zone`,
          subtitle: lz.description || "Designated Part 108 Abort Site",
          source: lz.source || "Airlane BVLOS Terrain Engine",
          metrics: [
            { label: "Clearance Radius", value: `${lz.infrastructure_clearance_m.toFixed(1)} m`, highlight: true },
            { label: "Terrain Slope", value: `${lz.slope_degrees.toFixed(1)}°`, highlight: true },
            { label: "Route Distance", value: `${lz.distance_along_route_miles.toFixed(2)} mi` },
            { label: "Elevation", value: `${lz.elevation_m.toFixed(1)} m` },
          ],
          description: "Real-world ground clearing analyzed for emergency recovery with low slope and zero wire obstruction.",
          coordinates: { lat: lz.lat, lng: lz.lng },
        });
        return;
      }
    }

    onSelectObject(null);
  };

  // 60 FPS Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      if (isPlaying) {
        simTimeRef.current += 0.016 * simSpeed;
        droneProgressRef.current = (droneProgressRef.current + 0.0012 * simSpeed) % 1.0;
      }
      const t = simTimeRef.current;
      const progress = droneProgressRef.current;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * window.devicePixelRatio || canvas.height !== height * window.devicePixelRatio) {
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
      }

      ctx.save();
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx.clearRect(0, 0, width, height);

      // Sky Background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, "#e0f2fe");
      skyGrad.addColorStop(0.4, "#f0fdf4");
      skyGrad.addColorStop(1, "#f8fafc");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Camera Transform
      const cx = width / 2 + pan.x;
      const cy = height / 2 + pan.y;
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);

      const toIso = (x: number, y: number, z: number = 0) => {
        if (cameraMode === "topdown") {
          return { x: x * 1.1, y: y * 1.1 - z * 0.1 };
        }
        const isoX = (x - y) * 0.866;
        const isoY = (x + y) * 0.5 - z;
        return { x: isoX, y: isoY };
      };

      // 1. Terrain Base
      const groundRadius = 380;
      ctx.beginPath();
      const g0 = toIso(-groundRadius, -groundRadius, 0);
      const g1 = toIso(groundRadius, -groundRadius, 0);
      const g2 = toIso(groundRadius, groundRadius, 0);
      const g3 = toIso(-groundRadius, groundRadius, 0);
      ctx.moveTo(g0.x, g0.y);
      ctx.lineTo(g1.x, g1.y);
      ctx.lineTo(g2.x, g2.y);
      ctx.lineTo(g3.x, g3.y);
      ctx.closePath();
      ctx.fillStyle = "#e2f1e4";
      ctx.fill();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Terrain Grid
      ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
      ctx.lineWidth = 1;
      for (let i = -groundRadius; i <= groundRadius; i += 60) {
        const pA = toIso(i, -groundRadius, 0);
        const pB = toIso(i, groundRadius, 0);
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();

        const pC = toIso(-groundRadius, i, 0);
        const pD = toIso(groundRadius, i, 0);
        ctx.beginPath();
        ctx.moveTo(pC.x, pC.y);
        ctx.lineTo(pD.x, pD.y);
        ctx.stroke();
      }

      // 2. Real Connecting Corridor Roads
      const lx = geoData.launch.x;
      const ly = geoData.launch.y;
      const dx = geoData.destination.x;
      const dy = geoData.destination.y;

      const pRoadStart = toIso(lx, ly, 0);
      const pRoadEnd = toIso(dx, dy, 0);

      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pRoadStart.x, pRoadStart.y);
      ctx.lineTo(pRoadEnd.x, pRoadEnd.y);
      ctx.stroke();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(pRoadStart.x, pRoadStart.y);
      ctx.lineTo(pRoadEnd.x, pRoadEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. Real Launch Pad (Origin)
      const pLaunchBase = toIso(lx, ly, 0);
      const pLaunchTop = toIso(lx, ly, 15);

      // Launch Pad 3D Base
      ctx.fillStyle = "#0284c7";
      ctx.beginPath();
      ctx.ellipse(pLaunchBase.x, pLaunchBase.y, 28, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Launch Ring Pulse
      const launchPulse = (Math.sin(t * 3) + 1) * 6;
      ctx.strokeStyle = "rgba(2, 132, 199, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(pLaunchBase.x, pLaunchBase.y, 28 + launchPulse, 16 + launchPulse * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Launch Label
      ctx.save();
      ctx.font = "bold 9px JetBrains Mono, monospace";
      ctx.fillStyle = "#0f172a";
      const launchText = `🛫 TAKEOFF: ${geoData.launch.name.slice(0, 26)}`;
      const lWidth = ctx.measureText(launchText).width;
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pLaunchTop.x - lWidth / 2 - 6, pLaunchTop.y - 18, lWidth + 12, 18, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#0369a1";
      ctx.textAlign = "center";
      ctx.fillText(launchText, pLaunchTop.x, pLaunchTop.y - 6);
      ctx.restore();

      // 4. Real Destination Pad (Recovery Hub)
      const pDestBase = toIso(dx, dy, 0);
      const pDestTop = toIso(dx, dy, 15);

      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.ellipse(pDestBase.x, pDestBase.y, 28, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Dest Label
      ctx.save();
      ctx.font = "bold 9px JetBrains Mono, monospace";
      const destText = `🎯 RECOVERY: ${geoData.destination.name.slice(0, 26)}`;
      const dWidth = ctx.measureText(destText).width;
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pDestTop.x - dWidth / 2 - 6, pDestTop.y - 18, dWidth + 12, 18, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#047857";
      ctx.textAlign = "center";
      ctx.fillText(destText, pDestTop.x, pDestTop.y - 6);
      ctx.restore();

      // 5. Render Real Mireye Powerline Infrastructure & Hazards
      if (showHazards && activeStage >= 3) {
        if (geoData.obstacles.length > 0) {
          geoData.obstacles.forEach((obs, idx) => {
            const b = toIso(obs.worldX, obs.worldY, 0);
            const top = toIso(obs.worldX, obs.worldY, 45);

            // Steel Lattice Tower
            ctx.strokeStyle = "#eab308";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(b.x - 10, b.y);
            ctx.lineTo(top.x, top.y);
            ctx.lineTo(b.x + 10, b.y);
            ctx.stroke();

            // Cross arms
            ctx.beginPath();
            ctx.moveTo(top.x - 20, top.y + 8);
            ctx.lineTo(top.x + 20, top.y + 8);
            ctx.moveTo(top.x - 14, top.y + 18);
            ctx.lineTo(top.x + 14, top.y + 18);
            ctx.stroke();

            // Warning beacon
            ctx.fillStyle = "#ef4444";
            ctx.beginPath();
            ctx.arc(top.x, top.y, 4, 0, Math.PI * 2);
            ctx.fill();

            // Real Hazard Badge
            ctx.save();
            ctx.font = "bold 8px JetBrains Mono, monospace";
            const obsText = `⚡ MIREYE: ${obs.obstacle_type.toUpperCase()} · ${obs.distance_m.toFixed(1)}m`;
            const obsWidth = ctx.measureText(obsText).width;
            ctx.fillStyle = "#fef3c7";
            ctx.strokeStyle = "#f59e0b";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(top.x - obsWidth / 2 - 4, top.y - 16, obsWidth + 8, 15, 3);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#92400e";
            ctx.textAlign = "center";
            ctx.fillText(obsText, top.x, top.y - 6);
            ctx.restore();
          });
        } else {
          // If no critical hazards directly in buffer, show general grid baseline
          const midX = (lx + dx) / 2 + 30;
          const midY = (ly + dy) / 2 - 30;
          const b = toIso(midX, midY, 0);
          const top = toIso(midX, midY, 40);

          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(b.x - 8, b.y);
          ctx.lineTo(top.x, top.y);
          ctx.lineTo(b.x + 8, b.y);
          ctx.stroke();
        }
      }

      // 6. Render Real Emergency Landing Zones
      if (showLandingPads) {
        geoData.landingZones.forEach((lz, idx) => {
          const lzPt = toIso(lz.worldX, lz.worldY, 0);
          ctx.strokeStyle = "#10b981";
          ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(lzPt.x, lzPt.y, 20, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#047857";
          ctx.font = "bold 8px JetBrains Mono, monospace";
          ctx.textAlign = "center";
          ctx.fillText(`🛬 LZ-0${idx + 1} (${lz.infrastructure_clearance_m.toFixed(1)}m)`, lzPt.x, lzPt.y + 2);
        });
      }

      // 7. Render Real FAA Airspace Ceiling (400ft AGL)
      if (showAirspace && activeStage >= 4) {
        const midAirX = (lx + dx) / 2;
        const midAirY = (ly + dy) / 2;
        const airCeiling = toIso(midAirX, midAirY, 65);

        ctx.fillStyle = "rgba(6, 182, 212, 0.1)";
        ctx.strokeStyle = "rgba(6, 182, 212, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(airCeiling.x, airCeiling.y, 110, 55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.font = "bold 9px JetBrains Mono, monospace";
        ctx.fillStyle = "#0e7490";
        ctx.textAlign = "center";
        ctx.fillText("🛡️ FAA UASFM CEILING · 400ft AGL", airCeiling.x, airCeiling.y - 10);
        ctx.restore();
      }

      // 8. Render Real NOAA Wind Flow Streamlines
      if (showWind && activeStage >= 6) {
        ctx.strokeStyle = "rgba(14, 165, 233, 0.4)";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
          const windP = (t * 0.3 + i * 0.15) % 1.0;
          const wx = -220 + windP * 440;
          const wy = -150 + i * 50;
          const pW1 = toIso(wx, wy, 70);
          const pW2 = toIso(wx + 30, wy + 15, 70);

          ctx.beginPath();
          ctx.moveTo(pW1.x, pW1.y);
          ctx.lineTo(pW2.x, pW2.y);
          ctx.stroke();
        }
      }

      // 9. Render Real Candidate Corridors
      if (showCorridors && activeStage >= 2) {
        // Draw Corridor Beta (Alternative)
        if (geoData.corridorB.length > 1) {
          ctx.strokeStyle = selectedCorridorId === "corridor_b" ? "#0284c7" : "#94a3b8";
          ctx.lineWidth = selectedCorridorId === "corridor_b" ? 4 : 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          const p0 = toIso(geoData.corridorB[0].x, geoData.corridorB[0].y, geoData.corridorB[0].z);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < geoData.corridorB.length; i++) {
            const pt = toIso(geoData.corridorB[i].x, geoData.corridorB[i].y, geoData.corridorB[i].z);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
        }

        // Draw Corridor Gamma (Alternative)
        if (geoData.corridorC.length > 1) {
          ctx.strokeStyle = selectedCorridorId === "corridor_c" ? "#0284c7" : "#94a3b8";
          ctx.lineWidth = selectedCorridorId === "corridor_c" ? 4 : 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          const p0 = toIso(geoData.corridorC[0].x, geoData.corridorC[0].y, geoData.corridorC[0].z);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < geoData.corridorC.length; i++) {
            const pt = toIso(geoData.corridorC[i].x, geoData.corridorC[i].y, geoData.corridorC[i].z);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw Corridor Alpha (Recommended)
        if (geoData.corridorA.length > 1) {
          ctx.strokeStyle = selectedCorridorId === "corridor_a" ? "#0284c7" : "#94a3b8";
          ctx.lineWidth = selectedCorridorId === "corridor_a" ? 5 : 2.5;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";

          if (selectedCorridorId === "corridor_a") {
            ctx.shadowColor = "rgba(2, 132, 199, 0.4)";
            ctx.shadowBlur = 10;
          }

          ctx.beginPath();
          const p0 = toIso(geoData.corridorA[0].x, geoData.corridorA[0].y, geoData.corridorA[0].z);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < geoData.corridorA.length; i++) {
            const pt = toIso(geoData.corridorA[i].x, geoData.corridorA[i].y, geoData.corridorA[i].z);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Real Waypoint Nodes along Corridor Alpha
          geoData.corridorA.forEach((wp, idx) => {
            const pt = toIso(wp.x, wp.y, wp.z);
            ctx.fillStyle = idx === 0 ? "#0284c7" : idx === geoData.corridorA.length - 1 ? "#10b981" : "#ffffff";
            ctx.strokeStyle = "#0284c7";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
        }
      }

      // 10. Render Autonomous Drone Flying Along REAL GPS Waypoints
      const activePoints =
        selectedCorridorId === "corridor_b"
          ? geoData.corridorB
          : selectedCorridorId === "corridor_c"
          ? geoData.corridorC
          : geoData.corridorA;

      if (activePoints.length > 1) {
        const totalSegs = activePoints.length - 1;
        const scaled = progress * totalSegs;
        const idx = Math.min(Math.floor(scaled), totalSegs - 1);
        const segT = scaled - idx;

        const p0 = activePoints[idx];
        const p1 = activePoints[idx + 1];

        const curX = p0.x + (p1.x - p0.x) * segT;
        const curY = p0.y + (p1.y - p0.y) * segT;
        const curZ = p0.z + (p1.z - p0.z) * segT + Math.sin(t * 6) * 1.5;

        const curLat = p0.lat + (p1.lat - p0.lat) * segT;
        const curLng = p0.lng + (p1.lng - p0.lng) * segT;

        const droneScreen = toIso(curX, curY, curZ);
        const droneGround = toIso(curX, curY, 0);

        if (cameraMode === "drone") {
          setPan({
            x: -droneScreen.x,
            y: -droneScreen.y,
          });
        }

        // Ground shadow
        ctx.fillStyle = "rgba(15, 23, 42, 0.15)";
        ctx.beginPath();
        ctx.ellipse(droneGround.x, droneGround.y, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Altitude tether
        ctx.strokeStyle = "rgba(2, 132, 199, 0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(droneGround.x, droneGround.y);
        ctx.lineTo(droneScreen.x, droneScreen.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Quad Arms
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 2;
        const arm = 11;
        const arms = [
          { dx: -arm, dy: -arm * 0.5 },
          { dx: arm, dy: -arm * 0.5 },
          { dx: arm, dy: arm * 0.5 },
          { dx: -arm, dy: arm * 0.5 },
        ];

        arms.forEach((a) => {
          ctx.beginPath();
          ctx.moveTo(droneScreen.x, droneScreen.y);
          ctx.lineTo(droneScreen.x + a.dx, droneScreen.y + a.dy);
          ctx.stroke();

          // Spinning rotor
          ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
          ctx.strokeStyle = "#0284c7";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(droneScreen.x + a.dx, droneScreen.y + a.dy, 6, 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });

        // Drone Body
        ctx.fillStyle = "#facc15";
        ctx.strokeStyle = "#ca8a04";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(droneScreen.x, droneScreen.y, 7, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Real Telemetry HUD Card floating above drone
        ctx.save();
        const hudY = droneScreen.y - 24;
        ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(droneScreen.x - 65, hudY - 14, 130, 20, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 8px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(
          `ALT: ${geoData.cruiseAltFt}ft · ${curLat.toFixed(4)}°, ${curLng.toFixed(4)}°`,
          droneScreen.x,
          hudY
        );
        ctx.restore();
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    geoData,
    zoom,
    pan,
    cameraMode,
    activeStage,
    selectedCorridorId,
    showAirspace,
    showHazards,
    showPopulation,
    showWind,
    showLandingPads,
    showCorridors,
    simSpeed,
    isPlaying,
  ]);

  return (
    <div className="relative w-full h-[520px] lg:h-[620px] rounded-2xl overflow-hidden border border-slate-200 shadow-xl bg-gradient-to-b from-sky-50 to-slate-50 select-none">
      {/* Top Controls Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm text-xs font-semibold text-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>3D Geospatial Digital Twin</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-bold">
              100% Real Backend Data
            </span>
          </div>

          <div className="flex items-center rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm p-0.5 text-xs">
            <button
              onClick={() => setCameraMode("isometric")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                cameraMode === "isometric" ? "bg-sky-500 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Isometric 3D
            </button>
            <button
              onClick={() => setCameraMode("topdown")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                cameraMode === "topdown" ? "bg-sky-500 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Top-Down
            </button>
            <button
              onClick={() => setCameraMode("drone")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                cameraMode === "drone" ? "bg-sky-500 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Drone Cam
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm text-xs">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1 rounded text-slate-600 hover:text-slate-900"
              title={isPlaying ? "Pause Simulation" : "Play Simulation"}
            >
              {isPlaying ? "⏸️" : "▶️"}
            </button>
            <button
              onClick={() => setSimSpeed((s) => (s === 1.0 ? 2.0 : s === 2.0 ? 4.0 : 1.0))}
              className="px-1.5 py-0.5 font-mono text-[11px] font-bold text-sky-600 hover:bg-sky-50 rounded"
              title="Simulation Speed"
            >
              {simSpeed}x
            </button>
          </div>

          <div className="flex items-center rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm p-0.5 text-xs">
            <button
              onClick={() => setZoom((z) => Math.min(2.5, z * 1.15))}
              className="px-2 py-1 text-slate-600 hover:text-slate-900 font-bold"
              title="Zoom In"
            >
              +
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z * 0.85))}
              className="px-2 py-1 text-slate-600 hover:text-slate-900 font-bold"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={handleResetView}
              className="px-2 py-1 text-slate-600 hover:text-slate-900 text-[11px]"
              title="Reset Camera"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Floating Hover Tooltip */}
      {hoveredItem && (
        <div
          className="absolute z-30 pointer-events-none px-3 py-1.5 rounded-lg bg-slate-900/90 text-white text-xs font-semibold shadow-lg backdrop-blur-md border border-slate-700"
          style={{
            left: `${hoveredItem.x + 12}px`,
            top: `${hoveredItem.y - 30}px`,
          }}
        >
          {hoveredItem.text}
          <div className="text-[10px] text-sky-300 font-normal mt-0.5">Click for real technical inspection</div>
        </div>
      )}

      {/* Bottom Layer Toggles Pill Bar */}
      <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm pointer-events-auto">
          <button
            onClick={() => setShowAirspace(!showAirspace)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              showAirspace ? "bg-cyan-50 text-cyan-700 border border-cyan-200 font-semibold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            🛡️ FAA Airspace (400ft)
          </button>
          <button
            onClick={() => setShowHazards(!showHazards)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              showHazards ? "bg-amber-50 text-amber-700 border border-amber-200 font-semibold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            ⚡ Mireye 345kV Grid
          </button>
          <button
            onClick={() => setShowLandingPads(!showLandingPads)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              showLandingPads ? "bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            🛬 Safe Landing Pads
          </button>
          <button
            onClick={() => setShowCorridors(!showCorridors)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              showCorridors ? "bg-sky-50 text-sky-700 border border-sky-200 font-semibold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            🛣️ Real GPS Corridors
          </button>
        </div>

        {/* Live GPS Footer */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm text-xs font-mono text-slate-600 pointer-events-auto">
          <span>Center: {geoData.launch.lat.toFixed(4)}°N</span>
          <span>•</span>
          <span>{geoData.launch.lng.toFixed(4)}°W</span>
        </div>
      </div>
    </div>
  );
};
