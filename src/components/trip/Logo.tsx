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
 * Built with precision geometry: gauge ring, route polyline, lead navigation wedge, and convoy nodes.
 */
export function Logo({ className, size = 40, variant = "mark" }: LogoProps) {
  if (variant === "full") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <LogoMark size={size} />
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight text-[20px] text-foreground leading-none">
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
      <rect width="120" height="120" rx="32" className="fill-primary" />

      {/* Subtle Instrument Calibration Ring (Aviation & Cartography) */}
      <circle
        cx="60"
        cy="60"
        r="44"
        stroke="#F7F5F0"
        strokeWidth="1.5"
        strokeOpacity="0.18"
        strokeDasharray="3 3"
      />

      {/* Cardinal Alignment Ticks */}
      <line
        x1="60"
        y1="12"
        x2="60"
        y2="18"
        stroke="#F7F5F0"
        strokeWidth="2"
        strokeOpacity="0.4"
        strokeLinecap="round"
      />
      <line
        x1="60"
        y1="102"
        x2="60"
        y2="108"
        stroke="#F7F5F0"
        strokeWidth="2"
        strokeOpacity="0.25"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="60"
        x2="18"
        y2="60"
        stroke="#F7F5F0"
        strokeWidth="2"
        strokeOpacity="0.25"
        strokeLinecap="round"
      />
      <line
        x1="102"
        y1="60"
        x2="108"
        y2="60"
        stroke="#F7F5F0"
        strokeWidth="2"
        strokeOpacity="0.25"
        strokeLinecap="round"
      />

      {/* Convoy Route Polyline (Route Corridor) */}
      <path
        d="M 40 88 C 40 68, 52 56, 60 44"
        stroke="#F7F5F0"
        strokeWidth="4"
        strokeLinecap="round"
        strokeOpacity="0.35"
      />
      <path
        d="M 60 44 C 64 38, 66 32, 66 26"
        stroke="#F7F5F0"
        strokeWidth="4"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />

      {/* Trailing Convoy Vehicle B (Amber Chip) */}
      <circle cx="40" cy="88" r="6" fill="#E69F00" stroke="#16201B" strokeWidth="2" />

      {/* Trailing Convoy Vehicle A (Sky Blue Chip) */}
      <circle cx="56" cy="54" r="7" fill="#56B4E9" stroke="#16201B" strokeWidth="2" />

      {/* Lead Vehicle (Precision Directional Wedge / Heading Arrow) */}
      <path
        d="M 66 18 L 78 40 L 66 35 L 54 40 Z"
        fill="#F7F5F0"
        stroke="#16201B"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Lead Vehicle Core Node */}
      <circle cx="66" cy="30" r="2.5" fill="#1B5A47" />
    </svg>
  );
}
