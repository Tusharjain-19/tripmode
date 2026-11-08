import { describe, expect, it } from "vitest";
import {
  formatSosPacket,
  generateGoogleMapsDirectionsLink,
  generateGoogleMapsLink,
  haversineDistanceM,
  parseSosCoords,
} from "./sos";

describe("sos module", () => {
  it("generates correct Google Maps URLs", () => {
    const lat = 26.912434;
    const lng = 75.787271;
    expect(generateGoogleMapsLink(lat, lng)).toBe("https://maps.google.com/?q=26.912434,75.787271");
    expect(generateGoogleMapsDirectionsLink(lat, lng)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=26.912434,75.787271",
    );
  });

  it("formats complete SOS packet with share text and WhatsApp URL", () => {
    const packet = formatSosPacket({
      lat: 28.6139,
      lng: 77.209,
      driverName: "Rahul",
      tripName: "Delhi Highway Convoy",
    });

    expect(packet.body).toContain("Rahul sent EMERGENCY SOS");
    expect(packet.body).toContain("https://maps.google.com/?q=28.613900,77.209000");
    expect(packet.whatsappUrl).toContain("https://api.whatsapp.com/send?text=");
    expect(decodeURIComponent(packet.whatsappUrl)).toContain(packet.mapsUrl);
  });

  it("parses coordinates from Google Maps query in SOS text", () => {
    const text = "Rahul: Emergency assistance needed! https://maps.google.com/?q=24.58540,73.71250";
    const parsed = parseSosCoords(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.lat).toBeCloseTo(24.5854, 4);
    expect(parsed?.lng).toBeCloseTo(73.7125, 4);
    expect(parsed?.mapsUrl).toBe("https://maps.google.com/?q=24.585400,73.712500");
  });

  it("parses coordinates from legacy 'Location lat, lng' strings", () => {
    const text = "Location 26.91240, 75.78730";
    const parsed = parseSosCoords(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.lat).toBeCloseTo(26.9124, 4);
    expect(parsed?.lng).toBeCloseTo(75.7873, 4);
  });

  it("returns null for non-coordinate text", () => {
    expect(parseSosCoords("Just chatting here")).toBeNull();
    expect(parseSosCoords("")).toBeNull();
  });

  it("calculates accurate haversine distance in meters", () => {
    // Delhi to Agra ~ 180-200 km
    const delhi: [number, number] = [77.209, 28.6139];
    const agra: [number, number] = [78.0081, 27.1767];
    const dist = haversineDistanceM(delhi, agra);
    expect(dist).toBeGreaterThan(170000);
    expect(dist).toBeLessThan(200000);
  });
});

