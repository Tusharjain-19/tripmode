import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Icon } from "./ui";

type Props = {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
};

export function QrScannerModal({ open, onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Helper to extract invite code from raw scanned text or URL
  const extractCode = (raw: string): string | null => {
    const text = raw.trim();
    if (!text) return null;

    // Pattern 1: URL like https://tripmode.app/join/ABC123 or .../join/ABC123
    const urlMatch = text.match(/\/join\/([A-Za-z0-9_-]{4,12})/i);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1].toUpperCase();
    }

    // Pattern 2: Query param like ?code=ABC123
    const queryMatch = text.match(/[?&]code=([A-Za-z0-9_-]{4,12})/i);
    if (queryMatch && queryMatch[1]) {
      return queryMatch[1].toUpperCase();
    }

    // Pattern 3: Raw alphanumeric code (4-10 chars)
    const rawClean = text.replace(/[^A-Za-z0-9]/g, "");
    if (rawClean.length >= 4 && rawClean.length <= 12) {
      return rawClean.toUpperCase();
    }

    return null;
  };

  const stopCamera = () => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async (mode: "environment" | "user") => {
    stopCamera();
    setErrorMsg(null);
    setHasPermission(null);

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("Camera API is not supported on this device/browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        scanFrame();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to access camera.";
      setHasPermission(false);
      setErrorMsg(
        msg.includes("Permission denied") || msg.includes("NotAllowedError")
          ? "Camera permission denied. Please grant camera access in phone settings or upload a QR image below."
          : "Unable to start camera. You can also upload a photo of the QR code.",
      );
    }
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      animRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code?.data) {
      const extracted = extractCode(code.data);
      if (extracted) {
        navigator.vibrate?.([60, 40, 60]);
        stopCamera();
        onScan(extracted);
        return;
      }
    }

    animRef.current = requestAnimationFrame(scanFrame);
  };

  // Image file upload fallback
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          const extracted = extractCode(code.data);
          if (extracted) {
            navigator.vibrate?.([60, 40, 60]);
            stopCamera();
            onScan(extracted);
            return;
          }
        }
        setErrorMsg("No valid Trip Mode QR code found in the selected photo.");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (open) {
      void startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facingMode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex w-full max-w-sm flex-col rounded-[26px] border border-border bg-card p-5 shadow-float overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon name="qr_code_scanner" className="text-[22px]" />
            </div>
            <div>
              <h3 className="text-[17px] font-bold text-foreground">Scan Convoy QR</h3>
              <p className="text-[11px] text-muted-foreground">Point camera at host's invite code</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground active:scale-95"
            aria-label="Close scanner"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="relative mt-4 aspect-square w-full overflow-hidden rounded-2xl bg-black flex items-center justify-center border border-border/80">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Target Scanner Reticle */}
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
            {/* Corner accents */}
            <span className="absolute -top-1 -left-1 h-4 w-4 border-t-4 border-l-4 border-primary rounded-tl-sm" />
            <span className="absolute -top-1 -right-1 h-4 w-4 border-t-4 border-r-4 border-primary rounded-tr-sm" />
            <span className="absolute -bottom-1 -left-1 h-4 w-4 border-b-4 border-l-4 border-primary rounded-bl-sm" />
            <span className="absolute -bottom-1 -right-1 h-4 w-4 border-b-4 border-r-4 border-primary rounded-br-sm" />

            {/* Pulsing scan laser */}
            <span className="absolute inset-x-2 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse" />
          </div>

          {/* Error / Permission State Overlay */}
          {errorMsg && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/90 p-5 text-center">
              <Icon name="videocam_off" className="text-[36px] text-alert mb-2" />
              <p className="text-[13px] text-muted-foreground leading-snug">{errorMsg}</p>
              <button
                type="button"
                onClick={() => void startCamera(facingMode)}
                className="mt-3 flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-[12px] font-semibold text-foreground hover:bg-secondary/80 active:scale-95"
              >
                <Icon name="refresh" className="text-[16px]" />
                Try Camera Again
              </button>
            </div>
          )}
        </div>

        {/* Camera Controls & Image Upload Fallback */}
        <div className="mt-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setFacingMode((m) => (m === "environment" ? "user" : "environment"))}
              className="flex-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary text-[13px] font-semibold text-foreground hover:bg-secondary/80 active:scale-95 cursor-pointer"
            >
              <Icon name="flip_camera_ios" className="text-[18px]" />
              Flip Camera
            </button>

            <label className="flex-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary text-[13px] font-semibold text-foreground hover:bg-secondary/80 active:scale-95 cursor-pointer">
              <Icon name="photo_library" className="text-[18px]" />
              Choose Photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex min-h-10 items-center justify-center text-[13px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Cancel & Enter Code Manually
          </button>
        </div>
      </div>
    </div>
  );
}
