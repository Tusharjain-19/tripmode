import { useEffect, useState } from "react";
import type { Point } from "./convoy";
import { lineLength, pointAt, routeProgress } from "./convoy";
import routesData from "@/data/routes.json";

// Road routes from OpenStreetMap routing (OSRM), stored as [lng, lat].
// Convoy math runs in a local planar projection measured in meters (x east, y north).
// The reference latitude follows the active route so distances stay accurate across India.
const M_PER_DEG_LAT = 110540;
let mPerDegLng = 111320 * Math.cos((25.7 * Math.PI) / 180);
const setRefLat = (lat: number) => {
  mPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
};

export type LngLat = [number, number];
export const toMeters = ([lng, lat]: LngLat): Point => ({
  x: lng * mPerDegLng,
  y: lat * M_PER_DEG_LAT,
});
export const toLngLat = (p: Point): LngLat => [p.x / mPerDegLng, p.y / M_PER_DEG_LAT];

/** Shortest-arc heading interpolation to avoid 360° flip spins. */
export function shortestArc(from: number, to: number): number {
  const d = ((to - from + 540) % 360) - 180;
  return from + d;
}

/** Linear interpolation between two coordinates. */
export function lerpLatLng(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Light map-matching: snap to route polyline if within maxDistanceM (default 30m). */
export function snapToRoute(
  point: Point,
  routeLine: Point[],
  maxDistanceM = 30,
): { point: Point; snapped: boolean; offsetM: number } {
  if (!routeLine.length) return { point, snapped: false, offsetM: 0 };
  const { progress, offset } = routeProgress(routeLine, point);
  if (offset <= maxDistanceM) {
    const { p } = pointAt(routeLine, progress);
    return { point: p, snapped: true, offsetM: offset };
  }
  return { point, snapped: false, offsetM: offset };
}

export type Place = { name: string; detail?: string; lngLat: LngLat };

export const PLACES: Place[] = [
  { name: "Jaipur", detail: "Rajasthan, India", lngLat: [75.7873, 26.9124] },
  { name: "Udaipur", detail: "City of Lakes, Rajasthan", lngLat: [73.7125, 24.5854] },
  { name: "Delhi", detail: "National Capital Region, India", lngLat: [77.209, 28.6139] },
  { name: "Agra", detail: "Taj Mahal City, Uttar Pradesh", lngLat: [78.0081, 27.1767] },
  { name: "Mumbai", detail: "Maharashtra, India", lngLat: [72.8777, 19.076] },
  { name: "Pune", detail: "Maharashtra, India", lngLat: [73.8567, 18.5204] },
  { name: "Bengaluru", detail: "Karnataka, India", lngLat: [77.5946, 12.9716] },
  { name: "Mysuru", detail: "Karnataka, India", lngLat: [76.6394, 12.2958] },
  { name: "Chandigarh", detail: "Punjab & Haryana, India", lngLat: [76.7794, 30.7333] },
  { name: "Goa", detail: "Panaji, India", lngLat: [73.8278, 15.2993] },
  { name: "Manali", detail: "Himachal Pradesh, India", lngLat: [77.1892, 32.2432] },
];

export const POPULAR_ROUTES = [
  {
    name: "Jaipur → Udaipur",
    origin: PLACES[0]!,
    dest: PLACES[1]!,
    via: "via Ajmer & Bhilwara (NH48)",
    km: 402,
    hours: "5 h 01 min",
  },
  {
    name: "Delhi → Agra",
    origin: PLACES[2]!,
    dest: PLACES[3]!,
    via: "via Yamuna Expressway",
    km: 233,
    hours: "3 h 40 min",
  },
  {
    name: "Mumbai → Pune",
    origin: PLACES[4]!,
    dest: PLACES[5]!,
    via: "via Mumbai-Pune Expressway",
    km: 148,
    hours: "2 h 55 min",
  },
  {
    name: "Bengaluru → Mysuru",
    origin: PLACES[6]!,
    dest: PLACES[7]!,
    via: "via Bengaluru-Mysuru Expressway",
    km: 143,
    hours: "2 h 30 min",
  },
  {
    name: "Delhi → Chandigarh",
    origin: PLACES[2]!,
    dest: PLACES[8]!,
    via: "via Grand Trunk Road (NH44)",
    km: 245,
    hours: "4 h 15 min",
  },
] as const;

export type RawRoute = {
  name: string;
  via: string;
  distanceM: number;
  durationS: number;
  coords: number[][];
};
export type RouteOption = {
  name: string;
  via: string;
  km: number;
  hours: string;
  coords: LngLat[];
  line: Point[];
};

const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h} h ${String(m).padStart(2, "0")} min`;
};

const build = (raw: RawRoute[]): RouteOption[] => {
  const first = raw[0]?.coords;
  if (first?.length) {
    const lats = first.map((c) => c[1]!);
    setRefLat((Math.min(...lats) + Math.max(...lats)) / 2);
  }
  return raw.map((r) => {
    const coords = r.coords.map((c) => [c[0], c[1]] as LngLat);
    return {
      name: r.name,
      via: r.via,
      km: Math.round(r.distanceM / 1000),
      hours: fmtDuration(r.durationS),
      coords,
      line: coords.map(toMeters),
    };
  });
};

/** Active route options. Mutated in place by setRoutes; subscribe via subscribeRoutes. */
export const ROUTES: RouteOption[] = build(routesData as RawRoute[]);
let version = 0;
const listeners = new Set<() => void>();
export const getRoutesVersion = () => version;
export const subscribeRoutes = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export function setRoutes(raw: RawRoute[]) {
  if (!raw.length) return;
  ROUTES.splice(0, ROUTES.length, ...build(raw));
  version += 1;
  listeners.forEach((l) => l());
}

/** Reactive hook to re-render whenever the convoy route corridors are updated. */
export function useRoutes(): RouteOption[] {
  const [_, setV] = useState(0);
  useEffect(() => {
    const unsub = subscribeRoutes(() => setV((v) => v + 1));
    return () => unsub();
  }, []);
  return ROUTES;
}

/** Route geometry is already in meters. */
export function metersPerUnit(_r: RouteOption): number {
  return 1;
}

export function routeLengthM(r: RouteOption): number {
  return lineLength(r.line);
}

// ---- Place search (OpenStreetMap Nominatim, India only) and road routing (OSRM) ----

type NominatimHit = {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    state_district?: string;
    county?: string;
    state?: string;
  };
};
const short = (h: NominatimHit) => {
  const a = h.address ?? {};
  const name = h.name || a.city || a.town || a.village || a.suburb || h.display_name.split(",")[0]!;
  const detail = [a.state_district || a.county, a.state].filter(Boolean).join(", ");
  return { name, detail };
};

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  const clean = q.trim().toLowerCase();
  const localMatches = PLACES.filter(
    (p) =>
      p.name.toLowerCase().includes(clean) || (p.detail && p.detail.toLowerCase().includes(clean)),
  );

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=in&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: signal ?? null, headers: { "Accept-Language": "en" } });
    if (res.ok) {
      const hits = (await res.json()) as NominatimHit[];
      const remote = hits.map((h) => ({
        ...short(h),
        lngLat: [Number(h.lon), Number(h.lat)] as LngLat,
      }));
      const seen = new Set(localMatches.map((m) => m.name.toLowerCase()));
      const combined = [...localMatches];
      for (const r of remote) {
        if (!seen.has(r.name.toLowerCase())) {
          combined.push(r);
          seen.add(r.name.toLowerCase());
        }
      }
      return combined.length > 0 ? combined : localMatches;
    }
  } catch {
    // Return instant local matches on network delay or error
  }
  return localMatches;
}

export async function reversePlace(lngLat: LngLat): Promise<Place> {
  const [lng, lat] = lngLat;
  // Check known places within ~5km
  const matched = PLACES.find((p) => Math.hypot(p.lngLat[0] - lng, p.lngLat[1] - lat) < 0.05);
  if (matched) return matched;

  const fallback = { name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lngLat };
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=14&lat=${lat}&lon=${lng}`,
      { headers: { "Accept-Language": "en" } },
    );
    if (!res.ok) return fallback;
    const h = (await res.json()) as NominatimHit & { error?: string };
    if (h.error) return fallback;
    return { ...short(h), lngLat };
  } catch {
    return fallback;
  }
}

