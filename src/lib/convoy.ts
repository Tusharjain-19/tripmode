// Pure convoy logic (frontend.md section 7). No side effects, fully unit-tested.

export type Point = { x: number; y: number };
export type MemberStatus =
  "following" | "behind" | "stopped" | "offroute" | "stale" | "offline" | "arrived";

export const THRESHOLDS = {
  stoppedSpeedKmh: 2,
  stoppedForS: 180,
  offRouteM: 150,
  offRouteForS: 30,
  staleS: 15,
  offlineS: 60,
} as const;

export function segmentLengths(line: Point[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < line.length; i++)
    out.push(Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y));
  return out;
}

export function lineLength(line: Point[]): number {
  return segmentLengths(line).reduce((a, b) => a + b, 0);
}

/** Point at a given distance along the polyline, plus heading in degrees (0 = east). */
export function pointAt(line: Point[], dist: number): { p: Point; heading: number } {
  const segs = segmentLengths(line);
  let d = Math.max(0, dist);
  for (let i = 0; i < segs.length; i++) {
    const sl = segs[i]!;
    if (d <= sl || i === segs.length - 1) {
      const t = sl === 0 ? 0 : Math.min(1, d / sl);
      const a = line[i]!;
      const b = line[i + 1]!;
      return {
        p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        heading: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      };
    }
    d -= sl;
  }
  return { p: line[0] ?? { x: 0, y: 0 }, heading: 0 };
}

/** Distance along the polyline of the closest projection of p. */
export function routeProgress(line: Point[], p: Point): { progress: number; offset: number } {
  let best = { progress: 0, offset: Infinity };
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const off = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (off < best.offset) best = { progress: acc + Math.sqrt(len2) * t, offset: off };
    acc += Math.sqrt(len2);
  }
  return best;
}

export type ProgressEntry = { id: string; progressM: number };

export function leaderId(entries: ProgressEntry[]): string | null {
  if (entries.length === 0) return null;
  // Ties resolve to the first entry so the leader is stable.
  return entries.reduce((best, e) => (e.progressM > best.progressM ? e : best)).id;
}

/** Gap behind the leader, along route, per member. */
export function gapsToLeader(entries: ProgressEntry[]): Record<string, number> {
  const lead = Math.max(...entries.map((e) => e.progressM), 0);
  return Object.fromEntries(entries.map((e) => [e.id, lead - e.progressM]));
}

/** Gaps between adjacent vehicles, ordered from leader backwards. */
export function adjacentGaps(
  entries: ProgressEntry[],
): { ahead: string; behind: string; gapM: number }[] {
  const sorted = [...entries].sort((a, b) => b.progressM - a.progressM);
  const out: { ahead: string; behind: string; gapM: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    out.push({
      ahead: sorted[i - 1]!.id,
      behind: sorted[i]!.id,
      gapM: sorted[i - 1]!.progressM - sorted[i]!.progressM,
    });
  }
  return out;
}

export type ClassifyInput = {
  gapM: number;
  thresholdM: number;
  stoppedForS: number;
  offRouteForS: number;
  sinceUpdateS: number;
  arrived?: boolean;
};

/** Priority: offline > stale > arrived > offroute > stopped > behind > following. */
export function classify(i: ClassifyInput): MemberStatus {
  if (i.sinceUpdateS >= THRESHOLDS.offlineS) return "offline";
  if (i.sinceUpdateS >= THRESHOLDS.staleS) return "stale";
  if (i.arrived) return "arrived";
  if (i.offRouteForS >= THRESHOLDS.offRouteForS) return "offroute";
  if (i.stoppedForS >= THRESHOLDS.stoppedForS) return "stopped";
  if (i.gapM > i.thresholdM) return "behind";
  return "following";
}

