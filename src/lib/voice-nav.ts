/**
 * Voice Navigation Synthesizer with selectable Voice Models
 * for in-car turn-by-turn guidance and convoy alerts.
 */

export type VoiceProfileId =
  | "female-natural"
  | "male-steady"
  | "female-crisp"
  | "male-calm"
  | "bilingual-in";

export interface VoiceProfile {
  id: VoiceProfileId;
  name: string;
  gender: "female" | "male";
  accent: string;
  description: string;
  pitch: number;
  rate: number;
  preferredLang: string;
}

export const VOICE_PROFILES: VoiceProfile[] = [
  {
    id: "female-natural",
    name: "Priya (Natural)",
    gender: "female",
    accent: "English (India)",
    description: "Clear, friendly, standard driving guidance",
    pitch: 1.1,
    rate: 1.0,
    preferredLang: "en-IN",
  },
  {
    id: "male-steady",
    name: "Arjun (Steady)",
    gender: "male",
    accent: "English (India)",
    description: "Deep, calm, focused convoy navigator",
    pitch: 0.85,
    rate: 0.98,
    preferredLang: "en-IN",
  },
  {
    id: "female-crisp",
    name: "Maya (Expressway)",
    gender: "female",
    accent: "English (Neutral)",
    description: "Fast, energetic, high-contrast turn cues",
    pitch: 1.18,
    rate: 1.12,
    preferredLang: "en-US",
  },
  {
    id: "male-calm",
    name: "Kabir (Smooth)",
    gender: "male",
    accent: "English (UK)",
    description: "Unhurried, soothing cadence for long road trips",
    pitch: 0.9,
    rate: 0.9,
    preferredLang: "en-GB",
  },
  {
    id: "bilingual-in",
    name: "Aanya (Bilingual)",
    gender: "female",
    accent: "Hindi / Indian",
    description: "Optimized for Indian route names and highways",
    pitch: 1.05,
    rate: 1.0,
    preferredLang: "hi-IN",
  },
];

const STORAGE_KEY = "tripmode.voiceProfile";
let memoryVoice: VoiceProfileId | null = null;

export function getSelectedVoiceProfile(): VoiceProfileId {
  if (memoryVoice) return memoryVoice;
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as VoiceProfileId | null;
      if (saved && VOICE_PROFILES.some((p) => p.id === saved)) {
        return saved;
      }
    } catch {
      /* ignore */
    }
  }
  return "female-natural";
}

export function setSelectedVoiceProfile(id: VoiceProfileId): void {
  memoryVoice = id;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Speaks turn guidance or convoy announcements using the selected Voice Model.
 */
export function speakGuidance(text: string, profileId?: VoiceProfileId): void {
  if (typeof window === "undefined" || typeof speechSynthesis === "undefined") return;

  try {
    speechSynthesis.cancel(); // Cancel any existing speech queue so guidance is immediate

    const activeId = profileId || getSelectedVoiceProfile();
    const profile = VOICE_PROFILES.find((p) => p.id === activeId) ?? VOICE_PROFILES[0]!;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = profile.pitch;
    utterance.rate = profile.rate;

    const voices = speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const langPrefix = profile.preferredLang.slice(0, 2).toLowerCase();

      // Priority 1: Match language prefix and gender hint in voice name
      let matched = voices.find((v) => {
        const vl = v.lang.toLowerCase();
        const vn = v.name.toLowerCase();
        const matchesLang = vl.startsWith(langPrefix) || vl.startsWith("en");
        const matchesGender =
          profile.gender === "female"
            ? vn.includes("female") || vn.includes("woman") || vn.includes("priya") || vn.includes("zira") || vn.includes("samantha")
            : vn.includes("male") || vn.includes("man") || vn.includes("david") || vn.includes("rishi") || vn.includes("george");
        return matchesLang && matchesGender;
      });

      // Priority 2: Match language prefix
      if (!matched) {
        matched = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
      }

      // Priority 3: Any English voice or default
      if (!matched) {
        matched = voices.find((v) => v.lang.toLowerCase().startsWith("en")) || voices[0];
      }

      if (matched) {
        utterance.voice = matched;
      }
    }

    speechSynthesis.speak(utterance);
  } catch {
    /* ignore speech synthesis errors */
  }
}

/** Plays an instant sample utterance for the driver to test the voice */
export function testVoiceSample(profileId: VoiceProfileId): void {
  const profile = VOICE_PROFILES.find((p) => p.id === profileId) ?? VOICE_PROFILES[0]!;
  const sample =
    profile.id === "bilingual-in"
      ? "Convoy guide: In 300 meters, stay left towards Jaipur Expressway."
      : `Convoy guide: In 300 meters, turn right on Highway 48. Speed is 70 kilometers per hour.`;
  speakGuidance(sample, profileId);
}
