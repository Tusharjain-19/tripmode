// Backend sync for trips: create/join/load, live members, live positions and messages.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { fetchRoutes, setRoutes, type RawRoute } from "./geo";
import { tripStore, type Me, type TripConfig, type VehicleColor } from "./trip-store";

export type Member = {
  userId: string;
  letter: string;
  displayName: string;
  vehicleLabel: string;
  vehicleType: "car" | "bike";
  color: VehicleColor;
  role: "driver" | "passenger";
  ready: boolean;
  approved: boolean;
};
export type TripStop = {
  id: string;
  name: string;
  reason: string;
  query: string;
  lng: number | null;
  lat: number | null;
  status: "suggested" | "confirmed" | "dismissed";
  at: number;
};
export type Position = {
  userId: string;
  lng: number;
  lat: number;
  speedMs: number | null;
  heading: number | null;
  at: number;
};
export type TripMessage = {
  id: string;
  userId: string;
  kind: "chat" | "quick" | "sos";
  body: string;
  at: number;
};

const ACTIVE_KEY = "tripmode.activeTrip";
export const rememberTrip = (id: string | null) => {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
};
export const rememberedTrip = () =>
  typeof window === "undefined" ? null : localStorage.getItem(ACTIVE_KEY);

const toMember = (r: {
  user_id: string;
  letter: string;
  display_name: string;
  vehicle_label: string;
  vehicle_type: string;
  color: string;
  role: string;
  ready: boolean;
  approved: boolean;
}): Member => ({
  userId: r.user_id,
  letter: r.letter,
  displayName: r.display_name,
  vehicleLabel: r.vehicle_label,
  vehicleType: r.vehicle_type === "bike" ? "bike" : "car",
  color: r.color as VehicleColor,
  role: r.role === "passenger" ? "passenger" : "driver",
  ready: r.ready,
  approved: r.approved,
});

