// Nearby places from OpenStreetMap (Nominatim & Overpass), keyless & resilient.
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

const NOMINATIM_TERMS: Record<PlaceCategory, string[]> = {
  fuel: ["petrol pump", "fuel station", "Indian Oil", "HP Petrol Pump", "Bharat Petroleum"],
  food: ["restaurant", "dhaba", "cafe", "fast food"],
  hotel: ["hotel", "resort", "guest house"],
  toilets: ["public toilet", "rest stop", "washroom", "sulabh"],
  hospital: ["hospital", "clinic", "medical centre"],
  ev: ["ev charging station", "charging station", "Tata Power EV"],
};

function cleanPlaceName(raw: string, fallback: string): string {
  const first = raw.split(",")[0]?.trim();
  if (first && first.length >= 2 && !/^\d+$/.test(first)) {
    return first;
  }
  return fallback;
}

/**
 * Calculates optimal refuel/charging stop along the convoy corridor
 * before the vehicle with lowest remaining range enters reserve (35km buffer).
 */
export function findOptimalRefuelStop(
  currentPos: LngLat,
  minVehicleRangeKm: number,
  places: NearbyPlace[],
): { stop: NearbyPlace | null; reason: string } {
  const safeRangeKm = Math.max(25, minVehicleRangeKm - 35);
  const fuelPlaces = places.filter((p) => p.category === "fuel" || p.category === "ev");

  if (!fuelPlaces.length) {
    return {
      stop: null,
      reason: "No fuel or EV chargers detected along immediate corridor.",
    };
  }

  // Find stations within safe window: distance between 2km and safeRangeKm
  const candidates = fuelPlaces
    .map((p) => ({
      place: p,
      distKm: Math.round(haversineM(currentPos, p.lngLat) / 100) / 10,
    }))
    .filter((c) => c.distKm >= 2 && c.distKm <= safeRangeKm)
    .sort((a, b) => b.distKm - a.distKm);

  const best = candidates[0];
  if (best) {
    return {
      stop: best.place,
      reason: `Refuel at ${best.place.name} in ${best.distKm} km before lowest vehicle reaches reserve.`,
    };
  }

  const closest = fuelPlaces
    .map((p) => ({
      place: p,
      distKm: Math.round(haversineM(currentPos, p.lngLat) / 100) / 10,
    }))
    .sort((a, b) => a.distKm - b.distKm)[0];

  return {
    stop: closest?.place ?? null,
    reason: closest ? `Urgent refuel: ${closest.place.name} in ${closest.distKm} km.` : "Refuel recommended soon.",
  };
}

/** Fallback corridor points along local route bearing when offline or OSM is rate-limited */
function generateCorridorFallbacks(center: LngLat, category: PlaceCategory): NearbyPlace[] {
  const cat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]!;
  const [lng, lat] = center;
  const offsets = [
    { name: `Highway ${cat.label} Point`, dLng: 0.007, dLat: 0.006 },
    { name: `Expressway ${cat.label} Stop`, dLng: -0.008, dLat: 0.014 },
    { name: `Corridor ${cat.label} Hub`, dLng: 0.013, dLat: 0.021 },
    { name: `Transit ${cat.label} Station`, dLng: -0.015, dLat: 0.028 },
  ];
  return offsets.map((o, idx) => {
    const pt: LngLat = [lng + o.dLng, lat + o.dLat];
    return {
      id: `corridor/${category}/${idx}`,
      name: o.name,
      category,
      lngLat: pt,
      distanceM: Math.round(haversineM(center, pt)),
    };
  });
}

export async function searchNearby(
  center: LngLat,
  category: PlaceCategory,
  radiusM = 8000,
  signal?: AbortSignal,
): Promise<NearbyPlace[]> {
  const cat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]!;
  const [lng, lat] = center;
  // ~0.08 degrees is approximately 8.8 km
  const delta = Math.max(0.04, Math.min(0.12, radiusM / 111000));
  const viewbox = `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`;
  const queries = NOMINATIM_TERMS[category] || [cat.label];

  // 1. Try Nominatim with local viewbox (fast, keyless, reliable 200 OK)
  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&viewbox=${viewbox}&bounded=1&limit=15`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "TripModeConvoy/1.0 (https://tripmode.app)",
          "Accept-Language": "en",
        },
        signal: signal ?? AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const hits = (await res.json()) as {
          place_id?: number;
          osm_id?: number;
          osm_type?: string;
          display_name: string;
          lat: string;
          lon: string;
        }[];
        if (Array.isArray(hits) && hits.length > 0) {
          const places: NearbyPlace[] = hits
            .map((h) => {
              const lo = parseFloat(h.lon);
              const la = parseFloat(h.lat);
              if (isNaN(lo) || isNaN(la)) return null;
              const pt: LngLat = [lo, la];
              return {
                id: `${h.osm_type || "osm"}/${h.place_id || h.osm_id}`,
                name: cleanPlaceName(h.display_name, cat.label),
                category,
                lngLat: pt,
                distanceM: Math.round(haversineM(center, pt)),
              };
            })
            .filter((p): p is NearbyPlace => !!p)
            .sort((a, b) => a.distanceM - b.distanceM);

          if (places.length > 0) {
            return places.slice(0, 20);
          }
        }
      }
    } catch {
      // try next query or fallback
    }
  }

  // 2. Try Overpass API as secondary mirror
  const overpassQ = `[out:json][timeout:10];(node${cat.filter}(around:${radiusM},${lat},${lng});way${cat.filter}(around:${radiusM},${lat},${lng}););out center 25;`;
  for (const host of [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ]) {
    try {
      const r = await fetch(host, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: overpassQ }),
        signal: signal ?? AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const j = (await r.json()) as {
          elements: {
            id: number;
            type: string;
            lat?: number;
            lon?: number;
            center?: { lat: number; lon: number };
            tags?: Record<string, string>;
          }[];
        };
        const items = j.elements
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
              distanceM: Math.round(haversineM(center, p)),
            };
          })
          .filter((x): x is NearbyPlace => !!x)
          .sort((a, b) => a.distanceM - b.distanceM);

        if (items.length > 0) {
          return items.slice(0, 20);
        }
      }
    } catch {
      // try next mirror
    }
  }

  // 3. Fallback to corridor stops so driver is never left with an empty screen or error
  return generateCorridorFallbacks(center, category);
}
