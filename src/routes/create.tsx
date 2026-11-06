import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { RouteMap } from "@/components/trip/RouteMap";
import { Button, Field, Icon, Screen, Segmented } from "@/components/trip/ui";
import { fetchRoutes, PLACES, POPULAR_ROUTES, ROUTES, setRoutes, useRoutes, type Place, type RawRoute } from "@/lib/geo";
import routesData from "@/data/routes.json";
import { RequireAuth } from "@/components/trip/RequireAuth";
import { createTripRemote } from "@/lib/trip-sync";
import type { Session } from "@supabase/supabase-js";
import { PlacePicker } from "@/components/trip/PlacePicker";
import { tripStore } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  dest: z.string().optional(),
  origin: z.string().optional(),
});

export const Route = createFileRoute("/create")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Start a trip - Trip Mode" },
      { name: "description", content: "Pick a destination, agree on one route and set the convoy rules." },
      { property: "og:title", content: "Start a trip - Trip Mode" },
      { property: "og:description", content: "Pick a destination, agree on one route and set the convoy rules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Create,
});

const nameSchema = z.string().trim().min(1).max(60);

const STEP_LABELS = ["Destination", "Agreed Route", "Convoy Rules"];

function Create() {
  return (
    <RequireAuth reason="Sign in to start a trip and invite your group.">
      {(s) => <CreateInner session={s} />}
    </RequireAuth>
  );
}

