import { useState } from "react";
import { z } from "zod";
import { tripStore, useTrip, VEHICLE_COLORS, type Role, type VehicleColor } from "@/lib/trip-store";
import { cn } from "@/lib/utils";
import { Button, Field, Icon, Segmented, VehicleChip, vehicleBg } from "./ui";

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  vehicleLabel: z.string().trim().min(1).max(24),
});

/** Vehicle setup then explicit per-trip location consent. Calls onDone after consent is recorded. */
export function JoinSteps({ onDone, takenColors = [] }: { onDone: () => void | Promise<void>; takenColors?: VehicleColor[] }) {
  const me = useTrip((s) => s.me);
  const tripName = useTrip((s) => s.trip?.name ?? "this trip");
  const [step, setStep] = useState<"vehicle" | "consent">("vehicle");
  const [displayName, setDisplayName] = useState(me.displayName || "Driver");
  const [vehicleLabel, setVehicleLabel] = useState(me.vehicleLabel || "My car");
  const [color, setColor] = useState<VehicleColor>(me.color);
  const [role, setRole] = useState<Role>(me.role);
  const [vehicleType, setVehicleType] = useState<"car" | "bike">(me.vehicleType);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleContinue = () => {
    const finalName = displayName.trim() || "Driver";
    const finalVehicle = vehicleLabel.trim() || (vehicleType === "bike" ? "My bike" : "My car");
    tripStore.updateMe({
      displayName: finalName,
      vehicleLabel: finalVehicle,
      color,
      role,
      vehicleType,
    });
    setStep("consent");
  };

  if (step === "vehicle")
    return (
      <form onSubmit={(e) => { e.preventDefault(); handleContinue(); }} className="screen-in space-y-5">
        <h2 className="text-[22px] font-semibold">Your vehicle</h2>
        <Field label="Your name" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} placeholder="First name" />
        <div>
          <div className="mb-2 text-[14px] font-medium">Vehicle type</div>
          <Segmented label="Vehicle type" value={vehicleType} onChange={(v) => { setVehicleType(v); if (vehicleLabel === "My car" || vehicleLabel === "My bike") setVehicleLabel(v === "bike" ? "My bike" : "My car"); }} options={[{ value: "car", label: "Car" }, { value: "bike", label: "Bike" }]} />
        </div>
        <Field label="Vehicle name" value={vehicleLabel} maxLength={24} onChange={(e) => setVehicleLabel(e.target.value)} />
        <div>
          <div className="mb-2 text-[14px] font-medium">Vehicle color</div>
          <div role="radiogroup" aria-label="Vehicle color" className="grid grid-cols-8 gap-2">
            {VEHICLE_COLORS.map((c, i) => {
              const taken = takenColors.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Color ${i + 1}${taken ? ", taken" : ""}`}
                  disabled={taken}
                  onClick={() => setColor(c)}
                  className={cn("flex aspect-square items-center justify-center rounded-[8px] disabled:opacity-25 cursor-pointer", vehicleBg(c), color === c && "outline-2 outline-offset-2 outline-foreground")}
                >
                  {color === c && <Icon name="check" className="text-[20px]" />}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[14px] font-medium">You are the</div>
          <Segmented label="Role" value={role} onChange={setRole} options={[{ value: "driver", label: "Driver" }, { value: "passenger", label: "Passenger" }]} />
          <p className="mt-2 text-[12px] text-tertiary">Drivers get larger buttons and typing is turned off while moving.</p>
        </div>
        <Button
          type="submit"
          className="w-full cursor-pointer"
          size="lg"
        >
          Continue to Location Consent
        </Button>
      </form>
    );

  return (
    <div className="screen-in space-y-5">
      <div className="flex items-center gap-3">
        <VehicleChip letter="A" color={color} size={40} ring="me" />
        <h2 className="text-[22px] font-semibold">Share your location for this trip?</h2>
      </div>
      <ul className="space-y-3 rounded-[14px] border border-border bg-card p-4 text-[16px]">
        {[
          ["group", `Only members of ${tripName} can see your live position.`],
          ["schedule", "Sharing runs only while this trip is active, and stops when it ends or you leave."],
          ["visibility", "A sharing indicator stays on screen the whole time."],
          ["delete", "Live positions are not kept. Your trip history is deleted after 30 days unless you save it."],
          ["logout", "You can stop sharing and leave at any time."],
        ].map(([icon, text]) => (
          <li key={icon} className="flex gap-3">
            <Icon name={icon ?? ""} className="text-primary" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      {err && <p role="alert" className="text-[14px] text-alert">{err}</p>}
      <Button
        className="w-full cursor-pointer"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            tripStore.updateMe({ consentAt: Date.now() });
            await onDone();
          } catch (e) {
            tripStore.updateMe({ consentAt: null });
            setErr(e instanceof Error ? e.message : "Could not join the trip.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <Icon name="sync" className="animate-spin text-[18px]" />
            Joining trip...
          </span>
        ) : (
          "Share location for this trip"
        )}
      </Button>
      <Button type="button" variant="quiet" className="w-full cursor-pointer" onClick={() => setStep("vehicle")}>
        Not now
      </Button>
    </div>
  );
}
