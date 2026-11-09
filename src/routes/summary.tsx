import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { btn, Button, Icon, Screen, VehicleChip } from "@/components/trip/ui";
import { tripStore, useTrip } from "@/lib/trip-store";

export const Route = createFileRoute("/summary")({
  head: () => ({
    meta: [
      { title: "Trip summary - Trip Mode" },
      {
        name: "description",
        content: "Distance, duration, arrivals and the longest gap for your trip.",
      },
      { property: "og:title", content: "Trip summary - Trip Mode" },
      {
        property: "og:description",
        content: "Distance, duration, arrivals and the longest gap for your trip.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Summary,
});

function Summary() {
  const s = useTrip((st) => st.summary);
  const trip = useTrip((st) => st.trip);
  const nav = useNavigate();
  const [saved, setSaved] = useState(false);
  const [discipline, setDiscipline] = useState<{
    score: number;
    inFormationPercent: number;
    strayCount: number;
    grade: string;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tripmode.lastDisciplineScore");
      if (raw) setDiscipline(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const handleSave = () => {
    try {
      const raw = localStorage.getItem("tripmode.savedTrips");
      const list = raw ? JSON.parse(raw) : [];
      const safeList = Array.isArray(list) ? list : [];
      safeList.unshift({
        id: trip?.id || Math.random().toString(36).slice(2),
        name: trip?.name || "Trip",
        origin: trip?.origin || "Origin",
        destination: trip?.destination || "Destination",
        distanceKm: s?.distanceKm || 0,
        durationMin: s?.durationMin || 0,
        date: new Date().toLocaleDateString(),
      });
      localStorage.setItem("tripmode.savedTrips", JSON.stringify(safeList.slice(0, 10)));
    } catch {
      // ignore
    }
    setSaved(true);
  };

  if (!s && !trip)
    return (
      <Screen title="Trip Summary" back="/" maxWidth="max-w-md">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <Icon name="history_toggle_off" className="text-[48px] text-tertiary" />
          <h2 className="mt-4 text-[20px] font-semibold text-foreground">
            No finished convoy to show
          </h2>
          <p className="mt-1 text-muted-foreground text-[14px]">
            Complete a convoy navigation to view distance and gap stats.
          </p>
          <Link to="/" className={btn({ className: "mt-6" })}>
            Go to home
          </Link>
        </div>
      </Screen>
    );

  const durationMin = Math.max(0, s?.durationMin ?? 0);
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  const arrivals = Array.isArray(s?.arrivals) ? s.arrivals : [];
  const distanceKm = s?.distanceKm ?? 0;
  const longestGapKm = s?.longestGapKm ?? 0;
  const stops = s?.stops ?? 0;
  const destination = trip?.destination ?? "Your Destination";

  return (
    <Screen
      title="Trip Summary"
      back="/"
      maxWidth="max-w-2xl lg:max-w-3xl"
      className="px-4 sm:px-6"
    >
      {/* Destination Arrival Banner */}
      <div className="rounded-[24px] border border-leading/30 bg-leading/10 p-5 sm:p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-leading text-white shadow-leading/20 shadow-md">
          <Icon name="check" className="text-[32px] font-bold" />
        </div>
        <h2 className="mt-3 text-[24px] sm:text-[26px] font-bold tracking-tight text-foreground">
          You Have Arrived!
        </h2>
        <p className="mt-1 font-semibold text-foreground text-[16px]">{destination}</p>
        <p className="text-[13px] text-muted-foreground">
          Location sharing has automatically ceased for all vehicles.
        </p>
      </div>

      {/* Convoy Metric Cards */}
      <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Distance Covered", `${distanceKm} km`, "straighten"],
          ["Convoy Duration", `${h > 0 ? `${h} h ` : ""}${m} min`, "schedule"],
          ["Longest Convoy Gap", `${longestGapKm} km`, "compare_arrows"],
          ["Pitstops Made", String(stops), "local_gas_station"],
        ].map(([k, v, icon]) => (
          <div key={k} className="rounded-[18px] border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon name={icon ?? ""} className="text-[18px] text-primary" />
              <dt className="text-[12px] font-medium">{k}</dt>
            </div>
            <dd className="mt-2 font-mono text-[20px] sm:text-[22px] font-bold text-foreground">
              {v}
            </dd>
          </div>
        ))}
      </dl>

      {/* Convoy Discipline Score Card */}
      {discipline && (
        <div className="mt-4 rounded-[20px] border border-border bg-card p-4 sm:p-5 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary font-mono text-[22px] font-bold">
              {discipline.grade}
            </span>
            <div>
              <div className="font-semibold text-[16px] text-foreground">
                Convoy Discipline: {discipline.score}%
              </div>
              <div className="text-[13px] text-muted-foreground">
                {discipline.inFormationPercent}% time in formation • {discipline.strayCount === 0 ? "Zero off-route strays" : `${discipline.strayCount} strays recovered`}
              </div>
            </div>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary uppercase tracking-wider hidden sm:inline">
            Formation Verified
          </span>
        </div>
      )}

      {/* Interactive Post-Trip Convoy Reel */}
      <div className="mt-6">
        <ConvoyReelPlayer arrivals={arrivals} distanceKm={distanceKm} />
      </div>

      {/* Arrival Order List */}
      {arrivals.length > 0 && (
        <section className="mt-6">
          <h3 className="overline mb-2 text-tertiary">Convoy Arrival Order</h3>
          <ul className="divide-y divide-border rounded-[18px] border border-border bg-card shadow-sm overflow-hidden">
            {arrivals.map((a, i) => (
              <li
                key={a.name || i}
                className="flex min-h-15 items-center gap-3 px-4 py-2 hover:bg-secondary/30 transition-colors"
              >
                <span className="font-mono text-[13px] font-bold text-muted-foreground w-4 text-center">
                  {i + 1}
                </span>
                <VehicleChip letter={String.fromCharCode(65 + i)} color={a.color ?? "v1"} size={32} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-[15px] truncate block text-foreground">
                    {a.name || `Vehicle ${i + 1}`}
                  </span>
                </div>
                <span className="font-mono text-[13px] font-semibold text-muted-foreground">
                  {a.minutes === null ? "Did not arrive" : `+${a.minutes} min`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Actions */}
      <div className="mt-8 space-y-2.5 pb-6">
        <Button className="w-full text-[16px] cursor-pointer" disabled={saved} onClick={handleSave}>
          <Icon name={saved ? "check" : "bookmark"} />
          {saved ? "Trip Saved to History" : "Save Convoy Trip"}
        </Button>
        <Button
          variant="quiet"
          className="w-full text-alert text-[14px] cursor-pointer"
          onClick={() => {
            tripStore.deleteData();
            nav({ to: "/" });
          }}
        >
          Delete Convoy Data Now
        </Button>
        <p className="text-center text-[12px] text-tertiary">
          Per our privacy charter, unsaved trips and GPS coordinates are purged automatically after
          30 days.
        </p>
      </div>
    </Screen>
  );
}

function ConvoyReelPlayer({
  arrivals,
  distanceKm,
}: {
  arrivals: { name: string; color?: string }[];
  distanceKm: number;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);

  const startReel = () => {
    setPlaying(true);
    setProgress(0);
    const start = performance.now();
    const duration = 6000;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      setProgress(t);
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div className="rounded-[22px] border border-border bg-card p-4 sm:p-5 shadow-float space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon name="movie" className="text-[20px]" />
          </span>
          <div>
            <h3 className="text-[15px] sm:text-[16px] font-bold text-foreground">Post-Trip Convoy Reel</h3>
            <p className="text-[12px] text-muted-foreground">Animated route formation playback</p>
          </div>
        </div>
        <button
          type="button"
          onClick={startReel}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:bg-primary-pressed active:scale-95 transition-all shadow-xs cursor-pointer"
        >
          <Icon name={playing ? "replay" : "play_arrow"} className="text-[18px]" />
          <span>{playing ? "Replaying..." : progress > 0 ? "Replay" : "Play Reel"}</span>
        </button>
      </div>

      <div className="relative h-28 rounded-xl bg-secondary/50 border border-border overflow-hidden p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
          <span>Start (0 km)</span>
          <span className="font-bold text-primary">{Math.round(progress * distanceKm)} km</span>
          <span>Finish ({distanceKm} km)</span>
        </div>

        <div className="relative h-8 flex items-center">
          <div className="absolute inset-x-0 h-2.5 rounded-full bg-border/80" />
          <div
            className="absolute left-0 h-2.5 rounded-full bg-primary transition-all duration-75 shadow-xs"
            style={{ width: `${progress * 100}%` }}
          />

          {arrivals.map((a, i) => {
            const lag = i * 0.04;
            const p = Math.max(0, Math.min(1, progress - lag));
            return (
              <div
                key={a.name || i}
                className="absolute -top-3.5 transition-transform"
                style={{
                  left: `calc(${p * 92}% + 4px)`,
                  transitionDuration: playing ? "50ms" : "300ms",
                }}
              >
                <VehicleChip letter={String.fromCharCode(65 + i)} color={(a.color as never) || "v1"} size={28} />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <span>Toll Gate Passed</span>
          <span>Corridor Safe Gap Maintained</span>
          <span>All Arrived</span>
        </div>
      </div>
    </div>
  );
}
