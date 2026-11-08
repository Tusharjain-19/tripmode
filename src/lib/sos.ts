import type { LngLat } from "./geo";

export type SosPayload = {
  lat: number;
  lng: number;
  mapsUrl: string;
  dirUrl: string;
  shareText: string;
  whatsappUrl: string;
  body: string;
};

/**
 * Builds standard Google Maps query link.
 */
export function generateGoogleMapsLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Builds Google Maps turn-by-turn navigation / directions link.
 */
export function generateGoogleMapsDirectionsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Formats a complete SOS emergency broadcast packet with maps links,
 * WhatsApp one-tap URL, and human-readable location data.
 */
export function formatSosPacket(params: {
  lat: number;
  lng: number;
  driverName?: string;
  tripName?: string;
}): SosPayload {
  const { lat, lng, driverName, tripName } = params;
  const mapsUrl = generateGoogleMapsLink(lat, lng);
  const dirUrl = generateGoogleMapsDirectionsLink(lat, lng);

  const prefix = driverName ? `${driverName} sent EMERGENCY SOS` : `EMERGENCY SOS Broadcast`;
  const tripPart = tripName ? ` [${tripName}]` : "";
  const body = `${prefix}${tripPart}: Assistance needed at ${lat.toFixed(5)}, ${lng.toFixed(5)}. Open map: ${mapsUrl}`;

  const shareText = `EMERGENCY SOS! Roadside assistance needed${tripPart}. My live GPS coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}. Google Maps link: ${mapsUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

  return {
    lat,
    lng,
    mapsUrl,
    dirUrl,
    shareText,
    whatsappUrl,
    body,
  };
}

/**
 * Parses GPS coordinates from incoming SOS message bodies.
 * Handles Google Maps links, raw lat/lng strings, and legacy formats.
 */
export function parseSosCoords(body: string): { lat: number; lng: number; mapsUrl: string } | null {
  if (!body) return null;

  // 1. Match Google Maps query pattern: q=28.6139,77.2090
  const qMatch = body.match(/[?&]q=(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/i);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]!);
    const lng = parseFloat(qMatch[2]!);
    if (isValidLatLng(lat, lng)) {
      return { lat, lng, mapsUrl: generateGoogleMapsLink(lat, lng) };
    }
  }

  // 2. Match explicit "Location 28.6139, 77.2090" or "at 28.6139, 77.2090"
  const locMatch = body.match(/(?:Location|at|coords?|near)\s+(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/i);
  if (locMatch) {
    const lat = parseFloat(locMatch[1]!);
    const lng = parseFloat(locMatch[2]!);
    if (isValidLatLng(lat, lng)) {
      return { lat, lng, mapsUrl: generateGoogleMapsLink(lat, lng) };
    }
  }

  // 3. Match any generic pair of decimal coordinates: 28.61390, 77.20900
  const genericMatch = body.match(/(-?\d{1,3}\.\d{3,})[,\s]+(-?\d{1,3}\.\d{3,})/);
  if (genericMatch) {
    const lat = parseFloat(genericMatch[1]!);
    const lng = parseFloat(genericMatch[2]!);
    if (isValidLatLng(lat, lng)) {
      return { lat, lng, mapsUrl: generateGoogleMapsLink(lat, lng) };
    }
  }

  return null;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Great-circle distance between two [lng, lat] points in meters (Haversine).
 */
export function haversineDistanceM(from: LngLat, to: LngLat): number {
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
