import { useEffect, useState, useCallback } from "react";

/**
 * Reactive hook to track online/offline connectivity status
 * with optional active ping verification.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  });
  const [isChecking, setIsChecking] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);
      // Keep wasOffline true briefly so banner can show "Back Online"
      const t = setTimeout(() => setWasOffline(false), 3500);
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
      // Ping lightweight asset with cache-busting to test true internet connectivity
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`/favicon.ico?_ping=${Date.now()}`, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const online = res.ok || res.status === 404; // Even 404 proves server was reached
      setIsOnline(online);
      if (online && wasOffline) {
        setTimeout(() => setWasOffline(false), 3000);
      }
      return online;
    } catch {
      setIsOnline(false);
      setWasOffline(true);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [wasOffline]);

  return { isOnline, isChecking, wasOffline, checkConnection };
}