/** Assign vertical stack rows so rail chips never overlap. x in px, chip width in px. */
export function stackRows(xs: { id: string; x: number }[], chipW: number): Record<string, number> {
  const sorted = [...xs].sort((a, b) => a.x - b.x);
  const rowsEnd: number[] = [];
  const out: Record<string, number> = {};
  for (const c of sorted) {
    let row = rowsEnd.findIndex((end) => c.x - chipW / 2 >= end + 2);
    if (row === -1) {
      row = rowsEnd.length;
      rowsEnd.push(0);
    }
    rowsEnd[row] = c.x + chipW / 2;
    out[c.id] = row;
  }
  return out;
}

export function formatKm(m: number): string {
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function statusMessage(name: string, status: MemberStatus, gapM: number): string | null {
  switch (status) {
    case "behind":
      return `${name} is ${formatKm(gapM)} behind the group.`;
    case "offroute":
      return `${name} left the agreed route.`;
    case "stopped":
      return `${name} has stopped for 3 minutes.`;
    case "stale":
      return `${name} lost connection. Showing last known position.`;
    case "offline":
      return `${name} is offline. Last seen over a minute ago.`;
    case "arrived":
      return `${name} reached the destination.`;
    default:
      return null;
  }
}

export type RegroupPace = {
  shouldSlowDown: boolean;
  paceSpeedKmh: number;
  excessGapM: number;
  catchupMinutes: number;
  message: string;
};

/**
 * Calculates optimal cruising pace for lead vehicle to allow separated tail vehicles to regroup.
 * Target regroup window: 2-5 minutes at a safe highway cruising speed.
 */
export function calculateRegroupSpeed(
  leaderSpeedKmh: number,
  tailSpeedKmh: number,
  currentGapM: number,
  thresholdM: number,
): RegroupPace {
  const excess = currentGapM - thresholdM;
  if (excess <= 0) {
    return {
      shouldSlowDown: false,
      paceSpeedKmh: Math.round(leaderSpeedKmh),
      excessGapM: 0,
      catchupMinutes: 0,
      message: "Convoy in formation.",
    };
  }

  // Desired catchup window: ~3.5 minutes (210s)
  const targetMinutes = Math.min(6, Math.max(2, Math.round((excess / 1000) * 1.5 * 10) / 10));
  const effectiveTailSpeed = Math.max(30, tailSpeedKmh);

  // Speed delta needed in km/h: (excessKm / (targetMinutes / 60))
  const neededSpeedDeltaKmh = (excess / 1000) / (targetMinutes / 60);
  const targetLeaderSpeed = Math.max(35, Math.min(leaderSpeedKmh, Math.round(effectiveTailSpeed - neededSpeedDeltaKmh)));

  return {
    shouldSlowDown: currentGapM > thresholdM * 1.3 && leaderSpeedKmh > 40,
    paceSpeedKmh: targetLeaderSpeed,
    excessGapM: excess,
    catchupMinutes: targetMinutes,
    message: `Tail vehicle ${formatKm(currentGapM)} behind. Cruise at ${targetLeaderSpeed} km/h to regroup in ~${targetMinutes}m.`,
  };
}

export type DisciplineSummary = {
  score: number;
  inFormationPercent: number;
  strayCount: number;
  grade: "A+" | "A" | "B" | "C";
};

/** Evaluates overall convoy driving discipline for post-trip recap */
export function calculateDisciplineScore(
  totalSamples: number,
  samplesInThreshold: number,
  strayCount: number,
): DisciplineSummary {
  if (totalSamples <= 0) {
    return { score: 100, inFormationPercent: 100, strayCount: 0, grade: "A+" };
  }
  const inFormationRatio = Math.min(1, Math.max(0, samplesInThreshold / totalSamples));
  const strayPenalty = Math.min(40, strayCount * 10);
  const rawScore = Math.max(20, Math.round(inFormationRatio * 100 - strayPenalty));

  let grade: "A+" | "A" | "B" | "C" = "A+";
  if (rawScore >= 90) grade = "A+" ;
  else if (rawScore >= 80) grade = "A";
  else if (rawScore >= 65) grade = "B";
  else grade = "C";

  return {
    score: rawScore,
    inFormationPercent: Math.round(inFormationRatio * 100),
    strayCount,
    grade,
  };
}
