import { useEffect, useState, useCallback } from "react";

/**
 * Reactive hook to track online/offline connectivity status
 * with reliable active ping verification.
 */
export function useNetworkStatus() {
  // Always default to online on startup to prevent false-positive offline banners
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Synchronize with real browser status once DOM has mounted
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOnline(false);
      setWasOffline(true);
    }

    const handleOnline = () => {
      setIsOnline(true);
      const t = setTimeout(() => setWasOffline(false), 3000);
      return () => clearTimeout(t);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return true;
    setIsChecking(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      // High-reliability global connectivity endpoint (returns HTTP 204 immediately worldwide)
      await fetch("https://connectivitycheck.gstatic.com/generate_204", {
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setIsOnline(true);
      setWasOffline(false);
      return true;
    } catch {
      // Secondary fallback to origin
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        await fetch("/", { method: "HEAD", signal: controller.signal });
        clearTimeout(timeoutId);
        setIsOnline(true);
        setWasOffline(false);
        return true;
      } catch {
        setIsOnline(false);
        setWasOffline(true);
        return false;
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  return { isOnline, isChecking, wasOffline, checkConnection };
}

