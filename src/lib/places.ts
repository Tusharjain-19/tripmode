// Nearby places from OpenStreetMap (Overpass API), keyless.
import type { LngLat } from "./geo";
import { haversineM } from "./nav";

export type PlaceCategory = "fuel" | "food" | "hotel" | "toilets" | "hospital" | "ev";
export const CATEGORIES: { id: PlaceCategory; label: string; icon: string; filter: string }[] = [
  { id: "fuel", label: "Petrol", icon: "local_gas_station", filter: '["amenity"="fuel"]' },
  {
    id: "food",
    label: "Food",
    icon: "restaurant",
    filter: '["amenity"~"^(restaurant|fast_food|cafe)$"]',
  },
  {
    id: "hotel",
    label: "Hotels",
    icon: "hotel",
    filter: '["tourism"~"^(hotel|motel|guest_house)$"]',
  },
  { id: "toilets", label: "Toilets", icon: "wc", filter: '["amenity"="toilets"]' },
  {
    id: "hospital",
    label: "Hospital",
    icon: "local_hospital",
    filter: '["amenity"~"^(hospital|clinic)$"]',
  },
  { id: "ev", label: "EV charging", icon: "ev_station", filter: '["amenity"="charging_station"]' },
];

export type NearbyPlace = {
  id: string;
  name: string;
  category: PlaceCategory;
  lngLat: LngLat;
  distanceM: number;
};

export async function searchNearby(
  center: LngLat,
  category: PlaceCategory,
  radiusM = 8000,
  signal?: AbortSignal,
): Promise<NearbyPlace[]> {
  const cat = CATEGORIES.find((c) => c.id === category)!;
  const [lng, lat] = center;
  const q = `[out:json][timeout:20];(node${cat.filter}(around:${radiusM},${lat},${lng});way${cat.filter}(around:${radiusM},${lat},${lng}););out center 40;`;
  let res: Response | null = null;
  for (const host of [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ]) {
    try {
      const r = await fetch(host, {
        method: "POST",
        body: new URLSearchParams({ data: q }),
        signal: signal ?? AbortSignal.timeout(15000),
      });
      if (r.ok) {
        res = r;
        break;
      }
    } catch {
      // try the next mirror
    }
  }
  if (!res) throw new Error("Nearby search is busy. Try again in a moment.");
  const j = (await res.json()) as {
    elements: {
      id: number;
      type: string;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }[];
  };
  return j.elements
    .map((e) => {
      const la = e.lat ?? e.center?.lat;
      const lo = e.lon ?? e.center?.lon;
      if (la === undefined || lo === undefined) return null;
      const p: LngLat = [lo, la];
      const t = e.tags ?? {};
      return {
        id: `${e.type}/${e.id}`,
        name: t["name:en"] || t["name"] || t["brand"] || cat.label,
        category,
        lngLat: p,
        distanceM: haversineM(center, p),
      };
    })
    .filter((x): x is NearbyPlace => !!x)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 25);
}
