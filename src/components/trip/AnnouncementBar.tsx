import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Icon } from "./ui";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; body: string; tone: string };
const KEY = "tripmode.dismissedNotices";

/** Shows the newest active admin notice to everyone, live. Each person can dismiss it. */
export function AnnouncementBar() {
  const [items, setItems] = useState<Item[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
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
      if (alive && data) setItems(data);
    };
    void load();
    const ch = supabase
      .channel(`notices-${Math.random().toString(36).slice(2)}`)
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
        "fixed inset-x-0 top-0 z-[60] mx-auto flex max-w-xl items-start gap-3 rounded-b-[14px] p-3 shadow-float",
        item.tone === "alert"
          ? "bg-alert text-primary-foreground"
          : item.tone === "caution"
            ? "bg-caution text-primary-foreground"
            : "bg-primary text-primary-foreground",
      )}
    >
      <Icon name="campaign" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{item.title}</div>
        {item.body && <div className="text-[14px] opacity-90">{item.body}</div>}
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss notice"
        className="flex h-8 w-8 items-center justify-center rounded-full"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
