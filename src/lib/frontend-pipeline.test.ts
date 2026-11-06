import { describe, expect, it } from "vitest";
import { lerpLatLng, shortestArc, snapToRoute } from "./geo";
import {
  getAdaptiveIntervalMs,
  haversineDistanceM,
  shouldTransmitFix,
  type GeoFix,
} from "./use-geolocation";
import { t, setLanguage, getLanguage } from "./i18n";

describe("Smooth vehicle motion math (frontend.md §6)", () => {
  it("interpolates heading via shortest arc across 0/360 boundary", () => {
    // Turning right from 350° to 10° should be a +20° delta, not -340°
    expect(shortestArc(350, 10)).toBe(370);
    // Turning left from 10° to 350° should be -20°, not +340°
    expect(shortestArc(10, 350)).toBe(-10);
    // Direct heading
    expect(shortestArc(90, 120)).toBe(120);
    expect(shortestArc(180, 150)).toBe(150);
  });

  it("lerpLatLng performs linear coordinate interpolation", () => {
    const a: [number, number] = [75.0, 26.0];
    const b: [number, number] = [76.0, 28.0];
    const mid = lerpLatLng(a, b, 0.5);
    expect(mid[0]).toBeCloseTo(75.5);
    expect(mid[1]).toBeCloseTo(27.0);
  });

  it("snaps to route when within 30 meters", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
    ];
    // 20 meters perpendicular offset from the segment (x: 500, y: 20)
    const result = snapToRoute({ x: 500, y: 20 }, line, 30);
    expect(result.snapped).toBe(true);
    expect(result.offsetM).toBeCloseTo(20);
    expect(result.point.y).toBeCloseTo(0);
    expect(result.point.x).toBeCloseTo(500);
  });

  it("does not snap when farther than 30 meters off route", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
    ];
    const off = { x: 500, y: 55 };
    const result = snapToRoute(off, line, 30);
    expect(result.snapped).toBe(false);
    expect(result.offsetM).toBeCloseTo(55);
    expect(result.point).toEqual(off);
  });
});

describe("Adaptive location sampling & noise filtering (frontend.md §5)", () => {
  it("selects adaptive sampling intervals by speed", () => {
    // > 20 km/h (5.56 m/s) -> 2000 ms
    expect(getAdaptiveIntervalMs(6)).toBe(2000);
    expect(getAdaptiveIntervalMs(25 / 3.6)).toBe(2000);

    // 5-20 km/h (1.39 - 5.56 m/s) -> 4000 ms
    expect(getAdaptiveIntervalMs(2.5)).toBe(4000);
    expect(getAdaptiveIntervalMs(15 / 3.6)).toBe(4000);

    // Stationary (< 5 km/h) -> 15000 ms heartbeat
    expect(getAdaptiveIntervalMs(0.5)).toBe(15000);
    expect(getAdaptiveIntervalMs(0)).toBe(15000);
  });

  it("drops fixes with accuracy worse than 50 m", () => {
    const badFix: GeoFix = {
      lng: 75.8,
      lat: 26.9,
      speedMs: 15,
      heading: 90,
      accuracyM: 65, // > 50m!
      at: Date.now(),
    };
    expect(shouldTransmitFix(null, badFix)).toBe(false);
  });

  it("transmits if distance delta > 8 meters", () => {
    const now = Date.now();
    const prev: GeoFix = {
      lat: 26.9124,
      lng: 75.7873,
      speedMs: 10,
      heading: 90,
      accuracyM: 10,
      at: now,
    };
    // Approx 15m away (0.00014 deg latitude is ~15.5m)
    const next: GeoFix = {
      lat: 26.91254,
      lng: 75.7873,
      speedMs: 10,
      heading: 90,
      accuracyM: 10,
      at: now + 2000,
    };
    expect(haversineDistanceM(prev.lat, prev.lng, next.lat, next.lng)).toBeGreaterThan(8);
    expect(shouldTransmitFix(prev, next)).toBe(true);
  });

  it("transmits if heading delta > 15 degrees", () => {
    const now = Date.now();
    const prev: GeoFix = {
      lat: 26.9124,
      lng: 75.7873,
      speedMs: 10,
      heading: 45,
      accuracyM: 10,
      at: now,
    };
    // Position stayed within 3m, but heading rotated by 25°
    const next: GeoFix = {
      lat: 26.91241,
      lng: 75.78731,
      speedMs: 10,
      heading: 70,
      accuracyM: 10,
      at: now + 2000,
    };
    expect(shouldTransmitFix(prev, next)).toBe(true);
  });

  it("transmits if stationary heartbeat (15 s) has elapsed", () => {
    const now = Date.now();
    const prev: GeoFix = {
      lat: 26.9124,
      lng: 75.7873,
      speedMs: 0,
      heading: 0,
      accuracyM: 8,
      at: now,
    };
    // Vehicle stationary (no move, same heading), 15.5 s later
    const next: GeoFix = {
      lat: 26.9124,
      lng: 75.7873,
      speedMs: 0,
      heading: 0,
      accuracyM: 8,
      at: now + 15500,
    };
    expect(shouldTransmitFix(prev, next)).toBe(true);
  });

  it("suppresses minor GPS jitter (< 8m, <= 15° heading, within heartbeat)", () => {
    const now = Date.now();
    const prev: GeoFix = {
      lat: 26.9124,
      lng: 75.7873,
      speedMs: 2,
      heading: 50,
      accuracyM: 10,
      at: now,
    };
    // 2 meters drift, 4° heading change, 3 seconds later
    const next: GeoFix = {
      lat: 26.91241,
      lng: 75.7873,
      speedMs: 2,
      heading: 54,
      accuracyM: 10,
      at: now + 3000,
    };
    expect(shouldTransmitFix(prev, next)).toBe(false);
  });
});

describe("Bilingual localization dictionary (frontend.md §11)", () => {
  it("translates to English by default", () => {
    setLanguage("en");
    expect(getLanguage()).toBe("en");
    expect(t("sharingLocation")).toBe("Sharing location");
    expect(t("pauseSharing")).toBe("Pause sharing");
    expect(t("slowDown")).toBe("Slow down");
  });

  it("translates accurately to Hindi", () => {
    setLanguage("hi");
    expect(getLanguage()).toBe("hi");
    expect(t("sharingLocation")).toBe("लोकेशन शेयर हो रही है");
    expect(t("pauseSharing")).toBe("शेयरिंग रोकें");
    expect(t("slowDown")).toBe("धीमे चलें");
    // Switch back
    setLanguage("en");
  });
});

describe("Geocoding & Route calculation resilience", () => {
  it("searchPlaces returns local popular place matches instantly", async () => {
    const { searchPlaces } = await import("./geo");
    const results = await searchPlaces("jaipur");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.name).toBe("Jaipur");
  }, 10000);

  it("fetchRoutes returns valid route corridors with distance and duration", async () => {
    const { fetchRoutes, PLACES } = await import("./geo");
    const routes = await fetchRoutes(PLACES[0]!.lngLat, PLACES[1]!.lngLat);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0]?.distanceM).toBeGreaterThan(1000);
    expect(routes[0]?.coords.length).toBeGreaterThan(1);
  }, 10000);
});

