import React from "react";
import type { LandingZone } from "../types/airlane";

interface LandingZonesListProps {
  landingZones: LandingZone[];
}

export const LandingZonesList: React.FC<LandingZonesListProps> = ({ landingZones }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs font-sans space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900 font-display">
            Emergency Forced Landing Sites
          </h3>
          <p className="text-xs text-slate-500 font-mono">
            Evaluated terrain clearings for safe Part 108 abort procedures
          </p>
        </div>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
          {landingZones.length} Safe Site{landingZones.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2.5 pt-1">
        {landingZones.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-2 text-center font-mono">
            No optimal forced landing clearings identified along this segment.
          </p>
        ) : (
          landingZones.map((lz, idx) => (
            <div
              key={idx}
              className="p-3 rounded-md bg-slate-50 border border-slate-200 text-xs flex items-start justify-between gap-3 font-mono"
            >
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900 font-sans flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>#{idx + 1} {lz.description}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Mile {lz.distance_along_route_miles.toFixed(2)} ({Math.round(lz.distance_along_route_m)}m along corridor) · ({lz.lat.toFixed(4)}°, {lz.lng.toFixed(4)}°)
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                  {Math.round(lz.infrastructure_clearance_m)}M CLEARANCE
                </span>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Slope: {lz.slope_degrees.toFixed(1)}°
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
