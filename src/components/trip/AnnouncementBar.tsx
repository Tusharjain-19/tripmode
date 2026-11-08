import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Icon } from "./ui";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    AndroidBridge?: {
      isNativeApp: () => boolean;
      getAppVersion: () => string;
      postNotification: (title: string, body: string, tone?: string, targetUrl?: string) => void;
      vibrate: (durationMs: number) => void;
    };
  }
}

type Item = { id: string; title: string; body: string; tone: string };
const KEY = "tripmode.dismissedNotices";
const PUSHED_KEY = "tripmode.pushedNotices";

/** Dispatches a system push notification across Native Android and Browser */
export function dispatchPushNotification(title: string, body: string, tone: string = "info") {
  // 1. Native Android Container Push via AndroidBridge
  if (typeof window !== "undefined" && window.AndroidBridge?.postNotification) {
    try {
      window.AndroidBridge.postNotification(title, body, tone, window.location.href);
      if (tone === "alert") {
        window.AndroidBridge.vibrate?.(400);
      } else {
        window.AndroidBridge.vibrate?.(200);
      }
      return true;
    } catch (e) {
      console.warn("AndroidBridge notification failed:", e);
    }
  }

  // 2. Web Notification API fallback (Desktop / Mobile browsers)
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      try {
        new Notification(title, {
          body,
          icon: "/favicon.svg",
          badge: "/favicon.svg",
          tag: `tripmode-alert-${Date.now()}`,
        });
        return true;
      } catch {
        // Notification constructor may throw on mobile Chrome without service worker
      }
    } else if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }

  return false;
}

/** Shows the newest active admin notice to everyone, live. Each person can dismiss it. */
export function AnnouncementBar() {
  const [items, setItems] = useState<Item[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const handledPushes = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
      const pushed = JSON.parse(sessionStorage.getItem(PUSHED_KEY) ?? "[]") as string[];
      handledPushes.current = new Set(pushed);
    } catch {
      /* ignore */
    }

    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, title, body, tone")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(5);

      if (alive && data) {
        setItems(data);

        // Check if any active notice should trigger a system push
        data.forEach((item) => {
          if (!handledPushes.current.has(item.id)) {
            handledPushes.current.add(item.id);
            try {
              sessionStorage.setItem(PUSHED_KEY, JSON.stringify(Array.from(handledPushes.current)));
            } catch {
              /* ignore */
            }
            dispatchPushNotification(item.title, item.body, item.tone);
          }
        });
      }
    };

    void load();

    const ch = supabase
      .channel("tripmode:announcements")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => void load(),
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, []);

  const item = items.find((i) => !dismissed.includes(i.id));
  if (!item) return null;

  const dismiss = () => {
    const next = [...dismissed, item.id].slice(-50);
    setDismissed(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-0 top-0 pt-[env(safe-area-inset-top,0px)] z-[60] mx-auto flex max-w-xl items-start gap-3 rounded-b-[18px] p-3 shadow-float transition-all",
        item.tone === "alert"
          ? "bg-alert text-primary-foreground"
          : item.tone === "caution"
            ? "bg-caution text-primary-foreground"
            : "bg-primary text-primary-foreground",
      )}
    >
      <Icon
        name={item.tone === "alert" ? "warning" : item.tone === "caution" ? "report" : "campaign"}
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[15px]">{item.title}</div>
        {item.body && <div className="text-[13px] opacity-90 mt-0.5 leading-snug">{item.body}</div>}
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss notice"
        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10 transition-colors"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
