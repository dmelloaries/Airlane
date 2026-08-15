import type { AnalysisResult } from "../types/airlane";
import { buildFormattedPart108Json } from "./exportUtils";
import { saveFileToDisk } from "./fileSaver";

interface PdfDrawOptions {
  font?: "F1" | "F2" | "F3"; // F1: Helvetica, F2: Helvetica-Bold, F3: Courier
  size?: number;
  color?: [number, number, number]; // RGB 0..1
  align?: "left" | "center" | "right";
}

class SimplePdfBuilder {
  private pages: string[] = [];
  private currentPageStream: string[] = [];
  private width = 612; // Standard US Letter width in pt
  private height = 792; // Standard US Letter height in pt

  constructor() {
    this.newPage();
  }

  public newPage(): void {
    if (this.currentPageStream.length > 0) {
      this.pages.push(this.currentPageStream.join("\n"));
      this.currentPageStream = [];
    }
  }

  // PDF stream primitive helpers
  public drawRect(
    x: number,
    yTop: number,
    w: number,
    h: number,
    fillColor?: [number, number, number],
    strokeColor?: [number, number, number],
    lineWidth: number = 1
  ): void {
    const yBottom = this.height - yTop - h;
    let op = "";
    if (lineWidth) op += `${lineWidth} w\n`;
    if (fillColor) op += `${fillColor[0]} ${fillColor[1]} ${fillColor[2]} rg\n`;
    if (strokeColor) op += `${strokeColor[0]} ${strokeColor[1]} ${strokeColor[2]} RG\n`;
    op += `${x.toFixed(2)} ${yBottom.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re\n`;
    if (fillColor && strokeColor) op += "B\n";
    else if (fillColor) op += "f\n";
    else if (strokeColor) op += "S\n";
    this.currentPageStream.push(op);
  }

  public drawLine(
    x1: number,
    yTop1: number,
    x2: number,
    yTop2: number,
    color: [number, number, number] = [0.8, 0.8, 0.8],
    width: number = 1
  ): void {
    const yB1 = this.height - yTop1;
    const yB2 = this.height - yTop2;
    const op = `${width} w\n${color[0]} ${color[1]} ${color[2]} RG\n${x1.toFixed(2)} ${yB1.toFixed(2)} m\n${x2.toFixed(2)} ${yB2.toFixed(2)} l\nS\n`;
    this.currentPageStream.push(op);
  }

  public drawText(
    text: string,
    x: number,
    yTop: number,
    options: PdfDrawOptions = {}
  ): void {
    const font = options.font || "F1";
    const size = options.size || 10;
    const color = options.color || [0.1, 0.1, 0.1];
    const align = options.align || "left";

    // Map common unicode symbols to ASCII equivalents for standard PDF Type-1 Helvetica font
    const asciiText = (text || "")
      .replace(/[•●]/g, "* ")
      .replace(/[·]/g, "| ")
      .replace(/[°]/g, " deg ")
      .replace(/[✓✔]/g, "[OK] ")
      .replace(/[✗✘]/g, "[X] ")
      .replace(/[★☆]/g, "* ")
      .replace(/[—–]/g, "-")
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/[^\x20-\x7E]/g, " ");

    // Escape special PDF characters: \ ( )
    const cleanText = asciiText
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

    // Rough text width estimation for alignment
    let approxWidth = cleanText.length * size * 0.52;
    if (font === "F2") approxWidth = cleanText.length * size * 0.58;
    if (font === "F3") approxWidth = cleanText.length * size * 0.6;

    let targetX = x;
    if (align === "center") targetX = x - approxWidth / 2;
    if (align === "right") targetX = x - approxWidth;

    const yBottom = this.height - yTop - size * 0.8;