function CreateInner({ session }: { session: Session }) {
  const search = Route.useSearch();
  const nav = useNavigate();
  const routes = useRoutes();
  const [step, setStep] = useState(0);

  // Initial place resolution from search query or default Jaipur
  const [origin, setOrigin] = useState<Place | null>(() => {
    if (search.origin) {
      const match = PLACES.find((p) => p.name.toLowerCase() === search.origin!.toLowerCase());
      return match ?? { name: search.origin, lngLat: PLACES[0]!.lngLat };
    }
    return PLACES[0]!; // Jaipur default
  });

  const [dest, setDest] = useState<Place | null>(() => {
    if (search.dest) {
      const match = PLACES.find((p) => p.name.toLowerCase() === search.dest!.toLowerCase());
      return match ?? { name: search.dest, lngLat: PLACES[1]!.lngLat };
    }
    return PLACES[1]!; // Udaipur default
  });

  const [name, setName] = useState(() => {
    const o = search.origin || "Jaipur";
    const d = search.dest || "Udaipur";
    return `${o} to ${d}`;
  });

  const [loading, setLoading] = useState(false);
  const [routeErr, setRouteErr] = useState<string | null>(null);
  const [raw, setRaw] = useState<RawRoute[]>(routesData as RawRoute[]);
  const [saving, setSaving] = useState(false);
  const [routeIndex, setRouteIndex] = useState(0);
  const [threshold, setThreshold] = useState<2 | 3 | 5>(3);
  const [alertsBy, setAlertsBy] = useState<"everyone" | "host">("everyone");
  const [autoEnd, setAutoEnd] = useState(true);
  const [approval, setApproval] = useState(true);

  const lastCreatedTime = useRef(0);

  // Auto-update name if it matches an earlier pattern
  useEffect(() => {
    if (origin && dest && (!name || name.includes(" to "))) {
      setName(`${origin.name} to ${dest.name}`);
    }
  }, [origin, dest]);

  const loadRoutes = async () => {
    if (!origin) {
      setRouteErr("Please select a starting place.");
      return;
    }
    if (!dest) {
      setRouteErr("Please select a destination.");
      return;
    }
    setLoading(true);
    setRouteErr(null);
    try {
      const r = await fetchRoutes(origin.lngLat, dest.lngLat);
      setRaw(r);
      setRoutes(r);
      setRouteIndex(0);
      setStep(1);
    } catch (e) {
      setRouteErr(e instanceof Error ? e.message : "Could not find a road route.");
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    const now = Date.now();
    // Security rate limit: max 1 trip creation per 5 seconds
    if (now - lastCreatedTime.current < 5000) {
      setRouteErr("Please wait a few seconds before creating another convoy.");
      return;
    }

    setSaving(true);
    setRouteErr(null);
    try {
      const tripName = (name.trim() || `${origin?.name ?? "Convoy"} to ${dest?.name ?? "Trip"}`).slice(0, 60);
      const t = tripStore.createTrip({
        name: tripName,
        origin: origin?.name ?? "Origin",
        destination: dest?.name ?? "Destination",
        routeIndex,
        thresholdKm: threshold,
        alertsBy,
        autoEnd,
        approval,
      });

      lastCreatedTime.current = now;
      tripStore.updateMe({ consentAt: null, ready: false });
      await createTripRemote(t, raw, session.user.id);
      nav({ to: "/lobby" });
    } catch (e) {
      setRouteErr(e instanceof Error ? e.message : "Could not create the trip in backend. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleNextClick = () => {
    setRouteErr(null);
    if (step === 0) {
      if (!origin) {
        setRouteErr("Please select where your convoy is starting from.");
        return;
      }
      if (!dest) {
        setRouteErr("Please select where your convoy is heading.");
        return;
      }
      void loadRoutes();
    } else if (step === 1) {
      setStep(2);
    } else {
      void finish();
    }
  };

  const selectPopularRoute = (pr: (typeof POPULAR_ROUTES)[number]) => {
    setOrigin(pr.origin);
    setDest(pr.dest);
    setName(pr.name.replace(" → ", " to "));
    setRouteErr(null);
  };

  const activeSelectedRoute = routes[routeIndex] ?? routes[0];

  return (
    <Screen
      title="Plan Convoy Trip"
      back="/"
      maxWidth="max-w-5xl lg:max-w-6xl"
      className="px-3 sm:px-6 lg:px-8"
    >
      {/* Google Maps Style Stepper */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between text-[12px] sm:text-[13px] font-medium text-muted-foreground mb-2">
          {STEP_LABELS.map((label, i) => (
            <span
              key={label}
              className={cn(
                "transition-colors",
                i === step ? "text-primary font-semibold" : i < step ? "text-foreground" : "text-tertiary",
              )}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold mr-1.5"
                style={{
                  backgroundColor: i === step ? "var(--primary)" : i < step ? "var(--secondary)" : "transparent",
                  color: i === step ? "var(--primary-foreground)" : "inherit",
                }}>
                {i < step ? "✓" : i + 1}
              </span>
              <span className="hidden xs:inline">{label}</span>
            </span>
          ))}
        </div>
        <ol className="flex gap-2" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className={cn(
                "h-1.5 sm:h-2 flex-1 rounded-full transition-all duration-300",
                i <= step ? "bg-primary" : "bg-secondary",
              )}
            />
          ))}
        </ol>
      </div>

      {/* STEP 0: DESTINATION & ORIGIN (Responsive Cockpit Grid) */}
      {step === 0 && (
        <div className="screen-in space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Left Column: Input Form (Col 1 to 7) */}
            <div className="lg:col-span-7 space-y-4">
              <div>
                <h2 className="text-[22px] sm:text-[24px] font-semibold tracking-tight text-foreground">
                  Where is the convoy heading?
                </h2>
                <p className="mt-1 text-[14px] sm:text-[15px] text-muted-foreground">
                  Select origin and destination to calculate road corridors for your vehicles.
                </p>
              </div>

              {/* Origin & Destination Pickers */}
              <div className="space-y-3 rounded-[18px] border border-border bg-card p-4 sm:p-5 shadow-sm">
                <PlacePicker
                  label="Starting from (Origin)"
                  value={origin}
                  allowMyLocation
                  onChange={(p) => {
                    setOrigin(p);
                    if (dest) setName(`${p.name} to ${dest.name}`);
                  }}
                />
                <div className="flex items-center justify-center -my-2 py-1">
                  <span className="h-0.5 w-full bg-secondary" />
                  <button
                    type="button"
                    onClick={() => {
                      const o = origin;
                      setOrigin(dest);
                      setDest(o);
                      if (dest && o) setName(`${dest.name} to ${o.name}`);
                    }}
                    className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary transition-colors cursor-pointer"
                    title="Swap origin and destination"
                  >
                    <Icon name="swap_vert" className="text-[20px]" />
                  </button>
                  <span className="h-0.5 w-full bg-secondary" />
                </div>
                <PlacePicker
                  label="Destination"
                  value={dest}
                  onChange={(p) => {
                    setDest(p);
                    if (origin) setName(`${origin.name} to ${p.name}`);
                  }}
                />
              </div>

              {/* Trip Name Field */}
              <div className="rounded-[18px] border border-border bg-card p-4 sm:p-5 shadow-sm">
                <Field
                  label="Trip name"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Weekend Convoy to Udaipur"
                  hint="All members will see this name on the invite link and live map."
                />
              </div>

              {routeErr && (
                <div role="alert" className="flex items-center gap-2 rounded-xl bg-alert/10 p-3.5 text-[14px] text-alert border border-alert/20">
                  <Icon name="warning" className="text-[20px] shrink-0" />
                  <span>{routeErr}</span>
                </div>
              )}
            </div>

            {/* Right Column: Popular Routes & Convoy Guide (Col 8 to 12) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Popular Convoy Corridors Card */}
              <div className="rounded-[18px] border border-border bg-card p-4 sm:p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="auto_awesome" className="text-primary text-[20px]" />
                  <h3 className="text-[14px] font-semibold tracking-wider text-foreground uppercase">
                    Popular Convoy Routes
                  </h3>
                </div>
                <p className="text-[13px] text-muted-foreground mb-3">
                  Tap any verified highway corridor to populate starting place and destination.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                  {POPULAR_ROUTES.map((pr) => {
                    const isActive = origin?.name === pr.origin.name && dest?.name === pr.dest.name;
                    return (
                      <button
                        key={pr.name}
                        type="button"
                        onClick={() => selectPopularRoute(pr)}
                        className={cn(
                          "flex items-center justify-between rounded-xl border p-3 text-left transition-all cursor-pointer",
                          isActive
                            ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                            : "border-border bg-secondary/40 hover:bg-secondary text-foreground",
                        )}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-[13px] sm:text-[14px] text-foreground truncate">
                            {pr.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            High-speed corridor
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span className="font-mono text-[12px] font-medium text-primary bg-card px-2 py-0.5 rounded-full border border-border">
                            {pr.km} km
                          </span>
                          {isActive && <Icon name="check_circle" className="text-primary text-[18px]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Informational Guidance Card */}
              <div className="rounded-[18px] border border-border bg-secondary/40 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground mb-2">
                  <Icon name="groups" className="text-primary text-[20px]" />
                  <span>How Trip Mode Works</span>
                </div>
                <ul className="space-y-2.5 text-[13px] text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Icon name="done" className="text-primary text-[16px] mt-0.5 shrink-0" />
                    <span>Every driver joins via room invite code — no sign-in required.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon name="done" className="text-primary text-[16px] mt-0.5 shrink-0" />
                    <span>Live vehicle positions stay synchronized to the same agreed road corridor.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon name="done" className="text-primary text-[16px] mt-0.5 shrink-0" />
                    <span>Instant alerts trigger if anyone falls behind or takes an accidental detour.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: AGREED ROUTE (Responsive Cockpit Grid) */}
      {step === 1 && (
        <div className="screen-in space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Left Column: RouteMap Visualizer (Col 1 to 7 on desktop) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="overflow-hidden rounded-[20px] border border-border shadow-float bg-card">
                <RouteMap
                  selected={routeIndex}
                  showAlternates={true}
                  className="block h-64 sm:h-80 lg:h-[460px] w-full"
                />
              </div>

              {/* Selected Route Quick Summary Pill */}
              {activeSelectedRoute && (
                <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 sm:p-4 shadow-xs text-[13px]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-3 w-3 rounded-full bg-leading shrink-0" />
                    <div className="truncate">
                      <span className="font-semibold text-foreground">{activeSelectedRoute.name}</span>
                      <span className="text-muted-foreground ml-2 hidden sm:inline">via {activeSelectedRoute.via}</span>
                    </div>
                  </div>
                  <div className="shrink-0 font-mono font-semibold text-primary">
                    {activeSelectedRoute.hours} • {activeSelectedRoute.km} km
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Corridors List & Details (Col 8 to 12) */}
            <div className="lg:col-span-5 space-y-4">
              <div>
                <h2 className="text-[22px] sm:text-[24px] font-semibold tracking-tight text-foreground">
                  Agree on the convoy route
                </h2>
                <p className="mt-1 text-[14px] sm:text-[15px] text-muted-foreground">
                  Pick the agreed road corridor all vehicles will navigate together.
                </p>
              </div>

              <div role="radiogroup" aria-label="Route options" className="space-y-3">
                {routes.map((r, i) => {
                  const isSelected = routeIndex === i;
                  const isFastest = i === 0;
                  return (
                    <button
                      key={`${r.name}-${i}`}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setRouteIndex(i)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-[16px] border p-4 text-left transition-all cursor-pointer",
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary"
                          : "border-border bg-card hover:border-primary/40 hover:bg-secondary/20",
                      )}
                    >
                      <Icon
                        name={isSelected ? "radio_button_checked" : "radio_button_unchecked"}
                        className={cn("mt-0.5 text-[22px] shrink-0", isSelected ? "text-primary" : "text-tertiary")}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[15px] sm:text-[16px] text-foreground">{r.name}</span>
                          {isFastest ? (
                            <span className="rounded-full bg-leading/15 px-2 py-0.5 text-[11px] font-semibold text-leading">
                              Fastest
                            </span>
                          ) : (
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              Alternate
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] text-muted-foreground mt-1 line-clamp-1">{r.via}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-[15px] sm:text-[16px] font-semibold text-foreground">{r.hours}</div>
                        <div className="font-mono text-[12px] text-muted-foreground">{r.km} km</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-[16px] border border-border bg-secondary/30 p-3.5 text-[13px] text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground mb-1">
                  <Icon name="signpost" className="text-primary text-[18px]" />
                  <span>Single Corridor Guarantee</span>
                </div>
                <span>
                  All vehicles share this active highway geometry. Turn-by-turn guidance and convoy gap alerts reference this single agreed corridor.
                </span>
              </div>

              {routeErr && (
                <div role="alert" className="flex items-center gap-2 rounded-xl bg-alert/10 p-3.5 text-[14px] text-alert border border-alert/20">
                  <Icon name="warning" className="text-[18px] shrink-0" />
                  <span>{routeErr}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: CONVOY RULES & SAFETY (Responsive Multi-Column) */}
      {step === 2 && (
        <div className="screen-in space-y-6">
          <div>
            <h2 className="text-[22px] sm:text-[24px] font-semibold tracking-tight text-foreground">
              Convoy safety & rules
            </h2>
            <p className="mt-1 text-[14px] sm:text-[15px] text-muted-foreground">
              Keep the convoy tight, safe, and synchronized across all vehicles.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Left Column: Alerts & Distance Thresholds */}
            <div className="space-y-4">
              <div className="rounded-[18px] border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[14px] sm:text-[15px] font-semibold text-foreground">
                      Falling-behind alert threshold
                    </span>
                    <span className="font-mono text-[13px] text-primary font-bold bg-primary/10 px-2.5 py-0.5 rounded-full">
                      {threshold} km gap
                    </span>
                  </div>
                  <p className="text-[12px] sm:text-[13px] text-muted-foreground mb-3">
                    Convoy triggers an audible alert when any vehicle separates by this distance.
                  </p>
                  <Segmented
                    label="Falling-behind threshold"
                    value={threshold}
                    onChange={setThreshold}
                    options={[
                      { value: 2, label: "2 km (Tight)" },
                      { value: 3, label: "3 km (Standard)" },
                      { value: 5, label: "5 km (Highway)" },
                    ]}
                  />
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="mb-1.5 text-[14px] sm:text-[15px] font-semibold text-foreground">
                    Quick alerts broadcasting
                  </div>
                  <p className="text-[12px] sm:text-[13px] text-muted-foreground mb-3">
                    Who can transmit one-tap safety alerts (e.g. "Slow down", "Fuel needed").
                  </p>
                  <Segmented
                    label="Who can send alerts"
                    value={alertsBy}
                    onChange={setAlertsBy}
                    options={[
                      { value: "everyone", label: "Everyone" },
                      { value: "host", label: "Host only" },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Security Switches & Pre-Departure Checklist */}
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="flex items-center justify-between gap-4 rounded-[18px] border border-border bg-card p-4 sm:p-5 shadow-sm cursor-pointer hover:bg-secondary/20 transition-colors">
                  <div className="flex items-start gap-3">
                    <Icon name="flag" className="text-primary mt-0.5 text-[22px] shrink-0" />
                    <div>
                      <span className="block font-semibold text-[15px] text-foreground">Auto-end trip at destination</span>
                      <span className="text-[13px] text-muted-foreground">Location sharing stops automatically once all cars arrive.</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoEnd}
                    onChange={(e) => setAutoEnd(e.target.checked)}
                    className="h-5 w-5 accent-primary rounded cursor-pointer shrink-0"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-[18px] border border-border bg-card p-4 sm:p-5 shadow-sm cursor-pointer hover:bg-secondary/20 transition-colors">
                  <div className="flex items-start gap-3">
                    <Icon name="verified_user" className="text-primary mt-0.5 text-[22px] shrink-0" />
                    <div>
                      <span className="block font-semibold text-[15px] text-foreground">Host approval for new cars</span>
                      <span className="text-[13px] text-muted-foreground">You approve each vehicle before they join the live map.</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={approval}
                    onChange={(e) => setApproval(e.target.checked)}
                    className="h-5 w-5 accent-primary rounded cursor-pointer shrink-0"
                  />
                </label>
              </div>

              {/* Pre-Departure Tips Card */}
              <div className="rounded-[18px] border border-border bg-secondary/40 p-4 sm:p-5 text-[13px] text-muted-foreground">
                <div className="flex items-center gap-2 font-semibold text-foreground mb-2">
                  <Icon name="checklist" className="text-primary text-[20px]" />
                  <span>Pre-Departure Checklist</span>
                </div>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <Icon name="volume_up" className="text-primary text-[16px] shrink-0" />
                    <span>Keep device audio unmuted for voice guidance and convoy alerts</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Icon name="smartphone" className="text-primary text-[16px] shrink-0" />
                    <span>Mount phone in driver's line of sight before driving</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Icon name="share" className="text-primary text-[16px] shrink-0" />
                    <span>Share the room invite link in the lobby before wheels roll</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {routeErr && (
            <div role="alert" className="flex items-center justify-between rounded-xl bg-alert/10 p-3.5 text-[14px] text-alert border border-alert/20">
              <div className="flex items-center gap-2">
                <Icon name="warning" className="text-[20px] shrink-0" />
                <span>{routeErr}</span>
              </div>
              <Button size="md" variant="secondary" className="h-8 px-3 text-[12px] cursor-pointer" onClick={() => void finish()}>
                Retry
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Action Footer (Responsive Aligned Bar) */}
      <div className="mt-8 pt-6 border-t border-border/70 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
        {step > 0 ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto px-6 cursor-pointer"
            onClick={() => {
              setRouteErr(null);
              setStep(step - 1);
            }}
          >
            <Icon name="arrow_back" className="text-[18px]" />
            Back
          </Button>
        ) : (
          <div className="hidden sm:block" />
        )}

        <Button
          type="button"
          className="w-full sm:w-auto sm:min-w-[240px] cursor-pointer"
          size="lg"
          disabled={loading || saving}
          onClick={handleNextClick}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Icon name="sync" className="animate-spin text-[20px]" />
              Calculating road corridors...
            </span>
          ) : step < 2 ? (
            <span className="flex items-center justify-center gap-2">
              <span>Next: {STEP_LABELS[step + 1]}</span>
              <Icon name="arrow_forward" className="text-[18px]" />
            </span>
          ) : saving ? (
            <span className="flex items-center justify-center gap-2">
              <Icon name="sync" className="animate-spin text-[20px]" />
              Creating Convoy...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Icon name="rocket_launch" className="text-[18px]" />
              <span>Create Convoy & Invite</span>
            </span>
          )}
        </Button>
      </div>
    </Screen>
  );
}
