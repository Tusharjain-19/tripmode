import * as maplibregl from "maplibre-gl";
import { setWorkerUrl, type GeoJSONSource, type Map as MLMap, type Marker } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { pointAt, segmentLengths } from "@/lib/convoy";
import { ROUTES, toLngLat, type LngLat } from "@/lib/geo";
import type { RouteMapProps } from "./RouteMap";
import { vehicleBg } from "./ui";

setWorkerUrl(workerUrl);

import type { StyleSpecification } from "maplibre-gl";
import type { MapStyleId } from "./RouteMap";

const SATELLITE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    sat: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "sat", type: "raster", source: "sat" }],
};
const STYLES: Record<MapStyleId, string | StyleSpecification> = {
  default: "https://tiles.openfreemap.org/styles/positron",
  detailed: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
  satellite: SATELLITE,
};
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function travelledCoords(routeIdx: number, travelledM: number): LngLat[] {
  const r = ROUTES[routeIdx] ?? ROUTES[0]!;
  const segs = segmentLengths(r.line);
  const out: LngLat[] = [r.coords[0]!];
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i]! >= travelledM) break;
    acc += segs[i]!;
    out.push(r.coords[i + 1]!);
  }
  out.push(toLngLat(pointAt(r.line, travelledM).p));
  return out;
}

const line = (coords: LngLat[]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: coords },
});

const RING: Record<string, string> = {
  none: "",
  caution: "outline-2 outline-dashed outline-offset-2 outline-caution",
  alert: "outline-2 outline-solid outline-offset-2 outline-alert",
  stale: "outline-2 outline-dashed outline-offset-2 outline-tertiary grayscale opacity-60",
  offroute: "outline-2 outline-dashed outline-offset-2 outline-caution ring-2 ring-caution/30",
};

