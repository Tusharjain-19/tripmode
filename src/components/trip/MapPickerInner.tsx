import * as maplibregl from "maplibre-gl";
import { setWorkerUrl, type Map as MLMap, type Marker } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { LngLat } from "@/lib/geo";

setWorkerUrl(workerUrl);

const INDIA_CENTER: LngLat = [79.0, 22.5];

/** Tap anywhere on the map to choose a point. */
export default function MapPickerInner({
  value,
  onPick,
  className,
}: {
  value: LngLat | null;
  onPick: (p: LngLat) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: value ?? INDIA_CENTER,
      zoom: value ? 11 : 4,
      maxBounds: [
        [60, 4],
        [100, 40],
      ],
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.getCanvas().style.cursor = "crosshair";
    m.on("click", (e) => pick.current([e.lngLat.lng, e.lngLat.lat]));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const color = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
      marker.current = new maplibregl.Marker({ color }).setLngLat(value).addTo(m);
    } else marker.current.setLngLat(value);
  }, [value]);

  return <div ref={el} className={className} />;
}