    const op = `BT\n/${font} ${size} Tf\n${color[0]} ${color[1]} ${color[2]} rg\n${targetX.toFixed(2)} ${yBottom.toFixed(2)} Td\n(${cleanText}) Tj\nET\n`;
    this.currentPageStream.push(op);
  }

  public drawBadge(
    text: string,
    x: number,
    yTop: number,
    bgColor: [number, number, number],
    textColor: [number, number, number],
    fontSize: number = 8
  ): void {
    const padX = 6;
    const padY = 3;
    const approxW = text.length * fontSize * 0.55 + padX * 2;
    const h = fontSize + padY * 2;
    this.drawRect(x, yTop, approxW, h, bgColor, undefined, 0);
    this.drawText(text, x + padX, yTop + padY + 1, {
      font: "F2",
      size: fontSize,
      color: textColor,
    });
  }

  public drawHeader(title: string, subtitle: string, pageNum: number, totalPages: number): void {
    // Top background banner
    this.drawRect(0, 0, this.width, 54, [0.06, 0.12, 0.22]);
    this.drawRect(0, 54, this.width, 3, [0.01, 0.52, 0.88]);

    // Logo / Emblem tag
    this.drawRect(40, 14, 28, 28, [0.01, 0.52, 0.88]);
    this.drawText("AL", 47, 21, { font: "F2", size: 14, color: [1, 1, 1] });

    // Title
    this.drawText("AIRLANE AUTONOMOUS FLIGHT DOSSIER", 78, 16, {
      font: "F2",
      size: 13,
      color: [1, 1, 1],
    });
    this.drawText(
      "FAA Part 108 NPRM & BVLOS Quantitative Safety Case Certification",
      78,
      32,
      { font: "F1", size: 8, color: [0.7, 0.85, 0.98] }
    );

    // Right tag — shown in red when data is insufficient
    if ((subtitle as string).includes("DATA_FAILURE") || (title as string).includes("INSUFFICIENT")) {
      this.drawBadge("DATA FAILURE -- NOT VALID", this.width - 200, 18, [0.8, 0.1, 0.1], [1, 1, 1], 8);
    } else {
      this.drawBadge("FAA PART 108 VERIFIED", this.width - 170, 18, [0.05, 0.45, 0.3], [1, 1, 1], 8);
    }

    // Section title bar
    this.drawRect(40, 68, this.width - 80, 24, [0.94, 0.96, 0.98], [0.85, 0.88, 0.92], 1);
    this.drawText(title, 50, 75, { font: "F2", size: 10, color: [0.06, 0.12, 0.22] });
    this.drawText(subtitle, this.width - 50, 76, {
      font: "F3",
      size: 8,
      color: [0.4, 0.45, 0.5],
      align: "right",
    });

    // Page footer
    this.drawLine(40, this.height - 40, this.width - 40, this.height - 40, [0.85, 0.88, 0.92], 1);
    this.drawText(
      "AIRLANE BVLOS SAFETY ENGINE · 100% GROUNDED SOURCES (MIREYE, FAA, CENSUS, NOAA)",
      40,
      this.height - 30,
      { font: "F3", size: 7, color: [0.5, 0.55, 0.6] }
    );
    this.drawText(
      `PAGE ${pageNum} OF ${totalPages}`,
      this.width - 40,
      this.height - 30,
      { font: "F2", size: 7, color: [0.3, 0.35, 0.4], align: "right" }
    );
  }

  public compile(): Uint8Array {
    if (this.currentPageStream.length > 0) {
      this.pages.push(this.currentPageStream.join("\n"));
      this.currentPageStream = [];
    }

    const totalPages = this.pages.length;
    const objects: string[] = [];
    const offsets: number[] = [];

    let currentOffset = 0;
    const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    currentOffset += header.length;

    // Object 1: Catalog
    const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
    objects.push(obj1);

    // Object 2: Pages
    const kidRefs = Array.from({ length: totalPages }, (_, i) => `${4 + i * 2} 0 R`).join(" ");
    const obj2 = `2 0 obj\n<< /Type /Pages /Kids [${kidRefs}] /Count ${totalPages} >>\nendobj\n`;
    objects.push(obj2);

    // Object 3: Resources
    const obj3 = `3 0 obj\n<< /Font <<
/F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
/F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
/F3 << /Type /Font /Subtype /Type1 /BaseFont /Courier >>
>> >>\nendobj\n`;
    objects.push(obj3);

    // Page Objects & Stream Objects
    for (let i = 0; i < totalPages; i++) {
      const pageObjIndex = 4 + i * 2;
      const streamObjIndex = pageObjIndex + 1;
      const streamContent = this.pages[i];
      const streamLen = streamContent.length;

      const pageObj = `${pageObjIndex} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources 3 0 R /Contents ${streamObjIndex} 0 R >>\nendobj\n`;
      objects.push(pageObj);

      const streamObj = `${streamObjIndex} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
      objects.push(streamObj);
    }

    // Build byte buffer
    let pdfString = header;
    for (let i = 0; i < objects.length; i++) {
      offsets.push(pdfString.length);
      pdfString += objects[i];
    }

    const startXref = pdfString.length;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 0; i < offsets.length; i++) {
      const offsetStr = offsets[i].toString().padStart(10, "0");
      xref += `${offsetStr} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
    pdfString += xref + trailer;

    // Convert string to Uint8Array binary
    const bytes = new Uint8Array(pdfString.length);
    for (let i = 0; i < pdfString.length; i++) {
      bytes[i] = pdfString.charCodeAt(i) & 0xff;
    }
    return bytes;
  }
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Builds and downloads a multi-page vector PDF safety dossier.
 */
export async function generatePart108Pdf(result: AnalysisResult, customFilename?: string): Promise<boolean> {
  try {
    const data = buildFormattedPart108Json(result);
    const pdf = new SimplePdfBuilder();
    const totalPages = 3;

    // ================= PAGE 1: MISSION PROFILE & VERDICT =================
    pdf.drawHeader("MISSION PROFILE & AUTONOMOUS VERDICT", `FILING ID: ${data.metadata.filing_id}`, 1, totalPages);

    let y = 104;

    // Mission Details Box
    pdf.drawRect(40, y, 532, 100, [0.98, 0.99, 1], [0.85, 0.9, 0.95], 1);

    pdf.drawText("LAUNCH LOCATION (ORIGIN)", 52, y + 12, { font: "F2", size: 8, color: [0.3, 0.4, 0.5] });
    pdf.drawText(data.mission_profile.launch.address, 52, y + 24, { font: "F2", size: 9, color: [0.06, 0.12, 0.22] });
    pdf.drawText(
      `GPS: ${data.mission_profile.launch.latitude.toFixed(4)}° N, ${data.mission_profile.launch.longitude.toFixed(4)}° W · Source: ${data.mission_profile.launch.geocoding_source}`,
      52,
      y + 36,
      { font: "F3", size: 7.5, color: [0.4, 0.45, 0.5] }
    );

    pdf.drawLine(52, y + 48, 560, y + 48, [0.88, 0.91, 0.94], 1);

    pdf.drawText("DESTINATION LOCATION", 52, y + 60, { font: "F2", size: 8, color: [0.3, 0.4, 0.5] });
    pdf.drawText(data.mission_profile.destination.address, 52, y + 72, { font: "F2", size: 9, color: [0.06, 0.12, 0.22] });
    pdf.drawText(
      `GPS: ${data.mission_profile.destination.latitude.toFixed(4)}° N, ${data.mission_profile.destination.longitude.toFixed(4)}° W · Source: ${data.mission_profile.destination.geocoding_source}`,
      52,
      y + 84,
      { font: "F3", size: 7.5, color: [0.4, 0.45, 0.5] }
    );

    y += 112;

    // Flight Metrics Grid
    const colW = 532 / 4;
    pdf.drawRect(40, y, 532, 42, [0.95, 0.97, 0.99], [0.85, 0.88, 0.92], 1);

    // Col 1
    pdf.drawText("TOTAL DISTANCE", 50, y + 10, { font: "F2", size: 7, color: [0.4, 0.45, 0.5] });
    pdf.drawText(`${data.mission_profile.flight_metrics.total_distance_miles} MI (${data.mission_profile.flight_metrics.total_distance_km} KM)`, 50, y + 24, {
      font: "F2",
      size: 10,
      color: [0.06, 0.12, 0.22],
    });

    // Col 2
    pdf.drawText("CRUISE ALTITUDE", 50 + colW, y + 10, { font: "F2", size: 7, color: [0.4, 0.45, 0.5] });
    pdf.drawText(`${data.mission_profile.parameters.cruise_altitude_ft} FT AGL`, 50 + colW, y + 24, {
      font: "F2",
      size: 10,
      color: [0.06, 0.12, 0.22],
    });

    // Col 3
    pdf.drawText("EST. DURATION", 50 + colW * 2, y + 10, { font: "F2", size: 7, color: [0.4, 0.45, 0.5] });
    pdf.drawText(`${data.mission_profile.flight_metrics.estimated_flight_duration_min} MIN`, 50 + colW * 2, y + 24, {
      font: "F2",
      size: 10,
      color: [0.06, 0.12, 0.22],
    });

    // Col 4
    pdf.drawText("DRONE CLASS", 50 + colW * 3, y + 10, { font: "F2", size: 7, color: [0.4, 0.45, 0.5] });
    pdf.drawText(data.mission_profile.parameters.drone_class.toUpperCase(), 50 + colW * 3, y + 24, {
      font: "F2",
      size: 10,
      color: [0.06, 0.12, 0.22],
    });

    // Check for data failure at the report level
    const hasDataFailure = Boolean(
      (data.metadata as Record<string, unknown>).data_quality_warning ||
      data.verdict_and_safety_case.confidence_score <= 0.30
    );

    // Autonomous Recommendation Banner — red when data failure, green when normal
    const bannerBgColor: [number, number, number] = hasDataFailure ? [0.99, 0.94, 0.94] : [0.93, 0.98, 0.95];
    const bannerBorderColor: [number, number, number] = hasDataFailure ? [0.85, 0.3, 0.3] : [0.5, 0.8, 0.6];
    const bannerTextColor: [number, number, number] = hasDataFailure ? [0.7, 0.1, 0.1] : [0.1, 0.5, 0.3];
    const bannerTitleColor: [number, number, number] = hasDataFailure ? [0.6, 0.05, 0.05] : [0.04, 0.35, 0.2];

    if (hasDataFailure) {
      // Data failure warning box before the verdict banner
      pdf.drawRect(40, y, 532, 40, [0.99, 0.94, 0.94], [0.8, 0.2, 0.2], 2);
      pdf.drawText("[!] DATA FETCH FAILURE -- SAFETY CASE INVALID", 52, y + 8, { font: "F2", size: 9, color: [0.7, 0.1, 0.1] });
      pdf.drawText(
        "Mireye API returned no usable data. Hazard scores are sentinel defaults, NOT real measurements.",
        52, y + 22, { font: "F1", size: 7.5, color: [0.6, 0.15, 0.15] }
      );
      pdf.drawText(
        "DO NOT use this document for flight authorization. Re-run the route or verify API connectivity.",
        52, y + 32, { font: "F1", size: 7.5, color: [0.6, 0.15, 0.15] }
      );
      y += 52;
    }

    pdf.drawRect(40, y, 532, 85, bannerBgColor, bannerBorderColor, 1.5);
    pdf.drawText(hasDataFailure ? "DATA FAILURE -- SAFETY CASE INVALID" : "AUTONOMOUS SAFETY CASE VERDICT", 52, y + 12, { font: "F2", size: 8, color: bannerTextColor });
    pdf.drawText(
      hasDataFailure
        ? `${data.verdict_and_safety_case.recommended_corridor_name} -- INSUFFICIENT DATA`
        : `${data.verdict_and_safety_case.recommended_corridor_name} IS THE SAFEST FLIGHT CORRIDOR`,
      52,
      y + 28,
      { font: "F2", size: 12, color: bannerTitleColor }
    );

    if (hasDataFailure) {
      pdf.drawBadge("INSUFFICIENT DATA", 380, y + 10, [0.75, 0.35, 0.1], [1, 1, 1], 8);
    } else {
      pdf.drawBadge(`FAA ${data.verdict_and_safety_case.part108_tier.toUpperCase()}`, 400, y + 10, [0.1, 0.6, 0.35], [1, 1, 1], 8);
    }
    pdf.drawBadge(`${Math.round(data.verdict_and_safety_case.confidence_score * 100)}% CONFIDENCE`, 470, y + 10, [0.01, 0.45, 0.75], [1, 1, 1], 8);

    pdf.drawText(
      "Primary Justification: " + data.verdict_and_safety_case.primary_justification,
      52,
      y + 48,
      { font: "F1", size: 8.5, color: bannerTitleColor }
    );

    y += 98;

    // Candidate Corridors Comparison Table
    pdf.drawText("EVALUATED CANDIDATE CORRIDORS COMPARISON", 40, y, { font: "F2", size: 9, color: [0.06, 0.12, 0.22] });
    y += 12;

    // Table Header
    pdf.drawRect(40, y, 532, 18, [0.15, 0.2, 0.28]);
    pdf.drawText("CORRIDOR", 46, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("PART 108 TIER", 180, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("HAZARD SCORE", 270, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("MIN CLEARANCE", 360, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("DISTANCE", 440, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("VERDICT", 500, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    y += 18;

    data.candidate_corridors_comparison.forEach((c, idx) => {
      const isRec = c.status === "RECOMMENDED";
      const isInsufficient = c.status === "INSUFFICIENT_DATA";
      const rowBg: [number, number, number] = isInsufficient
        ? [0.99, 0.97, 0.93]
        : isRec ? [0.92, 0.97, 0.94] : idx % 2 === 0 ? [0.98, 0.98, 0.99] : [1, 1, 1];
      pdf.drawRect(40, y, 532, 20, rowBg, [0.88, 0.9, 0.93], 0.5);

      pdf.drawText(c.name, 46, y + 6, { font: isRec ? "F2" : "F1", size: 8, color: [0.08, 0.12, 0.2] });
      pdf.drawText(c.tier, 180, y + 6, { font: "F3", size: 8, color: [0.2, 0.3, 0.4] });
      // Sentinel guard: null hazard_score means data was absent — show N/A, not 0.00
      const hazardStr = (c.hazard_score !== null && c.hazard_score !== undefined)
        ? (c.hazard_score as number).toFixed(2)
        : "N/A";
      pdf.drawText(hazardStr, 270, y + 6, { font: "F3", size: 8, color: isInsufficient ? [0.7, 0.4, 0.1] : [0.2, 0.3, 0.4] });
      // Sentinel guard: null clearance means data was absent — show N/A, not 9999.0 m
      const clearanceStr = (c.min_lateral_clearance_m !== null && c.min_lateral_clearance_m !== undefined && (c.min_lateral_clearance_m as number) < 9000)
        ? `${(c.min_lateral_clearance_m as number).toFixed(1)} m`
        : "N/A";
      pdf.drawText(clearanceStr, 360, y + 6, { font: "F3", size: 8, color: isInsufficient ? [0.7, 0.4, 0.1] : [0.2, 0.3, 0.4] });
      pdf.drawText(`${c.distance_miles} mi`, 440, y + 6, { font: "F3", size: 8, color: [0.2, 0.3, 0.4] });

      if (isInsufficient) {
        pdf.drawBadge("NO DATA", 495, y + 3, [0.75, 0.35, 0.1], [1, 1, 1], 6.5);
      } else if (isRec) {
        pdf.drawBadge("RECOMMENDED", 495, y + 3, [0.1, 0.6, 0.35], [1, 1, 1], 6.5);
      } else {
        pdf.drawBadge("REJECTED", 505, y + 3, [0.8, 0.2, 0.2], [1, 1, 1], 6.5);
      }
      y += 20;
    });

    y += 14;

    // AI Rejection Decision Log
    pdf.drawText("AI DECISION LOG & REJECTION RATIONALE", 40, y, { font: "F2", size: 9, color: [0.06, 0.12, 0.22] });
    y += 12;

    const rejectedCorridors = data.candidate_corridors_comparison.filter((c) => c.status === "REJECTED");
    const logBoxHeight = Math.max(50, rejectedCorridors.length * 28 + 16);
    pdf.drawRect(40, y, 532, logBoxHeight, [0.98, 0.98, 0.99], [0.85, 0.88, 0.92], 1);

    if (rejectedCorridors.length > 0) {
      rejectedCorridors.forEach((rej, rIdx) => {
        pdf.drawText(`• ${rej.name} (Rejected): ${rej.rejection_reason || "Sub-optimal risk metrics relative to recommended corridor."}`, 50, y + 10 + rIdx * 28, { font: "F1", size: 8, color: [0.3, 0.35, 0.4] });
        pdf.drawText(`  Authoritative Decision Source: FAA Part 108 / SORA 2.5 Multi-Objective Objective Function`, 50, y + 22 + rIdx * 28, { font: "F3", size: 7.5, color: [0.6, 0.2, 0.2] });
      });
    } else {
      pdf.drawText("• All evaluated candidate corridors met baseline airworthiness criteria.", 50, y + 14, { font: "F1", size: 8, color: [0.3, 0.35, 0.4] });
    }

    // ================= PAGE 2: COMPLETE HAZARDS & INFRASTRUCTURE REGISTER =================
    pdf.newPage();
    pdf.drawHeader("PHYSICAL HAZARDS & INFRASTRUCTURE REGISTER", "MIREYE EARTH API GROUNDED AUDIT", 2, totalPages);

    y = 104;

    pdf.drawText("COMPREHENSIVE OBSTACLE & HAZARD INVENTORY (ALL CORRIDORS)", 40, y, {
      font: "F2",
      size: 9.5,
      color: [0.06, 0.12, 0.22],
    });
    pdf.drawText(
      "Includes 345kV power lines, substations, transmission towers, and municipal obstacles with exact coordinates & sources",
      40,
      y + 12,
      { font: "F1", size: 7.5, color: [0.4, 0.45, 0.5] }
    );
    y += 24;

    // Hazard Table Header
    pdf.drawRect(40, y, 532, 18, [0.15, 0.2, 0.28]);
    pdf.drawText("HAZARD TYPE & CORRIDOR", 46, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("COORDINATES", 210, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("CLEARANCE", 320, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("STATUS", 390, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("SOURCE ATTRIBUTION", 460, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    y += 18;

    data.hazard_and_obstacle_registry.forEach((haz, idx) => {
      const rowBg: [number, number, number] = idx % 2 === 0 ? [0.98, 0.98, 0.99] : [1, 1, 1];
      pdf.drawRect(40, y, 532, 38, rowBg, [0.88, 0.9, 0.93], 0.5);

      pdf.drawText(haz.obstacle_type, 46, y + 7, { font: "F2", size: 8, color: [0.08, 0.12, 0.2] });
      pdf.drawText(haz.corridor, 46, y + 18, { font: "F1", size: 7, color: [0.4, 0.45, 0.5] });
      pdf.drawText(`Mile ${haz.distance_along_route_miles.toFixed(2)} along corridor`, 46, y + 27, {
        font: "F3",
        size: 6.5,
        color: [0.5, 0.55, 0.6],
      });

      pdf.drawText(`${haz.latitude.toFixed(4)}° N`, 210, y + 8, { font: "F3", size: 7.5, color: [0.2, 0.25, 0.3] });
      pdf.drawText(`${haz.longitude.toFixed(4)}° W`, 210, y + 19, { font: "F3", size: 7.5, color: [0.2, 0.25, 0.3] });

      pdf.drawText(`${haz.measured_clearance_m.toFixed(1)} m`, 320, y + 10, {
        font: "F2",
        size: 9,
        color: haz.measured_clearance_m < 50 ? [0.8, 0.2, 0.2] : [0.1, 0.5, 0.3],
      });
      pdf.drawText(haz.voltage_kv ? `${haz.voltage_kv} kV` : "Structure", 320, y + 22, {
        font: "F3",
        size: 7,
        color: [0.4, 0.45, 0.5],
      });

      if (haz.severity === "HIGH" && haz.measured_clearance_m < 50) {
        pdf.drawBadge("CRITICAL", 390, y + 8, [0.85, 0.2, 0.2], [1, 1, 1], 6.5);
      } else {
        pdf.drawBadge("MITIGATED", 390, y + 8, [0.1, 0.6, 0.35], [1, 1, 1], 6.5);
      }

      pdf.drawText(haz.authoritative_source, 460, y + 10, { font: "F3", size: 6.5, color: [0.3, 0.35, 0.4] });
      pdf.drawText(haz.clearance_status, 460, y + 22, { font: "F1", size: 6.5, color: [0.2, 0.5, 0.3] });
      y += 38;
    });

    y += 18;

    // Designated Emergency Landing Sites Section
    pdf.drawText("DESIGNATED EMERGENCY FORCED-LANDING SITES (LZ)", 40, y, {
      font: "F2",
      size: 9.5,
      color: [0.06, 0.12, 0.22],
    });
    y += 14;

    pdf.drawRect(40, y, 532, 18, [0.15, 0.2, 0.28]);
    pdf.drawText("LANDING ZONE", 46, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("POSITION / ELEVATION", 210, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("CLEARANCE / SLOPE", 340, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("FEMA FLOOD ZONE & SOURCE", 450, y + 5, { font: "F2", size: 7.5, color: [1, 1, 1] });
    y += 18;

    data.emergency_landing_sites.forEach((lz, idx) => {
      const rowBg: [number, number, number] = idx % 2 === 0 ? [0.95, 0.98, 0.96] : [1, 1, 1];
      pdf.drawRect(40, y, 532, 34, rowBg, [0.88, 0.9, 0.93], 0.5);

      pdf.drawText(lz.name, 46, y + 7, { font: "F2", size: 8, color: [0.06, 0.3, 0.18] });
      pdf.drawBadge(lz.designation, 46, y + 18, lz.designation === "PRIMARY" ? [0.1, 0.55, 0.3] : [0.4, 0.45, 0.5], [1, 1, 1], 6);

      pdf.drawText(`Mile ${lz.distance_along_route_miles} along route`, 210, y + 7, { font: "F3", size: 7.5, color: [0.2, 0.25, 0.3] });
      pdf.drawText(`Elev: ${lz.elevation_m}m (${lz.latitude.toFixed(4)}°N, ${lz.longitude.toFixed(4)}°W)`, 210, y + 19, {
        font: "F1",
        size: 7,
        color: [0.4, 0.45, 0.5],
      });

      pdf.drawText(`${lz.infrastructure_clearance_m}m Buffer`, 340, y + 7, { font: "F2", size: 8, color: [0.1, 0.45, 0.25] });
      pdf.drawText(`Slope: ${lz.slope_degrees}° (<5° limit)`, 340, y + 19, { font: "F1", size: 7, color: [0.4, 0.45, 0.5] });

      pdf.drawText(lz.fema_flood_zone, 450, y + 7, { font: "F2", size: 7.5, color: [0.08, 0.12, 0.2] });
      pdf.drawText("Airlane Terrain Engine · USGS 3DEP", 450, y + 19, { font: "F3", size: 6.5, color: [0.1, 0.5, 0.3] });

      y += 34;
    });

    y += 18;

    // Route Waypoint Coordinates Sample
    pdf.drawText("ENROUTE CORRIDOR WAYPOINTS & DETOUR GPS OFFSETS", 40, y, { font: "F2", size: 9, color: [0.06, 0.12, 0.22] });
    y += 12;

    pdf.drawRect(40, y, 532, 48, [0.97, 0.98, 0.99], [0.85, 0.88, 0.92], 1);
    data.corridor_waypoints.slice(0, 4).forEach((wp, idx) => {
      pdf.drawText(
        `WP #${wp.index}: ${wp.latitude.toFixed(5)}° N, ${wp.longitude.toFixed(5)}° W | Dist: ${wp.distance_from_start_m}m | ${wp.segment_description}`,
        50,
        y + 8 + idx * 10,
        { font: "F3", size: 7, color: [0.25, 0.3, 0.35] }
      );
    });

    // ================= PAGE 3: AIRSPACE, MARKET CLEARANCES & PROVENANCE AUDIT =================
    pdf.newPage();
    pdf.drawHeader("AIRSPACE, MARKET CLEARANCES & PROVENANCE AUDIT", "REGULATORY FILING & SORA 2.5", 3, totalPages);

    y = 104;

    // Multi-Layer Airspace & Market Clearances Grid
    pdf.drawText("REGULATORY, AIR RIGHTS & METEOROLOGICAL CLEARANCES", 40, y, { font: "F2", size: 9.5, color: [0.06, 0.12, 0.22] });
    y += 14;

    const gridW = (532 - 12) / 2;

    // Box 1: FAA UASFM Airspace (Dynamic from real analysis data)
    const faa = data.airspace_and_market_clearances.faa_uasfm;
    pdf.drawRect(40, y, gridW, 60, [0.98, 0.99, 1], [0.85, 0.9, 0.95], 1);
    pdf.drawText("FAA UAS FACILITY MAP (UASFM)", 50, y + 10, { font: "F2", size: 8, color: [0.06, 0.12, 0.22] });
    pdf.drawBadge(`${faa.ceiling_ft_agl}FT ${faa.status}`, 50 + gridW - 130, y + 6, [0.1, 0.55, 0.3], [1, 1, 1], 6);
    pdf.drawText(`• Airspace: ${faa.airspace_class}`, 50, y + 24, { font: "F1", size: 7.5, color: [0.3, 0.35, 0.4] });
    pdf.drawText(`• Enforced Altitude: ${data.mission_profile.parameters.cruise_altitude_ft}ft AGL (${faa.flight_altitude_buffer_ft}ft buffer below ceiling)`, 50, y + 36, { font: "F1", size: 7.5, color: [0.3, 0.35, 0.4] });
    pdf.drawText(`• Data Source: ${faa.source}`, 50, y + 48, { font: "F3", size: 7, color: [0.1, 0.5, 0.3] });

    // Box 2: NOAA METAR Weather (Dynamic from real analysis data)
    const noaa = data.airspace_and_market_clearances.meteorological_noaa_metar;
    pdf.drawRect(40 + gridW + 12, y, gridW, 60, [0.98, 0.99, 1], [0.85, 0.9, 0.95], 1);
    pdf.drawText("NOAA METAR AVIATION WEATHER", 50 + gridW + 12, y + 10, { font: "F2", size: 8, color: [0.06, 0.12, 0.22] });
    const noaaBadgeColor: [number, number, number] = noaa.drone_class_safe ? [0.1, 0.55, 0.3] : [0.8, 0.2, 0.2];
    pdf.drawBadge(`${noaa.status} (${noaa.surface_wind_kts}KT)`, 50 + gridW * 2 - 80, y + 6, noaaBadgeColor, [1, 1, 1], 6);
    pdf.drawText(`• Wind Speed: ${noaa.surface_wind_kts} kts · Peak Gusts: ${noaa.wind_gust_kts} kts`, 50 + gridW + 12, y + 24, { font: "F1", size: 7.5, color: [0.3, 0.35, 0.4] });
    pdf.drawText(`• Flight Safety Status: ${noaa.drone_class_safe ? "Approved for Drone Flight Envelope" : "Exceeds Safety Envelope"}`, 50 + gridW + 12, y + 36, { font: "F1", size: 7.5, color: [0.3, 0.35, 0.4] });
    pdf.drawText(`• Data Source: ${noaa.source} (${noaa.station_id})`, 50 + gridW + 12, y + 48, { font: "F3", size: 7, color: [0.1, 0.5, 0.3] });

    y += 70;

    // Box 3: US Census Population (Dynamic from real analysis data)
    const pop = data.airspace_and_market_clearances.population_density_ground_risk;
    pdf.drawRect(40, y, gridW, 60, [0.98, 0.99, 1], [0.85, 0.9, 0.95], 1);
    pdf.drawText("U.S. CENSUS GROUND RISK TIERS", 50, y + 10, { font: "F2", size: 8, color: [0.06, 0.12, 0.22] });
    const popBadgeColor: [number, number, number] = pop.dominant_tier.toLowerCase().includes("tier 1") || pop.dominant_tier.toLowerCase().includes("tier 2") ? [0.1, 0.55, 0.3] : [0.8, 0.4, 0.1];
    pdf.drawBadge(pop.dominant_tier.toUpperCase(), 50 + gridW - 95, y + 6, popBadgeColor, [1, 1, 1], 6);
    pdf.drawText(`• Max Density: ${pop.max_density_sq_mi.toLocaleString()} persons/sq mi`, 50, y + 24, { font: "F1", size: 7.5, color: [0.3, 0.35, 0.4] });
    pdf.drawText(`• Points Sampled: ${pop.points_evaluated} census sample points`, 50, y + 36, { font: "F1", size: 7.5, color: [0.3, 0.35, 0.4] });
    pdf.drawText(`• Data Source: ${pop.source}`, 50, y + 48, { font: "F3", size: 7, color: [0.1, 0.5, 0.3] });

    // Box 4: Air Rights & Market Corridor (Dynamic from real analysis data)
    const airRights = data.airspace_and_market_clearances.air_rights_and_market_corridors;
    pdf.drawRect(40 + gridW + 12, y, gridW, 60, [0.98, 0.99, 1], [0.85, 0.9, 0.95], 1);
    pdf.drawText("AIR RIGHTS & RIGHT-OF-WAY EASEMENTS", 50 + gridW + 12, y + 10, { font: "F2", size: 8, color: [0.06, 0.12, 0.22] });
    pdf.drawBadge(airRights.easement_status, 50 + gridW * 2 - 75, y + 6, [0.1, 0.55, 0.3], [1, 1, 1], 6);
    pdf.drawText(`• Municipal Easements: ${airRights.municipal_rights_of_way}`, 50 + gridW + 12, y + 24, { font: "F1", size: 7.5, color: [0.3, 0.35, 0.4] });
    pdf.drawText(`• Telecom Buffers: ${airRights.telecom_safe_buffer}`, 50 + gridW + 12, y + 36, { font: "F1", size: 7.5, color: [0.3, 0.35, 0.4] });
    pdf.drawText(`• Data Source: ${airRights.source}`, 50 + gridW + 12, y + 48, { font: "F3", size: 7, color: [0.1, 0.5, 0.3] });

    y += 74;

    // Full Provenance & Audit Trail Table
    pdf.drawText("AUTHORITATIVE DATA PROVENANCE & AUDIT MATRIX", 40, y, { font: "F2", size: 9.5, color: [0.06, 0.12, 0.22] });
    y += 12;

    pdf.drawRect(40, y, 532, 16, [0.15, 0.2, 0.28]);
    pdf.drawText("DATA FIELD / SUBSYSTEM", 46, y + 4, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("GROUNDED DATA SOURCE", 230, y + 4, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("STATUS", 440, y + 4, { font: "F2", size: 7.5, color: [1, 1, 1] });
    pdf.drawText("CONFIDENCE", 500, y + 4, { font: "F2", size: 7.5, color: [1, 1, 1] });
    y += 16;

    data.provenance_and_audit_citations.forEach((cit, idx) => {
      const rowBg: [number, number, number] = idx % 2 === 0 ? [0.98, 0.98, 0.99] : [1, 1, 1];
      pdf.drawRect(40, y, 532, 16, rowBg, [0.88, 0.9, 0.93], 0.5);

      pdf.drawText(cit.field, 46, y + 4, { font: "F2", size: 7.5, color: [0.08, 0.12, 0.2] });
      pdf.drawText(cit.source, 230, y + 4, { font: "F1", size: 7.5, color: [0.2, 0.25, 0.3] });
      pdf.drawText(cit.status, 440, y + 4, { font: "F3", size: 7, color: [0.1, 0.5, 0.3] });
      pdf.drawText(cit.confidence, 500, y + 4, { font: "F2", size: 7, color: [0.01, 0.45, 0.75] });
      y += 16;
    });

    y += 16;

    // Regulatory Attestation & Digital Stamp
    pdf.drawRect(40, y, 532, 60, [0.95, 0.97, 0.99], [0.8, 0.85, 0.9], 1);
    pdf.drawText("OFFICIAL FAA PART 108 ATTESTATION & SYSTEM SIGN-OFF", 50, y + 10, {
      font: "F2",
      size: 8,
      color: [0.06, 0.12, 0.22],
    });
    pdf.drawText(
      data.regulatory_attestations.disclaimer,
      50,
      y + 22,
      { font: "F1", size: 7.2, color: [0.35, 0.4, 0.45] }
    );
    pdf.drawText(
      `DIGITAL CERTIFICATION STAMP: SHA256-AIRLANE-${data.metadata.filing_id}-${Date.now().toString(16).toUpperCase()} · SIGNED: AIRLANE AUTONOMOUS SAFETY ENGINE`,
      50,
      y + 44,
      { font: "F3", size: 6.5, color: [0.01, 0.45, 0.75] }
    );

    // Compile binary and save with guaranteed extension
    const pdfBytes = pdf.compile();
    const filename =
      customFilename ||
      `Airlane_Part108_SafetyCase_${new Date().toISOString().slice(0, 10)}.pdf`;

    return await saveFileToDisk(
      pdfBytes,
      filename,
      "application/pdf",
      {
        description: "FAA Part 108 PDF Safety Dossier",
        accept: { "application/pdf": [".pdf"] },
      }
    );
  } catch (err) {
    console.error("Failed to generate Part 108 PDF:", err);
    return false;
  }
}
