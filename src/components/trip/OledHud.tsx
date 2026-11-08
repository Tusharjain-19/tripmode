import { useState, useEffect } from "react";
import { Icon } from "@/components/trip/ui";
import { cn } from "@/lib/utils";

interface OledHudProps {
  speedKmh: number;
  speedLimit?: number | undefined;
  nextInstruction?: string | undefined;
  nextManeuverIcon?: string | undefined;
  distanceToNextM?: number | null | undefined;
  leaderGapKm?: number | null | undefined;
  etaMinutes?: number | null | undefined;
  convoyMembersCount: number;
  onExit: () => void;
}

export function OledHud({
  speedKmh,
  speedLimit = 80,
  nextInstruction,
  nextManeuverIcon = "navigation",
  distanceToNextM,
  leaderGapKm,
  etaMinutes,
  convoyMembersCount,
  onExit,
}: OledHudProps) {
  const [clock, setClock] = useState("");
  const [mirrored, setMirrored] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  const isOverSpeed = speedKmh > speedLimit;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-between bg-black text-white p-6 select-none font-mono tracking-wide"
      style={{
        transform: mirrored ? "scaleX(-1)" : "none",
        transition: "transform 250ms ease-in-out",
      }}
    >
      {/* Top Bar: Minimal Status & Exit HUD */}
      <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[14px] text-neutral-400 font-medium">OLED HUD • {convoyMembersCount} IN CONVOY</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => setMirrored((m) => !m)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] active:scale-95 transition-all cursor-pointer",
              mirrored
                ? "bg-emerald-950 text-emerald-400 border-emerald-600 ring-2 ring-emerald-500/30"
                : "bg-neutral-950 text-neutral-300 border-neutral-800 hover:text-white hover:border-neutral-700",
            )}
            title="Reflect display for windshield projection. Place phone flat on dashboard beneath windshield."
          >
            <Icon name="flip" className="text-[16px]" />
            <span>{mirrored ? "Windshield: ON" : "Windshield Mirror"}</span>
          </button>
          <span className="text-[14px] text-neutral-400 hidden sm:inline">{clock}</span>
          <button
            type="button"
            onClick={onExit}
            className="flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-[13px] text-neutral-300 hover:text-white hover:border-neutral-700 active:scale-95 transition-all cursor-pointer"
          >
            <Icon name="fullscreen_exit" className="text-[16px]" />
            <span>Map</span>
          </button>
        </div>
      </div>

      {/* Center: High-Contrast Speedometer & Next Maneuver */}
      <div className="flex flex-col items-center justify-center my-auto space-y-6">
        {/* Next Maneuver Guidance */}
        {nextInstruction && (
          <div className="flex items-center gap-4 bg-neutral-950/80 border border-neutral-900 rounded-3xl px-6 py-4 max-w-md w-full">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-950 text-emerald-400 border border-emerald-800/40">
              <Icon name={nextManeuverIcon} className="text-[32px]" />
            </div>
            <div className="min-w-0 flex-1">
              {distanceToNextM != null && (
                <div className="text-[20px] font-bold text-emerald-400">
                  {distanceToNextM < 1000
                    ? `${Math.round(distanceToNextM)} m`
                    : `${(distanceToNextM / 1000).toFixed(1)} km`}
                </div>
              )}
              <div className="text-[15px] font-sans text-neutral-300 leading-snug truncate">
                {nextInstruction}
              </div>
            </div>
          </div>
        )}

        {/* Huge OLED Speedometer */}
        <div className="flex flex-col items-center justify-center">
          <div
            className={cn(
              "font-mono text-[92px] sm:text-[120px] font-bold tracking-tighter leading-none transition-colors",
              isOverSpeed ? "text-amber-400" : "text-white",
            )}
          >
            {Math.round(speedKmh)}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[14px] font-bold tracking-widest text-neutral-500 uppercase">
              KM/H
            </span>
            <span className="text-neutral-700">•</span>
            <span className="text-[13px] text-neutral-400">
              LIMIT <span className="font-bold text-neutral-200">{speedLimit}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Bar: Convoy Gap & ETA Readouts */}
      <div className="grid grid-cols-2 gap-4 border-t border-neutral-900 pt-4">
        <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
          <div className="text-[11px] font-bold tracking-wider text-neutral-500 uppercase">
            Leader Convoy Gap
          </div>
          <div className="mt-1 text-[22px] font-bold text-emerald-400">
            {leaderGapKm != null ? `${leaderGapKm.toFixed(1)} km` : "In Formation"}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
          <div className="text-[11px] font-bold tracking-wider text-neutral-500 uppercase">
            Estimated Arrival
          </div>
          <div className="mt-1 text-[22px] font-bold text-neutral-200">
            {etaMinutes != null ? `${etaMinutes} min` : "Calculating..."}
          </div>
        </div>
      </div>
    </div>
  );
}
