import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteMap } from "@/components/trip/RouteMap";
import { btn, Icon, Screen, Button } from "@/components/trip/ui";
import { useTrip } from "@/lib/trip-store";
import { ensureGuest, useSession } from "@/lib/auth";
import { useEffect, useState } from "react";
import { useRestoreTrip } from "@/lib/trip-sync";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trip Mode - Collaborative Multi-Vehicle Navigation" },
      {
        name: "description",
        content:
          "Separate vehicles travelling together share one live convoy map, glanceable convoy rail, and quick driving alerts.",
      },
      { property: "og:title", content: "Trip Mode - Collaborative Multi-Vehicle Navigation" },
      {
        property: "og:description",
        content:
          "See all vehicles on one shared map, monitor convoy gaps in real time, coordinate pitstops, and talk hands-free.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

type SavedTrip = {
  id: string;
  name: string;
  origin: string;
  destination: string;
  distanceKm: number;
  durationMin: number;
  date: string;
};

const QUICK_ALERTS = [
  { id: "speed", label: "Slow down", icon: "speed", hint: "Leader reducing pace" },
  { id: "fuel", label: "Need fuel", icon: "local_gas_station", hint: "Search pump along route" },
  {
    id: "break",
    label: "Need a break",
    icon: "airline_seat_recline_normal",
    hint: "Next rest area",
  },
  { id: "food", label: "Food stop", icon: "restaurant", hint: "Coordinate meal stop" },
  { id: "lost", label: "Lost the route", icon: "wrong_location", hint: "Off planned route" },
  { id: "wait", label: "Wait for me", icon: "hourglass_top", hint: "Caught at toll or traffic" },
];

function Home() {
  const trip = useTrip((s) => s.trip);
  const session = useSession();
  const nav = useNavigate();

  const [joinModal, setJoinModal] = useState(false);
  const [code, setCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [isDark, setIsDark] = useState(false);

  useRestoreTrip(!!session);

  useEffect(() => {
    if (session === null) void ensureGuest().catch(() => undefined);
  }, [session]);

  // Load real saved trips from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("tripmode.savedTrips");
      if (stored) {
        setSavedTrips(JSON.parse(stored) as SavedTrip[]);
      }
    } catch {
      // ignore
    }
  }, []);

  // Dark theme detection & toggle
  useEffect(() => {
    const isDarkSaved =
      localStorage.getItem("tripmode-theme") === "dark" ||
      (!("tripmode-theme" in localStorage) &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsDark(isDarkSaved);
    if (isDarkSaved) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("tripmode-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("tripmode-theme", "light");
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim();
    if (clean) {
      nav({ to: "/join/$code", params: { code: clean } });
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      nav({ to: "/create", search: { dest: q } });
    } else {
      nav({ to: "/create" });
    }
  };

  return (
    <Screen maxWidth="max-w-7xl" className="px-3 sm:px-6 lg:px-8">
      {/* Top Application Header */}
      <header className="flex h-16 sm:h-20 items-center justify-between border-b border-border/70 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-[12px] bg-primary text-primary-foreground shadow-float transition-transform active:scale-95">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              className="h-6 w-6"
              fill="none"
            >
              <circle
                cx="24"
                cy="24"
                r="15"
                stroke="currentColor"
                strokeWidth="2"
                strokeOpacity="0.35"
                strokeDasharray="3 3"
              />
              <path d="M24 11L33 34L24 29L15 34L24 11Z" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[19px] sm:text-[21px] font-semibold tracking-tight">
                Trip Mode
              </span>
              <span className="hidden xs:inline-flex rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-ink-secondary">
                CONVOY
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground hidden sm:block">
              Collaborative multi-vehicle navigation
            </p>
          </div>
        </div>

        {/* Header Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Night Driving / Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary cursor-pointer"
            aria-label={isDark ? "Switch to day driving mode" : "Switch to night driving mode"}
            title={isDark ? "Day Mode (Surface Light)" : "Night Driving Mode (Instrument Dark)"}
          >
            <Icon name={isDark ? "light_mode" : "dark_mode"} className="text-[20px]" />
          </button>

          <Link
            to="/create"
            className={btn({
              variant: "primary",
              className: "h-10 px-4 text-[14px] font-medium rounded-full shadow-sm",
            })}
          >
            <Icon name="add_road" className="text-[18px]" />
            <span className="hidden sm:inline">Start Convoy</span>
            <span className="sm:hidden">Start</span>
          </Link>
        </div>
      </header>

      {/* Active Trip Banner if user has an active convoy in progress */}
      {trip && (
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-[16px] border border-leading/40 bg-leading/10 p-4 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leading text-white shadow-xs">
              <Icon name="route" className="text-[22px]" />
            </span>
            <div>
              <div className="font-semibold text-[16px] text-foreground">{trip.name}</div>
              <div className="text-[13px] text-muted-foreground">
                Active convoy room • Invite Code{" "}
                <span className="font-mono font-medium text-foreground">{trip.inviteCode}</span>
              </div>
            </div>
          </div>
          <Link
            to="/trip"
            className={btn({
              variant: "primary",
              className: "h-10 px-5 text-[14px] w-full sm:w-auto",
            })}
          >
            <Icon name="play_arrow" className="text-[18px]" />
            Rejoin Live Map
          </Link>
        </div>
      )}

      {/* Responsive Cockpit Layout: 12 Columns */}
      <main className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Dispatch & Actions (Col 1 to 5) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Dispatch & Search Card */}
          <div className="rounded-[18px] border border-border bg-card p-4 sm:p-5 shadow-float">
            <h2 className="text-[13px] font-semibold tracking-wider text-tertiary uppercase">
              Convoy Dispatch
            </h2>
            <p className="mt-1 text-[20px] font-semibold tracking-tight text-foreground">
              Travel together in separate vehicles
            </p>
            <p className="mt-1 text-[14px] text-muted-foreground leading-relaxed">
              One shared live map for your group, real-time convoy gap monitoring, and push-to-talk
              voice coordination.
            </p>

            {/* Destination Search Form */}
            <form onSubmit={handleSearchSubmit} className="relative mt-4">
              <div className="flex h-13 w-full items-center gap-3 rounded-[12px] border border-border bg-secondary/80 px-4 transition-all focus-within:border-primary focus-within:bg-secondary">
                <Icon name="search" className="text-primary text-[22px]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Where to? Search destination..."
                  className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs transition-transform active:scale-95 cursor-pointer"
                  title="Plan convoy route"
                >
                  <Icon name="arrow_forward" className="text-[18px]" />
                </button>
              </div>
            </form>

            {/* Primary Action Buttons */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
              <Link
                to="/create"
                className={btn({
                  variant: "primary",
                  className: "flex-1 h-12 text-[15px] rounded-[10px]",
                })}
              >
                <Icon name="add_road" className="text-[20px]" />
                Start a Convoy
              </Link>
              <button
                type="button"
                onClick={() => setJoinModal(true)}
                className={btn({
                  variant: "secondary",
                  className: "flex-1 h-12 text-[15px] rounded-[10px] cursor-pointer",
                })}
              >
                <Icon name="pin" className="text-[20px] text-muted-foreground" />
                Join with Code
              </button>
            </div>
          </div>

          {/* Real Saved Trips History */}
          <div className="rounded-[18px] border border-border bg-card p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="overline text-tertiary">Trip History</h3>
              {savedTrips.length > 0 && (
                <span className="text-[12px] font-mono text-muted-foreground">
                  {savedTrips.length} saved
                </span>
              )}
            </div>

            {savedTrips.length > 0 ? (
              <ul className="divide-y divide-border rounded-[12px] border border-border bg-card overflow-hidden">
                {savedTrips.map((st) => (
                  <li
                    key={st.id}
                    className="flex min-h-14 items-center justify-between gap-3 px-3.5 py-2 hover:bg-secondary/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                        <Icon name="history" className="text-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-foreground truncate">
                          {st.name}
                        </div>
                        <div className="text-[12px] text-muted-foreground truncate">
                          {st.distanceKm > 0 ? `${st.distanceKm} km • ` : ""}
                          {st.date}
                        </div>
                      </div>
                    </div>
                    <Link
                      to="/create"
                      className={btn({ variant: "quiet", size: "icon", className: "h-8 w-8" })}
                      aria-label={`Start trip ${st.name}`}
                    >
                      <Icon name="chevron_right" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-border/80 bg-secondary/20 p-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Icon name="explore_off" className="text-[24px]" />
                </span>
                <p className="mt-3 text-[14px] font-medium text-foreground">No saved trips yet</p>
                <p className="mt-1 text-[12px] text-muted-foreground max-w-xs">
                  Trips you complete and save will appear here for easy repeating.
                </p>
                <Link
                  to="/create"
                  className={btn({ variant: "quiet", className: "mt-3 h-9 px-3 text-[13px]" })}
                >
                  Plan your first trip
                </Link>
              </div>
            )}
          </div>

          {/* Privacy & Ephemeral Location Pledge */}
          <div className="flex items-start gap-3.5 rounded-[16px] border border-border bg-card/70 p-4 text-[13px] text-muted-foreground">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon name="verified_user" className="text-[20px]" />
            </span>
            <div>
              <span className="font-semibold text-foreground block mb-0.5">
                Zero Persistent Tracking
              </span>
              GPS positions are shared ephemerally only with approved convoy members while the trip
              is active. All coordinates are purged when the trip ends.
            </div>
          </div>
        </div>

        {/* Right Column: Live Map & Instrument Features (Col 6 to 12) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Map Viewport Card */}
          <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-float">
            <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-leading" />
                <span className="text-[14px] font-semibold text-foreground">Keyless Map Stack</span>
                <span className="text-[12px] text-muted-foreground">• OpenFreeMap Positron</span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/create"
                  className="rounded-full border border-border bg-secondary px-3 py-1 text-[12px] font-medium text-foreground hover:bg-card transition-colors"
                >
                  Plan Route
                </Link>
              </div>
            </div>

            {/* Clean Map Viewport without dummy vehicles */}
            <div className="relative">
              <RouteMap
                selected={0}
                showAlternates={false}
                vehicles={[]}
                className="block h-[340px] sm:h-[400px] lg:h-[440px] w-full"
              />

              {/* Map Floating HUD */}
              <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2 text-[12px] font-mono">
                <span className="flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1 shadow-sm backdrop-blur-xs text-foreground">
                  <span className="h-2 w-2 rounded-full bg-leading" />
                  <span>MapLibre GL Vector Engine</span>
                </span>
              </div>
            </div>
          </div>

          {/* 1-Tap Driving Signals (design.md Section 8.6) */}
          <div className="rounded-[20px] border border-border bg-card p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="overline text-tertiary">1-Tap Convoy Driving Signals</h3>
                <p className="text-[13px] text-muted-foreground">
                  Designed for 1.5-second glanceability while driving. Zero emojis:
                </p>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline">
                design.md §8.6
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {QUICK_ALERTS.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center gap-3 rounded-[12px] border border-border bg-secondary/40 p-3 text-left min-h-[56px]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-primary shadow-xs">
                    <Icon name={alert.icon} className="text-[20px]" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-foreground truncate">
                      {alert.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{alert.hint}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4 Core Instrument Pillars (design.md) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-[16px] border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2.5 text-primary">
                <Icon name="timeline" className="text-[22px]" />
                <h4 className="font-semibold text-[15px] text-foreground">Signature Convoy Rail</h4>
              </div>
              <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
                Horizontal route timeline with proportional vehicle chips and real-time gap brackets
                in IBM Plex Mono.
              </p>
            </div>

            <div className="rounded-[16px] border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2.5 text-primary">
                <Icon name="turn_right" className="text-[22px]" />
                <h4 className="font-semibold text-[15px] text-foreground">Turn-by-Turn Guidance</h4>
              </div>
              <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
                Integrated maneuver cards, upcoming street names, and voice guidance running on
                keyless OpenStreetMap routing.
              </p>
            </div>

            <div className="rounded-[16px] border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2.5 text-primary">
                <Icon name="mic" className="text-[22px]" />
                <h4 className="font-semibold text-[15px] text-foreground">
                  Push-To-Talk Walkie Talkie
                </h4>
              </div>
              <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
                Hold-to-speak voice audio for drivers. Zero typing distraction on the road, with
                earcon tone cues on connect.
              </p>
            </div>

            <div className="rounded-[16px] border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2.5 text-primary">
                <Icon name="local_gas_station" className="text-[22px]" />
                <h4 className="font-semibold text-[15px] text-foreground">
                  Corridor POI Intelligence
                </h4>
              </div>
              <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
                Search corridor petrol pumps, rest areas, food stops, and EV chargers along the
                agreed convoy route.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Join with Code Modal */}
      {joinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-xs"
          onClick={() => setJoinModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-[20px] border border-border bg-card p-5 shadow-float animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="group_add" className="text-primary text-[22px]" />
                <h3 className="text-[18px] font-semibold text-foreground">Join a Convoy</h3>
              </div>
              <button
                type="button"
                onClick={() => setJoinModal(false)}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground cursor-pointer"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Enter the invite code shared by the convoy host.
            </p>
            <form onSubmit={handleJoin} className="mt-4 space-y-3">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 7k9m2p"
                autoFocus
                className="h-12 w-full rounded-lg border border-border bg-secondary px-4 font-mono text-[16px] outline-none focus:border-primary uppercase tracking-widest text-center"
              />
              <Button
                type="submit"
                className="w-full h-12 text-[15px] cursor-pointer"
                disabled={!code.trim()}
              >
                Preview & Join Convoy
              </Button>
            </form>
          </div>
        </div>
      )}
    </Screen>
  );
}
