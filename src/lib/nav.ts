// Turn-by-turn guidance from OSRM steps. Formatting is pure and unit-tested.
import type { LngLat } from "./geo";

export type NavStep = {
  type: string;
  modifier?: string | undefined;
  name: string;
  ref?: string | undefined;
  exit?: number | undefined;
  location: LngLat;
  distanceM: number;
};

export type NavLeg = {
  distanceM: number;
  durationS: number;
  summary: string;
  steps: NavStep[];
};

export type NavRoute = {
  steps: NavStep[];
  legs: NavLeg[];
  distanceM: number;
  durationS: number;
  geometry: LngLat[];
};

type OsrmStep = {
  maneuver: { type: string; modifier?: string; location: number[]; exit?: number };
  name: string;
  ref?: string;
  distance: number;
};

export async function fetchGuidance(
  from: LngLat,
  to: LngLat,
  waypointsOrSignal?: LngLat[] | AbortSignal,
  signalParam?: AbortSignal,
): Promise<NavRoute> {
  const waypoints: LngLat[] = Array.isArray(waypointsOrSignal) ? waypointsOrSignal : [];
  const signal: AbortSignal | null =
    waypointsOrSignal instanceof AbortSignal ? waypointsOrSignal : (signalParam ?? null);

  const allPoints = [from, ...waypoints, to];
  const pointsStr = allPoints.map((p) => `${p[0]},${p[1]}`).join(";");
  const mirrors = [
    "https://router.project-osrm.org",
    "https://routing.openstreetmap.de/routed-car",
  ];

  let lastError = "Directions are unavailable right now.";

  for (const base of mirrors) {
    try {
      const url = `${base}/route/v1/driving/${pointsStr}?steps=true&overview=full&geometries=geojson`;
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const j = (await res.json()) as {
        code: string;
        routes?: {
          distance: number;
          duration: number;
          geometry?: { coordinates: number[][] };
          legs: {
            distance: number;
            duration: number;
            summary: string;
            steps: OsrmStep[];
          }[];
        }[];
      };
      const r = j.routes?.[0];
      if (j.code === "Ok" && r) {
        const coords: LngLat[] = (r.geometry?.coordinates ?? []).map((c) => [c[0]!, c[1]!] as LngLat);
        const legs: NavLeg[] = (r.legs ?? []).map((l) => ({
          distanceM: l.distance,
          durationS: l.duration,
          summary: l.summary || "Main road",
          steps: l.steps.map((s) => ({
            type: s.maneuver.type,
            modifier: s.maneuver.modifier,
            name: s.name,
            ref: s.ref,
            exit: s.maneuver.exit,
            location: [s.maneuver.location[0]!, s.maneuver.location[1]!] as LngLat,
            distanceM: s.distance,
          })),
        }));
        const steps: NavStep[] = legs.flatMap((l) => l.steps);

        const routeResult = {
          distanceM: r.distance,
          durationS: r.duration,
          geometry: coords,
          legs,
          steps,
        };
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("tripmode.cachedGuidance", JSON.stringify(routeResult));
          }
        } catch {
          // ignore
        }
        return routeResult;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw e;
      }
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  // Fallback to offline cached route maneuvers when in cellular dead zone
  try {
    if (typeof localStorage !== "undefined") {
      const cached = localStorage.getItem("tripmode.cachedGuidance");
      if (cached) {
        return JSON.parse(cached) as NavRoute;
      }
    }
  } catch {
    // ignore
  }

  throw new Error(lastError);
}

/** Minimum distance from a point to a polyline in meters. */
export function distanceToRouteM(point: LngLat, lineCoords: LngLat[]): number {
  if (!lineCoords.length) return 0;
  let minD = Infinity;
  for (let i = 0; i < lineCoords.length; i++) {
    const d = haversineM(point, lineCoords[i]!);
    if (d < minD) minD = d;
  }
  return minD;
}

/** Great-circle distance in meters. */
export function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b[1] - a[1]);
  const dLng = toR(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[1])) * Math.cos(toR(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const road = (s: NavStep) => (s.name && s.ref ? `${s.name} (${s.ref})` : s.name || s.ref || "");

/** Human instruction for a step, e.g. "Turn left onto MG Road". */
export function instruction(s: NavStep): string {
  const onto = road(s) ? ` onto ${road(s)}` : "";
  const dir = s.modifier ?? "";
  switch (s.type) {
    case "depart":
      return road(s) ? `Head out on ${road(s)}` : "Start driving";
    case "arrive":
      return "Arrive at the destination";
    case "roundabout":
    case "rotary":
      return s.exit
        ? `At the roundabout, take exit ${s.exit}${onto}`
        : `Enter the roundabout${onto}`;
    case "merge":
      return `Merge${onto}`;
    case "on ramp":
      return `Take the ramp${onto}`;
    case "off ramp":
      return `Take the exit${onto}`;
    case "fork":
      return `Keep ${dir.includes("left") ? "left" : "right"} at the fork${onto}`;
    case "end of road":
      return `At the end of the road, turn ${dir.includes("left") ? "left" : "right"}${onto}`;
    case "continue":
    case "new name":
      return dir === "uturn" ? "Make a U-turn" : `Continue${onto}`;
    default:
      if (dir === "uturn") return "Make a U-turn";
      if (dir === "straight") return `Go straight${onto}`;
      if (dir) return `Turn ${dir}${onto}`;
      return `Continue${onto}`;
  }
}

/** Material Symbols icon name for a step. */
export function maneuverIcon(s: NavStep): string {
  if (s.type === "arrive") return "flag";
  if (s.type === "roundabout" || s.type === "rotary") return "roundabout_right";
  if (s.type === "merge") return "merge";
  if (s.type === "fork") return s.modifier?.includes("left") ? "fork_left" : "fork_right";
  switch (s.modifier) {
    case "left":
      return "turn_left";
    case "right":
      return "turn_right";
    case "slight left":
      return "turn_slight_left";
    case "slight right":
      return "turn_slight_right";
    case "sharp left":
      return "turn_sharp_left";
    case "sharp right":
      return "turn_sharp_right";
    case "uturn":
      return "u_turn_left";
    default:
      return "straight";
  }
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

/**
 * Index of the next maneuver to show: the first step after `current` whose
 * maneuver point is still ahead (further than `passedM` once we got close).
 */
export function advanceStep(steps: NavStep[], current: number, here: LngLat, passedM = 30): number {
  let i = Math.max(1, current);
  while (i < steps.length - 1 && haversineM(here, steps[i]!.location) < passedM) i++;
  return Math.min(i, steps.length - 1);
}
