import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { btn, Button, Icon, Screen, VehicleChip } from "@/components/trip/ui";
import { tripStore, useTrip } from "@/lib/trip-store";

export const Route = createFileRoute("/summary")({
  head: () => ({
    meta: [
      { title: "Trip summary - Trip Mode" },
      { name: "description", content: "Distance, duration, arrivals and the longest gap for your trip." },
      { property: "og:title", content: "Trip summary - Trip Mode" },
      { property: "og:description", content: "Distance, duration, arrivals and the longest gap for your trip." },
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

  const handleSave = () => {
    try {
      const list = JSON.parse(localStorage.getItem("tripmode.savedTrips") ?? "[]");
      list.unshift({
        id: trip?.id || Math.random().toString(36).slice(2),
        name: trip?.name || "Trip",
        origin: trip?.origin || "",
        destination: trip?.destination || "",
        distanceKm: s?.distanceKm || 0,
        durationMin: s?.durationMin || 0,
        date: new Date().toLocaleDateString(),
      });
      localStorage.setItem("tripmode.savedTrips", JSON.stringify(list.slice(0, 10)));
    } catch {
      // ignore
    }
    setSaved(true);
  };

  if (!s || !trip)
    return (
      <Screen title="Trip summary" back="/" maxWidth="max-w-md">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <Icon name="history_toggle_off" className="text-[48px] text-tertiary" />
          <h2 className="mt-4 text-[20px] font-semibold text-foreground">No finished convoy to show</h2>
          <p className="mt-1 text-muted-foreground text-[14px]">Complete a convoy navigation to view distance and gap stats.</p>
          <Link to="/" className={btn({ className: "mt-6" })}>Go to home</Link>
        </div>
      </Screen>
    );

  const h = Math.floor(s.durationMin / 60);
  const m = s.durationMin % 60;

  return (
    <Screen title="Trip Summary" back="/" maxWidth="max-w-2xl lg:max-w-3xl" className="px-4 sm:px-6">
      {/* Google Maps Style Destination Arrival Banner */}
      <div className="rounded-[24px] border border-leading/30 bg-leading/10 p-5 sm:p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-leading text-white shadow-leading/20 shadow-md">
          <Icon name="check" className="text-[32px] font-bold" />
        </div>
        <h2 className="mt-3 text-[24px] sm:text-[26px] font-bold tracking-tight text-foreground">You Have Arrived!</h2>
        <p className="mt-1 font-semibold text-foreground text-[16px]">{trip.destination}</p>
        <p className="text-[13px] text-muted-foreground">Location sharing has automatically ceased for all vehicles.</p>
      </div>

      {/* Convoy Metric Cards (Responsive 2 cols on mobile, 4 cols on tablet/desktop) */}
      <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Distance Covered", `${s.distanceKm} km`, "straighten"],
          ["Convoy Duration", `${h > 0 ? `${h} h ` : ""}${m} min`, "schedule"],
          ["Longest Convoy Gap", `${s.longestGapKm} km`, "compare_arrows"],
          ["Pitstops Made", String(s.stops), "local_gas_station"],
        ].map(([k, v, icon]) => (
          <div key={k} className="rounded-[18px] border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon name={icon ?? ""} className="text-[18px] text-primary" />
              <dt className="text-[12px] font-medium">{k}</dt>
            </div>
            <dd className="mt-2 font-mono text-[20px] sm:text-[22px] font-bold text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      {/* Arrival Order List */}
      <section className="mt-6">
        <h3 className="overline mb-2 text-tertiary">Convoy Arrival Order</h3>
        <ul className="divide-y divide-border rounded-[18px] border border-border bg-card shadow-sm overflow-hidden">
          {s.arrivals.map((a, i) => (
            <li key={a.name} className="flex min-h-15 items-center gap-3 px-4 py-2 hover:bg-secondary/30 transition-colors">
              <span className="font-mono text-[13px] font-bold text-muted-foreground w-4 text-center">
                {i + 1}
              </span>
              <VehicleChip letter={String.fromCharCode(65 + i)} color={a.color} size={32} />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-[15px] truncate block text-foreground">{a.name}</span>
              </div>
              <span className="font-mono text-[13px] font-semibold text-muted-foreground">
                {a.minutes === null ? "Did not arrive" : `+${a.minutes} min`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Actions */}
      <div className="mt-8 space-y-2.5 pb-6">
        <Button className="w-full text-[16px] cursor-pointer" disabled={saved} onClick={handleSave}>
          <Icon name={saved ? "check" : "bookmark"} />
          {saved ? "Trip Saved to History" : "Save Convoy Trip"}
        </Button>
        <Button variant="quiet" className="w-full text-alert text-[14px] cursor-pointer" onClick={() => { tripStore.deleteData(); nav({ to: "/" }); }}>
          Delete Convoy Data Now
        </Button>
        <p className="text-center text-[12px] text-tertiary">
          Per our privacy charter, unsaved trips and GPS coordinates are purged automatically after 30 days.
        </p>
      </div>
    </Screen>
  );
}
