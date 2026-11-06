import { describe, expect, it } from "vitest";
import { scrubSensitiveData } from "./error-reporting";

describe("security: scrubSensitiveData", () => {
  it("scrubs lat, lng, coords, and position objects", () => {
    const raw = {
      user: "Arjun",
      lat: 26.9124,
      lng: 75.7873,
      coords: [75.7873, 26.9124],
      position: { lat: 26.9, lng: 75.7 },
      otherMeta: "safe-info",
    };

    const scrubbed = scrubSensitiveData(raw);

    expect(scrubbed.user).toBe("Arjun");
    expect(scrubbed.otherMeta).toBe("safe-info");
    expect(scrubbed.lat).toBe("[REDACTED]");
    expect(scrubbed.lng).toBe("[REDACTED]");
    expect(scrubbed.coords).toBe("[REDACTED]");
    expect(scrubbed.position).toBe("[REDACTED]");
  });

  it("scrubs tokens, passwords, and invite codes", () => {
    const raw = {
      token: "secret-bearer-token",
      apiKey: "sk-12345",
      password: "pass",
      inviteCode: "7k9m2p",
      body: "Secret chat message",
    };

    const scrubbed = scrubSensitiveData(raw);

    expect(scrubbed.token).toBe("[REDACTED]");
    expect(scrubbed.apiKey).toBe("[REDACTED]");
    expect(scrubbed.password).toBe("[REDACTED]");
    expect(scrubbed.inviteCode).toBe("[REDACTED]");
    expect(scrubbed.body).toBe("[REDACTED]");
  });

  it("safely handles null and primitive values", () => {
    expect(scrubSensitiveData(null)).toBe(null);
    expect(scrubSensitiveData(undefined)).toBe(undefined);
    expect(scrubSensitiveData(42)).toBe(42);
    expect(scrubSensitiveData("hello")).toBe("hello");
  });
});
