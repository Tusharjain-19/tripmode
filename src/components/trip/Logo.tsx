import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string | undefined;
  size?: number | undefined;
  variant?: "mark" | "full" | "monochrome" | undefined;
  theme?: "light" | "dark" | "auto" | undefined;
}

/**
 * Trip Mode Official Emblem
 * Inspired by cartography, aviation instrumentation, and collaborative convoy movement.
 * Built with precision geometry: deep pine squircle, centerline guide, and 3 nested convoy chevrons.
 */
export function Logo({ className, size = 40, variant = "mark" }: LogoProps) {
  if (variant === "full") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <LogoMark size={size} />
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-tight text-[20px] text-foreground leading-none">
              Trip Mode
            </span>
            <span className="rounded-full border border-border bg-secondary/80 px-2 py-0.5 text-[10px] font-mono font-medium tracking-wider text-muted-foreground uppercase">
              Convoy
            </span>
          </div>
          <span className="text-[12px] text-muted-foreground tracking-normal font-normal mt-0.5">
            Multi-vehicle navigation
          </span>
        </div>
      </div>
    );
  }

  return <LogoMark size={size} className={className} />;
}

export function LogoMark({
  size = 40,
  className,
}: {
  size?: number | undefined;
  className?: string | undefined;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="none"
      className={cn("shrink-0 select-none", className)}
      aria-label="Trip Mode Logo"
      role="img"
    >
      {/* Precision Instrument Rounded Squircle Background */}
      <rect width="120" height="120" rx="28" fill="#143D30" />
      <rect
        x="1"
        y="1"
        width="118"
        height="118"
        rx="27"
        stroke="#F7F5F0"
        strokeOpacity="0.1"
        strokeWidth="1.5"
      />

      {/* Subtle Speed & Alignment Centerline */}
      <line
        x1="60"
        y1="16"
        x2="60"
        y2="104"
        stroke="#F7F5F0"
        strokeOpacity="0.15"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 6"
      />

      {/* Lead Convoy Vanguard (Vehicle 1 - Pure Warm White) */}
      <path d="M 60 22 L 86 58 L 60 50 L 34 58 Z" fill="#F7F5F0" />
      <circle cx="60" cy="40" r="3" fill="#143D30" />

      {/* Escort Convoy Vehicle (Vehicle 2 - Okabe-Ito Sky Blue) */}
      <path d="M 60 56 L 79 80 L 60 73 L 41 80 Z" fill="#56B4E9" />
      <circle cx="60" cy="67" r="2.5" fill="#143D30" />

      {/* Sweep Convoy Vehicle (Vehicle 3 - Okabe-Ito Warm Amber) */}
      <path d="M 60 78 L 72 96 L 60 91 L 48 96 Z" fill="#E69F00" />
    </svg>
  );
}
