# 🚁 Airlane — Autonomous Drone Navigation & BVLOS Safety Engine

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0+-646CFF.svg?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4.0-38B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900.svg?style=flat&logo=leaflet&logoColor=white)](https://leafletjs.com)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-2.5%20Flash-4285F4.svg?style=flat&logo=google&logoColor=white)](https://ai.google.dev)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB.svg?style=flat&logo=python&logoColor=white)](https://www.python.org/)

> **Airlane** is an autonomous mission planning, multi-corridor risk screening, and safety-case generation engine designed for commercial **Beyond Visual Line of Sight (BVLOS)** drone operations under **FAA Part 108**. It ingests ground-truth geospatial data, regulatory airspace maps, demographic density models, and live weather to generate defensible, auditable flight corridors in seconds.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [What It Does & How It Works](#-what-it-does--how-it-works)
  - [1. Multi-Corridor Candidate Generation](#1-multi-corridor-candidate-generation)
  - [2. Concurrent Multi-Source Sensory Ingestion](#2-concurrent-multi-source-sensory-ingestion)
  - [3. Pure Deterministic Compute Engine](#3-pure-deterministic-compute-engine)
  - [4. AI Safety Case Reasoning Layer](#4-ai-safety-case-reasoning-layer)
  - [5. Provenance, Auditability & Confidence Engine](#5-provenance-auditability--confidence-engine)
  - [6. Real-Time Streaming & Visual Dashboard](#6-real-time-streaming--visual-dashboard)
- [Data Resources & APIs Used](#-data-resources--apis-used)
- [Repository Structure](#-repository-structure)
- [Getting Started & Setup](#-getting-started--setup)
  - [Prerequisites](#prerequisites)
  - [Backend Setup (Python / FastAPI)](#backend-setup-python--fastapi)
  - [Frontend Setup (React / Vite)](#frontend-setup-react--vite)
- [Running Mission Analyses](#-running-mission-analyses)
  - [Via Interactive Web Dashboard](#via-interactive-web-dashboard)
  - [Via Command-Line Interface (CLI)](#via-command-line-interface-cli)
  - [Via REST API / SSE Stream](#via-rest-api--sse-stream)
- [Evaluation & Test Suite](#-evaluation--test-suite)
- [Regulatory Compliance & Disclaimer](#-regulatory-compliance--disclaimer)

---

## 📖 Overview

As the Federal Aviation Administration (FAA) transitions commercial drone delivery and infrastructure inspection to **Part 108 (BVLOS)**, operators are required to produce quantitative, auditable safety cases. Traditionally, evaluating a single BVLOS flight route requires days of manual GIS analysis: cross-referencing high-voltage transmission lines, checking FAA Class B/C/D airspace grid ceilings, calculating census tract population densities, locating emergency forced landing spots, and screening live METAR weather.

**Airlane** automates this entire pipeline into a deterministic, multi-corridor screening engine:
1. Generates 3 distinct geometric flight trajectories (direct path and lateral detours).
2. Parallel-queries 4 authoritative live data sources (Mireye Earth, FAA ArcGIS, US Census Bureau, NOAA).
3. Executes a pure mathematical compute engine to evaluate vertical obstacle clearances, worst-case Part 108 ground risk tiers, crosswinds, and landing zones.
4. Uses Google Gemini 2.5 Flash to synthesize an explainable safety case with explicit rejection rationale for suboptimal paths.
5. Emits a real-time Server-Sent Events (SSE) telemetry stream to an interactive flight operations dashboard.

---

## ✨ Key Features

- **🚀 Multi-Corridor Geometry Engine**: Evaluates three simultaneous trajectories (`Corridor A Direct`, `Corridor B +600m Right Detour`, `Corridor C -600m Left Detour`) using great-circle haversine math and quadratic Bézier curvature.
- **⚡ Parallel Multi-Source Ingestion**: Asynchronously queries Mireye Earth, FAA ArcGIS UAS Facility Maps, US Census ACS5 demographic APIs, and NOAA Aviation Weather in parallel.
- **🛡️ Pure Deterministic Compute (Zero-Hallucination)**: All quantitative scoring (obstacle clearance, population density, Part 108 tier, wind envelope, landing zones) runs in pure, testable Python functions. The LLM never invents numbers or scores.
- **📊 FAA Part 108 Ground Risk Classifier**: Geocodes coordinates to US Census Tract FIPS codes, computes population density (people/sq mi), and classifies worst-case ground risk across 5 Part 108 tiers.
- **🔌 Infrastructure & Obstacle Clearance**: Identifies high-voltage power lines (e.g., 345kV/138kV), substations, cell towers, and building structures with exact vertical clearance flags against drone cruise altitude.
- **🌿 Environmental & USFWS Critical Wildlife Habitat**: Screens for intersections with US Fish & Wildlife Service (USFWS) Critical Habitats, protected bird/wildlife species (e.g., endangered avian nesting corridors), ESA listing status, and FEMA flood zones via Mireye Earth.
- **🛬 Emergency Forced Landing Zone (FLZ) Identification**: Automatically ranks sample waypoints by minimal structural footprint and maximum open green space for contingency landings.
- **📜 Full Provenance & Audit Trail**: Every hazard, ceiling restriction, and density calculation is cited with its authoritative source, coordinate, and timestamp.
- **📡 Real-Time SSE Agent Terminal**: Operators watch the autonomous agent reason, inspect sensors, and synthesize findings via live Server-Sent Events streaming.
- **🗺️ Interactive High-Fidelity Map**: Leaflet-powered GIS visualization showing exact route polylines, color-coded hazard markers, landing zones, and obstacle callouts.
- **📑 Multi-Format Safety Case Export**: Export mission briefs to structured JSON or styled PDF dossiers.

---

## ⚙️ What It Does & How It Works

Airlane executes a structured 6-phase pipeline for every mission request:

```
[ Mission Input: Launch & Destination ]
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│  Phase 1: Multi-Corridor Candidate Generation          │
│  • Corridor A: Direct Great-Circle Path                │
│  • Corridor B: +600m Right Lateral Detour              │
│  • Corridor C: -600m Left Lateral Detour               │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Phase 2: Concurrent Multi-Source Data Ingestion       │
│  • Mireye Earth API  • FAA ArcGIS FeatureServer        │
│  • US Census ACS5    • NOAA Aviation Weather           │
│  • PostgreSQL (Neon) & SQLite Multi-Tier Cache         │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Phase 3: Pure Deterministic Compute Engine            │
│  • Obstacle & Clearance Flags (Transmission/Towers)    │
│  • Worst-Case Part 108 Population Density & Tier       │
│  • Crosswind & Tailwind Operating Envelopes            │
│  • Emergency Forced Landing Zones (FLZ)                │
│  • Multi-Criteria Pareto Ranking & Trade-Off Matrix    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Phase 4: AI Reasoning Layer (Gemini 2.5 Flash)        │
│  • Strict JSON Mission Synthesis                       │
│  • Rejection Rationale for Suboptimal Corridors        │
│  • Natural-Language Regulatory Justification           │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Phase 5: Provenance & Confidence Verification         │
│  • Source Citations & Timestamps Attached              │
│  • FAA Regulatory Disclaimer Appended                  │
│  • Dynamic Confidence Scoring (Degraded Path Handling) │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Phase 6: Streaming API & UI Operator Dashboard        │
│  • Real-Time SSE Agent Thought Stream                  │
│  • Leaflet GIS Map with Color-Coded Polylines & Pins   │
│  • Part 108 Risk Verdict Card & Audit Modal            │
└────────────────────────────────────────────────────────┘
```

### 1. Multi-Corridor Candidate Generation
Given a launch and destination (street address, landmark, or GPS coordinate), the engine computes great-circle distance and sample waypoints uniformly spaced every ~200m–400m. It generates:
- **Corridor A (Direct)**: Linear path along the shortest geographic distance.
- **Corridor B (+600m Right Detour)**: Lateral offset path curved via a quadratic Bézier control point to circumvent central infrastructure or dense populations.
- **Corridor C (-600m Left Detour)**: Opposite lateral offset path providing a third distinct tactical routing alternative.

### 2. Concurrent Multi-Source Sensory Ingestion
The engine fires asynchronous parallel queries across all sample waypoints for all three corridors simultaneously:
- **Mireye Earth API**: Power transmission lines & voltage (e.g., 345kV LCRA grid), substations, building footprints, aerodrome proximities, terrain elevation & slope, **USFWS Endangered Species Act (ESA) Critical Habitats**, **protected bird/wildlife species**, listing status, and **FEMA flood hazard zones**.
- **FAA ArcGIS UAS Facility Map**: Airspace classes (Class B, C, D, E) and maximum permissible UAS flight grid ceilings (0ft–400ft AGL).
- **US Census Bureau**: Geocodes coordinates to Census Tract FIPS codes and retrieves 5-year American Community Survey (ACS5) population counts and land area.
- **NOAA Aviation Weather Center**: METAR station weather reports for wind speed, gusts, and directional vectors.

### 3. Pure Deterministic Compute Engine
All safety calculations are handled by pure, deterministic mathematical functions:
- **Obstacle Clearance**: Compares drone cruise altitude (e.g., 300ft AGL) against Mireye transmission towers and terrain; flags points with clearance violations.
- **Worst-Case Part 108 Tier**: Computes tract population density ($D = \frac{\text{Population}}{\text{Land Area}}$) and determines the *worst-case* (highest risk) tier encountered along the corridor:
  - **Tier 1**: Rural / Sparsely Populated ($0 - 500 \text{ people/sq mi}$)
  - **Tier 2**: Low-Density Suburban ($500 - 2,000 \text{ people/sq mi}$)
  - **Tier 3**: Medium-Density Residential ($2,000 - 5,000 \text{ people/sq mi}$)
  - **Tier 4**: High-Density Urban ($5,000 - 12,000 \text{ people/sq mi}$)
  - **Tier 5**: Dense Urban Core ($> 12,000 \text{ people/sq mi}$)
- **Environmental & Critical Habitat Risk**: Evaluates USFWS Critical Habitat intersections, identifies affected waypoints, surfaces listed endangered/threatened wildlife species (e.g., protected bird nesting grounds), and tracks designation status as a distinct regulatory risk layer.
- **Wind Margin**: Computes crosswind vectors against maximum operating limits for the drone class (`micro_uav`, `small_uav`, `medium_uav`).
- **Forced Landing Zones**: Ranks points by lowest building coverage and proximity to open fields/parks.
- **Multi-Criteria Ranking**: Evaluates Pareto dominance across hazard count, ground risk tier, and flight distance to recommend the winning path and identify rejection causes for losing paths.

### 4. AI Safety Case Reasoning Layer
The computed comparison payload is passed to **Google Gemini 2.5 Flash** with strict JSON-schema constraints. The LLM is instructed **never to invent scores or numbers**; its role is strictly to:
- Synthesize human-readable mission justification.
- Explain trade-offs between corridors (e.g., *"Corridor B detours around the 345kV transmission line crossed by Corridor A at mile 1.8"*).
- State explicit reasons for rejecting the other two corridors.

### 5. Provenance, Auditability & Confidence Engine
Every assertion in the generated safety case is verified against raw data points. The engine attaches:
- Full citation metadata (data provider, endpoint, timestamp).
- Regulatory disclaimers (e.g., *"FAA UAS Facility Map data is not real-time flight authorization"*).
- Calculated confidence score (e.g., 94%), which automatically degrades if any data source times out or returns unknown values.

### 6. Real-Time Streaming & Visual Dashboard
The frontend connects via Server-Sent Events (`/analyze/stream`) to render:
- **Live Agent Terminal**: Real-time thoughts, sensor telemetry, and step-by-step progress.
- **Interactive Leaflet Map**: Corridors rendered with color coding (Green = Recommended, Blue/Amber = Detours/Rejected), clickable hazard pins, and emergency landing waypoints.
- **Verdict Dashboard**: Displays the Part 108 Tier badge, obstacle breakdown, wind vectors, and complete provenance audit trail.

---

## 🌐 Data Resources & APIs Used

Airlane integrates four distinct external data providers alongside Google Gemini for LLM synthesis:

| Data Provider | Service / Endpoint | Data Ingested | Role in BVLOS Safety Case | Auth / Access |
|---|---|---|---|---|
| **Mireye Earth** | `https://api.mireye.com/v1/earth` | Power transmission lines (voltage, towers), substations, building footprints, terrain elevation & slope, aerodromes, **USFWS Endangered Species Act (ESA) Critical Habitats**, **protected bird/wildlife species (`critical_habitat_species`)**, listing status, and **FEMA flood hazard zones**. | Vertical clearance calculation, power grid obstacle avoidance, landing zone candidate ranking, and environmental/wildlife habitat impact screening. | `MIREYE_API_KEY` (Bearer Token) |
| **Federal Aviation Administration (FAA)** | `FAA_UAS_FacilityMap_Data` on ArcGIS REST FeatureServer | Airspace classification (Class B, C, D, E) and UAS ceiling limits ($0\text{ft} - 400\text{ft}$ AGL). | Verifies maximum legal altitude and controlled airspace boundaries; attaches FAA disclaimers. | Public REST (No Key Required) |
| **US Census Bureau** | Census Geocoder (`geocoding.geo.census.gov`) & ACS5 API (`api.census.gov/data`) | Coordinates-to-Tract FIPS resolution, 5-year ACS population counts, land area ($\text{m}^2$). | Computes population density ($\text{people/sq mi}$) and assigns FAA Part 108 Ground Risk Tiers 1–5. | `CENSUS_API_KEY` (Free Instant Key) |
| **NOAA Aviation Weather Center** | `https://aviationweather.gov/data/api/metar` | Real-time METAR weather station reports, wind speed (knots), wind direction, gusts, altimeter. | Evaluates crosswind/tailwind limits against specific drone operating envelopes. | Public REST (No Key Required) |
| **Google Gemini** | Google GenAI SDK (`gemini-2.5-flash`) | Structured JSON generation for multi-corridor decision reasoning and narrative safety synthesis. | Translates pure mathematical matrices into explainable operator justifications and rejection causes. | `GEMINI_API_KEY` |
| **Komoot / Photon** | `https://photon.komoot.io/api` | OpenStreetMap POIs, landmark indexing, street address geocoding fallback. | Real-time mission origin/destination search autocomplete. | Public REST (No Key Required) |

---

## 📂 Repository Structure

```
Airlane/
├── Backend/                       # FastAPI Backend & Autonomous Agent Engine
│   ├── agent/                     # Pipeline modules
│   │   ├── corridor.py            # Phase 1: Great-circle & Bézier corridor generator
│   │   ├── fetcher.py             # Phase 2: Async parallel fetcher across 4 sources
│   │   ├── compute.py             # Phase 3: Pure deterministic scoring & ranking engine
│   │   ├── reason.py              # Phase 4: Gemini 2.5 Flash reasoning layer
│   │   ├── verify.py              # Phase 5: Provenance & confidence verification
│   │   └── run.py                 # End-to-end execution runner & CLI interface
│   ├── sources/                   # External API client adapters
│   │   ├── mireye.py              # Mireye Earth API client (caching & geocoding)
│   │   ├── faa_airspace.py        # FAA UAS Facility Map ArcGIS client
│   │   ├── population.py          # US Census Geocoder & ACS5 Tier classifier
│   │   └── noaa_wind.py           # NOAA METAR aviation weather client
│   ├── data/
│   │   └── part108_tiers.json     # Ground risk tier definition schema
│   ├── evals/                     # Offline evaluation test suites
│   │   └── test_tier_accuracy.py  # Ground risk tier lookup accuracy benchmark
│   ├── tests/                     # Unit & integration test suites
│   ├── db.py                      # PostgreSQL (Neon) & SQLite caching layer
│   ├── main.py                    # FastAPI application, SSE streamer & endpoints
│   ├── requirements.txt           # Python dependencies
│   └── .env                       # Backend environment credentials
│
├── Frontend/                      # React 19 + TypeScript + Vite Web Dashboard
│   ├── src/
│   │   ├── components/            # UI components
│   │   │   ├── MissionPlanner.tsx         # Flight planning form with live presets
│   │   │   ├── LocationAutocompleteInput.tsx # Geocoding autocomplete dropdown
│   │   │   ├── LiveAnalysisOverlay.tsx   # SSE live agent execution overlay
│   │   │   ├── AgentTerminal.tsx         # Real-time streaming terminal trace
│   │   │   ├── MapView.tsx               # Leaflet GIS visualization
│   │   │   ├── VerdictDashboard.tsx      # Part 108 verdict card & metrics
│   │   │   ├── CorridorTable.tsx         # 3-corridor itemized comparison table
│   │   │   ├── InteractiveHazardModal.tsx# Deep-dive hazard inspection modal
│   │   │   ├── ProvenanceAudit.tsx       # Timestamped provenance citations
│   │   │   └── ExportModal.tsx           # PDF & JSON safety case exporter
│   │   ├── services/
│   │   │   └── api.ts             # API client & SSE EventSource listener
│   │   ├── types/
│   │   │   └── airlane.ts         # TypeScript data interfaces
│   │   ├── App.tsx                # Main application entry
│   │   └── index.css              # Tailwind CSS v4 design system
│   ├── package.json               # Node.js dependencies
│   ├── vite.config.ts             # Vite configuration
│   └── .env                       # Frontend environment configuration
│
├── plan.md                        # Original 48-hour build roadmap & validation gates
└── README.md                      # Project documentation
```

---

## 🚀 Getting Started & Setup

### Prerequisites

Make sure you have the following installed on your workstation:
- **Python 3.10+** (Recommended: Python 3.11)
- **Node.js 18+** and **npm**
- **Git**

---

### Backend Setup (Python / FastAPI)

1. **Navigate to the Backend directory:**
   ```bash
   cd Backend
   ```

2. **Create and activate a Python virtual environment:**
   ```bash
   # Windows (PowerShell)
   python -m venv venv
   .\venv\Scripts\Activate.ps1

   # macOS / Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables:**
   Create a `.env` file in the `Backend/` directory:
   ```env
   # Google Gemini API Key for Reasoning Layer (https://ai.google.dev)
   GEMINI_API_KEY=your_gemini_api_key_here

   # US Census Bureau API Key (https://api.census.gov/data/key_signup.html)
   CENSUS_API_KEY=your_census_api_key_here

   # Mireye Earth API Key (https://mireye.com/account)
   MIREYE_API_KEY=your_mireye_api_key_here

   # (Optional) PostgreSQL Database URL for remote caching; falls back to SQLite if omitted
   DB_URL=postgresql://user:password@your-neon-host.tech/neondb?sslmode=require
   ```

5. **Start the FastAPI Backend Server:**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   The API will be live at `http://localhost:8000`. Interactive OpenAPI documentation is available at `http://localhost:8000/docs`.

---

### Frontend Setup (React / Vite)

1. **Navigate to the Frontend directory:**
   ```bash
   cd ../Frontend
   ```

2. **Install Node dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the `Frontend/` directory:
   ```env
   VITE_API_BASE_URL=http://localhost:8000
   ```

4. **Start the Vite development server:**
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:5173`.

---

## 🎮 Running Mission Analyses

### Via Interactive Web Dashboard
1. Open `http://localhost:5173` in your browser.
2. Select a curated flight preset (e.g., **"Cubberley Community Center ➔ Byxbee Park"** in Silicon Valley or **"480 Berdoll Ln ➔ 912 Elm St"** in Texas near the 345kV LCRA transmission grid) or enter custom addresses/coordinates.
3. Configure flight parameters (Cruise Altitude: 300ft AGL, Detour Offset: 600m, Drone Class: Small UAV).
4. Click **"Run BVLOS Risk Analysis"**.
5. Watch the **Live Agent Terminal** stream real-time sensor observations and render the multi-corridor safety case on the Leaflet map.

### Via Command-Line Interface (CLI)
You can run the full autonomous agent directly from your terminal:

```bash
cd Backend
python -m agent.run "480 Berdoll Ln, Cedar Creek TX" "912 Elm St, Cedar Creek TX"
```

Or using explicit GPS coordinates and custom detour offsets:
```bash
python -m agent.run "37.4172, -122.1084" "37.4481, -122.1063" --offset 600 --spacing 400 --altitude 300 --class small_uav
```

To output raw machine-readable JSON:
```bash
python -m agent.run "Cubberley Community Center" "Byxbee Park" --json
```

### Via REST API / SSE Stream

**Synchronous Analysis (`POST /analyze`):**
```bash
curl -X POST "http://localhost:8000/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "launch": "Cubberley Community Center, Palo Alto",
    "destination": "Byxbee Park, Baylands Palo Alto",
    "offset_distance_m": 600.0,
    "sample_spacing_m": 400.0,
    "cruise_altitude_ft": 300.0,
    "drone_class": "small_uav"
  }'
```

**Real-Time Server-Sent Events (`GET /analyze/stream`):**
```bash
curl -N "http://localhost:8000/analyze/stream?launch=37.4172,-122.1084&destination=37.4481,-122.1063"
```

---

## 🧪 Evaluation & Test Suite

Airlane includes automated verification tests ensuring deterministic scoring, data ingestion integrity, and zero hallucinations:

```bash
cd Backend

# Run unit and integration tests across all pipeline phases
python -m unittest discover tests/

# Run ground risk tier accuracy evaluation
python -m evals.test_tier_accuracy

# Run individual phase unit tests
python tests/test_phase1.py          # Corridor geometry & Bézier curvature
python tests/test_phase3_faa.py      # FAA airspace ceiling ingestion
python tests/test_phase4_census.py   # Census tract & tier classification
python tests/test_phase5_noaa.py     # NOAA METAR wind risk evaluation
python tests/test_phase6_compute.py  # Pure deterministic compute scoring
python tests/test_phase7_reason.py   # Gemini reasoning & JSON formatting
python tests/test_phase9_api.py      # FastAPI HTTP & SSE stream validation
```

---

## ⚖️ Regulatory Compliance & Disclaimer

> **⚠️ Regulatory Notice & Data Disclaimer:**
> 
> Airlane is a **pre-flight mission planning, risk screening, and safety-case documentation engine**. It is intended to assist Part 108 BVLOS waiver applicants, flight operations managers, and airspace safety officers in accelerating GIS analysis and quantifying risk dimensions.
>
> 1. **Not Real-Time FAA Authorization**: Ingestion of FAA UAS Facility Map data does not constitute formal FAA airspace authorization or waiver approval. Real-time authorizations must be processed through official LAANC or FAA DroneZone channels.
> 2. **Deterministic Calibration**: Population density and ground risk tier classifications are strictly mapped against published US Census Bureau ACS data and Part 108 density bands. The LLM does not generate or modify regulatory tiers.
> 3. **Degraded Path Guarantee**: In the event of network timeouts or missing sensor records, Airlane explicitly flags values as `UNKNOWN`, downgrades the safety case confidence score, and never silently presumes clear airspace or zero obstacles.

---

## 👥 Contributors & Acknowledgements

Built for the **Mireye Build Challenge**. Special thanks to:
- **Mireye Earth** for real-time infrastructure and geospatial APIs.
- **Federal Aviation Administration (FAA)** for open UAS facility airspace data.
- **US Census Bureau** for tract-level demographic datasets.
- **NOAA National Weather Service** for open aviation meteorological observations.
- **Google DeepMind** for the Gemini 2.5 Flash reasoning models.

---

<div align="center">
  <sub>Developed with 🚁 by the Airlane Team. Designed for safer autonomous skies.</sub>
</div>
