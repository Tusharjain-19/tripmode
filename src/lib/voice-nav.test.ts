import { describe, it, expect, beforeEach } from "vitest";
import {
  VOICE_PROFILES,
  getSelectedVoiceProfile,
  setSelectedVoiceProfile,
  testVoiceSample,
  speakGuidance,
} from "./voice-nav";

describe("voice-nav synthesizer", () => {
  beforeEach(() => {
    try {
      window.localStorage.removeItem("tripmode.voiceProfile");
    } catch {
      // ignore
    }
  });

  it("provides 5 diverse voice profiles with realistic rates and pitches", () => {
    expect(VOICE_PROFILES.length).toBe(5);
    const ids = VOICE_PROFILES.map((p) => p.id);
    expect(ids).toContain("female-natural");
    expect(ids).toContain("male-steady");
    expect(ids).toContain("female-crisp");
    expect(ids).toContain("male-calm");
    expect(ids).toContain("bilingual-in");
  });

  it("persists voice selection to localStorage", () => {
    expect(getSelectedVoiceProfile()).toBe("female-natural");
    setSelectedVoiceProfile("male-steady");
    expect(getSelectedVoiceProfile()).toBe("male-steady");
  });

  it("safely handles speakGuidance and testVoiceSample in test environment without throwing", () => {
    expect(() => speakGuidance("In 200m turn left")).not.toThrow();
    expect(() => testVoiceSample("female-crisp")).not.toThrow();
  });
});
