import { useState, useRef } from "react";
import { Icon, Button } from "@/components/trip/ui";

interface ShareCardModalProps {
  tripName: string;
  destination: string;
  inviteCode: string;
  memberCount: number;
  qrSvg: string;
  onClose: () => void;
}

export function ShareCardModal({
  tripName,
  destination,
  inviteCode,
  memberCount,
  qrSvg,
  onClose,
}: ShareCardModalProps) {
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${inviteCode}`
      : `https://tripmode-orcin.vercel.app/join/${inviteCode}`;

  const shareToWhatsApp = () => {
    const text = encodeURIComponent(
      `Join our live road trip convoy on Trip Mode!\n\nTrip: ${tripName}\nDestination: ${destination}\nRoom Code: ${inviteCode}\n\nTap to join live on the convoy map:\n${inviteUrl}`,
    );
    if (typeof window !== "undefined") {
      window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
    }
  };

  const downloadPoster = async () => {
    setDownloading(true);
    try {
      // Create a canvas poster with the Trip Mode branding, QR SVG, and convoy details
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Dark Pine green luxury background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 1350);
      grad.addColorStop(0, "#0c241c");
      grad.addColorStop(1, "#071712");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1350);

      // Card Background
      ctx.fillStyle = "#143328";
      ctx.roundRect(70, 70, 940, 1210, 48);
      ctx.fill();

      // Top Header
      ctx.fillStyle = "#56B4E9";
      ctx.font = "bold 32px sans-serif";
      ctx.fillText("TRIP MODE CONVOY", 120, 160);

      // Trip Name
      ctx.fillStyle = "#F7F5F0";
      ctx.font = "bold 64px sans-serif";
      ctx.fillText(tripName.slice(0, 26), 120, 250);

      // Destination
      ctx.fillStyle = "#9ba39f";
      ctx.font = "500 36px sans-serif";
      ctx.fillText(`Heading to: ${destination}`, 120, 310);

      // Draw SVG QR code
      const img = new Image();
      const svgBlob = new Blob([qrSvg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      await new Promise<void>((resolve) => {
        img.onload = () => {
          // White background box for QR code
          ctx.fillStyle = "#FFFFFF";
          ctx.roundRect(265, 380, 550, 550, 36);
          ctx.fill();

          ctx.drawImage(img, 305, 420, 470, 470);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.src = url;
      });

      // Room Code Pill
      ctx.fillStyle = "#1c4a3b";
      ctx.roundRect(240, 970, 600, 100, 30);
      ctx.fill();

      ctx.fillStyle = "#F7F5F0";
      ctx.font = "bold 44px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`CODE: ${inviteCode}`, 540, 1035);

      // Subtext
      ctx.font = "32px sans-serif";
      ctx.fillStyle = "#a8b5af";
      ctx.fillText("Scan with phone camera to join live map", 540, 1140);
      ctx.fillText(`Active Convoy • ${memberCount} Vehicle${memberCount === 1 ? "" : "s"} Connected`, 540, 1200);

      // Trigger download
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `convoy-${inviteCode}.png`;
      a.click();
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[28px] border border-border bg-card p-6 shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-border/80">
          <div className="flex items-center gap-2">
            <Icon name="photo_camera" className="text-primary text-[22px]" />
            <h3 className="text-[17px] font-semibold text-foreground">Share Convoy Card</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary text-muted-foreground cursor-pointer"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>

        {/* Story Card Preview */}
        <div
          ref={cardRef}
          className="my-4 rounded-[22px] bg-gradient-to-b from-[#143d30] to-[#0a2019] p-5 text-center text-white shadow-inner border border-emerald-900/60"
        >
          <div className="text-[11px] font-bold tracking-widest text-[#56B4E9] uppercase">
            Trip Mode Convoy
          </div>
          <div className="mt-1 font-bold text-[20px] leading-tight truncate text-[#F7F5F0]">
            {tripName}
          </div>
          <div className="text-[13px] text-neutral-300 truncate mt-0.5">
            To: {destination}
          </div>

          {/* QR Code Container */}
          <div className="my-3.5 mx-auto flex h-40 w-40 items-center justify-center rounded-2xl bg-white p-2.5 shadow-sm">
            <div
              className="h-full w-full [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </div>

          <div className="inline-block rounded-full bg-emerald-950/80 border border-emerald-700/50 px-4 py-1.5 font-mono text-[14px] font-bold text-white tracking-widest shadow-xs">
            {inviteCode}
          </div>
          <div className="mt-2 text-[11px] text-neutral-300">
            Scan to join directly on live map
          </div>
        </div>

        {/* Actions: Direct WhatsApp & Download Poster */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={shareToWhatsApp}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-white font-semibold text-[14px] shadow-sm hover:opacity-95 active:scale-95 transition-all cursor-pointer"
          >
            <Icon name="chat" className="text-[18px]" />
            <span>Share to WhatsApp</span>
          </button>

          <Button
            variant="secondary"
            className="w-full h-11 text-[14px] cursor-pointer"
            onClick={() => void downloadPoster()}
            disabled={downloading}
          >
            <Icon name="download" className="text-[18px]" />
            <span>{downloading ? "Generating Poster..." : "Save Poster to Gallery"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
