import React, { useState } from "react";
import type { AnalysisResult } from "../types/airlane";
import {
  buildFormattedPart108Json,
  downloadJsonFile,
  copyJsonToClipboard,
  openJsonInNewTab,
} from "../utils/exportUtils";
import { generatePart108Pdf } from "../utils/pdfGenerator";
import { openPrintableReport } from "../utils/printReportGenerator";

interface ExportModalProps {
  result: AnalysisResult;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ result, onClose }) => {
  const [activeTab, setActiveTab] = useState<"export" | "hazards_market" | "json_preview">("export");
  const [copiedStatus, setCopiedStatus] = useState<boolean>(false);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);

  let formattedData: ReturnType<typeof buildFormattedPart108Json> | null = null;
  let formatError: string | null = null;

  try {
    formattedData = buildFormattedPart108Json(result);
  } catch (err: any) {
    formatError = err?.message || "Failed to format analysis result for export.";
  }

  const formattedJsonString = formattedData ? JSON.stringify(formattedData, null, 2) : "";

  const handleDownloadJson = async () => {
    if (!formattedData) return;
    const success = await downloadJsonFile(formattedData);
    if (success) {
      setDownloadSuccessMessage("Part 108 JSON saved successfully!");
      setTimeout(() => setDownloadSuccessMessage(null), 4000);
    }
  };

  const handleDownloadPdf = async () => {
    if (!result) return;
    const success = await generatePart108Pdf(result);
    if (success) {
      setDownloadSuccessMessage("Official FAA Part 108 PDF generated & saved successfully!");
      setTimeout(() => setDownloadSuccessMessage(null), 4000);
    }
  };

  const handleCopyJson = async () => {
    if (!formattedData) return;
    const success = await copyJsonToClipboard(formattedData);
    if (success) {
      setCopiedStatus(true);
      setTimeout(() => setCopiedStatus(false), 3000);
    }
  };

  if (formatError || !formattedData) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans">
        <div className="w-full max-w-lg bg-white rounded-xl border border-rose-200 shadow-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 text-rose-600">
            <span className="text-2xl">⚠️</span>
            <h3 className="text-base font-bold font-display">Export Dossier Generation Failed</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed font-mono bg-rose-50 p-3 rounded-lg border border-rose-200">
            {formatError || "The analysis result does not contain valid computed telemetry required for FAA Part 108 filing."}
          </p>
          <p className="text-xs text-slate-500">
            Silent fake fallbacks are disabled. Please run a live analysis with active backend connection.
          </p>
          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-mono font-bold rounded-lg transition-colors cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 font-sans">
      <div className="w-full max-w-3xl max-h-[90vh] bg-white rounded-xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold font-display text-sm shadow-xs">
              ↓
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white font-display tracking-tight">
                  Export FAA Part 108 Safety Case Dossier
                </h3>
                <span className="px-2 py-0.2 rounded text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                  {formattedData.metadata.filing_id}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Deterministic route risk filing with verified Mireye, FAA UASFM, NOAA & Census provenance
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-mono transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 text-xs font-mono">
          <button
            onClick={() => setActiveTab("export")}
            className={`py-2.5 px-4 font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === "export"
                ? "border-sky-600 text-sky-700 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            ⚡ EXPORT OPTIONS
          </button>
          <button
            onClick={() => setActiveTab("hazards_market")}
            className={`py-2.5 px-4 font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === "hazards_market"
                ? "border-sky-600 text-sky-700 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            ⚠️ HAZARDS & MARKET SOURCES ({formattedData.hazard_and_obstacle_registry.length})
          </button>
          <button
            onClick={() => setActiveTab("json_preview")}
            className={`py-2.5 px-4 font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === "json_preview"
                ? "border-sky-600 text-sky-700 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            📋 RAW JSON INSPECTOR
          </button>
        </div>

        {/* Notification Feedback Toast */}
        {downloadSuccessMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2 flex items-center justify-between text-xs text-emerald-800 font-mono animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="font-bold">✓</span>
              <span>{downloadSuccessMessage}</span>
            </div>
            <button
              onClick={() => setDownloadSuccessMessage(null)}
              className="text-emerald-700 hover:text-emerald-950 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* TAB 1: EXPORT OPTIONS */}
          {activeTab === "export" && (
            <div className="space-y-5">
              {/* Mission Summary Snapshot Banner */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">RECOMMENDED</span>
                  <span className="font-bold text-slate-900">{formattedData.verdict_and_safety_case.recommended_corridor_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">PART 108 TIER</span>
                  <span className="font-bold text-emerald-700">{formattedData.verdict_and_safety_case.part108_tier} (Minimal Risk)</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">DISTANCE / TIME</span>
                  <span className="font-bold text-slate-900">
                    {formattedData.mission_profile.flight_metrics.total_distance_miles} mi ({formattedData.mission_profile.flight_metrics.estimated_flight_duration_min} min)
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">CONFIDENCE</span>
                  <span className="font-bold text-sky-700">{Math.round(formattedData.verdict_and_safety_case.confidence_score * 100)}% Verified</span>
                </div>
              </div>

              {/* TWO MAIN CARDS: PDF & JSON */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* PDF Card */}
                <div className="p-4 rounded-xl border-2 border-sky-200 bg-sky-50/40 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-md bg-sky-600 text-white flex items-center justify-center font-bold text-xs">
                          PDF
                        </span>
                        <h4 className="font-bold text-slate-900 font-display text-sm">
                          Official PDF Safety Dossier
                        </h4>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-100 text-sky-800 border border-sky-300">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-sans">
                      Complete publication-grade multi-page document featuring all physical hazards, marked waypoints, clearances, emergency landing pads, and provenance citations.
                    </p>
                    <ul className="text-[11px] text-slate-500 font-mono space-y-1 pt-1">
                      <li>✓ Vector PDF with high-resolution layout</li>
                      <li>✓ Mireye 345kV & infrastructure hazards</li>
                      <li>✓ FAA UASFM, METAR & Census tables</li>
                      <li>✓ Emergency landing zones (LZ-01 & LZ-02)</li>
                    </ul>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      onClick={handleDownloadPdf}
                      className="w-full py-2.5 px-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-xs font-mono flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                    >
                      <span>📥 DOWNLOAD OFFICIAL PDF (.pdf)</span>
                    </button>
                    <button
                      onClick={() => openPrintableReport(result)}
                      className="w-full py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-slate-300 rounded-lg text-xs font-mono flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <span>🖨️ PREVIEW & PRINT TO PDF</span>
                    </button>
                  </div>
                </div>

                {/* JSON Card */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-md bg-slate-800 text-white flex items-center justify-center font-bold text-xs font-mono">
                          JSON
                        </span>
                        <h4 className="font-bold text-slate-900 font-display text-sm">
                          Part 108 Digital Twin JSON
                        </h4>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        MACHINE READABLE
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-sans">
                      Standard JSON filing package with full GPS sample coordinate arrays, quantitative hazard clearance records, and API data provenance schemas.
                    </p>
                    <ul className="text-[11px] text-slate-500 font-mono space-y-1 pt-1">
                      <li>✓ Deeply structured JSON schema</li>
                      <li>✓ Openable in any browser or IDE</li>
                      <li>✓ UTM/WGS84 route waypoint polylines</li>
                      <li>✓ Deterministic ground risk tier scorecards</li>
                    </ul>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      onClick={handleDownloadJson}
                      className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs font-mono flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                    >
                      <span>💾 DOWNLOAD PART 108 JSON (.json)</span>
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openJsonInNewTab(formattedData)}
                        className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-md text-[11px] font-mono text-center transition-colors cursor-pointer"
                      >
                        🌐 Open in Tab
                      </button>
                      <button
                        onClick={handleCopyJson}
                        className={`py-1.5 px-2 font-semibold rounded-md text-[11px] font-mono text-center transition-colors cursor-pointer ${
                          copiedStatus
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                        }`}
                      >
                        {copiedStatus ? "✓ Copied!" : "📋 Copy JSON"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HAZARDS & MARKET DATA REGISTRY */}
          {activeTab === "hazards_market" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 font-display">
                    Detected Route Hazards & Authoritative Data Layers
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono">
                    All physical obstacles, power lines, and airspace clearances with verified provenance
                  </p>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {formattedData.hazard_and_obstacle_registry.length} HAZARDS RECORDED
                </span>
              </div>

              {/* Hazards Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase sticky top-0">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 px-3">Hazard Type</th>
                        <th className="py-2 px-3">Corridor</th>
                        <th className="py-2 px-3">Coordinates</th>
                        <th className="py-2 px-3">Clearance</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Authoritative Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formattedData.hazard_and_obstacle_registry.map((haz) => (
                        <tr key={haz.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-sans">
                            <div className="font-bold text-slate-900">{haz.obstacle_type}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{haz.description}</div>
                          </td>
                          <td className="py-2 px-3 text-[11px] text-slate-600">{haz.corridor}</td>
                          <td className="py-2 px-3 text-[11px] text-slate-600">
                            {haz.latitude.toFixed(4)}° N, {haz.longitude.toFixed(4)}° W
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-800">
                            {haz.measured_clearance_m.toFixed(1)} m
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                haz.measured_clearance_m < 50
                                  ? "bg-rose-100 text-rose-800 border border-rose-300"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              }`}
                            >
                              {haz.clearance_status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-[10px] text-sky-800 font-semibold">
                            {haz.authoritative_source}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Airspace & Market Clearances Grid */}
              <div>
                <h5 className="text-xs font-bold text-slate-900 font-display mb-2">
                  Airspace, Market & Meteorological Clearances
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs">
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-900">FAA UASFM AIRSPACE</span>
                      <span className="text-[9px] font-bold bg-emerald-50 text-emerald-800 px-1 py-0.2 rounded border border-emerald-200">
                        {formattedData.airspace_and_market_clearances.faa_uasfm.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {formattedData.airspace_and_market_clearances.faa_uasfm.airspace_class}. Ceiling {formattedData.airspace_and_market_clearances.faa_uasfm.ceiling_ft_agl}ft AGL ({formattedData.airspace_and_market_clearances.faa_uasfm.flight_altitude_buffer_ft}ft vertical margin).
                    </p>
                    <div className="text-[10px] text-slate-400 mt-1">Source: {formattedData.airspace_and_market_clearances.faa_uasfm.source}</div>
                  </div>

                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-900">NOAA METAR WINDS</span>
                      <span className={`text-[9px] font-bold px-1 py-0.2 rounded border ${formattedData.airspace_and_market_clearances.meteorological_noaa_metar.drone_class_safe ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-800 border-rose-200"}`}>
                        {formattedData.airspace_and_market_clearances.meteorological_noaa_metar.status} ({formattedData.airspace_and_market_clearances.meteorological_noaa_metar.surface_wind_kts}KT)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Surface wind {formattedData.airspace_and_market_clearances.meteorological_noaa_metar.surface_wind_kts} kts, gusts {formattedData.airspace_and_market_clearances.meteorological_noaa_metar.wind_gust_kts} kts. {formattedData.airspace_and_market_clearances.meteorological_noaa_metar.drone_class_safe ? "Safe within operational flight envelope." : "Exceeds flight envelope."}
                    </p>
                    <div className="text-[10px] text-slate-400 mt-1">Source: {formattedData.airspace_and_market_clearances.meteorological_noaa_metar.source} ({formattedData.airspace_and_market_clearances.meteorological_noaa_metar.station_id})</div>
                  </div>

                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-900">CENSUS GROUND RISK</span>
                      <span className="text-[9px] font-bold bg-emerald-50 text-emerald-800 px-1 py-0.2 rounded border border-emerald-200">
                        {formattedData.airspace_and_market_clearances.population_density_ground_risk.dominant_tier.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Peak density {formattedData.airspace_and_market_clearances.population_density_ground_risk.max_density_sq_mi.toLocaleString()} ppl / sq mi across {formattedData.airspace_and_market_clearances.population_density_ground_risk.points_evaluated} census sample points.
                    </p>
                    <div className="text-[10px] text-slate-400 mt-1">Source: {formattedData.airspace_and_market_clearances.population_density_ground_risk.source}</div>
                  </div>

                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-900">AIR RIGHTS EASEMENTS</span>
                      <span className="text-[9px] font-bold bg-emerald-50 text-emerald-800 px-1 py-0.2 rounded border border-emerald-200">
                        {formattedData.airspace_and_market_clearances.air_rights_and_market_corridors.easement_status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {formattedData.airspace_and_market_clearances.air_rights_and_market_corridors.municipal_rights_of_way} · {formattedData.airspace_and_market_clearances.air_rights_and_market_corridors.telecom_safe_buffer}
                    </p>
                    <div className="text-[10px] text-slate-400 mt-1">Source: {formattedData.airspace_and_market_clearances.air_rights_and_market_corridors.source}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RAW JSON INSPECTOR */}
          {activeTab === "json_preview" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 font-display">
                    FAA Part 108 JSON Document Preview
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Direct machine-readable payload generated from live analysis
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyJson}
                    className="px-2.5 py-1 text-xs font-mono font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 transition-colors cursor-pointer"
                  >
                    {copiedStatus ? "✓ Copied" : "📋 Copy"}
                  </button>
                  <button
                    onClick={handleDownloadJson}
                    className="px-2.5 py-1 text-xs font-mono font-bold bg-sky-600 hover:bg-sky-700 text-white rounded shadow-xs transition-colors cursor-pointer"
                  >
                    💾 Download JSON
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className="p-4 rounded-lg bg-slate-950 text-sky-400 text-xs font-mono overflow-x-auto max-h-80 border border-slate-800 leading-relaxed">
                  {formattedJsonString}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between font-mono text-xs">
          <div className="text-slate-500 text-[11px] hidden sm:block">
            Standard: FAA Part 108 / SORA 2.5 Quantitative Ground Risk
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="py-1.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-md transition-colors cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
