import React, { useState } from "react";
import type { MissionInputPayload } from "../types/airlane";

interface MissionInputFormProps {
  onSubmit: (payload: MissionInputPayload) => void;
  isLoading: boolean;
}

const PRESETS = [
  {
    name: "Cedar Creek, TX (345kV Transmission Risk)",
    tag: "Benchmark",
    launch: "480 Berdoll Ln, Cedar Creek TX",
    destination: "912 Elm St, Cedar Creek TX",
    offset: 600,
    spacing: 400,
    altitude: 300,
    droneClass: "small_uav" as const,
  },
  {
    name: "Palo Alto, CA (Suburban Airspace)",
    tag: "Class D / UASFM",
    launch: "37.4172, -122.1084",
    destination: "37.4481, -122.1063",
    offset: 600,
    spacing: 400,
    altitude: 300,
    droneClass: "small_uav" as const,
  },
  {
    name: "Austin Metro Corridor (Raw Coordinates)",
    tag: "Geodesic Test",
    launch: "30.1345, -97.5512",
    destination: "30.1650, -97.5020",
    offset: 600,
    spacing: 400,
    altitude: 250,
    droneClass: "small_uav" as const,
  },
];

export const MissionInputForm: React.FC<MissionInputFormProps> = ({ onSubmit, isLoading }) => {
  const [launch, setLaunch] = useState("480 Berdoll Ln, Cedar Creek TX");
  const [destination, setDestination] = useState("912 Elm St, Cedar Creek TX");
  const [offsetM, setOffsetM] = useState(600);
  const [spacingM, setSpacingM] = useState(400);
  const [altitudeFt, setAltitudeFt] = useState(300);
  const [droneClass, setDroneClass] = useState<"micro_uav" | "small_uav" | "medium_uav">("small_uav");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setLaunch(preset.launch);
    setDestination(preset.destination);
    setOffsetM(preset.offset);
    setSpacingM(preset.spacing);
    setAltitudeFt(preset.altitude);
    setDroneClass(preset.droneClass);
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
    <div className="w-full max-w-3xl mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            MISSION PLANNING
          </span>
          <span className="text-xs text-slate-400">Step 1 of 2: Define Route Endpoints</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          BVLOS Corridor Safety Screening
        </h2>
        <p className="text-sm text-slate-400 mt-1.5">
          Enter launch and recovery endpoints to automatically generate 3 candidate corridors, query 4 authoritative data layers (Mireye, FAA, Census, NOAA), and produce an FAA Part 108 Safety Case.
        </p>
      </div>

      {/* Quick Presets */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
          Flight Scenario Presets
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => applyPreset(p)}
              className="text-left p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-emerald-500/50 hover:bg-slate-800/60 transition-all group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                  {p.name.split("(")[0]}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 group-hover:text-emerald-300">
                  {p.tag}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-1">
                {p.launch.split(",")[0]} → {p.destination.split(",")[0]}
              </p>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Launch Point Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
              Launch Origin (Takeoff Zone)
            </span>
            <span className="text-[11px] text-slate-500 font-normal">Address or Lat, Lng</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={launch}
              onChange={(e) => setLaunch(e.target.value)}
              placeholder="e.g. 480 Berdoll Ln, Cedar Creek TX or 30.1345, -97.5512"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all font-mono"
              required
            />
          </div>
        </div>

        {/* Destination Point Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Destination (Recovery Point)
            </span>
            <span className="text-[11px] text-slate-500 font-normal">Address or Lat, Lng</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. 912 Elm St, Cedar Creek TX or 30.1650, -97.5020"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all font-mono"
              required
            />
          </div>
        </div>

        {/* Collapsible Advanced Flight Parameters */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg
              className={`w-4 h-4 transform transition-transform ${showAdvanced ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>{showAdvanced ? "Hide Advanced Mission Parameters" : "Customize Detour Offset & Altitude"}</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 rounded-xl bg-slate-950/60 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  Detour Bend Offset: <span className="text-emerald-400">±{offsetM}m</span>
                </label>
                <input
                  type="range"
                  min="200"
                  max="1500"
                  step="50"
                  value={offsetM}
                  onChange={(e) => setOffsetM(Number(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>200m</span>
                  <span>600m (Standard)</span>
                  <span>1500m</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  Sample Point Spacing: <span className="text-emerald-400">{spacingM}m</span>
                </label>
                <input
                  type="range"
                  min="200"
                  max="800"
                  step="50"
                  value={spacingM}
                  onChange={(e) => setSpacingM(Number(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>200m (Fine)</span>
                  <span>400m (Nominal)</span>
                  <span>800m</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  Cruise Altitude (AGL): <span className="text-emerald-400">{altitudeFt} ft</span>
                </label>
                <input
                  type="number"
                  min="100"
                  max="400"
                  step="25"
                  value={altitudeFt}
                  onChange={(e) => setAltitudeFt(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  UAS Operating Category
                </label>
                <select
                  value={droneClass}
                  onChange={(e) => setDroneClass(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  <option value="micro_uav">Micro UAV (&lt;250g, 15kt limit)</option>
                  <option value="small_uav">Small UAV (Part 108 Standard, 25kt limit)</option>
                  <option value="medium_uav">Medium UAV (&gt;25kg, 35kt limit)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400 hover:from-emerald-300 hover:to-sky-300 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-slate-950" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Evaluating Airspace & Ground Risk...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Run Autonomous Safety Case Analysis</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
