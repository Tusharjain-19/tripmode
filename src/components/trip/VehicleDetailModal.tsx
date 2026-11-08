import { useState } from "react";
import { Icon, VehicleChip } from "./ui";
import { formatDistance } from "@/lib/nav";
import { generateGoogleMapsDirectionsLink, generateGoogleMapsLink } from "@/lib/sos";
import type { SimVehicle } from "@/lib/simulation";

type Props = {
  vehicle: SimVehicle | null;
  currentCoords?: [number, number] | null;
  distanceM?: number | undefined;
  onNavigateTo: (lngLat: [number, number], driver: string) => void;
  onFocusCamera: (id: string) => void;
  onClose: () => void;
};

export function VehicleDetailModal({
  vehicle,
  currentCoords,
  distanceM,
  onNavigateTo,
  onFocusCamera,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);

  if (!vehicle) return null;

  const lat = currentCoords ? currentCoords[1] : 0;
  const lng = currentCoords ? currentCoords[0] : 0;
  const hasCoords = lat !== 0 || lng !== 0;
  const mapsUrl = generateGoogleMapsLink(lat, lng);
  const dirUrl = generateGoogleMapsDirectionsLink(lat, lng);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(mapsUrl);
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
    const shareText = `Convoy Vehicle Location: ${vehicle.driver} (${vehicle.name}). Live coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}. Google Maps link: ${mapsUrl}`;
    if (bridge?.share) {
      bridge.share("Vehicle Location", shareText, mapsUrl);
      return;
    }
    if (navigator.share) {
      navigator.share({ title: `${vehicle.driver}'s Location`, text: shareText, url: mapsUrl }).catch(() => undefined);
    } else {
      void handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="flex w-full max-w-md flex-col rounded-t-[26px] sm:rounded-[26px] border border-border bg-card p-5 shadow-float">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VehicleChip letter={vehicle.letter} color={vehicle.color} size={42} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-[17px]">{vehicle.driver}</span>
                {vehicle.role === "passenger" && (
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Passenger
                  </span>
                )}
              </div>
              <div className="text-[12px] text-muted-foreground">{vehicle.name}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Telemetry row */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border/80 bg-secondary/30 p-3 text-center">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Speed
            </div>
            <div className="font-mono text-[16px] font-bold text-foreground">
              {Math.round(vehicle.speedKmh)} <span className="text-[11px] font-normal">km/h</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Distance
            </div>
            <div className="font-mono text-[16px] font-bold text-foreground">
              {distanceM !== undefined ? formatDistance(distanceM) : "--"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </div>
            <div className="text-[12px] font-semibold text-foreground truncate">
              {vehicle.stoppedForS > 30 ? "Stopped" : vehicle.offRouteForS > 60 ? "Off Route" : "Rolling"}
            </div>
          </div>
        </div>

        {/* Coordinates link */}
        {hasCoords && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-card p-2.5 text-[12px]">
            <span className="font-mono text-muted-foreground select-all">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </span>
            <div className="flex items-center gap-2">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-semibold text-primary underline"
              >
                Maps <Icon name="open_in_new" className="text-[13px]" />
              </a>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-muted-foreground hover:text-foreground"
              >
                <Icon name={copied ? "check" : "content_copy"} className="text-[13px]" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-col gap-2">
          {hasCoords && !vehicle.isMe && (
            <button
              onClick={() => onNavigateTo([lng, lat], vehicle.driver)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold text-[15px] shadow-sm hover:bg-primary-pressed active:scale-[0.98] transition-all"
            >
              <Icon name="navigation" className="text-[20px]" />
              Set GPS Navigation to Vehicle
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onFocusCamera(vehicle.id)}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary text-[13px] font-semibold text-foreground hover:bg-secondary/80 active:scale-[0.98]"
            >
              <Icon name="center_focus_strong" className="text-[18px]" />
              Focus on Map
            </button>
            <a
              href={dirUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary text-[13px] font-semibold text-foreground hover:bg-secondary/80 active:scale-[0.98]"
            >
              <Icon name="map" className="text-[18px]" />
              Open in Maps
            </a>
          </div>

          <button
            onClick={handleShare}
            className="flex min-h-10 items-center justify-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <Icon name="share" className="text-[16px]" />
            Share Vehicle Location Link
          </button>
        </div>
      </div>
    </div>
  );
}
