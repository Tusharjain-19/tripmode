import { useState } from "react";
import { Icon, Button, Segmented } from "@/components/trip/ui";
import {
  VOICE_PROFILES,
  type VoiceProfileId,
  testVoiceSample,
} from "@/lib/voice-nav";
import type { MapStyleId } from "@/components/trip/RouteMap";
import { cn } from "@/lib/utils";

interface NavSettingsModalProps {
  open: boolean;
  onClose: () => void;
  mapStyle: MapStyleId;
  onMapStyleChange: (style: MapStyleId) => void;
  audioMode: "all" | "alerts" | "mute";
  onAudioModeChange: (mode: "all" | "alerts" | "mute") => void;
  showPtt: boolean;
  onShowPttChange: (show: boolean) => void;
  voiceProfile: VoiceProfileId;
  onVoiceProfileChange: (id: VoiceProfileId) => void;
  onOpenOledHud: () => void;
}

export function NavSettingsModal({
  open,
  onClose,
  mapStyle,
  onMapStyleChange,
  audioMode,
  onAudioModeChange,
  showPtt,
  onShowPttChange,
  voiceProfile,
  onVoiceProfileChange,
  onOpenOledHud,
}: NavSettingsModalProps) {
  const [testingVoice, setTestingVoice] = useState(false);

  if (!open) return null;

  const handleTestVoice = (id: VoiceProfileId) => {
    setTestingVoice(true);
    testVoiceSample(id);
    setTimeout(() => setTestingVoice(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-t-[28px] sm:rounded-[26px] border border-border bg-card p-5 sm:p-6 shadow-float text-foreground flex flex-col gap-5 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon name="tune" className="text-[22px]" />
            </span>
            <div>
              <h2 className="text-[18px] font-semibold text-foreground leading-tight">
                Navigation & Driving Settings
              </h2>
              <span className="text-[12px] text-muted-foreground">
                Display mode, navigator voice & controls
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        {/* 1. Map Theme / Night Drive */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
              Map Theme & Mode
            </span>
            <span className="text-[12px] text-primary font-medium capitalize">
              {mapStyle === "dark" ? "Night Drive" : mapStyle}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: "default", label: "Day", icon: "light_mode", desc: "Positron light" },
              { id: "dark", label: "Night", icon: "dark_mode", desc: "Dark highway" },
              { id: "satellite", label: "Satellite", icon: "satellite_alt", desc: "Aerial terrain" },
              { id: "detailed", label: "Detailed", icon: "map", desc: "Full landmarks" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onMapStyleChange(m.id as MapStyleId)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-center transition-all cursor-pointer active:scale-95",
                  mapStyle === m.id
                    ? "border-primary bg-primary/10 text-primary shadow-xs ring-1 ring-primary"
                    : "border-border/80 bg-secondary/40 text-foreground hover:bg-secondary",
                )}
              >
                <Icon name={m.icon} className="text-[22px]" />
                <span className="text-[13px] font-semibold">{m.label}</span>
                <span className="text-[10px] text-muted-foreground leading-none">{m.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 2. Navigator Voice Selection (Free Models) */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
              Navigator Voice Model
            </span>
            <button
              type="button"
              disabled={testingVoice}
              onClick={() => handleTestVoice(voiceProfile)}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline cursor-pointer disabled:opacity-50"
            >
              <Icon name="volume_up" className="text-[15px]" />
              <span>{testingVoice ? "Speaking sample..." : "Test Voice"}</span>
            </button>
          </div>

          <div className="space-y-2">
            {VOICE_PROFILES.map((p) => {
              const selected = voiceProfile === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => onVoiceProfileChange(p.id)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all active:scale-[0.99]",
                    selected
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                      : "border-border/70 bg-card hover:bg-secondary/40",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[16px] font-bold",
                        p.gender === "female"
                          ? "bg-rose-500/15 text-rose-500"
                          : "bg-blue-500/15 text-blue-500",
                      )}
                    >
                      <Icon name={p.gender === "female" ? "face_3" : "face_6"} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[14px] text-foreground truncate">
                          {p.name}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-secondary text-muted-foreground">
                          {p.accent}
                        </span>
                      </div>
                      <span className="text-[12px] text-muted-foreground truncate block">
                        {p.description}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestVoice(p.id);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary hover:bg-primary/20 text-foreground transition-colors cursor-pointer"
                      title={`Preview ${p.name}`}
                    >
                      <Icon name="play_arrow" className="text-[18px]" />
                    </button>
                    <div
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40",
                      )}
                    >
                      {selected && <Icon name="check" className="text-[14px] font-bold" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. Voice Guidance Level */}
        <section className="space-y-2">
          <span className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
            Guidance Audio Level
          </span>
          <Segmented
            label="Voice guidance level"
            value={audioMode}
            onChange={(m) => onAudioModeChange(m as "all" | "alerts" | "mute")}
            options={[
              { value: "all", label: "Turns & Alerts" },
              { value: "alerts", label: "Alerts Only" },
              { value: "mute", label: "Mute All" },
            ]}
          />
        </section>

        {/* 4. Push-to-Talk (Hold-to-Talk) Driving Screen Switch */}
        <section className="rounded-2xl border border-border bg-secondary/30 p-4">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                <Icon name="mic" className="text-[20px]" />
              </span>
              <div>
                <span className="block font-semibold text-[14px] text-foreground">
                  Push-to-Talk Walkie Talkie
                </span>
                <span className="text-[12px] text-muted-foreground">
                  Show "Hold to Talk" voice clip button on the driving map.
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={showPtt}
              onChange={(e) => onShowPttChange(e.target.checked)}
              className="h-5 w-5 accent-primary rounded cursor-pointer shrink-0"
            />
          </label>
        </section>

        {/* 5. Battery Saver OLED HUD */}
        <section className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
              <Icon name="battery_saver" className="text-[20px]" />
            </span>
            <div className="min-w-0">
              <span className="font-semibold text-[14px] text-foreground block">
                OLED Battery Saver HUD
              </span>
              <span className="text-[12px] text-muted-foreground block truncate">
                Full-black high-contrast HUD for long road trips
              </span>
            </div>
          </div>
          <Button
            size="md"
            variant="secondary"
            className="shrink-0 h-9 px-3.5 text-[12px] font-semibold cursor-pointer"
            onClick={() => {
              onClose();
              onOpenOledHud();
            }}
          >
            Launch HUD
          </Button>
        </section>

        {/* Modal Done Button */}
        <Button size="lg" className="w-full mt-2 cursor-pointer" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

