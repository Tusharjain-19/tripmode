import { useCallback, useEffect, useRef, useState } from "react";

export type GeoFix = {
  lng: number;
  lat: number;
  speedMs: number | null;
  heading: number | null;
  accuracyM: number;
  at: number;
};

export type GeoState = "idle" | "asking" | "granted" | "denied" | "unavailable";

export function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Adaptive sampling interval based on vehicle speed (frontend.md §5) */
export function getAdaptiveIntervalMs(speedMs: number | null): number {
  if (speedMs === null) return 4000;
  const kmh = speedMs * 3.6;
  if (kmh > 20) return 2000; // > 20 km/h: every 2s
  if (kmh >= 5) return 4000; // 5-20 km/h: every 4s
  return 15000; // Stationary: every 15s (heartbeat)
}

/**
 * Filter rules (frontend.md §5):
 * 1. Drop fixes with accuracy worse than 50 m.
 * 2. Send only if moved > 8 m, OR heading changed > 15°, OR heartbeat due (15 s).
 */
export function shouldTransmitFix(
  prev: GeoFix | null,
  next: GeoFix,
  heartbeatMs = 15000,
): boolean {
  if (next.accuracyM > 50) return false;
  if (!prev) return true;

  const elapsed = next.at - prev.at;
  if (elapsed >= heartbeatMs) return true;

  const dist = haversineDistanceM(prev.lat, prev.lng, next.lat, next.lng);
  if (dist > 8) return true;

  if (prev.heading !== null && next.heading !== null) {
    const diff = Math.abs(((next.heading - prev.heading + 540) % 360) - 180);
    if (diff > 15) return true;
  }

  return false;
}

/**
 * Real device location with adaptive sampling, noise filtering, and pause sharing control.
 * Nothing is requested until `request()` is called (explicit consent).
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>("idle");
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [rawFix, setRawFix] = useState<GeoFix | null>(null);
  const [publishedFix, setPublishedFix] = useState<GeoFix | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchId = useRef<number | null>(null);
  const lastPublished = useRef<GeoFix | null>(null);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  const stop = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
  }, []);

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);
  const togglePause = useCallback(() => setIsPaused((p) => !p), []);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unavailable");
      setError("This browser cannot share location.");
      return;
    }
    setState("asking");
    stop();

    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setState("granted");
        setError(null);

        const currentFix: GeoFix = {
          lng: p.coords.longitude,
          lat: p.coords.latitude,
          speedMs: p.coords.speed,
          heading: p.coords.heading,
          accuracyM: p.coords.accuracy,
          at: p.timestamp || Date.now(),
        };

        setRawFix(currentFix);

        // Filter: drop fixes with accuracy worse than 50 m (frontend.md §5)
        if (currentFix.accuracyM <= 50) {
          setFix(currentFix);

          // Check if adaptive transmission criteria are met
          if (shouldTransmitFix(lastPublished.current, currentFix)) {
            lastPublished.current = currentFix;
            if (!isPausedRef.current) {
              setPublishedFix(currentFix);
            }
          }
        }
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          setState("denied");
          setError("Location permission was denied. Allow it in your browser settings, then try again.");
          stop();
        } else {
          setError(e.code === e.TIMEOUT ? "Waiting for a GPS signal." : "Location is unavailable right now.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }, [stop]);

  useEffect(() => stop, [stop]);

  return {
    state,
    fix,
    rawFix,
    publishedFix: isPaused ? null : publishedFix,
    isPaused,
    isSharing: state === "granted" && !isPaused,
    error,
    request,
    stop,
    pause,
    resume,
    togglePause,
  };
}
