import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConvoyRail } from "@/components/trip/ConvoyRail";
import { RouteMap, type MapCamera, type MapVehicle } from "@/components/trip/RouteMap";
import { btn, Button, Icon, VehicleChip } from "@/components/trip/ui";
import { formatKm, gapsToLeader, statusMessage, type MemberStatus } from "@/lib/convoy";
import {
  metersPerUnit,
  ROUTES,
  searchPlaces,
  shortestArc,
  snapToRoute,
  toLngLat,
  toMeters,
} from "@/lib/geo";
import { useServerFn } from "@tanstack/react-start";
import { suggestStopsFromChat } from "@/lib/stops.functions";
import { useGeolocation } from "@/lib/use-geolocation";
import { useI18n } from "@/lib/i18n";
import { RequireAuth } from "@/components/trip/RequireAuth";
import {
  advanceStep,
  distanceToRouteM,
  fetchGuidance,
  formatDistance,
  haversineM,
  instruction,
  maneuverIcon,
  type NavLeg,
  type NavRoute,
} from "@/lib/nav";
import { CATEGORIES, searchNearby, type NearbyPlace, type PlaceCategory } from "@/lib/places";
import type { MapStyleId } from "@/components/trip/RouteMap";
import {
  confirmStopRemote,
  createStopRemote,
  dismissStopRemote,
  endTripRemote,
  leaveTripRemote,
  sendMessage,
  useMembers,
  useStops,
  useTripStatus,
  useMessages,
  usePositions,
  usePublishPosition,
  useRestoreTrip,
  type Member,
} from "@/lib/trip-sync";
import type { VehicleColor } from "@/lib/trip-store";
import {
  applyFix,
  routeMeters,
  TICK_MS,
  vehiclePoint,
  vehicleStatus,
  type SimVehicle,
} from "@/lib/simulation";
import { tripStore, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trip")({
  head: () => ({
    meta: [
      { title: "Live Convoy Navigation - Trip Mode" },
      {
        name: "description",
        content:
          "Live convoy map with the group's positions, gaps and Google Maps turn-by-turn guidance.",
      },
      { property: "og:title", content: "Live Convoy Navigation - Trip Mode" },
      {
        property: "og:description",
        content: "Live convoy map with the group's positions, gaps and alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TripGate,
});

function TripGate() {
  return <RequireAuth>{(session) => <TripGateInner uid={session.user.id} />}</RequireAuth>;
}

function TripGateInner({ uid }: { uid: string }) {
  useRestoreTrip(true);
  const trip = useTrip((s) => s.trip);
  const members = useMembers(trip?.id);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    // Allow up to 1200ms to restore trip state from storage / network before showing unjoined gate
    const timer = setTimeout(() => setRestoring(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const mine = members.find((m) => m.userId === uid);

  if (restoring && (!trip?.id || (!mine && members.length === 0))) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <Icon name="sync" className="animate-spin text-[40px] text-primary" />
        <p className="max-w-xs text-sm text-muted-foreground">Connecting to trip convoy...</p>
      </div>
    );
  }

  if (trip?.id && mine && !mine.approved)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <Icon name="hourglass_top" className="text-[40px] text-tertiary" />
        <p className="max-w-xs text-muted-foreground">
          The host has not approved you yet. Your location is not shared.
        </p>
        <Link to="/lobby" className={btn()}>
          Go to trip lobby
        </Link>
      </div>
    );
  if (!trip?.id || !mine)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <Icon name="location_off" className="text-[40px] text-tertiary" />
        <p className="max-w-xs text-muted-foreground">
          Join the trip and agree to share before opening the live map.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link to="/lobby" className={btn()}>
            Go to trip lobby
          </Link>
          <Link to="/create" className={btn({ variant: "secondary" })}>
            Create trip
          </Link>
        </div>
      </div>
    );
  return <LiveTrip uid={uid} members={members} mine={mine} />;
}

const QUICK = [
  { id: "slow", label: "Slow down", icon: "speed" },
  { id: "fuel", label: "Need fuel", icon: "local_gas_station" },
  { id: "break", label: "Need a break", icon: "airline_seat_recline_normal" },
  { id: "food", label: "Food stop", icon: "restaurant" },
  { id: "lost", label: "Lost the route", icon: "wrong_location" },
  { id: "wait", label: "Wait for me", icon: "hourglass_top" },
] as const;

type Banner = {
  id: number;
  kind: "system" | "quick" | "sent" | "sos";
  text: string;
  tone: "info" | "caution" | "alert";
  from?: SimVehicle | undefined;
  acks?: number;
  ackable?: boolean;
};
type Msg = {
  clientId: string;
  fromId: string;
  text: string;
  state: "sending" | "sent" | "delivered";
  at: number;
};
type Camera = MapCamera;
const WEDGE: Record<VehicleColor, string> = {
  v1: "border-l-v1",
  v2: "border-l-v2",
  v3: "border-l-v3",
  v4: "border-l-v4",
  v5: "border-l-v5",
  v6: "border-l-v6",
  v7: "border-l-v7",
  v8: "border-l-v8",
};

const SHEET_H = ["auto", "48vh", "88vh"];
const MAX_CHAT = 500;

function getCardinalDirection(angle: number): string {
  const normalized = ((angle % 360) + 360) % 360;
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(normalized / 45) % 8;
  return directions[index] ?? "N";
}

function mkVehicle(m: Member, isMe: boolean): SimVehicle {
  return {
    id: m.userId,
    letter: m.letter,
    name: m.vehicleLabel,
    driver: m.displayName,
    color: m.color,
    role: m.role,
    isMe,
    vehicleType: m.vehicleType ?? "car",
    progressM: 0,
    speedKmh: 0,
    offsetM: 0,
    lastUpdateReal: 0,
    stoppedForS: 0,
    offRouteForS: 0,
    arrivedAtS: null,
    stops: 0,
  };
}

function LiveTrip({ uid, members, mine }: { uid: string; members: Member[]; mine: Member }) {
  const { lang, t, toggleLanguage } = useI18n();
  const trip = useTrip((s) => s.trip)!;
  const me = useTrip((s) => s.me);
  const nav = useNavigate();
  const route = ROUTES[trip.routeIndex] ?? ROUTES[0]!;
  const mpu = metersPerUnit(route);
  const routeM = routeMeters(route.line, mpu);
  const thresholdM = trip.thresholdKm * 1000;

  const [meState, setMeState] = useState<SimVehicle>(() => mkVehicle(mine, true));
  const [others, setOthers] = useState<Record<string, SimVehicle>>({});
  const positions = usePositions(trip.id);
  const vehicles = useMemo(
    () => [
      {
        ...meState,
        letter: mine.letter,
        name: mine.vehicleLabel,
        color: mine.color,
        vehicleType: mine.vehicleType ?? me.vehicleType ?? "car",
      },
      ...Object.values(others),
    ],
    [meState, others, mine, me.vehicleType],
  );
  const [now, setNow] = useState(() => Date.now());
  const [camera, setCamera] = useState<Camera>({ mode: "follow" });
  const [bearing, setBearing] = useState(0);
  const [snap, setSnap] = useState(0);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [audioMode, setAudioMode] = useState<"all" | "alerts" | "mute">("all");
  const [zoomAction, setZoomAction] = useState<{ dir: "in" | "out"; ts: number } | undefined>();
  const [railOpen, setRailOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [exitConfirm, setExitConfirm] = useState(false);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const [draft, setDraft] = useState("");
  const geo = useGeolocation();
  const startedAt = useRef(Date.now());
  const [sos, setSos] = useState<"idle" | "holding" | "countdown" | "sent">("idle");
  const [sosLeft, setSosLeft] = useState(5);
  const lastAlert = useRef<Record<string, number>>({});
  const prevStatus = useRef<Record<string, MemberStatus>>({});
  const longestGap = useRef(0);
  const lastQuickSent = useRef(0);
  const headings = useRef<Record<string, number>>({});
  const bannerId = useRef(0);

  const showBanner = useCallback((b: Omit<Banner, "id">) => {
    bannerId.current += 1;
    const id = bannerId.current;
    setBanner({ ...b, id });
    if (b.kind !== "sos") setTimeout(() => setBanner((cur) => (cur?.id === id ? null : cur)), 6000);
  }, []);

  const vehiclesRef = useRef<SimVehicle[]>([]);
  vehiclesRef.current = vehicles;
  const messages = useMessages(trip.id, (m) => {
    if (m.userId === uid) return;
    const from =
      vehiclesRef.current.find((v) => v.id === m.userId) ??
      (() => {
        const mm = members.find((x) => x.userId === m.userId);
        return mm ? mkVehicle(mm, false) : undefined;
      })();
    const who = from?.driver ?? "A member";
    if (m.kind === "chat") {
      if (!chatOpenRef.current) setUnread((u) => u + 1);
    } else if (m.kind === "quick") {
      showBanner({
        kind: "quick",
        text: `${who}: ${m.body}`,
        tone: "caution",
        from,
        ackable: true,
      });
      navigator.vibrate?.(60);
      if (audioMode !== "mute" && typeof speechSynthesis !== "undefined") {
        speechSynthesis.speak(new SpeechSynthesisUtterance(`${who} says: ${m.body}`));
      }
    } else {
      showBanner({ kind: "sos", text: `SOS from ${who}. ${m.body}`, tone: "alert", from });
      navigator.vibrate?.([200, 100, 200]);
      if (typeof speechSynthesis !== "undefined") {
        speechSynthesis.speak(new SpeechSynthesisUtterance(`Emergency SOS from ${who}`));
      }
    }
  });
  const msgs: Msg[] = useMemo(
    () =>
      messages
        .filter((m) => m.kind === "chat")
        .map((m) => ({
          clientId: m.id,
          fromId: m.userId,
          text: m.body,
          state: "sent" as const,
          at: m.at,
        })),
    [messages],
  );

  // Clock for staleness
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  // Real GPS fixes drive your own vehicle
  useEffect(() => {
    const f = geo.fix;
    if (!f) return;
    setMeState((v) =>
      applyFix(
        v,
        route.line,
        toMeters([f.lng, f.lat]),
        f.speedMs,
        v.lastUpdateReal ? Math.max(0, (f.at - v.lastUpdateReal) / 1000) : 0,
        f.at,
      ),
    );
  }, [geo.fix, route.line]);
  usePublishPosition(trip.id, uid, geo.publishedFix);

  // Other members' live positions & companion convoy
  useEffect(() => {
    setOthers((prev) => {
      const next: Record<string, SimVehicle> = {};
      const realOtherMembers = members.filter((m) => m.userId !== uid);

      if (realOtherMembers.length > 0) {
        // Real connected members in the trip
        realOtherMembers.forEach((m, idx) => {
          const p = positions[m.userId];
          const base: SimVehicle = {
            ...(prev[m.userId] ?? mkVehicle(m, false)),
            letter: m.letter,
            name: m.vehicleLabel,
            driver: m.displayName,
            color: m.color,
            role: m.role,
            vehicleType: m.vehicleType ?? (idx % 2 === 1 ? "bike" : "car"),
          };
          if (!p) {
            // Position not published yet by other device: place on route near me so they are visible
            const fallbackProgress = Math.max(0, meState.progressM - (idx + 1) * 600);
            next[m.userId] = {
              ...base,
              progressM: base.progressM || fallbackProgress,
              speedKmh: 0,
            };
          } else {
            next[m.userId] =
              p.at === base.lastUpdateReal
                ? base
                : applyFix(
                    base,
                    route.line,
                    toMeters([p.lng, p.lat]),
                    p.speedMs,
                    base.lastUpdateReal ? Math.max(0, (p.at - base.lastUpdateReal) / 1000) : 0,
                    p.at,
                  );
          }
        });
      } else {
        // No other real members connected yet: provide simulated companion convoy vehicles (Car + Bike)
        // so the user can see other vehicles driving with them, test convoy gaps, map markers, and rail!
        const companions: Array<{
          id: string;
          name: string;
          driver: string;
          color: VehicleColor;
          vehicleType: "car" | "bike";
          offsetProgressM: number;
          speedKmh: number;
        }> = [
          {
            id: "sim-scout",
            name: "Scout Car",
            driver: "Alex (Scout)",
            color: (mine.color === "v2" ? "v3" : "v2") as VehicleColor,
            vehicleType: "car",
            offsetProgressM: 850,
            speedKmh: Math.max(45, meState.speedKmh || 65),
          },
          {
            id: "sim-sweep",
            name: "Sweep Bike",
            driver: "Sam (Rider)",
            color: (mine.color === "v4" ? "v5" : "v4") as VehicleColor,
            vehicleType: "bike",
            offsetProgressM: -620,
            speedKmh: Math.max(40, meState.speedKmh || 60),
          },
        ];

        companions.forEach((c) => {
          const prevV = prev[c.id];
          const targetProgress = Math.min(
            routeM,
            Math.max(0, meState.progressM + c.offsetProgressM),
          );
          next[c.id] = {
            id: c.id,
            letter: c.vehicleType === "bike" ? "B" : "C",
            name: c.name,
            driver: c.driver,
            color: c.color,
            role: "driver",
            isMe: false,
            vehicleType: c.vehicleType,
            progressM: prevV
              ? Math.min(routeM, prevV.progressM + (c.speedKmh / 3.6) * 1.2)
              : targetProgress,
            speedKmh: c.speedKmh,
            offsetM: 0,
            lastUpdateReal: Date.now(),
            stoppedForS: 0,
            offRouteForS: 0,
            arrivedAtS: null,
            stops: 0,
          };
        });
      }
      return next;
    });
  }, [
    members,
    positions,
    uid,
    route.line,
    routeM,
    meState.progressM,
    meState.speedKmh,
    mine.color,
  ]);

  const gaps: Record<string, number> = useMemo(
    () => gapsToLeader(vehicles.map((v) => ({ id: v.id, progressM: v.progressM }))),
    [vehicles],
  );
  const statuses = useMemo(
    () =>
      Object.fromEntries(
        vehicles.map((v) => [v.id, vehicleStatus(v, gaps[v.id] ?? 0, thresholdM, now)]),
      ) as Record<string, MemberStatus>,
    [vehicles, gaps, thresholdM, now],
  );
  const meV = vehicles.find((v) => v.isMe)!;
  const driving = me.role === "driver" && meV.speedKmh > 10;
  const othersCount = vehicles.length - 1;

  // System alerts from status changes, debounced 2 minutes per vehicle+status
  useEffect(() => {
    const maxGap = Math.max(...Object.values(gaps));
    longestGap.current = Math.max(longestGap.current, maxGap);
    for (const v of vehicles) {
      const s = statuses[v.id] ?? "following";
      const prev = prevStatus.current[v.id];
      prevStatus.current[v.id] = s;
      if (!prev || prev === s || v.isMe) continue;
      const key = `${v.id}:${s}`;
      if (Date.now() - (lastAlert.current[key] ?? 0) < 120000) continue;
      const text = statusMessage(`Vehicle ${v.letter}`, s, gaps[v.id] ?? 0);
      if (!text) continue;
      lastAlert.current[key] = Date.now();
      showBanner({
        kind: "system",
        text,
        tone: s === "arrived" ? "info" : s === "behind" || s === "stale" ? "caution" : "alert",
        from: v,
      });
      if (audioMode !== "mute" && typeof speechSynthesis !== "undefined") {
        speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      }
    }
  }, [statuses, gaps, vehicles, showBanner, audioMode]);

  // Auto end when everyone arrives
  const allArrived = vehicles.every((v) => v.arrivedAtS !== null);
  const isHost = trip.hostId === uid;
  const tripStatus = useTripStatus(trip.id);
  const ending = useRef(false);
  const endTrip = useCallback(() => {
    if (ending.current) return;
    ending.current = true;
    tripStore.finish({
      distanceKm: Math.round(meV.progressM / 1000),
      durationMin: Math.round((Date.now() - startedAt.current) / 60000),
      longestGapKm: Math.round(longestGap.current / 100) / 10,
      arrivals: vehicles.map((v) => ({
        name: v.name,
        color: v.color,
        minutes: v.arrivedAtS === null ? null : Math.round(v.arrivedAtS / 60),
      })),
      stops: vehicles.reduce((a, v) => a + v.stops, 0),
    });
    nav({ to: "/summary" });
  }, [meV.progressM, vehicles, nav]);

  useEffect(() => {
    if (allArrived && trip.autoEnd) {
      if (isHost) void endTripRemote(trip.id!).catch(() => undefined);
      endTrip();
    }
  }, [allArrived, trip.autoEnd, endTrip, isHost, trip.id]);

  useEffect(() => {
    if (tripStatus === "ended") endTrip();
  }, [tripStatus, endTrip]);

  const endForEveryone = async () => {
    try {
      await endTripRemote(trip.id!);
    } catch {
      showBanner({
        kind: "system",
        text: "Could not end the trip. Check your connection.",
        tone: "alert",
      });
      return;
    }
    endTrip();
  };

  const leave = async () => {
    await leaveTripRemote(trip.id!, uid).catch(() => undefined);
    tripStore.leave();
    tripStore.setTrip(null);
    nav({ to: "/" });
  };

  // Stops proposed in chat
  const stops = useStops(trip.id);
  const suggested = stops.filter((s) => s.status === "suggested");
  const confirmed = stops.filter((s) => s.status === "confirmed");
  const suggestFn = useServerFn(suggestStopsFromChat);
  const [stopState, setStopState] = useState<{ busy: boolean; note: string | null }>({
    busy: false,
    note: null,
  });
  const findStops = async () => {
    setStopState({ busy: true, note: null });
    try {
      const r = await suggestFn({ data: { tripId: trip.id! } });
      setStopState({
        busy: false,
        note: r.ok ? (r.added ? null : "No new stops found in the chat.") : r.error,
      });
    } catch {
      setStopState({ busy: false, note: "Could not read the chat right now." });
    }
  };

  const confirmStop = async (id: string, name: string, query: string) => {
    let at: [number, number] | null = null;
    try {
      at = (await searchPlaces(query || name))[0]?.lngLat ?? null;
    } catch {
      /* keep without a pin */
    }
    try {
      await confirmStopRemote(id, at);
      await sendMessage(trip.id!, uid, "chat", `Stop added: ${name}`.slice(0, MAX_CHAT));
    } catch {
      showBanner({
        kind: "system",
        text: "Stop not shared. Check your connection.",
        tone: "alert",
      });
    }
  };

  // Positions and camera with route snapping (frontend.md §6)
  const points: Record<
    string,
    { p: { x: number; y: number }; heading: number; offRoute: boolean }
  > = useMemo(
    () =>
      Object.fromEntries(
        vehicles.map((v) => {
          if (v.realP) {
            const snapped = snapToRoute(v.realP, route.line, 30);
            return [
              v.id,
              {
                p: snapped.point,
                heading: v.realHeading ?? 0,
                offRoute: !snapped.snapped,
              },
            ];
          }
          return [
            v.id,
            { ...vehiclePoint(route.line, v.progressM, v.offsetM, mpu), offRoute: false },
          ];
        }),
      ),
    [vehicles, route.line, mpu],
  );

  const smoothHeading = (id: string, h: number) => {
    const prev = headings.current[id] ?? h;
    const next = shortestArc(prev, h);
    headings.current[id] = next;
    return next;
  };

  const sendQuick = (label: string) => {
    if (Date.now() - lastQuickSent.current < 5000) {
      showBanner({
        kind: "system",
        text: "Wait a few seconds before sending another alert.",
        tone: "info",
      });
      return;
    }
    lastQuickSent.current = Date.now();
    setQuickOpen(false);
    showBanner({ kind: "sent", text: `Sent: ${label}`, tone: "info" });
    sendMessage(trip.id!, uid, "quick", label).catch(() =>
      showBanner({ kind: "system", text: "Alert not sent. Check your connection.", tone: "alert" }),
    );
    navigator.vibrate?.(30);
  };

  const sendChat = () => {
    const text = draft.trim().slice(0, MAX_CHAT);
    if (!text) return;
    setDraft("");
    sendMessage(trip.id!, uid, "chat", text).catch(() => {
      setDraft(text);
      showBanner({
        kind: "system",
        text: "Message not sent. Check your connection.",
        tone: "alert",
      });
    });
  };

  const readAloud = () => {
    const last = [...msgs].reverse().find((m) => m.fromId !== meV.id);
    if (!last || typeof speechSynthesis === "undefined") return;
    const from = vehicles.find((v) => v.id === last.fromId);
    speechSynthesis.speak(
      new SpeechSynthesisUtterance(`${from?.driver ?? "Someone"} says: ${last.text}`),
    );
  };

  // SOS long-press then 5 second cancel window
  const sosTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sosStart = () => {
    setSos("holding");
    sosTimer.current = setTimeout(() => {
      setSos("countdown");
      setSosLeft(5);
    }, 1200);
  };
  const sosRelease = () => {
    if (sos === "holding") {
      if (sosTimer.current) clearTimeout(sosTimer.current);
      setSos("idle");
    }
  };
  useEffect(() => {
    if (sos !== "countdown") return;
    if (sosLeft === 0) {
      setSos("sent");
      const f = geo.fix;
      void sendMessage(
        trip.id!,
        uid,
        "sos",
        f ? `Location ${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}` : "Location unavailable",
      );
      showBanner({
        kind: "sos",
        text: "SOS sent to all members with your location and vehicle.",
        tone: "alert",
      });
      return;
    }
    const t = setTimeout(() => setSosLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [sos, sosLeft, showBanner, geo.fix, trip.id, uid]);

  // Map style
  const [mapStyle, setMapStyle] = useState<MapStyleId>("default");
  const [styleOpen, setStyleOpen] = useState(false);

  // Nearby places & Selected POI (Google Maps style)
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [nearbyCat, setNearbyCat] = useState<PlaceCategory | null>(null);
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [nearbyState, setNearbyState] = useState<"idle" | "loading" | "error">("idle");
  const [selectedPlace, setSelectedPlace] = useState<NearbyPlace | null>(null);

  const findNearby = async (cat: PlaceCategory) => {
    const f = geo.fix;
    const center: [number, number] = f ? [f.lng, f.lat] : (route.coords[0] ?? [78, 22]);
    setNearbyCat(cat);
    setNearbyOpen(true);
    setNearbyState("loading");
    try {
      const places = await searchNearby(center, cat);
      setNearby(places);
      setNearbyState("idle");
      if (places.length > 0 && !selectedPlace) {
        setSelectedPlace(places[0]!);
      }
    } catch {
      setNearbyState("error");
      setNearby([]);
    }
  };

  const handleAddStop = async (p: NearbyPlace) => {
    void sendMessage(trip.id!, uid, "quick", `Proposing stop: ${p.name}`);
    showBanner({ kind: "sent", text: `Proposed ${p.name} as convoy stop`, tone: "info" });
    if (isHost) {
      await createStopRemote(trip.id!, p.name, p.lngLat).catch(() => undefined);
    }
    setSelectedPlace(null);
  };

  // Turn-by-turn guidance from your position to the destination
  const dest = route.coords[route.coords.length - 1]!;
  const waypoints = useMemo(
    () =>
      confirmed
        .filter((s) => s.lng !== null && s.lat !== null)
        .map((s) => [s.lng!, s.lat!] as [number, number]),
    [confirmed],
  );

  const [guide, setGuide] = useState<NavRoute | null>(null);
  const [stepIdx, setStepIdx] = useState(1);
  const [rerouting, setRerouting] = useState(false);
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [isFreeLook, setIsFreeLook] = useState(false);
  const [recenterSec, setRecenterSec] = useState(5);
  const recenterTimer = useRef<number>(0);
  const lastRouteAt = useRef(0);
  const spoken = useRef<string>("");
  const hasFix = !!geo.fix;

  const triggerReroute = useCallback(
    async (msg = "Recalculating route...") => {
      if (rerouting) return;
      setRerouting(true);
      showBanner({ kind: "system", text: msg, tone: "info" });
      const f = geo.fix;
      const startPoint: [number, number] = f
        ? [f.lng, f.lat]
        : (route.coords[0] ?? [75.7873, 26.9124]);
      try {
        const g = await fetchGuidance(startPoint, dest, waypoints);
        setGuide(g);
        setStepIdx(1);
      } catch {
        // preserve previous guidance
      } finally {
        setRerouting(false);
      }
    },
    [rerouting, geo.fix, route.coords, dest, waypoints, showBanner],
  );

  const handleUserPan = useCallback(() => {
    setIsFreeLook(true);
    setRecenterSec(5);
    window.clearInterval(recenterTimer.current);
    recenterTimer.current = window.setInterval(() => {
      setRecenterSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(recenterTimer.current);
          setIsFreeLook(false);
          setCamera({ mode: "follow" });
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleRecenter = useCallback(() => {
    window.clearInterval(recenterTimer.current);
    setIsFreeLook(false);
    setCamera({ mode: "follow" });
  }, []);

  useEffect(() => {
    const f = geo.fix;
    const startPoint: [number, number] = f
      ? [f.lng, f.lat]
      : (route.coords[0] ?? [75.7873, 26.9124]);
    const offGuide =
      guide &&
      guide.steps[stepIdx] &&
      f &&
      haversineM([f.lng, f.lat], guide.steps[stepIdx]!.location) >
        guide.steps[stepIdx]!.distanceM + 500;
    if (guide && !offGuide && Date.now() - lastRouteAt.current < 45000) return;
    lastRouteAt.current = Date.now();
    fetchGuidance(startPoint, dest, waypoints)
      .then((g) => {
        setGuide(g);
        setStepIdx(1);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFix, geo.fix?.lng, geo.fix?.lat, dest[0], dest[1], waypoints.length]);

  // Real-time off-route deviation check for automatic rerouting
  useEffect(() => {
    if (!geo.fix || !guide?.geometry || guide.geometry.length < 2) return;
    const devM = distanceToRouteM([geo.fix.lng, geo.fix.lat], guide.geometry);
    if (devM > 120 && meV.speedKmh > 5 && !rerouting && Date.now() - lastRouteAt.current > 15000) {
      lastRouteAt.current = Date.now();
      void triggerReroute("Off agreed route • Recalculating path...");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.fix?.lng, geo.fix?.lat, guide?.geometry, meV.speedKmh, rerouting, triggerReroute]);

  const here: [number, number] | null = geo.fix ? [geo.fix.lng, geo.fix.lat] : null;
  useEffect(() => {
    if (!guide || !here) return;
    const n = advanceStep(guide.steps, stepIdx, here);
    if (n !== stepIdx) setStepIdx(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, here?.[0], here?.[1]]);

  const nextStep = guide?.steps[stepIdx];
  const secondStep = guide?.steps[stepIdx + 1];
  const toNextM = nextStep && here ? haversineM(here, nextStep.location) : null;

  useEffect(() => {
    if (
      !nextStep ||
      toNextM === null ||
      audioMode !== "all" ||
      typeof speechSynthesis === "undefined"
    )
      return;
    const band = toNextM < 120 ? "now" : toNextM < 600 ? "soon" : null;
    if (!band) return;
    const key = `${stepIdx}:${band}`;
    if (spoken.current === key) return;
    spoken.current = key;
    const text =
      band === "now"
        ? instruction(nextStep)
        : `In ${formatDistance(toNextM)}, ${instruction(nextStep).toLowerCase()}`;
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }, [nextStep, toNextM, stepIdx, audioMode]);

  const speakNow = () => {
    if (!nextStep || typeof speechSynthesis === "undefined") return;
    const text = toNextM
      ? `In ${formatDistance(toNextM)}, ${instruction(nextStep).toLowerCase()}`
      : instruction(nextStep);
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  const cycleAudio = () => {
    setAudioMode((prev) => (prev === "all" ? "alerts" : prev === "alerts" ? "mute" : "all"));
  };

  const sortedMembers = [...vehicles].sort((a, b) => b.progressM - a.progressM);
  const ctl = driving ? "h-14 w-14" : "h-11 w-11";

  // Google Maps ETA calculation
  const remainingM = Math.max(0, routeM - meV.progressM);
  const remainingKm = Math.round(remainingM / 1000);
  const estSeconds = guide?.durationS ?? Math.round(remainingM / 20); // ~72kmh default
  const estMinutes = Math.round(estSeconds / 60);
  const estHours = Math.floor(estMinutes / 60);
  const estMins = estMinutes % 60;
  const etaTimeStr = new Date(Date.now() + estSeconds * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 overflow-hidden bg-background select-none">
      {/* Geolocation permission overlay if not granted */}
      {geo.state !== "granted" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/85 p-6 backdrop-blur-xs">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-[24px] bg-card p-6 text-center shadow-float border border-border">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon
                name={
                  geo.state === "denied" || geo.state === "unavailable"
                    ? "location_off"
                    : "my_location"
                }
                className="text-[32px]"
              />
            </span>
            <h2 className="text-[20px] font-semibold">Share your location for this trip</h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              Your GPS coordinates are shared in real time with convoy members to compute gaps and
              guide the route. Sharing automatically ceases when you leave.
            </p>
            {geo.error && (
              <p role="alert" className="text-[13px] text-alert font-medium">
                {geo.error}
              </p>
            )}
            <Button
              className="w-full"
              size="lg"
              onClick={geo.request}
              disabled={geo.state === "asking"}
            >
              {geo.state === "asking"
                ? "Acquiring GPS fix..."
                : geo.state === "denied"
                  ? "Retry GPS Permission"
                  : "Allow Live Location"}
            </Button>
            <Link to="/lobby" className="text-[14px] text-muted-foreground underline">
              Back to convoy lobby
            </Link>
          </div>
        </div>
      )}

      {/* Full Viewport Map */}
      <RouteMap
        selected={trip.routeIndex}
        showAlternates={false}
        travelledM={meV.progressM}
        activeRouteCoords={guide?.geometry ?? undefined}
        destinationLngLat={dest}
        nextManeuverLngLat={nextStep?.location ?? null}
        selectedPlaceId={selectedPlace?.id ?? null}
        camera={camera}
        onVehicleClick={(id) => setCamera({ mode: "focus", id })}
        onPlaceClick={(id) => {
          const found = nearby.find((p) => p.id === id);
          if (found) setSelectedPlace(found);
        }}
        onBearingChange={setBearing}
        onUserPan={handleUserPan}
        zoomAction={zoomAction}
        mapStyle={mapStyle}
        places={nearby.map((p) => ({
          id: p.id,
          name: p.name,
          icon: CATEGORIES.find((c) => c.id === p.category)!.icon,
          lngLat: p.lngLat,
        }))}
        className="absolute inset-0 h-full w-full"
        vehicles={vehicles.map((v): MapVehicle => {
          const pt = points[v.id]!;
          const { p, heading, offRoute } = pt;
          const s = statuses[v.id] ?? "following";
          const stale = s === "stale" || s === "offline";
          return {
            id: v.id,
            letter: v.letter,
            color: v.color,
            lngLat: toLngLat(p),
            screenAngle: -smoothHeading(v.id, heading),
            wedgeClass: WEDGE[v.color],
            ring: stale
              ? "stale"
              : s === "behind"
                ? "caution"
                : s === "offroute" || s === "stopped"
                  ? "alert"
                  : offRoute
                    ? "offroute"
                    : "none",
            isMe: v.isMe,
            simulated: !v.realP,
            vehicleType:
              v.vehicleType ?? members.find((m) => m.userId === v.id)?.vehicleType ?? "car",
            name: v.isMe ? "You" : v.driver,
            staleLabel: stale
              ? `last seen ${Math.round((now - v.lastUpdateReal) / 1000)} s ago`
              : undefined,
            label: `${v.name}, vehicle ${v.letter}, ${s}${v.realP ? "" : ", waiting for location"}`,
          };
        })}
      />

      {/* TOP: Google Maps Navigation Header (Image 2 style) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2.5 p-3 z-30">
        {/* Navigation Turn-by-Turn Card (Emerald Pine Header) */}
        {nextStep && toNextM !== null ? (
          <div
            onClick={() => setItineraryOpen(true)}
            className="pointer-events-auto w-full max-w-md overflow-hidden rounded-[24px] bg-[#0F5132] text-white shadow-float border border-emerald-900/40 cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99]"
            title="Tap to view full route itinerary and turn steps"
          >
            <div className="flex items-center gap-3.5 p-4">
              {/* Turn Maneuver Icon */}
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md shadow-inner">
                <Icon name={maneuverIcon(nextStep)} className="text-[40px] text-white" />
              </span>

              {/* Distance & Turn Name */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <div className="font-mono text-[28px] sm:text-[30px] font-bold tracking-tight leading-none text-white">
                    {formatDistance(toNextM)}
                  </div>
                  {rerouting && (
                    <span className="animate-pulse text-[11px] font-medium text-emerald-200">
                      Rerouting...
                    </span>
                  )}
                </div>
                <div className="truncate text-[17px] font-semibold text-white/95 mt-1 leading-snug">
                  {instruction(nextStep)}
                </div>
              </div>

              {/* Action Stack (Audio, Reroute, Sharing badge) */}
              <div
                className="flex flex-col items-end gap-1.5 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={cycleAudio}
                    aria-label="Toggle voice mode"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 active:scale-95 transition-all cursor-pointer shadow-xs"
                    title={`Voice: ${audioMode}`}
                  >
                    <Icon
                      name={
                        audioMode === "all"
                          ? "volume_up"
                          : audioMode === "alerts"
                            ? "notifications_active"
                            : "volume_off"
                      }
                      className="text-[20px]"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => void triggerReroute("Manual recalculation...")}
                    disabled={rerouting}
                    aria-label="Recalculate route"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                    title="Recalculate route"
                  >
                    <Icon
                      name="alt_route"
                      className={cn("text-[20px]", rerouting && "animate-spin")}
                    />
                  </button>
                </div>

                {/* Micro Sharing Status Tag */}
                <div
                  onClick={geo.togglePause}
                  className="flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-0.5 text-[11px] font-medium text-emerald-100 hover:bg-black/35 transition-colors cursor-pointer"
                  title={
                    geo.isPaused
                      ? "Location sharing paused - Tap to resume"
                      : "Location live - Tap to pause"
                  }
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      geo.isPaused
                        ? "bg-amber-400"
                        : geo.isSharing
                          ? "bg-emerald-400 animate-pulse"
                          : "bg-white/50",
                    )}
                  />
                  <span>{geo.isPaused ? "Paused" : "Live"}</span>
                </div>
              </div>
            </div>

            {/* Next Step Preview Sub-bar */}
            {secondStep && (
              <div className="flex items-center justify-between border-t border-white/15 bg-black/20 px-4 py-2 text-[13px] text-white/90">
                <div className="flex items-center gap-2 truncate">
                  <span className="font-medium text-emerald-200/80">Then:</span>
                  <Icon name={maneuverIcon(secondStep)} className="text-[17px] text-emerald-200" />
                  <span className="truncate font-medium">{instruction(secondStep)}</span>
                </div>
                <span className="text-[11px] text-emerald-200/70 shrink-0 ml-2">Tap for steps</span>
              </div>
            )}
          </div>
        ) : (
          /* Route info when turn guidance is resolving */
          <div className="pointer-events-auto flex w-full max-w-md items-center justify-between rounded-[24px] border border-border/80 bg-card/95 px-4 py-3 shadow-float backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "h-3 w-3 rounded-full animate-pulse",
                  geo.state === "granted" ? "bg-leading" : "bg-caution",
                )}
              />
              <div>
                <div className="font-semibold text-[15px] leading-tight text-foreground truncate max-w-[220px]">
                  {trip.name}
                </div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  {geo.state === "granted" ? "GPS Connected • Live Convoy" : "Connecting GPS..."}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleLanguage}
                className="flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
              >
                <Icon name="translate" className="text-[14px]" />
                <span>{lang.toUpperCase()}</span>
              </button>
            </div>
          </div>
        )}

        {/* Sleek Horizontal Corridor Quick Filter Chips (Glassmorphic) */}
        <div className="pointer-events-auto flex w-full max-w-md gap-2 overflow-x-auto pb-1 text-[13px] font-medium no-scrollbar">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => void findNearby(c.id)}
              aria-pressed={nearbyCat === c.id}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 shadow-sm transition-all cursor-pointer backdrop-blur-md border text-[12px] font-semibold",
                nearbyCat === c.id
                  ? "border-primary bg-primary text-primary-foreground shadow-md scale-105"
                  : "border-border/70 bg-card/90 text-foreground hover:bg-secondary/90 shadow-xs",
              )}
            >
              <Icon name={c.icon} className="text-[16px]" />
              <span>{c.label}</span>
            </button>
          ))}
        </div>

        {/* Real-time Convoy Alerts Banner */}
        {banner && (
          <div
            key={banner.id}
            role="status"
            className={cn(
              "banner-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[16px] border-l-4 bg-card p-3 shadow-float border border-border",
              banner.tone === "alert"
                ? "border-l-alert"
                : banner.tone === "caution"
                  ? "border-l-caution"
                  : "border-l-info",
            )}
          >
            {banner.from ? (
              <VehicleChip letter={banner.from.letter} color={banner.from.color} size={30} />
            ) : (
              <Icon
                name={banner.kind === "sos" ? "emergency" : "campaign"}
                className={
                  banner.kind === "sos" ? "text-alert text-[24px]" : "text-info text-[24px]"
                }
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium leading-snug">{banner.text}</div>
              {banner.acks !== undefined && (
                <div className="text-[12px] text-muted-foreground">
                  {banner.acks} of {othersCount} acknowledged
                </div>
              )}
            </div>
            {banner.ackable && (
              <Button
                variant="secondary"
                size="md"
                className="h-9 px-3 text-[13px]"
                onClick={() => setBanner(null)}
              >
                Got it
              </Button>
            )}
            {banner.kind === "sos" && (
              <Button
                variant="destructive"
                size="md"
                className="h-9 px-3 text-[13px]"
                onClick={() => {
                  setBanner(null);
                  setSos("idle");
                }}
              >
                Close
              </Button>
            )}
          </div>
        )}
      </div>

      {/* LEFT: Google Maps Speedometer & Speed Limit HUD (Skiper UI style) */}
      <div className="pointer-events-none absolute left-3.5 bottom-36 z-20 flex flex-col items-center">
        <div className="pointer-events-auto flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-card/95 p-3 shadow-float backdrop-blur-md transition-transform hover:scale-105">
          <div className="font-mono text-[28px] font-bold tracking-tight text-foreground leading-none">
            {Math.round(
              geo.fix?.speedMs != null && geo.fix.speedMs >= 0
                ? geo.fix.speedMs * 3.6
                : meV.speedKmh,
            )}
          </div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            km/h
          </div>
          {/* Speed Limit Badge */}
          <div className="mt-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-alert bg-card text-[10px] font-bold text-foreground shadow-xs">
            80
          </div>
        </div>
      </div>

      {/* Floating Google Maps Recenter Pill (shown after user pans/drags map) */}
      {isFreeLook && (
        <div className="banner-in pointer-events-auto absolute bottom-36 inset-x-0 z-30 flex justify-center">
          <button
            type="button"
            onClick={handleRecenter}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground shadow-float transition-all hover:scale-105 active:scale-95 ring-2 ring-primary-foreground/20 cursor-pointer"
          >
            <Icon name="navigation" className="text-[18px] text-white" />
            <span>Recenter ({recenterSec}s)</span>
          </button>
        </div>
      )}

      {/* RIGHT: Google Maps Floating Action Cluster */}
      <div className="absolute right-3.5 top-36 z-20 flex flex-col gap-2.5">
        {/* Dynamic Compass: Rotates with bearing; tap to reset north */}
        <button
          type="button"
          aria-label="Compass: Reset North"
          onClick={() => {
            setCamera({ mode: "north" });
            setTimeout(() => setCamera({ mode: "follow" }), 600);
          }}
          className={cn(
            "flex flex-col items-center justify-center rounded-full bg-card shadow-float border border-border/80 transition-transform active:scale-95 cursor-pointer",
            ctl,
          )}
          title={`Orientation: ${Math.round(bearing)}°`}
        >
          <div
            style={{ transform: `rotate(${-bearing}deg)`, transition: "transform 200ms ease-out" }}
            className="flex flex-col items-center justify-center"
          >
            <span className="block h-3 w-1 bg-alert rounded-t-sm" />
            <span className="block h-3 w-1 bg-muted-foreground rounded-b-sm" />
          </div>
          <span className="text-[9px] font-mono font-bold text-muted-foreground -mt-0.5">
            {getCardinalDirection(bearing)}
          </span>
        </button>

        {/* Recenter on Me Crosshair (Google Maps style) */}
        <button
          type="button"
          aria-label="Recenter on my car"
          onClick={() => setCamera({ mode: "follow" })}
          className={cn(
            "flex items-center justify-center rounded-full bg-card shadow-float border border-border/80 active:scale-95 cursor-pointer",
            ctl,
            camera.mode === "follow" && "text-primary ring-2 ring-primary/40",
          )}
          title="Recenter vehicle"
        >
          <Icon name="my_location" className="text-[22px]" />
        </button>

        {/* Fit Entire Convoy Group */}
        <button
          type="button"
          aria-label="Fit whole convoy"
          onClick={() => setCamera({ mode: "fit" })}
          className={cn(
            "flex items-center justify-center rounded-full bg-card shadow-float border border-border/80 active:scale-95 cursor-pointer",
            ctl,
            camera.mode === "fit" && "text-primary ring-2 ring-primary/40",
          )}
          title="Fit entire convoy"
        >
          <Icon name="groups" className="text-[22px]" />
        </button>

        {/* Audio Guidance Mode Toggle */}
        <button
          type="button"
          aria-label="Toggle voice guidance"
          onClick={cycleAudio}
          className={cn(
            "flex items-center justify-center rounded-full bg-card shadow-float border border-border/80 active:scale-95 cursor-pointer",
            ctl,
            audioMode === "mute" && "text-tertiary",
          )}
          title={`Audio: ${audioMode}`}
        >
          <Icon
            name={
              audioMode === "all"
                ? "volume_up"
                : audioMode === "alerts"
                  ? "notifications_active"
                  : "volume_off"
            }
            className="text-[22px]"
          />
        </button>

        {/* Map Layers (Satellite, Dark, Detailed) */}
        <button
          type="button"
          aria-label="Map style layers"
          onClick={() => setStyleOpen(!styleOpen)}
          className={cn(
            "flex items-center justify-center rounded-full bg-card shadow-float border border-border/80 active:scale-95 cursor-pointer",
            ctl,
            styleOpen && "text-primary",
          )}
          title="Layers"
        >
          <Icon name="layers" className="text-[22px]" />
        </button>

        {/* Google Maps Floating Zoom Controls (+ / -) */}
        <div className="flex flex-col rounded-full bg-card shadow-float border border-border/80 overflow-hidden divide-y divide-border/60">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoomAction({ dir: "in", ts: Date.now() })}
            className={cn(
              "flex items-center justify-center text-foreground hover:bg-secondary active:scale-95 transition-all cursor-pointer",
              ctl,
            )}
            title="Zoom in"
          >
            <Icon name="add" className="text-[22px]" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoomAction({ dir: "out", ts: Date.now() })}
            className={cn(
              "flex items-center justify-center text-foreground hover:bg-secondary active:scale-95 transition-all cursor-pointer",
              ctl,
            )}
            title="Zoom out"
          >
            <Icon name="remove" className="text-[22px]" />
          </button>
        </div>

        {/* Emergency SOS Long-press */}
        <button
          type="button"
          aria-label="SOS: Press and hold"
          onPointerDown={sosStart}
          onPointerUp={sosRelease}
          onPointerLeave={sosRelease}
          className={cn(
            "relative mt-1 flex items-center justify-center rounded-full bg-card text-alert shadow-float border border-alert/30 select-none cursor-pointer",
            ctl,
          )}
          title="Hold 1.2s for Convoy SOS"
        >
          <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 48 48">
            <circle
              cx={24}
              cy={24}
              r={21}
              fill="none"
              strokeWidth={3}
              className="stroke-alert sos-fill"
              strokeDasharray={132}
              strokeDashoffset={sos === "holding" ? 0 : 132}
              style={{ transitionDuration: sos === "holding" ? "1200ms" : "1ms" }}
            />
          </svg>
          <span className="font-mono text-[13px] font-bold">SOS</span>
        </button>
      </div>

      {/* Google Maps Floating "Report" Hazard Action Button (bottom right above dock, Image 2 style) */}
      <div className="absolute right-3.5 bottom-28 z-20">
        <button
          type="button"
          aria-label="Report Road Hazard"
          onClick={() => setQuickOpen(true)}
          className="flex items-center gap-2 rounded-full bg-[#1b241e]/90 text-white border border-white/20 px-3.5 py-2 shadow-float hover:scale-105 active:scale-95 transition-all cursor-pointer backdrop-blur-md"
          title="Broadcast road hazard or convoy alert"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
            <Icon name="warning" className="text-[18px]" />
          </span>
          <span className="text-[13px] font-semibold tracking-wide pr-1">Report</span>
        </button>
      </div>

      {/* Map Style Selector Popover */}
      {styleOpen && (
        <div
          className="absolute right-18 top-64 z-40 w-48 rounded-[18px] border border-border bg-card p-2 shadow-float"
          role="menu"
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-tertiary">
            Map Type
          </div>
          {(
            [
              ["default", "Clean (Default)", "map"],
              ["detailed", "Detailed", "terrain"],
              ["dark", "Night Navigation", "dark_mode"],
              ["satellite", "Satellite Aerial", "satellite_alt"],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={mapStyle === id}
              onClick={() => {
                setMapStyle(id);
                setStyleOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[14px] transition-colors cursor-pointer",
                mapStyle === id
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "hover:bg-secondary",
              )}
            >
              <Icon name={icon} className="text-[18px]" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Nearby Places Drawer */}
      {nearbyOpen && (
        <div className="absolute inset-x-0 bottom-0 z-40 mx-auto flex max-h-[70vh] max-w-xl flex-col rounded-t-[26px] border-t border-border bg-card shadow-float">
          <div className="flex items-center justify-between p-4 pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Icon name="explore" className="text-primary" />
              <h2 className="text-[18px] font-semibold">Services Along Route</h2>
            </div>
            <button
              type="button"
              aria-label="Close nearby"
              onClick={() => {
                setNearbyOpen(false);
                setNearby([]);
                setNearbyCat(null);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary cursor-pointer"
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-border">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void findNearby(c.id)}
                aria-pressed={nearbyCat === c.id}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer",
                  nearbyCat === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-secondary hover:bg-secondary/80",
                )}
              >
                <Icon name={c.icon} className="text-[16px]" /> {c.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {nearbyState === "loading" && (
              <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground text-[14px]">
                <Icon name="sync" className="animate-spin text-[20px]" />
                Scanning corridor for {nearbyCat}...
              </div>
            )}
            {nearbyState === "error" && (
              <p className="p-6 text-center text-alert text-[14px]">
                Nearby places busy. Try another category.
              </p>
            )}
            {nearbyState === "idle" && nearbyCat && nearby.length === 0 && (
              <p className="p-6 text-center text-muted-foreground text-[14px]">
                No {nearbyCat} found within 8 km.
              </p>
            )}
            <ul className="divide-y divide-border">
              {nearby.map((p) => (
                <li
                  key={p.id}
                  onClick={() => {
                    setSelectedPlace(p);
                    setCamera({ mode: "route" });
                    setNearbyOpen(false);
                  }}
                  className="flex items-center gap-3 py-3 px-2 hover:bg-secondary/40 rounded-xl transition-colors cursor-pointer"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/10 text-info">
                    <Icon
                      name={CATEGORIES.find((c) => c.id === p.category)!.icon}
                      className="text-[20px]"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[15px]">{p.name}</div>
                    <div className="font-mono text-[13px] text-muted-foreground">
                      {formatDistance(p.distanceM)} away from route
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      className="rounded-full bg-primary/10 text-primary font-medium px-3 py-1 text-[13px] hover:bg-primary/20 active:scale-95"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleAddStop(p);
                        setNearbyOpen(false);
                      }}
                    >
                      Add Stop
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Image 2 Style Google Maps POI Detail Card */}
      {selectedPlace && (
        <div className="banner-in pointer-events-auto absolute bottom-36 inset-x-4 z-40 mx-auto max-w-sm rounded-[22px] border border-border/80 bg-card p-4 shadow-float backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-foreground text-[16px] leading-snug truncate">
                {selectedPlace.name}
              </h3>
              <div className="mt-1 flex items-center gap-1.5 text-[13px]">
                <span className="font-bold text-foreground">4.6</span>
                <div className="flex text-amber-500 text-[13px] tracking-tight">
                  ★★★★<span className="opacity-70">★</span>
                </div>
                <span className="text-muted-foreground text-[12px]">(1,307)</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[13px]">
                <span className="text-muted-foreground">
                  {CATEGORIES.find((c) => c.id === selectedPlace.category)?.label ??
                    "Point of Interest"}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  Open 24 hours
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelectedPlace(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-95"
              aria-label="Close place card"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>

          <div className="mt-3.5 flex items-center justify-between border-t border-border/60 pt-3">
            <div className="text-[12px] text-muted-foreground">
              <span className="font-semibold text-foreground font-mono">
                {formatDistance(selectedPlace.distanceM)}
              </span>{" "}
              detour
            </div>
            <button
              onClick={() => void handleAddStop(selectedPlace)}
              className="inline-flex items-center gap-2 rounded-full bg-[#00897b] px-4 py-2 text-[13px] font-semibold text-white shadow-md transition-transform hover:scale-105 active:scale-95"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
                <Icon name="add" className="text-[14px]" />
              </span>
              Add stop
            </button>
          </div>
        </div>
      )}

      {/* SOS Countdown Overlay */}
      {sos === "countdown" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-[24px] border border-alert bg-card p-6 text-center shadow-float">
            <div className="font-mono text-[56px] font-bold leading-none text-alert">{sosLeft}</div>
            <h3 className="mt-3 text-[20px] font-semibold text-alert">
              Broadcasting Emergency SOS
            </h3>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Your real-time GPS coordinates are being transmitted to every vehicle in this convoy.
            </p>
            <Button
              variant="secondary"
              size="lg"
              className="mt-6 w-full text-[16px]"
              onClick={() => setSos("idle")}
            >
              Cancel SOS
            </Button>
          </div>
        </div>
      )}

      {/* Google Maps Route Plan & Turn-by-Turn Itinerary Modal */}
      {itineraryOpen && guide && (
        <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
          <div className="flex h-[88vh] sm:h-[80vh] w-full max-w-lg flex-col rounded-t-[26px] sm:rounded-[26px] border border-border bg-card shadow-float overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border p-4 bg-secondary/30">
              <div className="flex items-center gap-2.5">
                <Icon name="alt_route" className="text-primary text-[22px]" />
                <div>
                  <h2 className="text-[17px] font-semibold">Route Plan & Steps</h2>
                  <p className="text-[12px] text-muted-foreground font-mono">
                    {formatDistance(guide.distanceM)} • {Math.round(guide.durationS / 60)} min •
                    Fastest road route
                  </p>
                </div>
              </div>
              <button
                onClick={() => setItineraryOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary active:scale-95 text-muted-foreground"
                aria-label="Close route plan"
              >
                <Icon name="close" />
              </button>
            </div>

            {/* Waypoints & Stops Strip */}
            <div className="px-4 py-3 border-b border-border bg-card flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                <span className="truncate text-[13px] font-medium">{trip.origin || "Origin"}</span>
                {waypoints.length > 0 && (
                  <>
                    <Icon
                      name="arrow_forward"
                      className="text-[14px] text-muted-foreground shrink-0"
                    />
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-primary">
                      +{waypoints.length} stop{waypoints.length > 1 ? "s" : ""}
                    </span>
                  </>
                )}
                <Icon name="arrow_forward" className="text-[14px] text-muted-foreground shrink-0" />
                <span className="truncate text-[13px] font-medium">
                  {trip.destination || "Destination"}
                </span>
              </div>
              <button
                onClick={() => {
                  void triggerReroute("Manual recalculation requested...");
                }}
                disabled={rerouting}
                className="shrink-0 flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline active:scale-95"
              >
                <Icon name="sync" className={cn("text-[16px]", rerouting && "animate-spin")} />
                Reroute
              </button>
            </div>

            {/* Turn-by-Turn Steps List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Turn-by-turn guidance
              </div>
              <ul className="space-y-2">
                {guide.steps.map((s, idx) => {
                  const isCurrent = idx === stepIdx;
                  return (
                    <li
                      key={idx}
                      className={cn(
                        "flex items-start gap-3 rounded-xl p-3 border transition-colors",
                        isCurrent
                          ? "border-primary bg-primary/10 text-foreground font-semibold"
                          : "border-border/60 bg-card/60 hover:bg-secondary/40 text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          isCurrent ? "bg-primary text-white" : "bg-secondary text-foreground",
                        )}
                      >
                        <Icon name={maneuverIcon(s)} className="text-[20px]" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] leading-snug">{instruction(s)}</div>
                        <div className="font-mono text-[12px] text-muted-foreground mt-0.5">
                          {formatDistance(s.distanceM)}
                        </div>
                      </div>
                      {isCurrent && (
                        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                          Next
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Bottom Action Footer */}
            <div className="border-t border-border p-3 bg-secondary/20 flex gap-2">
              <Button className="w-full" size="md" onClick={() => setItineraryOpen(false)}>
                Resume Navigation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET: Convoy Rail & Roster Drawer */}
      <section
        className="absolute inset-x-0 bottom-[92px] z-10 mx-auto flex max-w-xl flex-col rounded-t-[26px] border-t border-border bg-card/95 backdrop-blur-md shadow-float"
        style={{
          height: driving || snap === 0 ? undefined : SHEET_H[snap],
          transition: "height 380ms cubic-bezier(0.2, 0.9, 0.3, 1)",
        }}
        aria-label="Convoy details"
      >
        {/* Grab Handle */}
        <button
          type="button"
          className="flex h-6 w-full shrink-0 items-center justify-center cursor-pointer hover:bg-secondary/40 rounded-t-[26px]"
          aria-label={snap === 2 ? "Collapse details" : "Expand details"}
          onClick={() => setSnap((s) => (s + 1) % 3)}
          disabled={driving}
        >
          <span className="h-1.5 w-12 rounded-full bg-border" />
        </button>

        {/* Signature Convoy Rail (Always Visible in Navigation Dock) */}
        <div className="shrink-0 px-4 pb-2">
          <ConvoyRail
            members={vehicles.map((v) => ({
              id: v.id,
              letter: v.letter,
              color: v.color,
              progressM: v.progressM,
              status: statuses[v.id] ?? "following",
              isMe: v.isMe,
              name: v.name,
            }))}
            routeM={routeM}
            thresholdM={thresholdM}
            onFocus={(id) => setCamera({ mode: "focus", id })}
            origin={trip.origin}
            destination={trip.destination}
          />
        </div>

        {/* Expanded Drawer Content (Snap 1 or 2) */}
        {!driving && snap > 0 && (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 space-y-4">
            {/* AI Stop Suggestions from Chat */}
            <StopsPanel
              isHost={isHost}
              suggested={suggested}
              confirmed={confirmed}
              here={here}
              busy={stopState.busy}
              note={stopState.note}
              onFind={() => void findStops()}
              onConfirm={(s) => void confirmStop(s.id, s.name, s.query)}
              onDismiss={(s) => void dismissStopRemote(s.id).catch(() => undefined)}
            />

            {/* Convoy Vehicles Roster */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="overline text-tertiary">Convoy Vehicles ({vehicles.length})</h3>
                <span className="text-[12px] text-muted-foreground">
                  Tap any car to focus camera
                </span>
              </div>
              <ul className="divide-y divide-border rounded-[16px] border border-border bg-card shadow-sm overflow-hidden">
                {sortedMembers.map((v, i) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      className="flex min-h-15 w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary/40 transition-colors cursor-pointer"
                      onClick={() => setCamera({ mode: "focus", id: v.id })}
                    >
                      <VehicleChip
                        letter={v.letter}
                        color={v.color}
                        size={34}
                        ring={v.isMe ? "me" : "none"}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold truncate">
                          {v.name}
                          {v.isMe && (
                            <span className="text-[12px] font-normal text-primary"> (You)</span>
                          )}
                        </div>
                        <div className="text-[13px] text-muted-foreground flex items-center gap-1.5">
                          <span>{v.driver}</span>
                          <span>•</span>
                          <StatusText s={statuses[v.id] ?? "following"} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-[14px] font-semibold text-foreground">
                          {i === 0 ? "Leader" : formatKm(gaps[v.id] ?? 0)}
                        </div>
                        <div className="font-mono text-[12px] text-muted-foreground">
                          {Math.round(v.speedKmh)} km/h
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Full Snap: Settings & Controls */}
            {snap === 2 && (
              <div className="space-y-3 pt-2">
                <h3 className="overline text-tertiary">Trip Details & Rules</h3>
                <div className="rounded-[16px] bg-secondary/80 p-4 text-[14px] space-y-1.5">
                  <div className="font-semibold">
                    {route.name} route ({route.via})
                  </div>
                  <div className="text-muted-foreground">
                    Alert threshold: {trip.thresholdKm} km gap • Alerts by: {trip.alertsBy}
                  </div>
                </div>
                {isHost && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => void endForEveryone()}
                  >
                    End Convoy for Everyone
                  </Button>
                )}
                <Button
                  variant="quiet"
                  className="w-full text-alert"
                  onClick={() => setExitConfirm(true)}
                >
                  Stop Sharing & Leave Convoy
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* BOTTOM: Google Maps Driving Navigation Dock (Image 2 style) */}
      <footer className="absolute inset-x-0 bottom-0 z-20 mx-auto flex h-[88px] max-w-xl items-center justify-between border-t border-border/80 bg-card/95 backdrop-blur-md px-4 shadow-float">
        {/* Left: Google Maps Circular Exit Button */}
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-destructive/15 hover:text-destructive active:scale-95 transition-all cursor-pointer shadow-xs border border-border/60"
          onClick={() => setExitConfirm(true)}
          aria-label="Exit Navigation"
          title="Exit navigation"
        >
          <Icon name="close" className="text-[24px] font-bold" />
        </button>

        {/* Center: Large Google Maps ETA Readout */}
        <div
          className="min-w-0 flex-1 px-4 cursor-pointer text-center"
          onClick={() => setRailOpen((o) => !o)}
          title="Tap to view Convoy Rail and vehicle gaps"
        >
          <div className="flex items-center justify-center gap-2">
            <span className="font-mono text-[24px] sm:text-[26px] font-bold text-leading leading-tight tracking-tight">
              {estHours > 0 ? `${estHours} hr ${estMins} min` : `${estMins} min`}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-2 text-[13px] font-mono text-muted-foreground">
            <span>{remainingKm} km</span>
            <span>•</span>
            <span>{etaTimeStr}</span>
          </div>
        </div>

        {/* Right: Convoy Rail Toggle & Group Chat */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className={cn(
              "relative flex h-12 w-12 items-center justify-center rounded-full transition-all cursor-pointer border shadow-xs",
              railOpen
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-secondary text-foreground border-border/60 hover:bg-secondary/80",
            )}
            onClick={() => setRailOpen((o) => !o)}
            aria-label="Toggle Convoy Rail"
            title="Convoy Rail & Vehicles"
          >
            <Icon name="timeline" className="text-[22px]" />
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-white px-1 text-[10px] font-bold">
              {vehicles.length}
            </span>
          </button>

          <button
            type="button"
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-secondary/80 active:scale-95 transition-all cursor-pointer border border-border/60 shadow-xs"
            onClick={() => {
              setChatOpen(true);
              setUnread(0);
            }}
            aria-label="Open group chat"
            title="Group Chat"
          >
            <Icon name="chat" className="text-[22px]" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-alert px-1 text-[11px] font-bold text-destructive-foreground">
                {unread}
              </span>
            )}
          </button>
        </div>
      </footer>

      {/* Convoy Rail Slide-up Drawer */}
      {railOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/40 backdrop-blur-xs"
          onClick={() => setRailOpen(false)}
        >
          <div
            className="screen-in mx-auto w-full max-w-xl rounded-t-[28px] border-t border-border bg-card p-5 pb-8 shadow-float space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <Icon name="timeline" className="text-primary text-[22px]" />
                <h3 className="text-[17px] font-semibold text-foreground">
                  Convoy Vehicles & Timeline
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRailOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary text-muted-foreground cursor-pointer"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>

            {/* Signature Convoy Rail */}
            <div className="py-2">
              <ConvoyRail
                members={vehicles.map((v) => ({
                  id: v.id,
                  letter: v.letter,
                  color: v.color,
                  progressM: v.progressM,
                  status: statuses[v.id] ?? "following",
                  isMe: v.isMe,
                  name: v.name,
                  vehicleType: v.vehicleType ?? "car",
                }))}
                routeM={routeM}
                thresholdM={thresholdM}
                onFocus={(id) => {
                  setCamera({ mode: "focus", id });
                  setRailOpen(false);
                }}
                origin={trip.origin}
                destination={trip.destination}
              />
            </div>

            {/* Vehicle Roster List */}
            <div className="space-y-2">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                Active Convoy Members ({vehicles.length})
              </div>
              <ul className="divide-y divide-border rounded-[18px] border border-border bg-secondary/30 overflow-hidden">
                {sortedMembers.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-secondary/60 transition-colors cursor-pointer"
                      onClick={() => {
                        setCamera({ mode: "focus", id: v.id });
                        setRailOpen(false);
                      }}
                    >
                      <VehicleChip
                        letter={v.letter}
                        color={v.color}
                        vehicleType={v.vehicleType}
                        size={36}
                        ring={v.isMe ? "me" : "none"}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[14px] text-foreground truncate">
                            {v.name}
                          </span>
                          {v.isMe && (
                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/10 px-1.5 py-0.5 rounded-full">
                              You
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            • {v.vehicleType === "bike" ? "Bike" : "Car"}
                          </span>
                        </div>
                        <div className="text-[12px] text-muted-foreground truncate">
                          {v.driver} • <StatusText s={statuses[v.id] ?? "following"} />
                        </div>
                      </div>
                      <span className="font-mono text-[13px] font-semibold text-foreground shrink-0">
                        {v.speedKmh > 0 ? `${Math.round(v.speedKmh)} km/h` : "Idle"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Quick Alerts Sheet (6-Button Driving Grid) */}
      {quickOpen && (
        <div
          className="absolute inset-0 z-50 flex items-end bg-black/40 backdrop-blur-xs"
          onClick={() => setQuickOpen(false)}
        >
          <div
            className="screen-in mx-auto w-full max-w-xl rounded-t-[26px] bg-card p-5 pb-8 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[18px] font-semibold">Broadcast to Convoy</h2>
                <p className="text-[13px] text-muted-foreground">
                  One-tap driving alerts with instant audio banner for all cars.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-secondary cursor-pointer"
                onClick={() => setQuickOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {QUICK.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => sendQuick(q.label)}
                  className="flex flex-col items-center justify-center gap-2 rounded-[18px] border border-border bg-secondary/70 p-3 text-[14px] font-medium transition-all active:scale-95 hover:border-primary/50 min-h-24 cursor-pointer"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon name={q.icon} className="text-[28px]" />
                  </span>
                  <span>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Group Chat Drawer */}
      {chatOpen && (
        <div
          className="absolute inset-0 z-50 flex items-end bg-black/40 backdrop-blur-xs"
          onClick={() => setChatOpen(false)}
        >
          <div
            className="screen-in mx-auto flex h-[82vh] w-full max-w-xl flex-col rounded-t-[26px] bg-card shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-border">
              <div>
                <h2 className="text-[18px] font-semibold">Convoy Chat</h2>
                <p className="text-[12px] text-muted-foreground">
                  AI automatically suggests stops from your chat conversation.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close chat"
                className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-secondary cursor-pointer"
                onClick={() => setChatOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <ul className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {msgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
                  <Icon name="chat_bubble_outline" className="text-[36px] text-tertiary mb-2" />
                  <p className="text-[14px]">
                    No messages yet. Message the group or propose stops!
                  </p>
                </div>
              ) : (
                msgs.map((m) => {
                  const from = vehicles.find((v) => v.id === m.fromId);
                  const isMine = m.fromId === meV.id;
                  return (
                    <li
                      key={m.clientId}
                      className={cn("flex gap-2.5", isMine && "flex-row-reverse")}
                    >
                      {from && <VehicleChip letter={from.letter} color={from.color} size={28} />}
                      <div
                        className={cn(
                          "max-w-[78%] rounded-[18px] px-3.5 py-2.5 text-[15px]",
                          isMine
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground",
                        )}
                      >
                        {!isMine && (
                          <div className="text-[11px] font-semibold text-muted-foreground mb-0.5">
                            {from?.driver}
                          </div>
                        )}
                        <div className="leading-relaxed">{m.text}</div>
                        {isMine && (
                          <div className="mt-1 text-right text-[10px] opacity-75">{m.state}</div>
                        )}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
            <div className="border-t border-border p-3">
              {driving ? (
                <div className="flex items-center gap-3">
                  <p className="flex-1 text-[13px] text-muted-foreground">
                    Typing is disabled while driving above 10 km/h.
                  </p>
                  <Button size="lg" onClick={readAloud}>
                    <Icon name="record_voice_over" />
                    Read aloud
                  </Button>
                </div>
              ) : (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendChat();
                  }}
                >
                  <input
                    value={draft}
                    maxLength={MAX_CHAT}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Message the convoy..."
                    aria-label="Message"
                    className="h-12 flex-1 rounded-xl bg-secondary px-4 outline-none focus:ring-2 focus:ring-primary text-[15px]"
                  />
                  <Button type="submit" size="icon" aria-label="Send" disabled={!draft.trim()}>
                    <Icon name="send" />
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Exit Navigation Confirmation Dialog */}
      {exitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-[24px] border border-border bg-card p-6 shadow-float text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto mb-3">
              <Icon name="warning" className="text-[28px]" />
            </span>
            <h3 className="text-[18px] font-semibold">Exit Convoy Navigation?</h3>
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              Your live location sharing will cease immediately. Other members will be notified that
              you left the convoy.
            </p>
            <div className="mt-6 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setExitConfirm(false)}>
                Stay in Convoy
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => void leave()}>
                Exit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusText({ s }: { s: MemberStatus }) {
  const map: Record<MemberStatus, [string, string]> = {
    following: ["Following", "text-leading font-semibold"],
    behind: ["Falling Behind", "text-caution font-semibold"],
    stopped: ["Stopped", "text-alert font-semibold"],
    offroute: ["Off Route", "text-alert font-semibold"],
    stale: ["Weak Signal", "text-caution"],
    offline: ["Offline", "text-tertiary"],
    arrived: ["Arrived", "text-leading font-semibold"],
  };
  return <span className={map[s][1]}>{map[s][0]}</span>;
}

type StopItem = ReturnType<typeof useStops>[number];
function StopsPanel(p: {
  isHost: boolean;
  suggested: StopItem[];
  confirmed: StopItem[];
  here: [number, number] | null;
  busy: boolean;
  note: string | null;
  onFind: () => void;
  onConfirm: (s: StopItem) => void;
  onDismiss: (s: StopItem) => void;
}) {
  if (!p.isHost && p.confirmed.length === 0) return null;
  return (
    <section className="space-y-2" aria-label="Convoy Stops">
      <div className="flex items-center justify-between gap-2">
        <h3 className="overline text-tertiary">Convoy Stops</h3>
        {p.isHost && (
          <button
            className="flex min-h-9 items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 text-[13px] font-semibold hover:bg-primary/20 transition-colors"
            onClick={p.onFind}
            disabled={p.busy}
          >
            <Icon name="auto_awesome" className="text-[16px]" />
            {p.busy ? "Analyzing chat..." : "Find stops in chat"}
          </button>
        )}
      </div>
      {p.note && (
        <p
          className="text-[13px] text-muted-foreground rounded-lg bg-secondary p-2.5"
          role="status"
        >
          {p.note}
        </p>
      )}
      {p.isHost &&
        p.suggested.map((s) => (
          <div
            key={s.id}
            className="rounded-[16px] border border-dashed border-primary/50 bg-primary/5 p-3.5 space-y-2"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-primary uppercase tracking-wider">
              <span>AI Suggested Stop</span>
              <span>Host Only</span>
            </div>
            <div className="font-semibold text-[15px]">{s.name}</div>
            {s.reason && <div className="text-[13px] text-muted-foreground">{s.reason}</div>}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1 h-9 text-[13px]" onClick={() => p.onConfirm(s)}>
                Add to Convoy
              </Button>
              <Button
                variant="quiet"
                className="h-9 px-3 text-[13px]"
                onClick={() => p.onDismiss(s)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      {p.confirmed.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-3 rounded-[16px] border border-border bg-secondary/50 p-3"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Icon name="location_on" className="text-[20px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[14px]">{s.name}</div>
            {s.reason && (
              <div className="truncate text-[12px] text-muted-foreground">{s.reason}</div>
            )}
          </div>
          {s.lng !== null && s.lat !== null && (
            <div className="text-right font-mono text-[13px] font-semibold text-muted-foreground">
              {p.here ? formatDistance(haversineM(p.here, [s.lng, s.lat])) : ""}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
