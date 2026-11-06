# Trip Mode 🚗🗺️

> **Collaborative Multi-Vehicle Navigation for Road Trips & Convoys**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![TanStack Start](https://img.shields.io/badge/TanStack-Start-FF4154.svg?logo=react)](https://tanstack.com/start)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC.svg?logo=tailwind-css)](https://tailwindcss.com/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-v5-396B94.svg?logo=mapbox)](https://maplibre.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Realtime_&_Auth-3ECF8E.svg?logo=supabase)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Tests-Vitest_36_Passed-6E9F18.svg?logo=vitest)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📌 Overview

When groups travel together in separate cars or motorcycles, staying coordinated is notoriously chaotic: vehicles get separated by traffic lights, take different navigation routes, miss pitstops, or make dangerous phone calls while driving.

**Trip Mode** provides a shared navigation cockpit for groups. Drivers join a convoy room using an invite code or link, agree on a single route corridor, track each other's live positions and gaps in real time, and coordinate through low-latency voice, one-tap safety alerts, and AI-suggested pitstops.

---

## ✨ Key Capabilities

| Feature | Description |
| :--- | :--- |
| **Agreed Route Corridor** | All convoy drivers share one synchronized road corridor calculated via OSRM, preventing accidental detours. |
| **Convoy Progress Rail** | An intuitive timeline bar displaying proportional progress, order of vehicles, and real-time gap distances. |
| **Falling-Behind Alerts** | Automatic auditory and visual alerts triggered whenever any vehicle separates by a designated gap (2 km, 3 km, or 5 km). |
| **Turn-by-Turn Guidance** | Maneuver instructions, distance count-downs, next-turn previews, and text-to-speech audio guidance. |
| **Push-to-Talk (PTT) Voice** | Low-latency in-app walkie-talkie audio for immediate hands-free road communications. |
| **One-Tap Quick Alerts** | Large, high-contrast driving buttons (*"Need fuel"*, *"Slow down"*, *"Food stop"*, *"Wait for me"*, *"Lost route"*). |
| **Emergency SOS Beacon** | Broadcasts immediate high-priority alert with exact GPS coordinates and pulsing visual beacon to all convoy members. |
| **Corridor POI Search** | Instant along-route discovery for petrol stations, restaurants, EV charging stations, cafes, and rest areas. |
| **AI Pitstop Extraction** | Host-only intelligent assistant that parses conversational chat for stop proposals and extracts clean map coordinates. |
| **Privacy-First Design** | Drivers use anonymous guest sessions—no login required. Live GPS coordinates are shared ephemerally and automatically purged. |

---

## 🏗️ Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────┐
│                   Trip Mode Client                     │
│  React 19 • TanStack Start / Router • Tailwind CSS v4  │
├───────────────────────────┬────────────────────────────┤
│       Live Convoy HUD     │     Navigation Engine      │
│  - MapLibre GL Vector Map │  - OSRM Route Calculation  │
│  - Pure Convoy Math       │  - OpenFreeMap (Positron)  │
│  - Realtime Rail & Gaps   │  - Nominatim & Overpass    │
├───────────────────────────┴────────────────────────────┤
│                   Backend & Data Layer                 │
│  - Supabase Realtime (postgres_changes broadcast)      │
│  - Ephemeral Member State & Ephemeral Location Pins    │
│  - Row-Level Security (RLS) & Security Definer RPCs    │
│  - Cloudflare Workers / Nitro SSR Edge Deployment      │
└────────────────────────────────────────────────────────┘
```

- **Framework**: [TanStack Start](https://tanstack.com/start) with [TanStack Router](https://tanstack.com/router)
- **UI & Styling**: [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Class Variance Authority](https://cva.style/)
- **Mapping**: [MapLibre GL JS](https://maplibre.org/) with keyless vector tiles via OpenFreeMap Positron
- **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL, Realtime replication, Anonymous Guest Auth, Row-Level Security)
- **Navigation APIs**: OSRM road geometries, Nominatim geocoding, OpenStreetMap Overpass POI API
- **AI Integration**: Edge function stop extraction using Vercel AI SDK
- **Testing**: [Vitest](https://vitest.dev/) with 36 unit and integration test suites

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v20.x` or later (tested up to Node 22+)
- **Package Manager**: `npm`, `pnpm`, or `bun`

### 1. Clone the repository

```bash
git clone https://github.com/Tusharjain-19/tripmode.git
cd tripmode
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Add your Supabase credentials:

```env
# Supabase Configuration
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-or-publishable-key"
VITE_SUPABASE_PROJECT_ID="your-project-id"

# Server runtime variables (used during SSR)
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_PUBLISHABLE_KEY="your-anon-or-publishable-key"
SUPABASE_PROJECT_ID="your-project-id"

# Optional: AI Stop Extraction Key
AI_API_KEY=""
```

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Verification

Trip Mode features an extensive test suite covering convoy gap math, corridor projection, security filtering, and routing:

```bash
# Run unit and integration tests
npm test

# Run tests in watch mode
npm run test:watch
```

Test coverage includes:
- Pure convoy gap and leader distance calculation (`src/lib/convoy.test.ts`)
- Turn-by-turn instruction and maneuver step advancement (`src/lib/nav.test.ts`)
- Token sanitization, password scrubbing, and invite code protection (`src/lib/security.test.ts`)
- Forward and reverse geocoding fallback pipelines (`src/lib/frontend-pipeline.test.ts`)
- Client routing tree matches (`src/test/app-routing.test.tsx`)

---

## 📦 Building for Production

Compile optimized production client, server-side render bundles, and Nitro server output:

```bash
npm run build
```

Preview the production build locally:

```bash
npx vite preview
```

---

## 📁 Project Structure

```
├── docs/                       # Product specifications, database schemas & design tokens
├── public/                     # Static assets, sound effects, earcons & icons
├── src/
│   ├── components/trip/        # Convoy UI components, RouteMap, ConvoyRail, PlacePicker
│   ├── data/                   # Pre-fetched offline route corridors (routes.json)
│   ├── integrations/supabase/  # Supabase client and typed database contracts
│   ├── lib/
│   │   ├── auth.ts             # Anonymous guest session management
│   │   ├── convoy.ts           # Pure convoy math and status transitions
│   │   ├── geo.ts              # Local meter projection & geocoding helpers
│   │   ├── nav.ts              # OSRM turn-by-turn guidance parser
│   │   ├── places.ts           # Overpass corridor POI search
│   │   ├── simulation.ts       # Vehicle simulation engine for testing
│   │   ├── trip-store.ts       # Client convoy state store
│   │   └── trip-sync.ts        # Supabase Realtime channel synchronization
│   ├── routes/                 # TanStack file-based application routes
│   │   ├── index.tsx           # Home & convoy dispatch dashboard
│   │   ├── create.tsx          # Multi-step responsive trip creation flow
│   │   ├── lobby.tsx           # Vehicle selection & member staging area
│   │   ├── trip.tsx            # Live navigation cockpit with HUD & Convoy Rail
│   │   ├── summary.tsx         # Post-trip stats & arrival recap
│   │   ├── admin.tsx           # Security Definer admin overview & broadcast panel
│   │   └── join.$code.tsx      # Invitation link preview and onboarding
│   └── styles.css              # Global design tokens and Tailwind theme variables
├── vitest.config.ts            # Vitest testing configuration
└── vite.config.ts              # Vite 8 & TanStack Start bundler configuration
```

---

## 🔒 Security & Privacy Charter

1. **Ephemeral Positioning**: Live vehicle coordinates are never stored permanently in database logs. They exist solely in active runtime channels and are wiped when the trip concludes.
2. **Access Scoping**: Realtime access and chat messaging are gated by host-approved membership with Row-Level Security (RLS).
3. **No Unnecessary Sign-In**: Drivers receive an encrypted anonymous guest session to ensure no personal email or password barrier blocks spontaneous road trips.
4. **Scrubbed Telemetry**: Sentry and crash telemetry automatically scrubs bearer tokens, passwords, and 6-character room codes.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
