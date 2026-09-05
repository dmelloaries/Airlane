import React, { useState } from "react";
import type { MissionInputPayload } from "../types/airlane";
import { LocationAutocompleteInput } from "./LocationAutocompleteInput";
import {
  MiniatureCityCanvas,
  type SelectedObjectInfo,
} from "./MiniatureCityCanvas";
import {
  calculateHaversineDistanceKm,
  resolveCoordinates,
  MAX_FLIGHT_DISTANCE_KM,
} from "../utils/geoUtils";

interface MissionPlannerProps {
  onSubmit: (payload: MissionInputPayload) => void;
  isLoading: boolean;
  onSelectObject?: (info: SelectedObjectInfo | null) => void;
}

const PRESETS = [
  {
    name: "Palo Alto Corridor",
    tag: "Silicon Valley Sector",
    launch: "Cubberley Community Center, Palo Alto",
    destination: "Byxbee Park, Baylands Palo Alto",
    launchCoord: { lat: 37.4172, lng: -122.1084 },
    destCoord: { lat: 37.4481, lng: -122.1063 },
    offset: 600,
    spacing: 400,
    altitude: 300,
    droneClass: "small_uav" as const,
    payload: 1.5,
  },
  {
    name: "Cedar Creek Power Grid",
    tag: "Powerline Clearance",
    launch: "480 Berdoll Ln, Cedar Creek TX",
    destination: "620 FM 535, Cedar Creek TX",
    launchCoord: { lat: 30.1395, lng: -97.5462 },
    destCoord: { lat: 30.155, lng: -97.52 },
    offset: 600,
    spacing: 400,
    altitude: 300,
    droneClass: "small_uav" as const,
    payload: 2.2,
  },
  {
    name: "Stanford Innovation Hub",
    tag: "Class D Airspace",
    launch: "Stanford Research Park, Palo Alto",
    destination: "Stanford Dish Loop Hub, Stanford CA",
    launchCoord: { lat: 37.4241, lng: -122.148 },
    destCoord: { lat: 37.4124, lng: -122.164 },
    offset: 500,
    spacing: 350,
    altitude: 300,
    droneClass: "small_uav" as const,
    payload: 1.0,
  },
];

