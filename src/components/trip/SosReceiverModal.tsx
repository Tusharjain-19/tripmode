import { useState } from "react";
import { Icon, VehicleChip } from "./ui";
import { formatDistance } from "@/lib/nav";
import { generateGoogleMapsDirectionsLink } from "@/lib/sos";
import type { VehicleColor } from "@/lib/trip-store";

export type ActiveSosAlert = {
  id: string;
  userId: string;
  driver: string;
  color?: VehicleColor | undefined;
  letter?: string | undefined;
  lat: number;
  lng: number;
  mapsUrl: string;
  text: string;
  at: number;
};

type Props = {
  alert: ActiveSosAlert | null;
  distanceM?: number | undefined;
  onRerouteGps: (lngLat: [number, number], driver: string) => void;
  onDismiss: () => void;
};

export function SosReceiverModal({ alert, distanceM, onRerouteGps, onDismiss }: Props) {
  const [copied, setCopied] = useState(false);

  if (!alert) return null;

  const dirUrl = generateGoogleMapsDirectionsLink(alert.lat, alert.lng);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(alert.mapsUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // fallback
    }
  };

  const handleShare = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bridge = (window as any).AndroidBridge;
    const shareText = `CONVOY SOS ALERT: ${alert.driver} requires emergency assistance! Live coordinates: ${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)}. Google Maps link: ${alert.mapsUrl}`;
    if (bridge?.share) {
      bridge.share("Convoy SOS Alert", shareText, alert.mapsUrl);
      return;
    }
    if (navigator.share) {
      navigator.share({ title: "Convoy SOS Alert", text: shareText, url: alert.mapsUrl }).catch(() => undefined);
    } else {
      void handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex w-full max-w-lg flex-col rounded-t-[28px] sm:rounded-[28px] border-2 border-alert bg-card p-6 shadow-float">
        {/* Header with emergency alert */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-alert text-alert-foreground">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-alert opacity-75" />
              <Icon name="emergency" className="text-[26px]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-alert animate-pulse" />
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-alert">
                  Convoy Emergency
                </span>
              </div>
              <h2 className="text-[20px] font-bold text-foreground">SOS From {alert.driver}</h2>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground active:scale-95"
            aria-label="Dismiss SOS"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Member and distance card */}
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-secondary/30 p-4">
          <div className="flex items-center gap-3">
            {alert.color && alert.letter ? (
              <VehicleChip letter={alert.letter} color={alert.color} size={36} />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
                <Icon name="directions_car" className="text-muted-foreground" />
              </div>
            )}
            <div>
              <div className="font-semibold text-foreground text-[15px]">{alert.driver}</div>
              <div className="text-[12px] text-muted-foreground">Needs immediate roadside help</div>
            </div>
          </div>
          {distanceM !== undefined && (
            <div className="text-right">
              <div className="font-mono text-[16px] font-bold text-foreground">
                {formatDistance(distanceM)}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                from you
              </div>
            </div>
          )}
        </div>

        {/* Coordinates and Google Maps Link */}
        <div className="mt-3 rounded-2xl border border-border/70 bg-card p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              GPS Location
            </span>
            <span className="font-mono text-[13px] font-semibold text-foreground select-all">
              {alert.lat.toFixed(5)}, {alert.lng.toFixed(5)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-[12px]">
            <a
              href={alert.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-primary underline truncate select-all"
            >
              {alert.mapsUrl}
              <Icon name="open_in_new" className="text-[13px] shrink-0" />
            </a>
            <button
              onClick={handleCopy}
              className="shrink-0 flex items-center gap-1 rounded px-2 py-0.5 font-semibold text-muted-foreground hover:text-foreground"
            >
              <Icon name={copied ? "check" : "content_copy"} className="text-[13px]" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Primary Action: Change GPS to SOS Location */}
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            onClick={() => onRerouteGps([alert.lng, alert.lat], alert.driver)}
            className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-alert text-alert-foreground text-[16px] font-bold shadow-lg hover:opacity-95 active:scale-[0.98] transition-all"
          >
            <Icon name="navigation" className="text-[22px]" />
            Change GPS Navigation to Driver
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <a
              href={dirUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-3 text-[14px] font-semibold text-foreground hover:bg-secondary/80 active:scale-[0.98] transition-all"
            >
              <Icon name="map" className="text-[18px]" />
              Google Maps
            </a>

            <button
              onClick={handleShare}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-3 text-[14px] font-semibold text-foreground hover:bg-secondary/80 active:scale-[0.98] transition-all"
            >
              <Icon name="share" className="text-[18px]" />
              Share Link
            </button>
          </div>

          <button
            onClick={onDismiss}
            className="mt-1 flex min-h-10 items-center justify-center text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Dismiss Alert
          </button>
        </div>
      </div>
    </div>
  );
}
