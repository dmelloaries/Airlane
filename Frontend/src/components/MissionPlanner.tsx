import React, { useState } from "react";
import type { MissionInputPayload } from "../types/airlane";
import { MiniatureCityCanvas, type SelectedObjectInfo } from "./MiniatureCityCanvas";

interface MissionPlannerProps {
  onSubmit: (payload: MissionInputPayload) => void;
  isLoading: boolean;
  onSelectObject?: (info: SelectedObjectInfo | null) => void;
}

const PRESETS = [
  {
    name: "Palo Alto Innovation Corridor",
    tag: "Silicon Valley Primary",
    launch: "Cubberley Community Center, Palo Alto",
    destination: "Byxbee Park, Baylands Palo Alto",
    offset: 600,
    spacing: 400,
    altitude: 300,
    droneClass: "small_uav" as const,
    payload: 1.5,
  },
  {
    name: "Cedar Creek 345kV Grid Test",
    tag: "Mireye Powerline Risk",
    launch: "480 Berdoll Ln, Cedar Creek TX",
    destination: "912 Elm St, Cedar Creek TX",
    offset: 600,
    spacing: 400,
    altitude: 300,
    droneClass: "small_uav" as const,
    payload: 2.2,
  },
  {
    name: "Stanford Park to Moffett Hub",
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
  const [destination, setDestination] = useState("Byxbee Park, Baylands Palo Alto");
  const [offsetM, setOffsetM] = useState(600);
  const [spacingM, setSpacingM] = useState(400);
  const [altitudeFt, setAltitudeFt] = useState(300);
  const [payloadKg, setPayloadKg] = useState(1.5);
  const [droneClass, setDroneClass] = useState<"micro_uav" | "small_uav" | "medium_uav">("small_uav");
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
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto space-y-3 pt-2 sm:pt-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold shadow-xs">
          <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
          <span>Next-Gen Autonomous Drone Infrastructure</span>
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight font-display">
          Plan the safest route <br className="hidden sm:block" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600">
            through the sky.
          </span>
        </h1>
        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto font-normal">
          Airlane understands the world around your drone and finds the safest path through it.
        </p>
      </div>

      {/* Main Grid: Floating Mission Input Card Over Interactive Miniature Digital Twin */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Floating Card: Plan a Flight Form (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-xl shadow-slate-200/50 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight font-display">
                Plan a flight
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Autonomous corridor generator & risk classifier
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              Part 108 Tier 1
            </span>
          </div>

          {/* Preset Chips */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Quick Mission Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all text-left ${
                    launch === p.launch
                      ? "bg-sky-50 border-sky-300 text-sky-800 font-semibold shadow-xs"
                      : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Launch Input */}
            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-500" />
                  Launch Location
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Takeoff Hub</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={launch}
                  onChange={(e) => setLaunch(e.target.value)}
                  placeholder="e.g. Cubberley Community Center, Palo Alto"
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50/80 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                  required
                />
              </div>
            </div>

            {/* Destination Input */}
            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Destination
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Recovery Hub</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Byxbee Park, Palo Alto"
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50/80 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                  required
                />
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 transition-colors"
              >
                <span>{showAdvanced ? "▾ Hide flight parameters" : "▸ Advanced: Payload, Altitude & Drone Class"}</span>
              </button>

              {showAdvanced && (
                <div className="mt-3 p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3 animate-in fade-in duration-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Payload Weight (kg)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={payloadKg}
                        onChange={(e) => setPayloadKg(parseFloat(e.target.value) || 1.5)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Cruise Altitude (ft AGL)
                      </label>
                      <input
                        type="number"
                        value={altitudeFt}
                        onChange={(e) => setAltitudeFt(parseInt(e.target.value) || 300)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Drone Class
                      </label>
                      <select
                        value={droneClass}
                        onChange={(e) => setDroneClass(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                      >
                        <option value="small_uav">Small UAV (≤55 lbs)</option>
                        <option value="micro_uav">Micro UAV (≤0.55 lbs)</option>
                        <option value="medium_uav">Medium UAV (&gt;55 lbs)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Detour Offset (m)
                      </label>
                      <input
                        type="number"
                        value={offsetM}
                        onChange={(e) => setOffsetM(parseInt(e.target.value) || 600)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Primary CTA Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-sky-600 via-blue-600 to-sky-700 hover:from-sky-700 hover:to-blue-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-sky-600/25 hover:shadow-sky-600/35 transition-all flex items-center justify-center gap-2 group active:scale-[0.99] cursor-pointer"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Analyzing Silicon Valley Airspace...</span>
                </>
              ) : (
                <>
                  <span>Plan route</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </>
              )}
            </button>
          </form>

          {/* Value Badges */}
          <div className="pt-2 grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-slate-500 border-t border-slate-100">
            <div className="p-2 rounded-lg bg-slate-50">
              <span className="block font-bold text-slate-800">4 Data Sources</span>
              <span>FAA · NOAA · Mireye · Census</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50">
              <span className="block font-bold text-slate-800">Part 108</span>
              <span>Ground Tier Risk</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50">
              <span className="block font-bold text-slate-800">Obstacle Avoid</span>
              <span>Real-time Detour</span>
            </div>
          </div>
        </div>

        {/* Right Digital Twin Viewport (7 cols) */}
        <div className="lg:col-span-7 space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-800 font-display">
                Living Silicon Valley Flight Environment
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Hover/Click objects to inspect
            </span>
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