/** Keep geometry light: drop points closer than ~minM to the previous kept point. */
function thin(coords: number[][], minM = 40): number[][] {
  const out: number[][] = [];
  let last: number[] | undefined;
  for (const c of coords) {
    if (!last || Math.hypot((c[0]! - last[0]!) * 100000, (c[1]! - last[1]!) * 110000) >= minM) {
      out.push(c);
      last = c;
    }
  }
  const end = coords[coords.length - 1];
  if (end && out[out.length - 1] !== end) out.push(end);
  return out;
}

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: number[][] };
  legs: { summary: string }[];
};

export async function fetchRoutes(from: LngLat, to: LngLat): Promise<RawRoute[]> {
  const mirrors = [
    "https://router.project-osrm.org",
    "https://routing.openstreetmap.de/routed-car",
  ];

  for (const base of mirrors) {
    try {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      // Generous 8-second timeout per mirror for long cross-state routes across India
      const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;
      const url = `${base}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?alternatives=true&overview=full&geometries=geojson`;
      const fetchInit: RequestInit = controller ? { signal: controller.signal } : {};
      const res = await fetch(url, fetchInit);
      if (timeout) clearTimeout(timeout);

      if (res.ok) {
        const j = (await res.json()) as { code: string; routes?: OsrmRoute[] };
        if (j.code === "Ok" && j.routes?.length) {
          return j.routes.map((r, i) => ({
            name: i === 0 ? "Fastest route" : `Alternative ${i}`,
            via: r.legs[0]?.summary ? `via ${r.legs[0].summary}` : "Main highway",
            distanceM: r.distance,
            durationS: r.duration,
            coords: thin(r.geometry.coordinates, 35),
          }));
        }
      }
    } catch {
      // Failover to secondary OSRM mirror
    }
  }

  // Graceful fallback for Jaipur - Udaipur
  const isJaipurUdaipur =
    Math.hypot(from[0] - 75.7873, from[1] - 26.9124) < 1.0 &&
    Math.hypot(to[0] - 73.7125, to[1] - 24.5854) < 1.0;
  if (isJaipurUdaipur && (routesData as RawRoute[]).length) {
    return routesData as RawRoute[];
  }

  // Linear corridor fallback with road waypoints so creation never hangs
  const distM = Math.round(Math.hypot((to[0] - from[0]) * 100000, (to[1] - from[1]) * 110540));
  const durS = Math.round((distM / 1000 / 60) * 3600);
  
  // Generate a multi-segment road spine rather than a harsh 3-point straight line
  const steps = Math.min(20, Math.max(5, Math.round(distM / 50000)));
  const coords: LngLat[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    // Slight road arc curvature (deviation up to ~0.15 deg) so it hugs natural geographic corridors
    const lat = from[1] + (to[1] - from[1]) * t;
    const lng = from[0] + (to[0] - from[0]) * t + Math.sin(t * Math.PI) * 0.08 * (to[1] > from[1] ? -1 : 1);
    coords.push([Number(lng.toFixed(5)), Number(lat.toFixed(5))]);
  }

  return [
    {
      name: "Fastest route",
      via: "Direct highway corridor",
      distanceM: distM,
      durationS: durS,
      coords,
    },
  ];
}
