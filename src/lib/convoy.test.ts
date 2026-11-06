import { describe, expect, it } from "vitest";
import { adjacentGaps, classify, gapsToLeader, leaderId, pointAt, routeProgress, stackRows } from "./convoy";

const line = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 1000 },
];

describe("route geometry", () => {
  it("projects a point onto the route", () => {
    const r = routeProgress(line, { x: 1000, y: 400 });
    expect(r.progress).toBeCloseTo(1400);
    expect(r.offset).toBeCloseTo(0);
  });
  it("reports perpendicular offset", () => {
    expect(routeProgress(line, { x: 500, y: 200 }).offset).toBeCloseTo(200);
  });
  it("finds a point along the route", () => {
    expect(pointAt(line, 1500).p).toEqual({ x: 1000, y: 500 });
  });
});

describe("leader and gaps", () => {
  const two = [
    { id: "A", progressM: 5000 },
    { id: "B", progressM: 2000 },
  ];
  it("2 vehicles", () => {
    expect(leaderId(two)).toBe("A");
    expect(gapsToLeader(two)).toEqual({ A: 0, B: 3000 });
  });
  it("5 vehicles in reversed input order", () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ id: `V${n}`, progressM: n * 1000 }));
    expect(leaderId(five)).toBe("V5");
    expect(adjacentGaps(five).map((g) => g.behind)).toEqual(["V4", "V3", "V2", "V1"]);
    expect(adjacentGaps(five).every((g) => g.gapM === 1000)).toBe(true);
  });
  it("10 vehicles with equal progress keep a stable leader", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `V${i}`, progressM: 7000 }));
    expect(leaderId(ten)).toBe("V0");
    expect(Object.values(gapsToLeader(ten)).every((g) => g === 0)).toBe(true);
  });
});

describe("status classification", () => {
  const base = { gapM: 0, thresholdM: 3000, stoppedForS: 0, offRouteForS: 0, sinceUpdateS: 0 };
  it("behind when gap exceeds the host threshold", () => {
    expect(classify({ ...base, gapM: 3001 })).toBe("behind");
    expect(classify({ ...base, gapM: 3000 })).toBe("following");
  });
  it("stopped after 3 minutes", () => expect(classify({ ...base, stoppedForS: 180 })).toBe("stopped"));
  it("off route after 30 seconds", () => expect(classify({ ...base, offRouteForS: 30 })).toBe("offroute"));
  it("stale after 15 s, offline after 60 s", () => {
    expect(classify({ ...base, sinceUpdateS: 15 })).toBe("stale");
    expect(classify({ ...base, sinceUpdateS: 60 })).toBe("offline");
  });
});

describe("rail collision stacking", () => {
  it("stacks overlapping chips into separate rows", () => {
    const rows = stackRows(
      [
        { id: "A", x: 100 },
        { id: "B", x: 110 },
        { id: "C", x: 300 },
      ],
      32,
    );
    expect(rows).toEqual({ A: 0, B: 1, C: 0 });
  });
});
