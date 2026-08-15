import React, { useEffect, useRef, useState, useMemo } from "react";
import type { AnalysisResult, ObstacleRisk, LandingZone } from "../types/airlane";

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
  isHeroBackground?: boolean;
}

export const MiniatureCityCanvas: React.FC<MiniatureCityCanvasProps> = ({
  analysisResult,
  activeStage = 8,
  selectedCorridorId = "corridor_a",
  onSelectObject,
  isInteractive = true,
  isHeroBackground = false,
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
  const [showLandingPads, setShowLandingPads] = useState<boolean>(true);
  const [showCorridors, setShowCorridors] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(1.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  // Hovered item tooltip
  const [hoveredItem, setHoveredItem] = useState<{ x: number; y: number; text: string } | null>(null);

  // Simulation time
  const simTimeRef = useRef<number>(0);
  const drone1ProgressRef = useRef<number>(0.1);
  const drone2ProgressRef = useRef<number>(0.5);
  const drone3ProgressRef = useRef<number>(0.0);

  // -------------------------------------------------------------
  // REAL GEOSPATIAL PROJECTION ENGINE
  // Converts real GPS lat/lng from backend into 3D isometric space
  // -------------------------------------------------------------
  const geoData = useMemo(() => {
    const launchLat = analysisResult?.launch?.lat ?? 37.4172;
    const launchLng = analysisResult?.launch?.lng ?? -122.1084;
    const destLat = analysisResult?.destination?.lat ?? 37.4481;
    const destLng = analysisResult?.destination?.lng ?? -122.1063;

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

    const metersPerLat = 111132;
    const metersPerLng = 111132 * Math.cos((centerLat * Math.PI) / 180);

    const totalMetersX = lngSpan * metersPerLng;
    const totalMetersY = latSpan * metersPerLat;
    const maxDimensionMeters = Math.max(totalMetersX, totalMetersY, 2000);

    const worldScale = 460 / maxDimensionMeters;

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

    const launchWorld = toWorldCoords(launchLat, launchLng, 0);
    const destWorld = toWorldCoords(destLat, destLng, 0);

    const projectCorridor = (corrId: string) => {
      const corrData = analysisResult?.corridors?.find((c) => c.id === corrId);
      if (corrData?.sample_points && corrData.sample_points.length > 0) {
        return corrData.sample_points.map((pt) => {
          const w = toWorldCoords(pt.lat, pt.lng, analysisResult?.parameters?.cruise_altitude_ft || 300);
          return { ...w, sample_index: pt.index, dist_m: pt.distance_from_start_m };
        });
      }

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

      // Default Corridor A with waypoint curvature
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

    const projectedObstacles = allObstacles.map((obs) => {
      const w = toWorldCoords(obs.lat, obs.lng, 0);
      return {
        ...obs,
        worldX: w.x,
        worldY: w.y,
      };
    });

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
        name: analysisResult?.launch?.normalized_address || analysisResult?.launch?.input || "Launch Pad",
        lat: launchLat,
        lng: launchLng,
      },
      destination: {
        ...destWorld,
        name: analysisResult?.destination?.normalized_address || analysisResult?.destination?.input || "Recovery Hub",
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

  // Static Miniature City Scenery (Silicon Valley campuses, buildings, trees, infrastructure)
  const cityFeatures = useMemo(() => {
    const buildings = [
      // Silicon Valley Central Campuses
      { x: -140, y: -90, w: 55, h: 42, height: 32, type: "campus", color: "#e2e8f0", roof: "#cbd5e1", label: "RESEARCH QUAD" },
      { x: -70, y: -130, w: 45, h: 45, height: 48, type: "tower", color: "#93c5fd", roof: "#3b82f6", label: "INNOVATION TOWER" },
      { x: 20, y: -110, w: 60, h: 36, height: 26, type: "campus", color: "#f1f5f9", roof: "#94a3b8", label: "LABS" },
      { x: 110, y: -80, w: 40, h: 40, height: 40, type: "tower", color: "#bae6fd", roof: "#0284c7", label: "AVIONICS HUB" },
      { x: -160, y: 50, w: 50, h: 35, height: 22, type: "hangar", color: "#e2e8f0", roof: "#64748b", label: "FLIGHT HANGAR" },
      { x: -40, y: 80, w: 36, h: 36, height: 18, type: "substation", color: "#fef08a", roof: "#eab308", label: "GRID SUBSTATION" },
      { x: 70, y: 60, w: 52, h: 38, height: 28, type: "campus", color: "#f8fafc", roof: "#cbd5e1", label: "DATA CENTER" },
      { x: 140, y: 30, w: 42, h: 42, height: 36, type: "tower", color: "#e0e7ff", roof: "#6366f1", label: "TECH COMMONS" },
    ];

    const trees = [
      { x: -180, y: -120, r: 9, h: 14 },
      { x: -165, y: -140, r: 7, h: 12 },
      { x: -110, y: -160, r: 8, h: 13 },
      { x: -20, y: -160, r: 10, h: 15 },
      { x: 70, y: -150, r: 8, h: 13 },
      { x: 150, y: -130, r: 9, h: 14 },
      { x: -190, y: 10, r: 8, h: 13 },
      { x: -120, y: 20, r: 7, h: 11 },
      { x: -80, y: 40, r: 9, h: 14 },
      { x: 20, y: 30, r: 8, h: 12 },
      { x: 120, y: 120, r: 10, h: 15 },
      { x: 160, y: 90, r: 8, h: 13 },
      { x: -90, y: 130, r: 9, h: 14 },
      { x: 30, y: 130, r: 7, h: 12 },
    ];

    const powerTowers = [
      { x: -80, y: 20, height: 50, label: "345kV TOWER #1" },
      { x: -20, y: 0, height: 50, label: "345kV TOWER #2" },
      { x: 40, y: -20, height: 50, label: "345kV TOWER #3" },
    ];

    return { buildings, trees, powerTowers };
  }, []);

  const handleResetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setCameraMode("isometric");
  };

  // Canvas Mouse & Interaction Handlers
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
    if (Math.hypot(mouseX - pLaunch.x, mouseY - pLaunch.y) < 32) {
      setHoveredItem({ x: mouseX, y: mouseY, text: `TAKEOFF HUB: ${geoData.launch.name}` });
      canvas.style.cursor = "pointer";
      return;
    }

    // Check hit test on Destination
    const pDest = toIsoLocal(geoData.destination.x, geoData.destination.y, 10);
    if (Math.hypot(mouseX - pDest.x, mouseY - pDest.y) < 32) {
      setHoveredItem({ x: mouseX, y: mouseY, text: `RECOVERY HUB: ${geoData.destination.name}` });
      canvas.style.cursor = "pointer";
      return;
    }

    // Check hit test on Obstacles
    for (const obs of geoData.obstacles) {
      const pObs = toIsoLocal(obs.worldX, obs.worldY, 35);
      if (Math.hypot(mouseX - pObs.x, mouseY - pObs.y) < 30) {
        setHoveredItem({
          x: mouseX,
          y: mouseY,
          text: `⚡ ${obs.obstacle_type.toUpperCase()} · ${obs.distance_m.toFixed(1)}m CLEARANCE`,
        });
        canvas.style.cursor = "pointer";
        return;
      }
    }

    // Check hit test on Landing Zones
    for (const lz of geoData.landingZones) {
      const pLz = toIsoLocal(lz.worldX, lz.worldY, 0);
      if (Math.hypot(mouseX - pLz.x, mouseY - pLz.y) < 28) {
        setHoveredItem({
          x: mouseX,
          y: mouseY,
          text: `EMERGENCY LANDING ZONE (${lz.infrastructure_clearance_m.toFixed(1)}m CLEARANCE)`,
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
    setZoom((prev) => Math.max(0.5, Math.min(2.8, prev * zoomFactor)));
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

    // 1. Launch
    const pLaunch = toIsoLocal(geoData.launch.x, geoData.launch.y, 10);
    if (Math.hypot(mouseX - pLaunch.x, mouseY - pLaunch.y) < 35) {
      onSelectObject({
        type: "launch",
        title: "Takeoff Origin Pad",
        subtitle: geoData.launch.name,
        source: "Geocoded Mission Origin",
        metrics: [
          { label: "LATITUDE", value: `${geoData.launch.lat.toFixed(5)}° N`, highlight: true },
          { label: "LONGITUDE", value: `${geoData.launch.lng.toFixed(5)}° W`, highlight: true },
          { label: "PAD STATUS", value: "Verified Active" },
          { label: "INITIAL CLIMB", value: "300 FT AGL" },
        ],
        description: "Initial departure hub. Verified clear of immediate wire entanglements and aligned with FAA Part 108 corridor egress standards.",
        coordinates: { lat: geoData.launch.lat, lng: geoData.launch.lng },
      });
      return;
    }

    // 2. Destination
    const pDest = toIsoLocal(geoData.destination.x, geoData.destination.y, 10);
    if (Math.hypot(mouseX - pDest.x, mouseY - pDest.y) < 35) {
      onSelectObject({
        type: "destination",
        title: "Recovery Hub Pad",
        subtitle: geoData.destination.name,
        source: "Geocoded Mission Destination",
        metrics: [
          { label: "LATITUDE", value: `${geoData.destination.lat.toFixed(5)}° N`, highlight: true },
          { label: "LONGITUDE", value: `${geoData.destination.lng.toFixed(5)}° W`, highlight: true },
          { label: "RECOVERY PAD", value: "Clear & Operational" },
          { label: "APPROACH ANGLE", value: "3.5° Standard" },
        ],
        description: "Terminal recovery waypoint. Evaluated for ground clearance and minimum obstacle conflict zones.",
        coordinates: { lat: geoData.destination.lat, lng: geoData.destination.lng },
      });
      return;
    }

    // 3. Mireye Obstacles
    for (const obs of geoData.obstacles) {
      const pObs = toIsoLocal(obs.worldX, obs.worldY, 35);
      if (Math.hypot(mouseX - pObs.x, mouseY - pObs.y) < 35) {
        onSelectObject({
          type: "hazard",
          title: `Infrastructure Hazard: ${obs.obstacle_type}`,
          subtitle: `Distance to Flight Path: ${obs.distance_m.toFixed(1)}m`,
          source: obs.source || "Mireye Earth API",
          metrics: [
            { label: "LATERAL CLEARANCE", value: `${obs.distance_m.toFixed(1)} m`, highlight: true },
            { label: "GRID VOLTAGE", value: obs.voltage_kv ? `${obs.voltage_kv} kV` : "345 kV", highlight: true },
            { label: "SEVERITY", value: obs.severity },
            { label: "MITIGATION", value: obs.clearance_status || "Detour Enforced" },
          ],
          description: obs.description || "Real-world electrical transmission line verified via Mireye Earth API. Safe lateral buffer enforced.",
          coordinates: { lat: obs.lat, lng: obs.lng },
        });
        return;
      }
    }

    // 4. Landing Zones
    for (const lz of geoData.landingZones) {
      const pLz = toIsoLocal(lz.worldX, lz.worldY, 0);
      if (Math.hypot(mouseX - pLz.x, mouseY - pLz.y) < 30) {
        onSelectObject({
          type: "landing_zone",
          title: "Designated Emergency Landing Zone",
          subtitle: lz.description || "Part 108 Safe Abort Clearing",
          source: lz.source || "Airlane BVLOS Terrain Engine",
          metrics: [
            { label: "CLEARANCE RADIUS", value: `${lz.infrastructure_clearance_m.toFixed(1)} m`, highlight: true },
            { label: "TERRAIN SLOPE", value: `${lz.slope_degrees.toFixed(1)}°`, highlight: true },
            { label: "CORRIDOR DISTANCE", value: `${lz.distance_along_route_miles.toFixed(2)} mi` },
            { label: "ELEVATION", value: `${lz.elevation_m.toFixed(1)} m` },
          ],
          description: "Emergency abort site identified with low slope and verified zero wire/building obstructions.",
          coordinates: { lat: lz.lat, lng: lz.lng },
        });
        return;
      }
    }

    onSelectObject(null);
  };

  // Render Loop (60 FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      if (isPlaying) {
        simTimeRef.current += 0.016 * simSpeed;
        drone1ProgressRef.current = (drone1ProgressRef.current + 0.001 * simSpeed) % 1.0;
        drone2ProgressRef.current = (drone2ProgressRef.current + 0.0008 * simSpeed) % 1.0;
        drone3ProgressRef.current = (drone3ProgressRef.current + 0.0012 * simSpeed) % 1.0;
      }
      const t = simTimeRef.current;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * window.devicePixelRatio || canvas.height !== height * window.devicePixelRatio) {
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
      }

      ctx.save();
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx.clearRect(0, 0, width, height);

      // Warm, subtle blueprint sky/terrain background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, "#f8fafc");
      bgGrad.addColorStop(0.5, "#f1f5f9");
      bgGrad.addColorStop(1, "#e2e8f0");
      ctx.fillStyle = bgGrad;
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

      // 1. Terrain Ground Base (Warm Neutral / Pale Architectural Green)
      const groundRadius = 340;
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
      ctx.fillStyle = "#eef4f0";
      ctx.fill();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Topographic Blueprint Grid Lines
      ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
      ctx.lineWidth = 1;
      for (let i = -groundRadius; i <= groundRadius; i += 48) {
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

      // Engineering Coordinate Crosshairs
      const crossPoints = [
        { x: -200, y: -200 }, { x: 0, y: -200 }, { x: 200, y: -200 },
        { x: -200, y: 0 }, { x: 200, y: 0 },
        { x: -200, y: 200 }, { x: 0, y: 200 }, { x: 200, y: 200 }
      ];
      ctx.strokeStyle = "rgba(100, 116, 139, 0.35)";
      ctx.lineWidth = 1;
      crossPoints.forEach((cp) => {
        const pt = toIso(cp.x, cp.y, 0);
        ctx.beginPath();
        ctx.moveTo(pt.x - 4, pt.y);
        ctx.lineTo(pt.x + 4, pt.y);
        ctx.moveTo(pt.x, pt.y - 4);
        ctx.lineTo(pt.x, pt.y + 4);
        ctx.stroke();
      });

      // 2. Procedural Silicon Valley Campus Buildings
      cityFeatures.buildings.forEach((b) => {
        const p0 = toIso(b.x - b.w / 2, b.y - b.h / 2, 0);
        const p1 = toIso(b.x + b.w / 2, b.y - b.h / 2, 0);
        const p2 = toIso(b.x + b.w / 2, b.y + b.h / 2, 0);
        const p3 = toIso(b.x - b.w / 2, b.y + b.h / 2, 0);

        const t0 = toIso(b.x - b.w / 2, b.y - b.h / 2, b.height);
        const t1 = toIso(b.x + b.w / 2, b.y - b.h / 2, b.height);
        const t2 = toIso(b.x + b.w / 2, b.y + b.h / 2, b.height);
        const t3 = toIso(b.x - b.w / 2, b.y + b.h / 2, b.height);

        // Building Shadow
        ctx.fillStyle = "rgba(15, 23, 42, 0.08)";
        ctx.beginPath();
        ctx.moveTo(p0.x + b.height * 0.4, p0.y + b.height * 0.3);
        ctx.lineTo(p1.x + b.height * 0.4, p1.y + b.height * 0.3);
        ctx.lineTo(p2.x + b.height * 0.4, p2.y + b.height * 0.3);
        ctx.lineTo(p3.x + b.height * 0.4, p3.y + b.height * 0.3);
        ctx.closePath();
        ctx.fill();

        // Right Wall
        ctx.fillStyle = "#94a3b8";
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(t1.x, t1.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(15, 23, 42, 0.15)";
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Left Wall
        ctx.fillStyle = "#cbd5e1";
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.lineTo(t3.x, t3.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Roof
        ctx.fillStyle = b.roof;
        ctx.beginPath();
        ctx.moveTo(t0.x, t0.y);
        ctx.lineTo(t1.x, t1.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.lineTo(t3.x, t3.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Architectural details (Helipad / HVAC / Solar on roofs)
        if (b.type === "tower") {
          const rCenter = toIso(b.x, b.y, b.height);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(rCenter.x, rCenter.y, 8, 4, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.font = "bold 6px JetBrains Mono, monospace";
          ctx.textAlign = "center";
          ctx.fillText("H", rCenter.x, rCenter.y + 2);
        }
      });

      // 3. Silicon Valley Trees & Landscaping
      cityFeatures.trees.forEach((tr) => {
        const tb = toIso(tr.x, tr.y, 0);
        const tt = toIso(tr.x, tr.y, tr.h);

        // Trunk
        ctx.strokeStyle = "#78716c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tb.x, tb.y);
        ctx.lineTo(tt.x, tt.y);
        ctx.stroke();

        // Foliage Crown
        ctx.fillStyle = "#15803d";
        ctx.beginPath();
        ctx.ellipse(tt.x, tt.y, tr.r, tr.r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#166534";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      });

      // 4. Powerline Infrastructure & Transmission Towers
      if (showHazards) {
        cityFeatures.powerTowers.forEach((pt, idx) => {
          const pb = toIso(pt.x, pt.y, 0);
          const ptop = toIso(pt.x, pt.y, pt.height);

          // Tower Lattice
          ctx.strokeStyle = "#eab308";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pb.x - 8, pb.y);
          ctx.lineTo(ptop.x, ptop.y);
          ctx.lineTo(pb.x + 8, pb.y);
          ctx.stroke();

          // Cross arms
          ctx.beginPath();
          ctx.moveTo(ptop.x - 16, ptop.y + 6);
          ctx.lineTo(ptop.x + 16, ptop.y + 6);
          ctx.moveTo(ptop.x - 12, ptop.y + 14);
          ctx.lineTo(ptop.x + 12, ptop.y + 14);
          ctx.stroke();

          // Red Hazard Beacon
          ctx.fillStyle = "#ef4444";
          ctx.beginPath();
          ctx.arc(ptop.x, ptop.y, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Connect cables between towers
          if (idx < cityFeatures.powerTowers.length - 1) {
            const nextTower = cityFeatures.powerTowers[idx + 1];
            const nextTop = toIso(nextTower.x, nextTower.y, nextTower.height);
            ctx.strokeStyle = "rgba(234, 179, 8, 0.7)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ptop.x - 14, ptop.y + 6);
            ctx.quadraticCurveTo((ptop.x + nextTop.x) / 2, (ptop.y + nextTop.y) / 2 + 6, nextTop.x - 14, nextTop.y + 6);
            ctx.stroke();
          }
        });
      }

      // 5. Connecting Surface Roads & Runway
      const lx = geoData.launch.x;
      const ly = geoData.launch.y;
      const dx = geoData.destination.x;
      const dy = geoData.destination.y;

      const pRoadStart = toIso(lx, ly, 0);
      const pRoadEnd = toIso(dx, dy, 0);

      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pRoadStart.x, pRoadStart.y);
      ctx.lineTo(pRoadEnd.x, pRoadEnd.y);
      ctx.stroke();

      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pRoadStart.x, pRoadStart.y);
      ctx.lineTo(pRoadEnd.x, pRoadEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 6. Launch Origin Hub
      const pLaunchBase = toIso(lx, ly, 0);
      const pLaunchTop = toIso(lx, ly, 12);

      ctx.fillStyle = "#0284c7";
      ctx.beginPath();
      ctx.ellipse(pLaunchBase.x, pLaunchBase.y, 22, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Launch Label
      ctx.save();
      ctx.font = "bold 8.5px JetBrains Mono, monospace";
      const launchText = `TAKEOFF: ${geoData.launch.name.slice(0, 22)}`;
      const lWidth = ctx.measureText(launchText).width;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pLaunchTop.x - lWidth / 2 - 4, pLaunchTop.y - 14, lWidth + 8, 14, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#0284c7";
      ctx.textAlign = "center";
      ctx.fillText(launchText, pLaunchTop.x, pLaunchTop.y - 4);
      ctx.restore();

      // 7. Destination Hub
      const pDestBase = toIso(dx, dy, 0);
      const pDestTop = toIso(dx, dy, 12);

      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.ellipse(pDestBase.x, pDestBase.y, 22, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Dest Label
      ctx.save();
      ctx.font = "bold 8.5px JetBrains Mono, monospace";
      const destText = `RECOVERY: ${geoData.destination.name.slice(0, 22)}`;
      const dWidth = ctx.measureText(destText).width;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pDestTop.x - dWidth / 2 - 4, pDestTop.y - 14, dWidth + 8, 14, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#047857";
      ctx.textAlign = "center";
      ctx.fillText(destText, pDestTop.x, pDestTop.y - 4);
      ctx.restore();

      // 8. Real Emergency Landing Zones
      if (showLandingPads) {
        geoData.landingZones.forEach((lz, idx) => {
          const lzPt = toIso(lz.worldX, lz.worldY, 0);
          ctx.strokeStyle = "#10b981";
          ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(lzPt.x, lzPt.y, 16, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#047857";
          ctx.font = "bold 7.5px JetBrains Mono, monospace";
          ctx.textAlign = "center";
          ctx.fillText(`LZ-0${idx + 1} (${lz.infrastructure_clearance_m.toFixed(0)}m)`, lzPt.x, lzPt.y + 2);
        });
      }

      // 9. FAA Airspace Ceiling (400ft AGL)
      if (showAirspace && activeStage >= 4) {
        const midAirX = (lx + dx) / 2;
        const midAirY = (ly + dy) / 2;
        const airCeiling = toIso(midAirX, midAirY, 60);

        ctx.fillStyle = "rgba(2, 132, 199, 0.05)";
        ctx.strokeStyle = "rgba(2, 132, 199, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.ellipse(airCeiling.x, airCeiling.y, 100, 50, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.save();
        ctx.font = "bold 8px JetBrains Mono, monospace";
        ctx.fillStyle = "#0369a1";
        ctx.textAlign = "center";
        ctx.fillText("FAA UASFM CEILING · 400 FT AGL", airCeiling.x, airCeiling.y - 8);
        ctx.restore();
      }

      // 10. Flight Corridors
      if (showCorridors && activeStage >= 2) {
        // Alternative Corridor Beta (Dashed Gray)
        if (geoData.corridorB.length > 1) {
          ctx.strokeStyle = selectedCorridorId === "corridor_b" ? "#0284c7" : "#94a3b8";
          ctx.lineWidth = selectedCorridorId === "corridor_b" ? 3 : 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          const p0 = toIso(geoData.corridorB[0].x, geoData.corridorB[0].y, geoData.corridorB[0].z);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < geoData.corridorB.length; i++) {
            const pt = toIso(geoData.corridorB[i].x, geoData.corridorB[i].y, geoData.corridorB[i].z);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Alternative Corridor Gamma (Dashed Gray)
        if (geoData.corridorC.length > 1) {
          ctx.strokeStyle = selectedCorridorId === "corridor_c" ? "#0284c7" : "#94a3b8";
          ctx.lineWidth = selectedCorridorId === "corridor_c" ? 3 : 1.5;
          ctx.setLineDash([4, 4]);
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

        // Recommended Corridor Alpha (Solid Airlane Blue with Glow)
        if (geoData.corridorA.length > 1) {
          // Glow layer
          ctx.strokeStyle = "rgba(2, 132, 199, 0.25)";
          ctx.lineWidth = 8;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          const p0Glow = toIso(geoData.corridorA[0].x, geoData.corridorA[0].y, geoData.corridorA[0].z);
          ctx.moveTo(p0Glow.x, p0Glow.y);
          for (let i = 1; i < geoData.corridorA.length; i++) {
            const pt = toIso(geoData.corridorA[i].x, geoData.corridorA[i].y, geoData.corridorA[i].z);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();

          // Main solid corridor line
          ctx.strokeStyle = "#0284c7";
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(p0Glow.x, p0Glow.y);
          for (let i = 1; i < geoData.corridorA.length; i++) {
            const pt = toIso(geoData.corridorA[i].x, geoData.corridorA[i].y, geoData.corridorA[i].z);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();

          // Waypoints
          geoData.corridorA.forEach((wp, idx) => {
            const pt = toIso(wp.x, wp.y, wp.z);
            ctx.fillStyle = idx === 0 ? "#0284c7" : idx === geoData.corridorA.length - 1 ? "#10b981" : "#ffffff";
            ctx.strokeStyle = "#0284c7";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
        }
      }

      // 11. MULTI-DRONE AUTONOMOUS VISUALIZATION
      // DRONE 1: Primary Corridor Drone
      if (geoData.corridorA.length > 1) {
        const progress1 = drone1ProgressRef.current;
        const totalSegs = geoData.corridorA.length - 1;
        const scaled = progress1 * totalSegs;
        const idx = Math.min(Math.floor(scaled), totalSegs - 1);
        const segT = scaled - idx;

        const p0 = geoData.corridorA[idx];
        const p1 = geoData.corridorA[idx + 1];

        const curX = p0.x + (p1.x - p0.x) * segT;
        const curY = p0.y + (p1.y - p0.y) * segT;
        const curZ = p0.z + (p1.z - p0.z) * segT + Math.sin(t * 5) * 1.5;

        const droneScreen = toIso(curX, curY, curZ);
        const droneGround = toIso(curX, curY, 0);

        // Ground shadow & altitude tether
        ctx.fillStyle = "rgba(15, 23, 42, 0.12)";
        ctx.beginPath();
        ctx.ellipse(droneGround.x, droneGround.y, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(2, 132, 199, 0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(droneGround.x, droneGround.y);
        ctx.lineTo(droneScreen.x, droneScreen.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Drone Quad Arms & Rotors
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 1.8;
        const arm = 9;
        [-arm, arm].forEach((dxArm) => {
          [-arm * 0.5, arm * 0.5].forEach((dyArm) => {
            ctx.beginPath();
            ctx.moveTo(droneScreen.x, droneScreen.y);
            ctx.lineTo(droneScreen.x + dxArm, droneScreen.y + dyArm);
            ctx.stroke();

            ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
            ctx.strokeStyle = "#0284c7";
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.ellipse(droneScreen.x + dxArm, droneScreen.y + dyArm, 4.5, 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
        });

        // Drone Core Body
        ctx.fillStyle = "#0284c7";
        ctx.strokeStyle = "#0369a1";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(droneScreen.x, droneScreen.y, 5.5, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Drone Telemetry Label
        ctx.save();
        const hudY = droneScreen.y - 18;
        ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.roundRect(droneScreen.x - 45, hudY - 11, 90, 15, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 7.5px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`AIRLANE · ${geoData.cruiseAltFt}FT AGL`, droneScreen.x, hudY - 1);
        ctx.restore();
      }

      // DRONE 2: Alternative Route Scout (Amber / Detour Patrol)
      if (geoData.corridorB.length > 1) {
        const progress2 = drone2ProgressRef.current;
        const totalSegs = geoData.corridorB.length - 1;
        const scaled = progress2 * totalSegs;
        const idx = Math.min(Math.floor(scaled), totalSegs - 1);
        const segT = scaled - idx;

        const p0 = geoData.corridorB[idx];
        const p1 = geoData.corridorB[idx + 1];

        const curX = p0.x + (p1.x - p0.x) * segT;
        const curY = p0.y + (p1.y - p0.y) * segT;
        const curZ = p0.z + (p1.z - p0.z) * segT;

        const droneScreen = toIso(curX, curY, curZ);

        ctx.fillStyle = "#64748b";
        ctx.beginPath();
        ctx.ellipse(droneScreen.x, droneScreen.y, 4, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // DRONE 3: Dynamic Obstacle Avoidance Demonstration
      // Smoothly approaches 345kV Tower hazard, detects risk, arcs around safely
      const d3T = (t * 0.15) % 1.0;
      const startX = -130;
      const startY = 60;
      const targetX = 80;
      const targetY = -40;

      // Hazard center at (-20, 0)
      const hazardX = -20;
      const hazardY = 0;
      const linearX = startX + (targetX - startX) * d3T;
      const linearY = startY + (targetY - startY) * d3T;

      // Calculate distance to hazard and dynamic repulsive detour
      const distToHazard = Math.hypot(linearX - hazardX, linearY - hazardY);
      const isAvoiding = distToHazard < 65;
      const detourOffset = isAvoiding ? (1 - distToHazard / 65) * 32 : 0;

      const d3X = linearX;
      const d3Y = linearY - detourOffset;
      const d3Z = 35 + Math.sin(t * 4) * 1.2;

      const pD3 = toIso(d3X, d3Y, d3Z);
      const pD3Ground = toIso(d3X, d3Y, 0);

      // Radar ping when actively avoiding hazard
      if (isAvoiding) {
        const pingRadius = (t * 20) % 25;
        ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(pD3.x, pD3.y, pingRadius, pingRadius * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.save();
        ctx.font = "bold 7px JetBrains Mono, monospace";
        ctx.fillStyle = "#ef4444";
        ctx.textAlign = "center";
        ctx.fillText("HAZARD AVOIDANCE VECTOR", pD3.x, pD3.y - 12);
        ctx.restore();
      }

      // Drone 3 body
      ctx.fillStyle = isAvoiding ? "#ef4444" : "#10b981";
      ctx.beginPath();
      ctx.ellipse(pD3.x, pD3.y, 4.5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    geoData,
    cityFeatures,
    zoom,
    pan,
    cameraMode,
    activeStage,
    selectedCorridorId,
    showAirspace,
    showHazards,
    showLandingPads,
    showCorridors,
    simSpeed,
    isPlaying,
  ]);

  return (
    <div
      className={`relative w-full ${
        isHeroBackground ? "h-[460px] lg:h-[540px]" : "h-[480px] lg:h-[580px]"
      } rounded-lg overflow-hidden border border-slate-200 shadow-xs bg-[#fbfbfa] select-none`}
    >
      {/* Top Controls Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/95 backdrop-blur-md border border-slate-200 text-xs font-semibold text-slate-800 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[11px]">3D Digital Twin</span>
            <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
              Live Systems
            </span>
          </div>

          <div className="flex items-center rounded-md bg-white/95 backdrop-blur-md border border-slate-200 p-0.5 text-xs shadow-xs">
            <button
              onClick={() => setCameraMode("isometric")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                cameraMode === "isometric" ? "bg-sky-600 text-white font-semibold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Isometric
            </button>
            <button
              onClick={() => setCameraMode("topdown")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                cameraMode === "topdown" ? "bg-sky-600 text-white font-semibold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Top-Down
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center rounded-md bg-white/95 backdrop-blur-md border border-slate-200 p-0.5 text-xs shadow-xs">
            <button
              onClick={() => setZoom((z) => Math.min(2.5, z * 1.15))}
              className="px-2 py-0.5 text-slate-600 hover:text-slate-900 font-bold"
              title="Zoom In"
            >
              +
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z * 0.85))}
              className="px-2 py-0.5 text-slate-600 hover:text-slate-900 font-bold"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={handleResetView}
              className="px-2 py-0.5 text-slate-500 hover:text-slate-900 text-[10px] font-mono"
              title="Reset Camera"
            >
              RESET
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
          className="absolute z-30 pointer-events-none px-2.5 py-1 rounded bg-slate-900 text-white text-[11px] font-mono shadow-md border border-slate-700"
          style={{
            left: `${hoveredItem.x + 10}px`,
            top: `${hoveredItem.y - 28}px`,
          }}
        >
          {hoveredItem.text}
        </div>
      )}

      {/* Bottom Layer Toggles */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-md bg-white/95 backdrop-blur-md border border-slate-200 shadow-xs pointer-events-auto text-[11px] font-mono">
          <button
            onClick={() => setShowAirspace(!showAirspace)}
            className={`px-2 py-0.5 rounded transition-colors ${
              showAirspace ? "bg-sky-50 text-sky-800 border border-sky-200 font-semibold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            FAA 400FT
          </button>
          <button
            onClick={() => setShowHazards(!showHazards)}
            className={`px-2 py-0.5 rounded transition-colors ${
              showHazards ? "bg-amber-50 text-amber-800 border border-amber-200 font-semibold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            345kV GRID
          </button>
          <button
            onClick={() => setShowLandingPads(!showLandingPads)}
            className={`px-2 py-0.5 rounded transition-colors ${
              showLandingPads ? "bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            LANDING PADS
          </button>
          <button
            onClick={() => setShowCorridors(!showCorridors)}
            className={`px-2 py-0.5 rounded transition-colors ${
              showCorridors ? "bg-sky-50 text-sky-800 border border-sky-200 font-semibold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            GPS CORRIDORS
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/95 backdrop-blur-md border border-slate-200 text-[10px] font-mono text-slate-500 shadow-xs pointer-events-auto">
          <span>LAT: {geoData.launch.lat.toFixed(4)}° N</span>
          <span>·</span>
          <span>LNG: {geoData.launch.lng.toFixed(4)}° W</span>
        </div>
      </div>
    </div>
  );
};
