// Simulation harness: virtual vehicles replaying the agreed route with scripted scenarios.
// Emits the same shape the realtime protocol would (position snapshots per tick).
import {
  classify,
  lineLength,
  pointAt,
  routeProgress,
  type MemberStatus,
  type Point,
} from "./convoy";
import type { Role, VehicleColor } from "./trip-store";

export const SIM_SECONDS_PER_TICK = 40;
export const TICK_MS = 1000;

export type SimVehicle = {
  id: string;
  letter: string;
  name: string;
  driver: string;
  color: VehicleColor;
  role: Role;
  isMe: boolean;
  progressM: number;
  speedKmh: number;
  offsetM: number;
  lastUpdateReal: number;
  stoppedForS: number;
  offRouteForS: number;
  arrivedAtS: number | null;
  stops: number;
  /** Real GPS position in local meters, when known. */
  realP?: Point;
  realHeading?: number;
};

export type Scenario = {
  baseKmh: number;
  stopAt?: [number, number];
  offRouteAt?: [number, number];
  signalLossAt?: [number, number];
};

export const SCENARIOS: Record<string, Scenario> = {
  A: { baseKmh: 86, stopAt: [2600, 2900] },
  B: { baseKmh: 90, offRouteAt: [500, 900] },
  C: { baseKmh: 71 },
  D: { baseKmh: 84, stopAt: [700, 1100] },
  E: { baseKmh: 82, signalLossAt: [2400, 3600] },
};

export function seedVehicles(me: {
  vehicleLabel: string;
  displayName: string;
  color: VehicleColor;
  role: Role;
}): SimVehicle[] {
  const now = Date.now();
  type Identity = Pick<SimVehicle, "id" | "letter" | "name" | "driver" | "color" | "role" | "isMe">;
  const others: Identity[] = [];
  const meV: Identity = {
    id: "A",
    letter: "A",
    name: me.vehicleLabel || "My car",
    driver: me.displayName || "You",
    color: me.color,
    role: me.role,
    isMe: true,
  };
  return [meV, ...others].map((v, i) => ({
    ...v,
    progressM: 3000 - i * 500,
    speedKmh: 0,
    offsetM: 0,
    lastUpdateReal: now,
    stoppedForS: 0,
    offRouteForS: 0,
    arrivedAtS: null,
    stops: 0,
  }));
}

/** Advance one tick. Pure apart from Date.now passed in. */
export function step(
  vs: SimVehicle[],
  simT: number,
  routeM: number,
  nowReal: number,
): SimVehicle[] {
  return vs.map((v) => {
    const sc = SCENARIOS[v.id] ?? { baseKmh: 80 };
    const inRange = (r?: [number, number]) => !!r && simT >= r[0] && simT < r[1];
    if (inRange(sc.signalLossAt)) return v; // no update: goes stale
    if (v.arrivedAtS !== null) return { ...v, speedKmh: 0, lastUpdateReal: nowReal };
    const stopped = inRange(sc.stopAt);
    const jitter = Math.sin(simT / 90 + v.letter.charCodeAt(0)) * 4;
    const speed = stopped ? 0 : Math.max(0, sc.baseKmh + jitter);
    const progressM = Math.min(routeM, v.progressM + (speed / 3.6) * SIM_SECONDS_PER_TICK);
    const off = inRange(sc.offRouteAt);
    const wasStopped = v.speedKmh < 2;
    return {
      ...v,
      progressM,
      speedKmh: speed,
      offsetM: off ? Math.min(900, v.offsetM + 300) : Math.max(0, v.offsetM - 300),
      lastUpdateReal: nowReal,
      stoppedForS: speed < 2 ? v.stoppedForS + SIM_SECONDS_PER_TICK : 0,
      offRouteForS: off ? v.offRouteForS + SIM_SECONDS_PER_TICK : 0,
      arrivedAtS: progressM >= routeM ? simT : null,
      stops: speed < 2 && !wasStopped ? v.stops + 1 : v.stops,
    };
  });
}

export function vehicleStatus(
  v: SimVehicle,
  gapM: number,
  thresholdM: number,
  nowReal: number,
): MemberStatus {
  return classify({
    gapM,
    thresholdM,
    stoppedForS: v.stoppedForS,
    offRouteForS: v.offRouteForS,
    sinceUpdateS: (nowReal - v.lastUpdateReal) / 1000,
    arrived: v.arrivedAtS !== null,
  });
}

/** Map-space position: point on route plus perpendicular offset for off-route vehicles. */
export function vehiclePoint(line: Point[], progressM: number, offsetM: number, mPerUnit: number) {
  const { p, heading } = pointAt(line, progressM / mPerUnit);
  const rad = ((heading + 90) * Math.PI) / 180;
  const o = offsetM / mPerUnit;
  return { p: { x: p.x + Math.cos(rad) * o, y: p.y + Math.sin(rad) * o }, heading };
}

export function routeMeters(line: Point[], mPerUnit: number) {
  return lineLength(line) * mPerUnit;
}

/** Apply a real GPS fix to a vehicle. `p` is the fix in local meters. */
export function applyFix(
  v: SimVehicle,
  line: Point[],
  p: Point,
  speedMs: number | null,
  dtS: number,
  nowReal: number,
): SimVehicle {
  const { progress, offset } = routeProgress(line, p);
  const moved = v.realP ? Math.hypot(p.x - v.realP.x, p.y - v.realP.y) : 0;
  const speedKmh =
    speedMs !== null && speedMs >= 0 ? speedMs * 3.6 : dtS > 0 ? (moved / dtS) * 3.6 : 0;
  const heading =
    v.realP && moved > 3
      ? (Math.atan2(p.y - v.realP.y, p.x - v.realP.x) * 180) / Math.PI
      : (v.realHeading ?? 0);
  const routeM = lineLength(line);
  const wasStopped = v.speedKmh < 2;
  return {
    ...v,
    realP: p,
    realHeading: heading,
    progressM: progress,
    offsetM: offset,
    speedKmh,
    lastUpdateReal: nowReal,
    stoppedForS: speedKmh < 2 ? v.stoppedForS + dtS : 0,
    offRouteForS: offset > 300 ? v.offRouteForS + dtS : 0,
    arrivedAtS: routeM - progress < 200 && offset < 300 ? nowReal / 1000 : null,
    stops: speedKmh < 2 && !wasStopped ? v.stops + 1 : v.stops,
  };
}