export default function RouteMapInner({
  selected,
  showAlternates = true,
  travelledM,
  activeRouteCoords,
  nextManeuverLngLat,
  destinationLngLat,
  selectedPlaceId,
  vehicles = [],
  camera = { mode: "route" },
  onVehicleClick,
  onBearingChange,
  interactive = true,
  className,
  mapStyle = "default",
  places = [],
  onPlaceClick,
  onUserPan,
  zoomAction,
}: RouteMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const pending = useRef<(() => void)[]>([]);
  const whenReady = (fn: () => void) => (ready.current ? fn() : pending.current.push(fn));
  const markers = useRef<Map<string, { m: Marker; from: LngLat; to: LngLat; start: number }>>(
    new Map(),
  );
  const turnMarker = useRef<Marker | null>(null);
  const clickRef = useRef(onVehicleClick);
  clickRef.current = onVehicleClick;
  const bearingRef = useRef(onBearingChange);
  bearingRef.current = onBearingChange;
  const userPanRef = useRef(onUserPan);
  userPanRef.current = onUserPan;
  const raf = useRef(0);
  const applyRoute = useRef<() => void>(() => undefined);
  const placeClick = useRef(onPlaceClick);
  placeClick.current = onPlaceClick;
  const placeMarkers = useRef<Marker[]>([]);

  // Create map once
  useEffect(() => {
    if (!el.current) return;
    const r = ROUTES[selected] ?? ROUTES[0]!;
    const initialCoords =
      activeRouteCoords && activeRouteCoords.length > 1 ? activeRouteCoords : r.coords;
    const b = new maplibregl.LngLatBounds(initialCoords[0], initialCoords[0]);
    initialCoords.forEach((c) => b.extend(c));

    const m = new maplibregl.Map({
      container: el.current,
      style: STYLES[mapStyle],
      bounds: b,
      fitBoundsOptions: { padding: 40 },
      interactive,
      attributionControl: { compact: true },
    });
    map.current = m;

    m.on("rotate", () => {
      bearingRef.current?.(m.getBearing());
    });

    m.on("dragstart", () => {
      userPanRef.current?.();
    });

    const setupLayers = () => {
      const primary = cssVar("--primary") || "#1b5a47";
      const casing = cssVar("--background") || "#ffffff";
      const alt = cssVar("--tertiary") || "#7b867f";
      const land = cssVar("--map-land") || "#ebe8df";
      const navBlue = "#1a73e8"; // Google Maps navigation blue standard

      if (!m.getSource("alts"))
        m.addSource("alts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      if (!m.getSource("route")) m.addSource("route", { type: "geojson", data: line([]) });
      if (!m.getSource("travelled")) m.addSource("travelled", { type: "geojson", data: line([]) });

      const lineLayout = { "line-cap": "round" as const, "line-join": "round" as const };

      if (!m.getLayer("alts")) {
        m.addLayer({
          id: "alts",
          type: "line",
          source: "alts",
          layout: lineLayout,
          paint: { "line-color": alt, "line-width": 5, "line-opacity": 0.7 },
        });
      }
      if (!m.getLayer("route-casing")) {
        m.addLayer({
          id: "route-casing",
          type: "line",
          source: "route",
          layout: lineLayout,
          paint: { "line-color": casing, "line-width": 11, "line-opacity": 0.95 },
        });
      }
      if (!m.getLayer("route")) {
        m.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: lineLayout,
          paint: {
            "line-color": activeRouteCoords && activeRouteCoords.length > 1 ? navBlue : primary,
            "line-width": 8,
          },
        });
      }
      if (!m.getLayer("travelled")) {
        m.addLayer({
          id: "travelled",
          type: "line",
          source: "travelled",
          layout: lineLayout,
          paint: { "line-color": land, "line-width": 8, "line-opacity": 0.5 },
        });
      }

      ready.current = true;
      pending.current.splice(0).forEach((fn) => fn());
      applyRoute.current();
    };

    m.on("style.load", setupLayers);

    const currentMarkers = markers.current;
    const currentPlaces = placeMarkers.current;

    return () => {
      cancelAnimationFrame(raf.current);
      currentMarkers.forEach((x) => x.m.remove());
      currentMarkers.clear();
      currentPlaces.forEach((p) => p.remove());
      placeMarkers.current = [];
      turnMarker.current?.remove();
      turnMarker.current = null;
      ready.current = false;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // Route lines
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const r = ROUTES[selected] ?? ROUTES[0]!;
      const mainCoords =
        activeRouteCoords && activeRouteCoords.length > 1 ? activeRouteCoords : r.coords;

      (m.getSource("route") as GeoJSONSource | undefined)?.setData(line(mainCoords));

      // Update line color if using live guidance
      if (m.getLayer("route")) {
        const navBlue = "#1a73e8";
        const primary = cssVar("--primary") || "#1b5a47";
        m.setPaintProperty(
          "route",
          "line-color",
          activeRouteCoords && activeRouteCoords.length > 1 ? navBlue : primary,
        );
      }

      (m.getSource("alts") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features:
          showAlternates && (!activeRouteCoords || activeRouteCoords.length < 2)
            ? ROUTES.filter((_, i) => i !== selected).map((x) => line(x.coords))
            : [],
      });

      const travCoords =
        travelledM && (!activeRouteCoords || activeRouteCoords.length < 2)
          ? travelledCoords(selected, travelledM)
          : [];
      (m.getSource("travelled") as GeoJSONSource | undefined)?.setData(line(travCoords));
    };
    applyRoute.current = apply;
    whenReady(apply);
  }, [selected, showAlternates, travelledM, activeRouteCoords]);

  // Turn Maneuver Marker Highlight
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    whenReady(() => {
      // Next maneuver point highlight
      if (nextManeuverLngLat) {
        if (!turnMarker.current) {
          const el = document.createElement("div");
          el.className = "relative flex h-7 w-7 items-center justify-center";
          el.innerHTML = `
            <span class="absolute inset-0 rounded-full bg-[#1a73e8]/30 animate-ping"></span>
            <span class="relative flex h-6 w-6 items-center justify-center rounded-full bg-[#1a73e8] text-white shadow-md ring-2 ring-white">
              <span class="ms text-[14px]">turn_slight_right</span>
            </span>
          `;
          turnMarker.current = new maplibregl.Marker({ element: el })
            .setLngLat(nextManeuverLngLat)
            .addTo(m);
        } else {
          turnMarker.current.setLngLat(nextManeuverLngLat);
        }
      } else if (turnMarker.current) {
        turnMarker.current.remove();
        turnMarker.current = null;
      }
    });
  }, [nextManeuverLngLat]);

  // Map style switch
  const firstStyle = useRef(true);
  useEffect(() => {
    if (firstStyle.current) {
      firstStyle.current = false;
      return;
    }
    map.current?.setStyle(STYLES[mapStyle]);
  }, [mapStyle]);

  // Handle external zoom controls (Google Maps + / - buttons)
  useEffect(() => {
    if (!zoomAction) return;
    const m = map.current;
    if (!m) return;
    if (zoomAction.dir === "in") {
      m.zoomIn({ duration: 300 });
    } else {
      m.zoomOut({ duration: 300 });
    }
  }, [zoomAction]);

  // Nearby place pins
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    placeMarkers.current.forEach((p) => p.remove());
    placeMarkers.current = places.map((p) => {
      const isSel = selectedPlaceId === p.id;
      const node = document.createElement("button");
      node.className = `flex ${isSel ? "h-10 w-10 bg-[#00897b] ring-4 ring-[#00897b]/40 scale-110 z-20" : "h-8 w-8 bg-info"} items-center justify-center rounded-full border-2 border-card text-primary-foreground shadow-float transition-transform active:scale-95`;
      node.setAttribute("aria-label", p.name);
      node.innerHTML = `<span class="ms text-[18px]">${esc(p.icon)}</span>`;
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        placeClick.current?.(p.id);
      });
      return new maplibregl.Marker({ element: node }).setLngLat(p.lngLat).addTo(m);
    });
    if (places.length && !selectedPlaceId) {
      const b = new maplibregl.LngLatBounds(places[0]!.lngLat, places[0]!.lngLat);
      places.forEach((p) => b.extend(p.lngLat));
      m.fitBounds(b, {
        padding: { top: 160, bottom: 320, left: 50, right: 90 },
        maxZoom: 14,
        duration: 700,
      });
    }
  }, [places, selectedPlaceId]);

  // Vehicle markers: create, restyle, and interpolate positions over 1000 ms
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const now = performance.now();
    const seen = new Set<string>();
    for (const v of vehicles) {
      seen.add(v.id);
      let entry = markers.current.get(v.id);
      if (!entry) {
        const node = document.createElement("button");
        node.addEventListener("click", () => clickRef.current?.(v.id));
        const mk = new maplibregl.Marker({ element: node }).setLngLat(v.lngLat).addTo(m);
        entry = { m: mk, from: v.lngLat, to: v.lngLat, start: now };
        markers.current.set(v.id, entry);
      } else {
        const cur = entry.m.getLngLat();
        entry.from = [cur.lng, cur.lat];
        entry.to = v.lngLat;
        entry.start = now;
      }
      const node = entry.m.getElement();
      node.setAttribute("aria-label", v.label);
      node.className = "relative flex flex-col items-center group cursor-pointer";
      const isBike = v.vehicleType === "bike";
      const vehicleIcon = isBike ? "two_wheeler" : "directions_car";
      node.innerHTML = `
        ${v.isMe ? `<span class="absolute -inset-3 rounded-full bg-primary/25 animate-ping pointer-events-none"></span>` : ""}
        <span class="relative flex h-10 w-10 items-center justify-center rounded-[12px] text-[18px] font-semibold ${vehicleBg(v.color)} ${v.isMe ? "ring-2 ring-primary ring-offset-2 ring-offset-card shadow-float" : (RING[v.ring] ?? "shadow-md")} transition-transform duration-150">
          <span class="ms text-[22px] leading-none">${vehicleIcon}</span>
          <span class="absolute left-1/2 top-1/2 h-0 w-0 pointer-events-none" style="transform: rotate(${v.screenAngle}deg)">
            <span class="absolute block h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent ${v.wedgeClass}" style="left:21px; top:-6px"></span>
          </span>
        </span>
        ${v.name ? `<span class="mt-1 max-w-28 truncate whitespace-nowrap rounded-md bg-card/95 backdrop-blur-xs px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-float border border-border/70">${esc(v.name)}</span>` : ""}
        ${v.simulated ? `<span class="mt-0.5 rounded-[4px] bg-secondary px-1 text-[9px] font-medium uppercase tracking-[0.06em] text-muted-foreground shadow-xs">Convoy</span>` : ""}
        ${v.staleLabel ? `<span class="mt-0.5 whitespace-nowrap rounded-[4px] bg-card px-1.5 text-[10px] text-muted-foreground">${v.staleLabel}</span>` : ""}`;
    }
    markers.current.forEach((entry, id) => {
      if (!seen.has(id)) {
        entry.m.remove();
        markers.current.delete(id);
      }
    });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cancelAnimationFrame(raf.current);
    const tick = () => {
      const t = performance.now();
      let active = false;
      markers.current.forEach((e) => {
        const k = reduce ? 1 : Math.min(1, (t - e.start) / 1000);
        if (k < 1) active = true;
        e.m.setLngLat([
          e.from[0] + (e.to[0] - e.from[0]) * k,
          e.from[1] + (e.to[1] - e.from[1]) * k,
        ]);
      });
      if (active) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [vehicles]);

  // Camera
  const camKey = camera.mode === "focus" ? `focus:${camera.id}` : camera.mode;
  const followTarget =
    camera.mode === "follow" || camera.mode === "focus"
      ? vehicles.find((v) => (camera.mode === "focus" ? v.id === camera.id : v.isMe))?.lngLat
      : undefined;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const go = () => {
      if (camera.mode === "north") {
        m.easeTo({ bearing: 0, pitch: 0, duration: 500 });
      } else if (camera.mode === "route") {
        const r = ROUTES[selected] ?? ROUTES[0]!;
        const b = new maplibregl.LngLatBounds(r.coords[0], r.coords[0]);
        r.coords.forEach((c) => b.extend(c));
        m.easeTo({ pitch: 0, duration: 300 });
        m.fitBounds(b, { padding: 40, duration: 700 });
      } else if (camera.mode === "fit" && vehicles.length) {
        const b = new maplibregl.LngLatBounds(vehicles[0]!.lngLat, vehicles[0]!.lngLat);
        vehicles.forEach((v) => b.extend(v.lngLat));
        m.easeTo({ pitch: 0, duration: 300 });
        m.fitBounds(b, {
          padding: { top: 160, bottom: 280, left: 50, right: 80 },
          maxZoom: 14,
          duration: 700,
        });
      }
    };
    whenReady(go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camKey, selected]);
  useEffect(() => {
    const m = map.current;
    if (!m || !followTarget) return;
    m.easeTo({
      center: followTarget,
      zoom: Math.max(m.getZoom(), 15),
      pitch: camera.mode === "follow" ? 38 : 0,
      duration: 1000,
      easing: (t) => t,
      padding: { top: 120, bottom: 280, left: 20, right: 60 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followTarget?.[0], followTarget?.[1], camKey]);

  return <div ref={el} className={className} />;
}
