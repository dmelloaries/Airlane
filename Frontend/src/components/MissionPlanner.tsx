import React, { useState } from "react";
import type { MissionInputPayload } from "../types/airlane";
import { LocationAutocompleteInput } from "./LocationAutocompleteInput";
import {
  MiniatureCityCanvas,
  type SelectedObjectInfo,
} from "./MiniatureCityCanvas";

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
    offset: 600,
    spacing: 400,
    altitude: 300,
    droneClass: "small_uav" as const,
    payload: 1.5,
  },
  {
    name: "Cedar Creek 345kV Grid",
    tag: "Powerline Clearance",
    launch: "480 Berdoll Ln, Cedar Creek TX",
    destination: "912 Elm St, Cedar Creek TX",
    offset: 600,
    spacing: 400,
    altitude: 300,
    droneClass: "small_uav" as const,
    payload: 2.2,
  },
  {
    name: "Stanford to Moffett Hub",
    tag: "Class D Airspace",
    launch: "Stanford Research Park, Palo Alto",
    destination: "Moffett Federal Airfield Hub",
    offset: 750,
    spacing: 400,
    altitude: 350,
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
    "Byxbee Park, Baylands Palo Alto",
  );
  const [offsetM, setOffsetM] = useState(600);
  const [spacingM, setSpacingM] = useState(400);
  const [altitudeFt, setAltitudeFt] = useState(300);
  const [payloadKg, setPayloadKg] = useState(1.5);
  const [droneClass, setDroneClass] = useState<
    "micro_uav" | "small_uav" | "medium_uav"
  >("small_uav");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setLaunch(preset.launch);
    setDestination(preset.destination);
    setOffsetM(preset.offset);
    setSpacingM(preset.spacing);
    setAltitudeFt(preset.altitude);
    setDroneClass(preset.droneClass);
    setPayloadKg(preset.payload);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!launch.trim() || !destination.trim()) return;

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
              onChange={setLaunch}
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
              onChange={setDestination}
              placeholder="Search recovery point, park, campus, or coordinates..."
              required
            />

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

            {/* Submit CTA Button: Compact, confident, 6-8px radius */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs sm:text-sm rounded-md shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>ANALYZING AIRSPACE...</span>
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
            <div className="p-1 rounded bg-slate-50">MIREYE 345kV</div>
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