/** Create the trip in the backend. The host joins it like everyone else (join_trip) after consenting. */
export async function createTripRemote(trip: TripConfig, routes: RawRoute[], userId: string) {
  const { data, error } = await supabase
    .from("trips")
    .insert({
      host_id: userId,
      invite_code: trip.inviteCode,
      name: trip.name,
      origin: trip.origin,
      destination: trip.destination,
      routes: routes as never,
      route_index: trip.routeIndex,
      threshold_km: trip.thresholdKm,
      alerts_by: trip.alertsBy,
      auto_end: trip.autoEnd,
      require_approval: trip.approval,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tripStore.setTrip({ ...trip, id: data.id, hostId: userId });
  rememberTrip(data.id);
  return data.id;
}

const INVITE_CODE_REGEX = /^[A-Za-z0-9_-]{4,32}$/;

export async function joinTripRemote(code: string, me: Me) {
  const clean = code.trim();
  if (!INVITE_CODE_REGEX.test(clean)) {
    throw new Error("Invalid invite code format.");
  }
  const displayName = (me.displayName || "Driver").trim().slice(0, 40) || "Driver";
  const vehicleLabel = (me.vehicleLabel || "My car").trim().slice(0, 40) || "My car";

  const { data, error } = await supabase.rpc("join_trip", {
    _code: clean,
    _display_name: displayName,
    _vehicle_label: vehicleLabel,
    _vehicle_type: me.vehicleType === "bike" ? "bike" : "car",
    _color: me.color,
    _role: me.role === "passenger" ? "passenger" : "driver",
  });
  if (error) throw new Error(error.message);
  await loadTrip(data);
  rememberTrip(data);
  return data;
}

/** Load a trip the user belongs to into the local store, including its routes. */
export async function loadTrip(id: string) {
  const { data, error } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  if (error || !data) {
    rememberTrip(null);
    return null;
  }
  const rawRoutes = (data.routes as unknown as RawRoute[]) || [];
  setRoutes(rawRoutes);

  // If routes only have straight-line fallback (<= 2 coords), enrich with real highway geometry in background
  if (
    rawRoutes.length > 0 &&
    rawRoutes[0]?.coords &&
    rawRoutes[0].coords.length <= 2 &&
    rawRoutes[0].coords[0] &&
    rawRoutes[0].coords[1]
  ) {
    const from = rawRoutes[0].coords[0] as [number, number];
    const to = rawRoutes[0].coords[rawRoutes[0].coords.length - 1] as [number, number];
    void fetchRoutes(from, to).then((enriched) => {
      if (enriched.length > 0 && enriched[0]!.coords.length > 2) {
        setRoutes(enriched);
        void supabase.from("trips").update({ routes: enriched as never }).eq("id", id);
      }
    });
  }
  const trip: TripConfig = {
    id: data.id,
    hostId: data.host_id,
    name: data.name,
    origin: data.origin,
    destination: data.destination,
    routeIndex: data.route_index,
    thresholdKm: (data.threshold_km as 2 | 3 | 5) ?? 3,
    alertsBy: data.alerts_by === "host" ? "host" : "everyone",
    autoEnd: data.auto_end,
    approval: data.require_approval,
    inviteCode: data.invite_code,
    inviteRevoked: data.invite_revoked,
  };
  tripStore.setTrip(trip);
  return trip;
}

export async function updateTripRemote(
  id: string,
  p: { invite_code?: string; invite_revoked?: boolean; status?: string },
) {
  await supabase.from("trips").update(p).eq("id", id);
}

export async function updateMemberRemote(
  tripId: string,
  userId: string,
  p: {
    ready?: boolean;
    vehicle_type?: "car" | "bike";
    vehicle_label?: string;
    display_name?: string;
    color?: VehicleColor;
    role?: "driver" | "passenger";
  },
) {
  const updates: Database["public"]["Tables"]["trip_members"]["Update"] = {};
  if (typeof p.ready === "boolean") updates.ready = p.ready;
  if (p.vehicle_type) updates.vehicle_type = p.vehicle_type;
  if (p.vehicle_label !== undefined) updates.vehicle_label = p.vehicle_label;
  if (p.display_name !== undefined) updates.display_name = p.display_name;
  if (p.color !== undefined) updates.color = p.color;
  if (p.role !== undefined) updates.role = p.role;
  if (Object.keys(updates).length === 0) return;
  await supabase.from("trip_members").update(updates).eq("trip_id", tripId).eq("user_id", userId);
}

export async function setMemberApproval(tripId: string, userId: string, approved: boolean) {
  const { error } = await supabase
    .from("trip_members")
    .update({ approved })
    .eq("trip_id", tripId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function removeMemberRemote(tripId: string, userId: string) {
  const { error } = await supabase
    .from("trip_members")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Host ends the trip: the backend drops every shared position and blocks new ones. */
export async function endTripRemote(tripId: string) {
  const { error } = await supabase.from("trips").update({ status: "ended" }).eq("id", tripId);
  if (error) throw new Error(error.message);
}

/** Live trip status ("lobby", "live", "ended"). */
export function useTripStatus(tripId: string | undefined) {
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!tripId) return;
    supabase
      .from("trips")
      .select("status")
      .eq("id", tripId)
      .maybeSingle()
      .then(({ data }) => data && setStatus(data.status));
    const ch = supabase
      .channel(`trip-${tripId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${tripId}` },
        (p) => setStatus((p.new as { status: string }).status),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [tripId]);
  return status;
}

/** Stops: the host sees suggestions and confirmed stops; members see confirmed only (enforced by RLS). */
export function useStops(tripId: string | undefined) {
  const [stops, setStops] = useState<TripStop[]>([]);
  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("trip_stops")
        .select("*")
        .eq("trip_id", tripId)
        .neq("status", "dismissed")
        .order("created_at");
      if (alive && data)
        setStops(
          data.map((r) => ({
            id: r.id,
            name: r.name,
            reason: r.reason,
            query: r.query,
            lng: r.lng,
            lat: r.lat,
            status: r.status as TripStop["status"],
            at: new Date(r.created_at).getTime(),
          })),
        );
    };
    void load();
    const ch = supabase
      .channel(`stops-${tripId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_stops", filter: `trip_id=eq.${tripId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [tripId]);
  return stops;
}

export async function createStopRemote(
  tripId: string,
  name: string,
  lngLat: [number, number] | null,
) {
  const { error } = await supabase.from("trip_stops").insert({
    trip_id: tripId,
    name,
    query: name,
    lng: lngLat?.[0] ?? null,
    lat: lngLat?.[1] ?? null,
    status: "confirmed",
  });
  if (error) throw new Error(error.message);
}

export async function confirmStopRemote(stopId: string, lngLat: [number, number] | null) {
  const { error } = await supabase
    .from("trip_stops")
    .update({ status: "confirmed", lng: lngLat?.[0] ?? null, lat: lngLat?.[1] ?? null })
    .eq("id", stopId);
  if (error) throw new Error(error.message);
}

export async function dismissStopRemote(stopId: string) {
  const { error } = await supabase
    .from("trip_stops")
    .update({ status: "dismissed" })
    .eq("id", stopId);
  if (error) throw new Error(error.message);
}

export async function leaveTripRemote(tripId: string, userId: string) {
  await supabase.from("trip_positions").delete().eq("trip_id", tripId).eq("user_id", userId);
  await supabase.from("trip_members").delete().eq("trip_id", tripId).eq("user_id", userId);
  rememberTrip(null);
}

export async function invitePreview(code: string) {
  const clean = code.trim();
  if (!INVITE_CODE_REGEX.test(clean)) {
    throw new Error("Invalid invite code format.");
  }
  const { data, error } = await supabase.rpc("trip_invite_preview", { _code: clean });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

/** Restore the remembered trip after reload. */
export function useRestoreTrip(enabled: boolean) {
  useEffect(() => {
    if (!enabled || tripStore.get().trip?.id) return;
    const id = rememberedTrip();
    if (id) void loadTrip(id);
  }, [enabled]);
}

/** Live member list. */
export function useMembers(tripId: string | undefined) {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("trip_members")
        .select("*")
        .eq("trip_id", tripId)
        .order("letter");
      if (alive && data) setMembers(data.map(toMember));
    };
    void load();
    const ch = supabase
      .channel(`members-${tripId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${tripId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [tripId]);
  return members;
}

/** Live positions of every member, keyed by user id. */
export function usePositions(tripId: string | undefined) {
  const [positions, setPositions] = useState<Record<string, Position>>({});
  useEffect(() => {
    if (!tripId) return;
    type Row = {
      user_id: string;
      lng: number;
      lat: number;
      speed_ms: number | null;
      heading: number | null;
      updated_at: string;
    };
    const put = (r: Row) =>
      setPositions((p) => ({
        ...p,
        [r.user_id]: {
          userId: r.user_id,
          lng: r.lng,
          lat: r.lat,
          speedMs: r.speed_ms,
          heading: r.heading,
          at: new Date(r.updated_at).getTime(),
        },
      }));
    supabase
      .from("trip_positions")
      .select("*")
      .eq("trip_id", tripId)
      .then(({ data }) => data?.forEach(put));
    const ch = supabase
      .channel(`positions-${tripId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_positions", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<Row>;
            if (old.user_id)
              setPositions((p) =>
                Object.fromEntries(Object.entries(p).filter(([k]) => k !== old.user_id)),
              );
          } else put(payload.new as Row);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [tripId]);
  return positions;
}

const MAX_SPEED_MS = 69.44; // 250 km/h threshold (security.md §8)

function haversineApproxM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.cos(((lat1 + lat2) * Math.PI) / 360);
  return Math.hypot(dLng * a, dLat) * R;
}

/** Publish own position, at most every `everyMs` with plausibility & teleportation checks. */
export function usePublishPosition(
  tripId: string | undefined,
  userId: string | undefined,
  fix: {
    lng: number;
    lat: number;
    speedMs: number | null;
    heading: number | null;
    accuracyM: number;
  } | null,
  everyMs = 3000,
) {
  const lastTime = useRef(0);
  const prevFix = useRef<{ lng: number; lat: number; at: number } | null>(null);

  useEffect(() => {
    if (!tripId || !userId || !fix) return;

    // Coordinate plausibility bounds check
    if (
      !Number.isFinite(fix.lat) ||
      !Number.isFinite(fix.lng) ||
      fix.lat < -90 ||
      fix.lat > 90 ||
      fix.lng < -180 ||
      fix.lng > 180
    ) {
      return;
    }

    // Reported speed check: reject > 250 km/h (security.md §8)
    if (
      fix.speedMs !== null &&
      (fix.speedMs > MAX_SPEED_MS || fix.speedMs < 0 || !Number.isFinite(fix.speedMs))
    ) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastTime.current;
    if (elapsed < Math.max(1000, everyMs)) return;

    // Teleportation / jump plausibility check (security.md §2, §8)
    if (prevFix.current) {
      const deltaSec = (now - prevFix.current.at) / 1000;
      if (deltaSec > 0 && deltaSec < 60) {
        const dist = haversineApproxM(prevFix.current.lat, prevFix.current.lng, fix.lat, fix.lng);
        const apparentSpeedMs = dist / deltaSec;
        if (apparentSpeedMs > MAX_SPEED_MS) {
          // Implausible jump: drop update to protect convoy integrity
          return;
        }
      }
    }

    lastTime.current = now;
    prevFix.current = { lat: fix.lat, lng: fix.lng, at: now };

    void supabase.from("trip_positions").upsert({
      trip_id: tripId,
      user_id: userId,
      lng: fix.lng,
      lat: fix.lat,
      speed_ms: fix.speedMs,
      heading: fix.heading,
      accuracy_m: fix.accuracyM,
      updated_at: new Date().toISOString(),
    });
  }, [tripId, userId, fix, everyMs]);
}

export function useMessages(tripId: string | undefined, onNew?: (m: TripMessage) => void) {
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const cb = useRef(onNew);
  cb.current = onNew;
  useEffect(() => {
    if (!tripId) return;
    type Row = { id: string; user_id: string; kind: string; body: string; created_at: string };
    const map = (r: Row): TripMessage => ({
      id: r.id,
      userId: r.user_id,
      kind: r.kind as TripMessage["kind"],
      body: r.body,
      at: new Date(r.created_at).getTime(),
    });
    supabase
      .from("trip_messages")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => data && setMessages(data.map(map)));
    const ch = supabase
      .channel(`messages-${tripId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trip_messages",
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          const m = map(payload.new as Row);
          setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m]));
          cb.current?.(m);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [tripId]);
  return messages;
}

// Rate limit buffers (security.md §8: chat 10/10s, quick alerts 1/5s)
const chatRateLimitBuffer: number[] = [];
let lastQuickAlertTime = 0;

export async function sendMessage(
  tripId: string,
  userId: string,
  kind: TripMessage["kind"],
  rawBody: string,
) {
  const now = Date.now();

  // Strip control chars and cap at 500 characters

  const cleanBody = rawBody
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 500);
  if (!cleanBody) return;

  if (kind === "quick") {
    if (now - lastQuickAlertTime < 5000) {
      throw new Error("Quick alert rate limit: please wait 5 seconds.");
    }
    lastQuickAlertTime = now;
  } else if (kind === "chat") {
    while (chatRateLimitBuffer.length > 0 && now - chatRateLimitBuffer[0]! > 10000) {
      chatRateLimitBuffer.shift();
    }
    if (chatRateLimitBuffer.length >= 10) {
      throw new Error("Chat message rate limit: please slow down.");
    }
    chatRateLimitBuffer.push(now);
  }

  const { error } = await supabase.from("trip_messages").insert({
    trip_id: tripId,
    user_id: userId,
    kind,
    body: cleanBody,
  });
  if (error) throw new Error(error.message);
}
