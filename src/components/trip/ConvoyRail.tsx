import { useLayoutEffect, useRef, useState } from "react";
import { adjacentGaps, formatKm, stackRows, type MemberStatus } from "@/lib/convoy";
import type { VehicleColor } from "@/lib/trip-store";
import { cn } from "@/lib/utils";
import { VehicleChip } from "./ui";

export type RailMember = { id: string; letter: string; color: VehicleColor; progressM: number; status: MemberStatus; isMe: boolean; name: string };

const CHIP = 28;

export function ConvoyRail({ members, routeM, thresholdM, onFocus, origin, destination }: { members: RailMember[]; routeM: number; thresholdM: number; onFocus: (id: string) => void; origin: string; destination: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const xOf = (p: number) => Math.max(0, Math.min(1, p / routeM)) * w;
  const rows = stackRows(members.map((m) => ({ id: m.id, x: xOf(m.progressM) })), CHIP);
  const maxRow = Math.max(0, ...Object.values(rows));
  const leadP = Math.max(0, ...members.map((m) => m.progressM));
  const gaps = adjacentGaps(members);
  const byId: Record<string, RailMember> = Object.fromEntries(members.map((m) => [m.id, m]));
  const chipZone = (maxRow + 1) * (CHIP + 4);

  return (
    <div className="w-full select-none" aria-label="Convoy rail">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
        <span className="flex items-center gap-1 truncate max-w-[45%]">
          <span className="h-2 w-2 rounded-full border border-primary bg-background shrink-0" />
          <span className="truncate">{origin}</span>
        </span>
        <span className="flex items-center gap-1 truncate max-w-[45%] justify-end">
          <span className="truncate">{destination}</span>
          <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
        </span>
      </div>
      <div ref={ref} className="relative mx-[14px]" style={{ height: chipZone + 8 + 22 }}>
        {members.map((m) => {
          const ring = m.isMe ? "me" : m.status === "behind" ? "caution" : m.status === "offroute" || m.status === "stopped" ? "alert" : m.status === "stale" || m.status === "offline" ? "stale" : "none";
          return (
            <button
              key={m.id}
              onClick={() => onFocus(m.id)}
              className="rail-chip absolute -translate-x-1/2 group transition-transform active:scale-95"
              style={{ left: xOf(m.progressM), top: chipZone - ((rows[m.id] ?? 0) + 1) * (CHIP + 4) }}
              aria-label={`${m.name}, vehicle ${m.letter}, ${m.status}. Focus on map`}
              title={`${m.name} (${m.letter}) - ${m.status}`}
            >
              <VehicleChip letter={m.letter} color={m.color} size={CHIP} ring={ring} />
            </button>
          );
        })}
        <div className="absolute left-0 right-0 h-2 rounded-full bg-secondary shadow-inner" style={{ top: chipZone + 2 }}>
          <div className="rail-chip h-2 rounded-full bg-primary" style={{ width: xOf(leadP), transitionProperty: "width" }} />
        </div>
        {gaps.map((g) => {
          const a = xOf(byId[g.ahead]?.progressM ?? 0);
          const b = xOf(byId[g.behind]?.progressM ?? 0);
          if (a - b < 34) return null;
          const over = g.gapM > thresholdM;
          return (
            <div
              key={`${g.ahead}-${g.behind}`}
              className={cn("gap-bracket rail-chip absolute flex justify-center border-x border-b font-mono text-[11px] font-medium", over ? "border-caution text-caution font-semibold" : "border-border text-muted-foreground")}
              style={{ left: b, width: a - b, top: chipZone + 12, height: 18, transitionProperty: "left, width, color, border-color" }}
            >
              <span className={cn("translate-y-[2px] rounded px-1 text-[10px] leading-none", over ? "bg-caution/15 text-caution" : "bg-card text-muted-foreground")}>{formatKm(g.gapM)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
