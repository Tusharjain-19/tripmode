import { useSyncExternalStore } from "react";

export const VEHICLE_COLORS = ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8"] as const;
export type VehicleColor = (typeof VEHICLE_COLORS)[number];
/** Text color on each vehicle color that passes AA. */
export const ON_VEHICLE: Record<VehicleColor, "dark" | "light"> = {
  v1: "dark", v2: "dark", v3: "dark", v4: "dark", v5: "light", v6: "dark", v7: "light", v8: "light",
};
export type Role = "driver" | "passenger";

export type TripConfig = {
  /** Server id once the trip exists in the backend. */
  id?: string;
  hostId?: string;
  name: string;
  origin: string;
  destination: string;
  routeIndex: number;
  thresholdKm: 2 | 3 | 5;
  alertsBy: "everyone" | "host";
  autoEnd: boolean;
  approval: boolean;
  inviteCode: string;
  inviteRevoked: boolean;
};

export type Me = {
  displayName: string;
  vehicleLabel: string;
  color: VehicleColor;
  role: Role;
  vehicleType: "car" | "bike";
  consentAt: number | null;
  ready: boolean;
};

export type TripSummary = {
  distanceKm: number;
  durationMin: number;
  longestGapKm: number;
  arrivals: { name: string; color: VehicleColor; minutes: number | null }[];
  stops: number;
};

type State = { trip: TripConfig | null; me: Me; summary: TripSummary | null };

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

let state: State = {
  trip: null,
  me: { displayName: "", vehicleLabel: "", color: "v1", role: "driver", vehicleType: "car", consentAt: null, ready: false },
  summary: null,
};
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

export const tripStore = {
  get: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  createTrip(t: Omit<TripConfig, "inviteCode" | "inviteRevoked">): TripConfig {
    const trip = { ...t, inviteCode: randomCode(), inviteRevoked: false };
    set({ trip, summary: null });
    return trip;
  },
  setTrip(trip: TripConfig | null) {
    set({ trip });
  },
  updateTrip(p: Partial<TripConfig>) {
    if (state.trip) set({ trip: { ...state.trip, ...p } });
  },
  regenerateInvite() {
    if (state.trip) set({ trip: { ...state.trip, inviteCode: randomCode(), inviteRevoked: false } });
  },
  updateMe(p: Partial<Me>) {
    set({ me: { ...state.me, ...p } });
  },
  /** Revoke sharing consent and leave. */
  leave() {
    set({ me: { ...state.me, consentAt: null, ready: false } });
  },
  finish(summary: TripSummary) {
    set({ summary, me: { ...state.me, consentAt: null, ready: false } });
  },
  deleteData() {
    set({ trip: null, summary: null });
  },
};

export function useTrip<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(tripStore.subscribe, () => sel(tripStore.get()), () => sel(tripStore.get()));
}
