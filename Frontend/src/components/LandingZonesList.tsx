import React from "react";
import type { LandingZone } from "../types/airlane";

interface LandingZonesListProps {
  landingZones: LandingZone[];
}

export const LandingZonesList: React.FC<LandingZonesListProps> = ({ landingZones }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </span>
          <h3 className="text-base font-bold text-white tracking-wide">
            Emergency Forced Landing Sites
          </h3>
        </div>
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          {landingZones.length} Safe Site{landingZones.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-3">
        {landingZones.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-3 text-center">
            No optimal forced landing clearings identified along this segment.
          </p>
        ) : (
          landingZones.map((lz, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-cyan-500/30 transition-colors flex items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-mono font-bold text-xs">
                  #{idx + 1}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-200">
                    Mile {lz.distance_along_route_miles.toFixed(2)} ({Math.round(lz.distance_along_route_m)}m along corridor)
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Coordinates: ({lz.lat.toFixed(4)}, {lz.lng.toFixed(4)})
                  </div>
                  <p className="text-xs text-slate-300 mt-1">{lz.description}</p>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <div className="text-[11px] font-mono font-bold text-cyan-300 bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/20">
                  {Math.round(lz.infrastructure_clearance_m)}m Clearance
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1">
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
