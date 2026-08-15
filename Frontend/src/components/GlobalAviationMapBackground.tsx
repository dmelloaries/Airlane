import React from "react";

/**
 * GlobalAviationMapBackground
 * 
 * Ultra-refined, minimalist cartographic vector world map with global air routes.
 * Designed with a soft radial focus mask so the background is whisper-quiet,
 * elegant, and never competes with or camouflages the foreground UI cards and typography.
 */
export const GlobalAviationMapBackground: React.FC = () => {
  return (
    <div
      className="absolute inset-0 pointer-events-none select-none overflow-hidden"
      aria-hidden="true"
      style={{ minWidth: "100%", minHeight: "100%" }}
    >
      <svg
        className="w-full h-full object-cover opacity-60"
        viewBox="0 0 2000 1000"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Center Focus Scrim Mask: Softens the map under center content/cards so UI is razor-sharp */}
          <radialGradient id="centerFadeMaskGrad" cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="85%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="1.0" />
          </radialGradient>
          <mask id="centerContentMask">
            <rect width="2000" height="1000" fill="url(#centerFadeMaskGrad)" />
          </mask>

          {/* Subtle Ambient Ocean Gradient */}
          <radialGradient id="oceanAmbient" cx="50%" cy="40%" r="75%">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.03" />
            <stop offset="70%" stopColor="#0369a1" stopOpacity="0.015" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.0" />
          </radialGradient>

          {/* Landmass Shading Pattern & Gradients */}
          <linearGradient id="landmassSmooth" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.70" />
            <stop offset="100%" stopColor="#f1f5f9" stopOpacity="0.50" />
          </linearGradient>

          {/* Delicate Flight Route Gradients */}
          <linearGradient id="routeRoseMuted" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.40" />
            <stop offset="50%" stopColor="#fb7185" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.40" />
          </linearGradient>

          <linearGradient id="routeCyanMuted" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.30" />
          </linearGradient>

          {/* Glow filter for active beacon flights */}
          <filter id="subtleBeaconGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Global Masked Map Group */}
        <g mask="url(#centerContentMask)">
          {/* Subtle Ocean Shimmer */}
          <rect width="2000" height="1000" fill="url(#oceanAmbient)" />

          {/* =========================================================
              1. MINIMAL CARTOGRAPHIC GRATICULE (WHISPER-QUIET LINES)
              ========================================================= */}
          <g id="graticule-grid" stroke="#64748b" strokeWidth="0.6" strokeOpacity="0.12" fill="none">
            {/* Parallels (Latitude lines) */}
            <line x1="0" y1="131" x2="2000" y2="131" strokeDasharray="6,6" strokeOpacity="0.10" /> {/* Arctic Circle */}
            <line x1="0" y1="250" x2="2000" y2="250" strokeOpacity="0.08" /> {/* 45° N */}
            <line x1="0" y1="370" x2="2000" y2="370" strokeDasharray="4,4" stroke="#0284c7" strokeOpacity="0.18" /> {/* Tropic of Cancer */}
            
            {/* Equator (0°) */}
            <line x1="0" y1="500" x2="2000" y2="500" stroke="#0284c7" strokeWidth="0.9" strokeOpacity="0.22" strokeDasharray="8,4" />

            {/* Southern Parallels */}
            <line x1="0" y1="631" x2="2000" y2="631" strokeDasharray="4,4" stroke="#0284c7" strokeOpacity="0.18" /> {/* Tropic of Capricorn */}
            <line x1="0" y1="750" x2="2000" y2="750" strokeOpacity="0.08" /> {/* 45° S */}
            <line x1="0" y1="869" x2="2000" y2="869" strokeDasharray="6,6" strokeOpacity="0.10" /> {/* Antarctic Circle */}

            {/* Meridians (every 30°) */}
            {[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map((i) => {
              const x = i * 83.33;
              const isPrime = i === 12;
              return (
                <line
                  key={`meridian-${i}`}
                  x1={x}
                  y1="50"
                  x2={x}
                  y2="950"
                  stroke={isPrime ? "#0284c7" : "#64748b"}
                  strokeWidth={isPrime ? 0.8 : 0.5}
                  strokeOpacity={isPrime ? 0.22 : 0.08}
                  strokeDasharray={isPrime ? "none" : "4,4"}
                />
              );
            })}
          </g>

          {/* =========================================================
              2. CONTINENTS SILHOUETTES (CLEAN, SMOOTH, UNOBTRUSIVE)
              ========================================================= */}
          <g
            id="continents-layer"
            fill="url(#landmassSmooth)"
            stroke="#cbd5e1"
            strokeWidth="0.85"
            strokeOpacity="0.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            {/* North America */}
            <path
              d="M 120,130 
                 Q 140,110 170,120 
                 Q 200,105 240,120 
                 Q 270,100 310,110 
                 L 335,85 
                 Q 360,70 410,75 
                 Q 440,90 445,120 
                 Q 410,135 390,140 
                 L 385,170 
                 Q 410,165 440,185 
                 Q 490,195 530,170 
                 Q 565,190 585,220 
                 L 590,260 
                 Q 580,285 570,305 
                 Q 555,325 560,355 
                 Q 550,370 540,370 
                 Q 525,350 495,340 
                 L 460,350 
                 Q 445,370 460,390 
                 L 485,410 
                 Q 530,430 558,450 
                 Q 545,465 520,445 
                 L 465,415 
                 Q 430,380 415,350 
                 L 380,335 
                 Q 355,340 340,310 
                 L 320,290 
                 Q 310,260 300,230 
                 L 280,210 
                 Q 240,210 200,190 
                 L 160,185 
                 Q 130,170 120,130 Z"
            />

            {/* Greenland */}
            <path
              d="M 670,80 
                 Q 730,70 780,95 
                 Q 800,130 760,170 
                 Q 720,185 680,150 
                 Q 655,120 670,80 Z"
            />

            {/* South America */}
            <path
              d="M 558,450 
                 Q 590,435 635,440 
                 Q 680,450 720,475 
                 Q 765,510 790,560 
                 Q 805,600 780,635 
                 Q 740,670 710,720 
                 Q 680,780 655,830 
                 L 640,835 
                 Q 635,790 630,740 
                 Q 610,690 595,640 
                 Q 570,580 560,530 
                 L 555,490 
                 Q 545,465 558,450 Z"
            />

            {/* Europe */}
            <path
              d="M 960,285 
                 Q 960,255 985,245 
                 L 1005,240 
                 Q 995,215 1025,200 
                 L 1045,215 
                 Q 1060,185 1075,160 
                 Q 1090,130 1110,140 
                 Q 1130,170 1105,200 
                 L 1100,230 
                 Q 1130,240 1150,265 
                 L 1140,290 
                 Q 1110,295 1095,275 
                 L 1080,290 
                 Q 1055,275 1040,290 
                 L 1010,290 
                 Q 985,300 960,285 Z"
            />
            {/* British Isles */}
            <path d="M 985,185 Q 1000,175 1010,195 Q 1000,225 985,215 Z" />
            <path d="M 965,195 Q 975,190 978,205 Q 970,215 965,205 Z" />

            {/* Africa */}
            <path
              d="M 960,305 
                 Q 1020,300 1080,310 
                 Q 1135,315 1170,335 
                 Q 1205,370 1235,420 
                 Q 1260,460 1250,500 
                 Q 1230,550 1200,610 
                 Q 1170,680 1135,715 
                 L 1105,710 
                 Q 1080,660 1065,590 
                 Q 1050,540 1015,510 
                 L 970,505 
                 Q 920,490 890,440 
                 Q 880,380 910,340 
                 Q 930,320 960,305 Z"
            />
            {/* Madagascar */}
            <path d="M 1265,605 Q 1285,615 1280,670 Q 1265,680 1255,640 Z" />

            {/* Asia & Eurasia */}
            <path
              d="M 1150,230 
                 Q 1220,180 1300,165 
                 Q 1380,150 1480,155 
                 Q 1580,160 1660,140 
                 Q 1740,130 1820,160 
                 L 1850,195 
                 Q 1810,225 1770,240 
                 Q 1730,255 1715,280 
                 L 1720,305 
                 Q 1690,320 1660,325 
                 Q 1650,365 1630,390 
                 Q 1590,420 1570,470 
                 L 1550,475 
                 Q 1540,430 1515,400 
                 Q 1480,380 1445,395 
                 Q 1410,430 1395,435 
                 Q 1370,400 1350,380 
                 Q 1320,365 1290,365 
                 L 1255,390 
                 Q 1220,350 1205,310 
                 Q 1170,270 1150,230 Z"
            />
            {/* Japan */}
            <path d="M 1750,270 Q 1785,280 1795,315 Q 1770,335 1745,310 Z" />

            {/* Australia */}
            <path
              d="M 1640,650 
                 Q 1690,620 1750,625 
                 Q 1800,600 1845,630 
                 Q 1870,680 1855,735 
                 Q 1810,770 1760,765 
                 Q 1700,775 1655,745 
                 Q 1620,700 1640,650 Z"
            />
            {/* New Zealand */}
            <path d="M 1940,710 Q 1965,700 1960,735 Q 1940,740 1940,710 Z" />

            {/* Antarctica */}
            <path
              d="M 0,935 
                 Q 400,915 800,925 
                 Q 1200,910 1600,930 
                 L 2000,925 
                 L 2000,1000 
                 L 0,1000 Z"
              strokeOpacity="0.25"
            />
          </g>

          {/* =========================================================
              3. AIR ROUTE NETWORK (SOFT, REFINED, HARMONIOUS CURVES)
              ========================================================= */}
          <g id="flight-corridors" fill="none">
            {/* Cyan/Sky Secondary Corridors */}
            <g stroke="url(#routeCyanMuted)" strokeWidth="0.85" strokeDasharray="3,2">
              <path d="M 180,140 L 315,230" />
              <path d="M 315,230 L 515,268" />
              <path d="M 320,291 L 465,335" />
              <path d="M 465,335 L 555,360" />
              <path d="M 515,268 L 575,285" />
              <path d="M 558,450 L 628,442 L 670,460 L 760,628" />
              <path d="M 588,474 L 564,499 L 572,567 L 740,630" />
              <path d="M 607,686 L 675,692" />
              <path d="M 878,144 L 999,214 L 1090,170" />
              <path d="M 1048,221 L 1209,190" />
              <path d="M 979,275 L 1069,267 L 1132,290 L 1173,333" />
              <path d="M 890,418 L 1018,464 L 1085,524 L 1155,645" />
              <path d="M 1204,507 L 1220,522 L 1319,612 L 1643,677" />
              <path d="M 1285,301 L 1412,325 L 1429,341" />
              <path d="M 1429,341 L 1490,375 L 1558,424" />
              <path d="M 1404,394 L 1446,428 L 1443,462 L 1576,492" />
              <path d="M 1576,492 L 1593,534 L 1643,677 L 1805,710 L 1840,688" />
              <path d="M 1840,688 L 1970,704" />
              <path d="M 1672,419 L 1634,376 L 1675,326" />
              <path d="M 1646,278 L 1705,291 L 1776,301" />
            </g>

            {/* Muted Rose/Coral Main Arcs */}
            <g stroke="url(#routeRoseMuted)" strokeWidth="1.0" strokeLinecap="round">
              <path d="M 589,274 Q 780,180 999,214" /> {/* NY -> London */}
              <path d="M 589,274 Q 800,195 1013,229" /> {/* NY -> Paris */}
              <path d="M 575,285 Q 810,210 1048,221" /> {/* DC -> Frankfurt */}
              <path d="M 555,360 Q 750,300 979,275" /> {/* Miami -> Lisbon */}
              <path d="M 555,360 Q 720,400 890,418" /> {/* Miami -> Dakar */}
              <path d="M 740,630 Q 860,490 890,418" /> {/* Sao Paulo -> Dakar */}
              <path d="M 675,692 Q 880,720 1102,688" /> {/* Buenos Aires -> Cape Town */}

              {/* Trans-America */}
              <path d="M 320,291 Q 450,240 589,274" /> {/* SFO -> JFK */}
              <path d="M 320,291 L 344,311 L 450,395 L 558,450" />
              <path d="M 558,450 L 588,474 L 572,567 L 607,686" />

              {/* Trans-Eurasia & Middle East */}
              <path d="M 999,214 Q 1150,260 1307,360" /> {/* London -> Dubai */}
              <path d="M 1048,221 Q 1240,250 1429,341" /> {/* Frankfurt -> Delhi */}
              <path d="M 1013,229 Q 1100,280 1173,333" /> {/* Paris -> Cairo */}
              <path d="M 1173,333 L 1307,360 L 1404,394" />
              <path d="M 1307,360 Q 1440,380 1576,492" /> {/* Dubai -> Singapore */}
              <path d="M 1307,360 Q 1480,310 1634,376" /> {/* Dubai -> Hong Kong */}
              <path d="M 1209,190 Q 1420,180 1646,278" /> {/* Moscow -> Beijing */}

              {/* Asia-Pacific */}
              <path d="M 1558,424 L 1576,492" />
              <path d="M 1576,492 Q 1700,560 1840,688" /> {/* Singapore -> Sydney */}
              <path d="M 1634,376 L 1776,301" /> {/* Hong Kong -> Tokyo */}
              <path d="M 1776,301 Q 1850,480 1840,688" /> {/* Tokyo -> Sydney */}

              {/* Pacific Rim Edge Routes */}
              <path d="M 320,291 Q 160,250 0,270" strokeDasharray="4,4" />
              <path d="M 315,230 Q 150,190 0,210" strokeDasharray="4,4" />
              <path d="M 1776,301 Q 1880,260 2000,280" strokeDasharray="4,4" />
              <path d="M 1840,688 Q 1920,670 2000,690" strokeDasharray="4,4" />
            </g>

            {/* Subtle Telemetry Pulses */}
            <circle r="2.5" fill="#0284c7" opacity="0.6" filter="url(#subtleBeaconGlow)">
              <animateMotion
                path="M 320,291 Q 450,240 589,274"
                dur="8s"
                repeatCount="indefinite"
              />
            </circle>
            <circle r="2.5" fill="#f43f5e" opacity="0.5" filter="url(#subtleBeaconGlow)">
              <animateMotion
                path="M 589,274 Q 780,180 999,214"
                dur="10s"
                repeatCount="indefinite"
              />
            </circle>
            <circle r="2.5" fill="#0284c7" opacity="0.5" filter="url(#subtleBeaconGlow)">
              <animateMotion
                path="M 1307,360 Q 1440,380 1576,492"
                dur="11s"
                repeatCount="indefinite"
              />
            </circle>
          </g>

          {/* =========================================================
              4. WAYPOINT NODES (MINIMAL, DELICATE DOTS - NO NOISY TEXT)
              ========================================================= */}
          <g id="aviation-nodes">
            {/* Primary Waypoint Nodes with subtle beacon rings */}
            {[
              { x: 320, y: 291 }, // SFO
              { x: 589, y: 274 }, // JFK
              { x: 999, y: 214 }, // LHR
              { x: 1048, y: 221 }, // FRA
              { x: 1307, y: 360 }, // DXB
              { x: 1429, y: 341 }, // DEL
              { x: 1576, y: 492 }, // SIN
              { x: 1776, y: 301 }, // HND
              { x: 1840, y: 688 }, // SYD
              { x: 740, y: 630 }, // GRU
            ].map((hub, idx) => (
              <g key={`hub-${idx}`} transform={`translate(${hub.x}, ${hub.y})`}>
                <circle
                  r="6"
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="0.8"
                  opacity="0.3"
                  className="radar-sweep-ping"
                />
                <circle r="2.5" fill="#e11d48" opacity="0.65" stroke="#ffffff" strokeWidth="1" />
              </g>
            ))}

            {/* Secondary Waypoint Nodes */}
            {[
              { x: 180, y: 140 }, { x: 315, y: 230 }, { x: 344, y: 311 }, { x: 515, y: 268 },
              { x: 575, y: 285 }, { x: 555, y: 360 }, { x: 450, y: 395 }, { x: 558, y: 450 },
              { x: 628, y: 442 }, { x: 588, y: 474 }, { x: 572, y: 567 }, { x: 607, y: 686 },
              { x: 675, y: 692 }, { x: 760, y: 628 }, { x: 878, y: 144 }, { x: 979, y: 275 },
              { x: 1013, y: 229 }, { x: 1069, y: 267 }, { x: 1132, y: 290 }, { x: 1173, y: 333 },
              { x: 890, y: 418 }, { x: 1018, y: 464 }, { x: 1085, y: 524 }, { x: 1155, y: 645 },
              { x: 1319, y: 612 }, { x: 1209, y: 190 }, { x: 1285, y: 301 }, { x: 1372, y: 362 },
              { x: 1404, y: 394 }, { x: 1446, y: 428 }, { x: 1443, y: 462 }, { x: 1490, y: 375 },
              { x: 1558, y: 424 }, { x: 1593, y: 534 }, { x: 1672, y: 419 }, { x: 1634, y: 376 },
              { x: 1675, y: 326 }, { x: 1646, y: 278 }, { x: 1705, y: 291 }, { x: 1643, y: 677 },
              { x: 1805, y: 710 }, { x: 1850, y: 638 }, { x: 1970, y: 704 }, { x: 1102, y: 688 },
            ].map((node, idx) => (
              <circle
                key={`node-${idx}`}
                cx={node.x}
                cy={node.y}
                r="1.6"
                fill="#64748b"
                opacity="0.4"
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
};
