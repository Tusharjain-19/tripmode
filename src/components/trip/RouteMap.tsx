import { lazyRetry } from "@/lib/lazy-retry";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, useSyncExternalStore } from "react";
import { getRoutesVersion, subscribeRoutes, type LngLat } from "@/lib/geo";
import type { VehicleColor } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export type MapVehicle = {
  id: string;
  letter: string;
  color: VehicleColor;
  lngLat: LngLat;
  /** Clockwise screen rotation in degrees, 0 = pointing east. */
  screenAngle: number;
  wedgeClass: string;
  ring: "none" | "caution" | "alert" | "stale" | "offroute";
  isMe: boolean;
  simulated: boolean;
  vehicleType?: "car" | "bike" | undefined;
  name?: string | undefined;
  staleLabel?: string | undefined;
  label: string;
};

export type MapCamera =
  | { mode: "route" }
  | { mode: "follow" }
  | { mode: "fit" }
  | { mode: "focus"; id: string }
  | { mode: "north" };

export type MapStyleId = "default" | "detailed" | "dark" | "satellite";
export type MapPlace = { id: string; name: string; icon: string; lngLat: LngLat };

export type RouteMapProps = {
  mapStyle?: MapStyleId;
  places?: MapPlace[];
  selectedPlaceId?: string | null;
  onPlaceClick?: (id: string) => void;
  selected: number;
  showAlternates?: boolean;
  travelledM?: number;
  activeRouteCoords?: LngLat[];
  nextManeuverLngLat?: LngLat | null;
  destinationLngLat?: LngLat | null;
  vehicles?: MapVehicle[];
  camera?: MapCamera;
  onVehicleClick?: (id: string) => void;
  onBearingChange?: (bearing: number) => void;
  onUserPan?: () => void;
  interactive?: boolean;
  className?: string;
};

const Inner = lazyRetry(() => import("./RouteMapInner"), "route-map");

/** Real map (OpenStreetMap data via OpenFreeMap) with road routes. Browser-only. */
export function RouteMap(props: RouteMapProps) {
  const v = useSyncExternalStore(subscribeRoutes, getRoutesVersion, getRoutesVersion);
  const fallback = (
    <div className={cn(props.className, "relative flex items-center justify-center bg-map-land overflow-hidden")} aria-label="Loading map">
      <div className="absolute inset-0 bg-[radial-gradient(#1b5a47_1px,transparent_1px)] [background-size:20px_20px] opacity-10" />
      <div className="flex items-center gap-2 rounded-full border border-border/80 bg-card/85 px-3 py-1.5 shadow-sm backdrop-blur-xs text-[12px] text-muted-foreground animate-pulse">
        <span className="h-2 w-2 rounded-full bg-primary" />
        <span>Loading map...</span>
      </div>
    </div>
  );
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <Inner key={v} {...props} />
      </Suspense>
    </ClientOnly>
  );
}
