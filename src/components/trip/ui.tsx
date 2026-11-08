import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { ON_VEHICLE, type VehicleColor } from "@/lib/trip-store";

export function Icon({
  name,
  className,
  label,
  style,
}: {
  name: string;
  className?: string | undefined;
  label?: string | undefined;
  style?: React.CSSProperties | undefined;
}) {
  return (
    <span
      className={cn("ms text-[24px]", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      style={style}
    >
      {name}
    </span>
  );
}

export const btn = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium text-[16px] min-h-12 px-5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-pressed",
        secondary: "bg-card text-foreground border border-border hover:bg-secondary",
        quiet: "text-primary hover:bg-secondary",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
      },
      size: { md: "", lg: "min-h-16 text-[18px] px-6", icon: "w-12 px-0" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof btn>) {
  return <button type={type} className={cn(btn({ variant, size }), className)} {...p} />;
}

const colorBg: Record<VehicleColor, string> = {
  v1: "bg-v1",
  v2: "bg-v2",
  v3: "bg-v3",
  v4: "bg-v4",
  v5: "bg-v5",
  v6: "bg-v6",
  v7: "bg-v7",
  v8: "bg-v8",
};
export const vehicleBg = (c: VehicleColor) =>
  cn(colorBg[c], ON_VEHICLE[c] === "dark" ? "text-on-vehicle-dark" : "text-on-vehicle-light");
export const vehicleFill: Record<VehicleColor, string> = {
  v1: "fill-v1",
  v2: "fill-v2",
  v3: "fill-v3",
  v4: "fill-v4",
  v5: "fill-v5",
  v6: "fill-v6",
  v7: "fill-v7",
  v8: "fill-v8",
};

export function VehicleChip({
  letter,
  color,
  vehicleType = "car",
  size = 32,
  ring,
  className,
}: {
  letter?: string | undefined;
  color: VehicleColor;
  vehicleType?: "car" | "bike" | undefined;
  size?: number | undefined;
  ring?: "none" | "caution" | "alert" | "stale" | "me" | undefined;
  className?: string | undefined;
}) {
  const iconSize = Math.max(14, Math.round(size * 0.58));
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[10px] font-semibold transition-transform shadow-xs",
        vehicleBg(color),
        ring === "caution" && "outline-2 outline-dashed outline-offset-2 outline-caution",
        ring === "alert" && "outline-2 outline-solid outline-offset-2 outline-alert",
        ring === "stale" &&
          "outline-2 outline-dashed outline-offset-2 outline-tertiary grayscale opacity-70",
        ring === "me" && "outline-2 outline-solid outline-offset-2 outline-foreground shadow-sm",
        className,
      )}
      style={{ width: size, height: size }}
      title={letter ? `Vehicle ${letter} (${vehicleType})` : `${vehicleType}`}
    >
      <Icon
        name={vehicleType === "bike" ? "two_wheeler" : "directions_car"}
        className="leading-none"
        style={{ fontSize: `${iconSize}px` }}
      />
    </span>
  );
}

export function Screen({
  children,
  title,
  back,
  maxWidth = "max-w-md",
  className,
  headerRight,
  hideBuffer = true,
}: {
  children: ReactNode;
  title?: string;
  back?: string;
  maxWidth?: string;
  className?: string;
  headerRight?: ReactNode;
  hideBuffer?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background transition-colors duration-200">
      <div
        className={cn(
          "screen-in mx-auto flex min-h-screen flex-col px-4 pb-8",
          maxWidth,
          className,
        )}
      >
        {(title || back || headerRight) && (
          <header className="flex h-16 items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {back && (
                <Link
                  to={back}
                  className={btn({ variant: "quiet", size: "icon" })}
                  aria-label="Back"
                >
                  <Icon name="arrow_back" />
                </Link>
              )}
              {title && <h1 className="text-[18px] font-semibold">{title}</h1>}
            </div>
            {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-secondary p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 flex-1 rounded-[6px] text-[14px] font-medium transition-colors cursor-pointer",
            value === o.value
              ? "bg-card text-foreground shadow-float font-semibold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  ...p
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-medium">{label}</span>
      <input
        className="h-12 w-full rounded-lg border border-transparent bg-secondary px-4 text-[16px] outline-none focus:border-ring"
        {...p}
      />
      {hint && <span className="mt-1 block text-[12px] text-tertiary">{hint}</span>}
    </label>
  );
}