export const MissionPlanner: React.FC<MissionPlannerProps> = ({
  onSubmit,
  isLoading,
  onSelectObject,
}) => {
  const [launch, setLaunch] = useState("Cubberley Community Center, Palo Alto");
  const [destination, setDestination] = useState(
    "Byxbee Park, Baylands Palo Alto"
  );
  const [launchCoord, setLaunchCoord] = useState<{
    lat: number;
    lng: number;
  } | null>(PRESETS[0].launchCoord);
  const [destCoord, setDestCoord] = useState<{
    lat: number;
    lng: number;
  } | null>(PRESETS[0].destCoord);

  const [offsetM, setOffsetM] = useState(600);
  const [spacingM, setSpacingM] = useState(400);
  const [altitudeFt, setAltitudeFt] = useState(300);
  const [payloadKg, setPayloadKg] = useState(1.5);
  const [droneClass, setDroneClass] = useState<
    "micro_uav" | "small_uav" | "medium_uav"
  >("small_uav");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Compute great-circle baseline distance in km
  const distanceKm =
    launchCoord && destCoord
      ? calculateHaversineDistanceKm(
          launchCoord.lat,
          launchCoord.lng,
          destCoord.lat,
          destCoord.lng
        )
      : null;

  const isDistanceExceeded =
    distanceKm !== null && distanceKm > MAX_FLIGHT_DISTANCE_KM;

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setLaunch(preset.launch);
    setDestination(preset.destination);
    setLaunchCoord(preset.launchCoord);
    setDestCoord(preset.destCoord);
    setOffsetM(preset.offset);
    setSpacingM(preset.spacing);
    setAltitudeFt(preset.altitude);
    setDroneClass(preset.droneClass);
    setPayloadKg(preset.payload);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!launch.trim() || !destination.trim()) return;
    if (isDistanceExceeded) return;

    onSubmit({
      launch: launch.trim(),
      destination: destination.trim(),
      offset_distance_m: offsetM,
      sample_spacing_m: spacingM,
      cruise_altitude_ft: altitudeFt,
      drone_class: droneClass,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Editorial Hero Header */}
      <div className="border-b border-slate-300/80 pb-6 pt-2 flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div className="space-y-2.5 max-w-4xl">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />
            <span>FAA PART 108 BVLOS CORRIDOR ENGINE</span>
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[72px] xl:text-[78px] text-slate-950 font-instrument leading-[1.02] tracking-tight">
            Plan the safest route through the physical world.
          </h1>
          <p className="text-lg sm:text-xl md:text-2xl text-slate-600 max-w-3xl font-normal leading-relaxed font-instrument">
            Airlane builds a real-time digital twin of terrain, airspace,
            infrastructure, population, and wind to determine the safest
            autonomous drone corridor.
          </p>
        </div>

        {/* Inline Engineering Specs */}
        <div className="hidden lg:flex items-center gap-4 text-xs font-mono text-slate-600 bg-white border border-slate-200/90 px-4 py-2.5 rounded-md shadow-xs">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">
              SOURCES
            </span>
            <span className="font-bold text-slate-800">4 LIVE FEEDS</span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">
              RESOLUTION
            </span>
            <span className="font-bold text-slate-800">BLOCK GROUP</span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">
              SAFETY BASIS
            </span>
            <span className="font-bold text-emerald-700">DETERMINISTIC</span>
          </div>
        </div>
      </div>

      {/* Main Layout: Asymmetrical Console (5 cols) + Living Digital Twin World (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Flight Planning Console (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.04)] space-y-4 technical-corner-tl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-display">
                Flight Parameters
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                Origin & Destination Endpoints
              </p>
            </div>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              01 / INPUT
            </span>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Quick Mission Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-colors text-left ${
                    launch === p.launch
                      ? "bg-sky-50 border-sky-300 text-sky-800 font-semibold"
                      : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
            {/* Launch Location Auto-completion Input */}
            <LocationAutocompleteInput
              id="launch-input"
              label="Launch Location"
              tag="ORIGIN"
              dotColor="bg-sky-600"
              value={launch}
              onChange={(val) => {
                setLaunch(val);
                const resolved = resolveCoordinates(val);
                if (resolved) setLaunchCoord(resolved);
              }}
              onSelectPlace={(place) =>
                setLaunchCoord(place ? { lat: place.lat, lng: place.lng } : null)
              }
              placeholder="Search origin, airport, campus, or coordinates..."
              required
            />

            {/* Destination Auto-completion Input */}
            <LocationAutocompleteInput
              id="destination-input"
              label="Destination"
              tag="RECOVERY"
              dotColor="bg-emerald-600"
              value={destination}
              onChange={(val) => {
                setDestination(val);
                const resolved = resolveCoordinates(val);
                if (resolved) setDestCoord(resolved);
              }}
              onSelectPlace={(place) =>
                setDestCoord(place ? { lat: place.lat, lng: place.lng } : null)
              }
              placeholder="Search recovery point, park, campus, or coordinates..."
              required
            />

            {/* Real-time Flight Distance & Mireye Credit Protection Status */}
            {distanceKm !== null ? (
              isDistanceExceeded ? (
                <div className="p-3 rounded-md bg-rose-50/95 border border-rose-300 text-rose-900 font-mono text-xs space-y-1.5 shadow-xs animate-in fade-in">
                  <div className="flex items-center justify-between font-bold">
                    <div className="flex items-center gap-1.5 text-rose-700">
                      <span className="text-sm">⚠️</span>
                      <span>DISTANCE EXCEEDS 5.0 KM LIMIT</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 font-bold text-[11px]">
                      {distanceKm.toFixed(2)} km
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-700 leading-relaxed font-sans">
                    Endpoints are <strong>{distanceKm.toFixed(2)} km</strong> apart. Maximum allowed flight distance is <strong>5.0 km</strong> Please select points within 5 km.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between px-3 py-2 bg-emerald-50/80 border border-emerald-200 rounded-md text-xs font-mono text-emerald-800 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>
                      FLIGHT DISTANCE: <strong>{distanceKm.toFixed(2)} km</strong>
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-bold bg-white px-2 py-0.5 rounded border border-emerald-200">
                    ✓ SAFE RANGE (≤ 5.0 KM)
                  </span>
                </div>
              )
            ) : (
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border border-slate-200/80 rounded-md text-[11px] font-mono text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <span>FLIGHT RADIUS CAP: 5.0 KM</span>
                </div>
                <span className="text-[10px] text-slate-400">MIREYE CREDIT PROTECTION</span>
              </div>
            )}

            {/* Advanced Settings Toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs font-mono font-medium text-sky-600 hover:text-sky-800 flex items-center gap-1 transition-colors"
              >
                <span>
                  {showAdvanced
                    ? "[-] HIDE FLIGHT PARAMETERS"
                    : "[+] ADVANCED: ALTITUDE, CLASS & SPACING"}
                </span>
              </button>

              {showAdvanced && (
                <div className="mt-2.5 p-3 rounded-md bg-slate-50 border border-slate-200 space-y-2.5 text-xs font-mono">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">
                        CRUISE ALTITUDE (FT AGL)
                      </label>
                      <input
                        type="number"
                        value={altitudeFt}
                        onChange={(e) =>
                          setAltitudeFt(parseInt(e.target.value) || 300)
                        }
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-slate-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">
                        PAYLOAD WEIGHT (KG)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={payloadKg}
                        onChange={(e) =>
                          setPayloadKg(parseFloat(e.target.value) || 1.5)
                        }
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-slate-900 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">
                        DRONE CLASS
                      </label>
                      <select
                        value={droneClass}
                        onChange={(e) => setDroneClass(e.target.value as any)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-slate-900 text-xs font-sans"
                      >
                        <option value="small_uav">Small UAV (≤55 lbs)</option>
                        <option value="micro_uav">Micro UAV (≤0.55 lbs)</option>
                        <option value="medium_uav">
                          Medium UAV (&gt;55 lbs)
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">
                        DETOUR OFFSET (M)
                      </label>
                      <input
                        type="number"
                        value={offsetM}
                        onChange={(e) =>
                          setOffsetM(parseInt(e.target.value) || 600)
                        }
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-slate-900 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit CTA Button: Compact, confident, with credit protection state */}
            <button
              type="submit"
              disabled={isLoading || isDistanceExceeded}
              className={`w-full py-2.5 px-4 font-bold text-xs sm:text-sm rounded-md shadow-xs transition-all flex items-center justify-center gap-2 ${
                isDistanceExceeded
                  ? "bg-rose-100 border border-rose-300 text-rose-700 cursor-not-allowed opacity-90"
                  : "bg-sky-600 hover:bg-sky-700 text-white cursor-pointer active:scale-[0.99]"
              }`}
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>ANALYZING AIRSPACE...</span>
                </>
              ) : isDistanceExceeded ? (
                <>
                  <span>⚠️ ROUTE EXCEEDS 5.0 KM (PROTECTED)</span>
                </>
              ) : (
                <>
                  <span>PLAN ROUTE</span>
                  <span>→</span>
                </>
              )}
            </button>
          </form>

          {/* Technical Data Sources Footer */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-4 gap-1 text-center font-mono text-[10px] text-slate-500">
            <div className="p-1 rounded bg-slate-50">FAA UASFM</div>
            <div className="p-1 rounded bg-slate-50">NOAA METAR</div>
            <div className="p-1 rounded bg-slate-50">MIREYE EARTH API</div>
            <div className="p-1 rounded bg-slate-50">US CENSUS</div>
          </div>
        </div>

        {/* Right Digital Twin Environment (7 cols) */}
        <div className="lg:col-span-7 space-y-2">
          <div className="flex items-center justify-between px-1 text-xs font-mono text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-bold text-slate-800">
                LIVING DIGITAL TWIN ENVIRONMENT
              </span>
            </div>
            <span>INTERACTIVE AIRSPACE</span>
          </div>

          <MiniatureCityCanvas
            activeStage={2}
            selectedCorridorId="corridor_a"
            onSelectObject={onSelectObject}
          />
        </div>
      </div>
    </div>
  );
};
