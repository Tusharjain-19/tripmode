import { useState } from "react";
import { Icon } from "./ui";
import type { SosPayload } from "@/lib/sos";

type Props = {
  open: boolean;
  payload: SosPayload | null;
  onClose: () => void;
  onResolve: () => void;
};

export function SosSenderModal({ open, payload, onClose, onResolve }: Props) {
  const [copied, setCopied] = useState(false);

  if (!open || !payload) return null;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(payload.mapsUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // fallback
    }
  };

  const handleShare = () => {
    // If running in Android WebView wrapper with native share bridge
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bridge = (window as any).AndroidBridge;
    if (bridge?.share) {
      bridge.share("Emergency SOS Coordinates", payload.shareText, payload.mapsUrl);
      return;
    }

    if (navigator.share) {
      navigator
        .share({
          title: "Convoy Emergency SOS",
          text: payload.shareText,
          url: payload.mapsUrl,
        })
        .catch(() => undefined);
    } else {
      void handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex w-full max-w-lg flex-col rounded-t-[28px] sm:rounded-[28px] border-2 border-alert bg-card p-6 shadow-float">
        {/* Header with emergency beacon */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-alert/20 text-alert">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-alert opacity-60" />
              <Icon name="emergency" className="text-[24px]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-alert animate-pulse" />
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-alert">
                  SOS Active
                </span>
              </div>
              <h2 className="text-[19px] font-bold text-foreground">Emergency Broadcast Sent</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground active:scale-95"
            aria-label="Minimize SOS sheet"
          >
            <Icon name="close" />
          </button>
        </div>

        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          Your live GPS coordinates have been transmitted to all convoy members. You can also share
          your direct map link with family, emergency services, or local mechanics.
        </p>

        {/* Coordinates & Google Maps Link Card */}
        <div className="mt-4 rounded-2xl border border-border/80 bg-secondary/40 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              GPS Coordinates
            </div>
            <a
              href={payload.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary underline"
            >
              Open in Maps
              <Icon name="open_in_new" className="text-[14px]" />
            </a>
          </div>

          <div className="mt-2 font-mono text-[16px] font-bold text-foreground select-all">
            {payload.lat.toFixed(5)}, {payload.lng.toFixed(5)}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
            <div className="truncate font-mono text-[12px] text-muted-foreground select-all">
              {payload.mapsUrl}
            </div>
            <button
              onClick={handleCopy}
              className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-foreground hover:bg-secondary active:scale-95 transition-colors"
            >
              <Icon name={copied ? "check" : "content_copy"} className="text-[14px]" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* WhatsApp 1-tap share */}
          <a
            href={payload.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-[14px] font-semibold text-white shadow-sm hover:bg-emerald-500 active:scale-[0.98] transition-all"
          >
            <Icon name="share" className="text-[20px]" />
            Share via WhatsApp
          </a>

          {/* System Share (SMS / Other Apps) */}
          <button
            onClick={handleShare}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-secondary border border-border px-4 text-[14px] font-semibold text-foreground hover:bg-secondary/80 active:scale-[0.98] transition-all"
          >
            <Icon name="send_to_mobile" className="text-[20px]" />
            Share Link / SMS
          </button>
        </div>

        {/* Resolve or Minimize footer */}
        <div className="mt-5 flex flex-col gap-2 border-t border-border/60 pt-4">
          <button
            onClick={onResolve}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-alert text-alert-foreground text-[15px] font-bold shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <Icon name="verified" className="text-[20px]" />
            I Am Safe • End SOS Broadcast
          </button>

          <button
            onClick={onClose}
            className="flex min-h-11 w-full items-center justify-center text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Keep SOS Active in Background
          </button>
        </div>
      </div>
    </div>
  );
}
