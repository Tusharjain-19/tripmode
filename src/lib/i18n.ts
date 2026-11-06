import { useCallback, useSyncExternalStore } from "react";

export type Language = "en" | "hi";

const STORAGE_KEY = "tripmode.language";

const DICTIONARY = {
  en: {
    // HUD & Navigation
    sharingLocation: "Sharing location",
    locationPaused: "Location sharing paused",
    pauseSharing: "Pause sharing",
    resumeSharing: "Resume sharing",
    gpsLocked: "GPS Locked • Live Convoy",
    connectingGps: "Connecting GPS...",
    speedKmh: "km/h",
    recenter: "Recenter",
    exitNav: "Exit navigation",
    exitConfirmTitle: "Exit live navigation?",
    exitConfirmDesc: "You can leave the convoy or stay in the trip lobby.",
    endTripEveryone: "End trip for everyone",
    leaveTrip: "Leave convoy",
    cancel: "Cancel",
    tapForSteps: "Tap for steps",
    destination: "Destination",
    eta: "ETA",
    remaining: "remaining",

    // Audio & PTT
    pttHold: "Hold to talk to convoy",
    pttTransmitting: "Transmitting live audio to convoy...",
    audioAll: "All audio enabled",
    audioAlerts: "Alerts only",
    audioMute: "Audio muted",

    // Alerts
    quickAlerts: "Broadcast to Convoy",
    quickAlertsDesc: "One-tap driving alerts with instant audio banner for all cars.",
    slowDown: "Slow down",
    needFuel: "Need fuel",
    needBreak: "Need a break",
    foodStop: "Food stop",
    lostRoute: "Lost the route",
    waitForMe: "Wait for me",
    sosHold: "Hold 3s for SOS",
    sosBroadcast: "Emergency SOS Broadcast",
    sosTriggered: "Convoy emergency triggered",

    // Statuses
    statusFollowing: "in convoy",
    statusBehind: "behind leader",
    statusStopped: "stopped",
    statusOffroute: "off route",
    statusStale: "signal lost",
    statusOffline: "offline",
    statusArrived: "arrived at destination",

    // UI
    groupChat: "Group Chat",
    send: "Send",
    saySomething: "Message convoy...",
    language: "Language",
  },
  hi: {
    // HUD & Navigation
    sharingLocation: "लोकेशन शेयर हो रही है",
    locationPaused: "लोकेशन शेयरिंग रोकी गई",
    pauseSharing: "शेयरिंग रोकें",
    resumeSharing: "शेयरिंग शुरू करें",
    gpsLocked: "जीपीएस सक्रिय • लाइव काफ़िला",
    connectingGps: "जीपीएस से कनेक्ट हो रहा है...",
    speedKmh: "किमी/घंटा",
    recenter: "पुनः केंद्रित करें",
    exitNav: "नेविगेशन समाप्त करें",
    exitConfirmTitle: "क्या नेविगेशन बंद करना चाहते हैं?",
    exitConfirmDesc: "आप काफ़िला छोड़ सकते हैं या ट्रिप लॉबी में वापस जा सकते हैं।",
    endTripEveryone: "सभी के लिए यात्रा समाप्त करें",
    leaveTrip: "काफ़िला छोड़ें",
    cancel: "रद्द करें",
    tapForSteps: "मोड़ देखने के लिए टैप करें",
    destination: "मंज़िल",
    eta: "पहुंचने का समय",
    remaining: "शेष",

    // Audio & PTT
    pttHold: "काफ़िले से बात करने के लिए दबाकर रखें",
    pttTransmitting: "काफ़िले को आवाज़ भेजी जा रही है...",
    audioAll: "सभी ऑडियो चालू",
    audioAlerts: "केवल अलर्ट",
    audioMute: "म्यूट",

    // Alerts
    quickAlerts: "काफ़िले को संदेश भेजें",
    quickAlertsDesc: "सभी गाड़ियों को तुरंत ऑडियो अलर्ट भेजने के लिए टैप करें।",
    slowDown: "धीमे चलें",
    needFuel: "ईंधन चाहिए",
    needBreak: "विराम चाहिए",
    foodStop: "भोजन विराम",
    lostRoute: "रास्ता भटक गए",
    waitForMe: "मेरा इंतज़ार करें",
    sosHold: "SOS के लिए 3 सेकंड दबाएं",
    sosBroadcast: "आपातकालीन SOS प्रसारित",
    sosTriggered: "काफ़िले का आपातकालीन अलर्ट जारी",

    // Statuses
    statusFollowing: "काफ़िले में",
    statusBehind: "लीडर से पीछे",
    statusStopped: "रुके हुए हैं",
    statusOffroute: "रास्ते से बाहर",
    statusStale: "सिग्नल नहीं आ रहा",
    statusOffline: "ऑफ़लाइन",
    statusArrived: "मंज़िल पर पहुंचे",

    // UI
    groupChat: "ग्रुप चैट",
    send: "भेजें",
    saySomething: "काफ़िले को संदेश लिखें...",
    language: "भाषा",
  },
} as const;

export type TranslationKey = keyof typeof DICTIONARY.en;

let currentLang: Language = "en";
const listeners = new Set<() => void>();

function safeStorageGet(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.getItem === "function") {
      return window.localStorage.getItem(key);
    }
  } catch {
    // ignore
  }
  return null;
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.setItem === "function") {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // ignore
  }
}

const saved = safeStorageGet(STORAGE_KEY);
if (saved === "en" || saved === "hi") {
  currentLang = saved;
}

export function getLanguage(): Language {
  return currentLang;
}

export function setLanguage(lang: Language) {
  if (currentLang === lang) return;
  currentLang = lang;
  safeStorageSet(STORAGE_KEY, lang);
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
  listeners.forEach((l) => l());
}

export function toggleLanguage() {
  setLanguage(currentLang === "en" ? "hi" : "en");
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function t(key: TranslationKey): string {
  return DICTIONARY[currentLang][key] || DICTIONARY.en[key] || key;
}

export function useI18n() {
  const lang = useSyncExternalStore<Language>(subscribe, getLanguage, () => "en");

  const translate = useCallback((key: TranslationKey): string => {
    return DICTIONARY[lang][key] || DICTIONARY.en[key] || key;
  }, [lang]);

  return {
    lang,
    t: translate,
    setLanguage,
    toggleLanguage,
  };
}
