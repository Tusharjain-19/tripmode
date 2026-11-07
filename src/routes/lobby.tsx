import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { JoinSteps } from "@/components/trip/JoinSteps";
import { RouteMap } from "@/components/trip/RouteMap";
import {
  btn,
  Button,
  Field,
  Icon,
  Screen,
  Segmented,
  VehicleChip,
  vehicleBg,
} from "@/components/trip/ui";
import { ROUTES } from "@/lib/geo";
import { tripStore, useTrip, VEHICLE_COLORS, type VehicleColor } from "@/lib/trip-store";
import { RequireAuth } from "@/components/trip/RequireAuth";
import {
  joinTripRemote,
  leaveTripRemote,
  removeMemberRemote,
  setMemberApproval,
  updateMemberRemote,
  updateTripRemote,
  useMembers,
  useRestoreTrip,
} from "@/lib/trip-sync";
import type { Session } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lobby")({
  head: () => ({
    meta: [
      { title: "Trip lobby - Trip Mode" },
      {
        name: "description",
        content: "Invite your group, pick your vehicle and get ready to depart.",
      },
      { property: "og:title", content: "Trip lobby - Trip Mode" },
      {
        property: "og:description",
        content: "Invite your group, pick your vehicle and get ready to depart.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RequireAuth>{(s) => <Lobby session={s} />}</RequireAuth>,
});

function Lobby({ session }: { session: Session }) {
  const uid = session.user.id;
  useRestoreTrip(true);
  const trip = useTrip((s) => s.trip);
  const me = useTrip((s) => s.me);
  const nav = useNavigate();
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const members = useMembers(trip?.id);
  const mine = members.find((m) => m.userId === uid);
  const others = members.filter((m) => m.userId !== uid && m.approved);
  const pending = members.filter((m) => m.userId !== uid && !m.approved);
  const isHost = trip?.hostId === uid;
  const [customizing, setCustomizing] = useState(false);
  const [customType, setCustomType] = useState<"car" | "bike">(
    () => mine?.vehicleType ?? me.vehicleType ?? "car",
  );
  const [customLabel, setCustomLabel] = useState(
    () => mine?.vehicleLabel ?? me.vehicleLabel ?? "My car",
  );
  const [customColor, setCustomColor] = useState<VehicleColor>(
    () => mine?.color ?? me.color ?? "v1",
  );
  const takenColors = others.map((o) => o.color);

  if (!trip)
    return (
      <Screen title="No active trip" back="/" maxWidth="max-w-md">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <Icon name="explore_off" className="text-[48px] text-tertiary" />
          <h2 className="mt-4 text-[20px] font-semibold">No active convoy found</h2>
          <p className="mt-1 text-muted-foreground text-[14px]">
            Start a trip first, then invite your group.
          </p>
          <Link to="/create" className={btn({ className: "mt-6" })}>
            Start a trip
          </Link>
        </div>
      </Screen>
    );

  if (!mine) {
    if (!me.consentAt) {
      return (
        <Screen title={trip.name} back="/" maxWidth="max-w-lg">
          <JoinSteps
            onDone={async () => {
              await joinTripRemote(trip.inviteCode, tripStore.get().me);
            }}
            takenColors={others.map((o) => o.color)}
          />
        </Screen>
      );
    }

    return (
      <Screen title={trip.name} back="/" maxWidth="max-w-md">
        <div className="flex flex-col items-center justify-center p-8 text-center min-h-[40vh]">
          <Icon name="sync" className="animate-spin text-[36px] text-primary" />
          <h2 className="mt-4 text-[20px] font-semibold">Joining convoy...</h2>
          <p className="mt-1 text-muted-foreground text-[14px]">
            Connecting your vehicle to the room.
          </p>
        </div>
      </Screen>
    );
  }

  if (mine && !mine.approved)
    return (
      <Screen title={trip.name} back="/" maxWidth="max-w-lg">
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary">
            <Icon name="hourglass_top" className="text-[36px]" />
          </div>
          <h2 className="mt-4 text-[22px] font-semibold">Waiting for host approval</h2>
          <p className="mt-2 text-[14px] text-muted-foreground max-w-xs">
            The host must approve your vehicle before location sharing begins. This screen updates
            in real time.
          </p>
          <Button
            variant="quiet"
            className="mt-6 w-full cursor-pointer"
            onClick={async () => {
              if (trip.id) await leaveTripRemote(trip.id, uid);
              tripStore.leave();
              tripStore.setTrip(null);
              nav({ to: "/" });
            }}
          >
            Cancel request & leave
          </Button>
        </div>
      </Screen>
    );

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${trip.inviteCode}`
      : `/join/${trip.inviteCode}`;
  const share = async () => {
    if (navigator.share) {
      await navigator
        .share({ title: trip.name, text: `Join ${trip.name} on Trip Mode Convoy`, url: link })
        .catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeRoute = ROUTES[trip.routeIndex] ?? ROUTES[0];
  const allReady = (mine?.ready ?? me.ready) && others.length > 0 && others.every((o) => o.ready);

  return (
    <Screen
      title={trip.name}
      back="/"
      maxWidth="max-w-5xl lg:max-w-6xl"
      className="px-3 sm:px-6 lg:px-8"
      headerRight={
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-semibold bg-secondary px-2.5 py-1 rounded-full text-foreground border border-border">
            Code: {trip.inviteCode}
          </span>
        </div>
      }
    >
      {/* Responsive Cockpit Layout: 12-Column Grid on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Route Overview & Share Card (Col 1 to 6) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Google Maps Route Header Card */}
          <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-float">
            <div className="relative">
              <RouteMap
                selected={trip.routeIndex}
                showAlternates={false}
                className="block h-48 sm:h-56 lg:h-64 w-full"
              />
              <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-card/95 px-3 py-1 shadow-sm text-[12px] font-mono backdrop-blur-xs border border-border/80">
                <span className="h-2 w-2 rounded-full bg-leading" />
                <span>
                  {activeRoute?.via} • {activeRoute?.km} km
                </span>
              </div>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Agreed Convoy Route
                </div>
                <div className="text-[17px] font-semibold truncate text-foreground">
                  {trip.origin} → {trip.destination}
                </div>
              </div>
              <span className="font-mono text-[15px] font-semibold text-primary">
                {activeRoute?.hours}
              </span>
            </div>
          </div>

          {/* Invite Sheet */}
          <section className="rounded-[20px] border border-border bg-card p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="share" className="text-primary text-[20px]" />
                <h2 className="text-[16px] sm:text-[17px] font-semibold text-foreground">
                  Invite Convoy Members
                </h2>
              </div>
              <span className="text-[12px] text-tertiary">Expires in 24 h</span>
            </div>

            {trip.inviteRevoked ? (
              <p className="mt-3 text-[14px] text-alert">
                This invite link has been revoked. Existing members remain connected.
              </p>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5">
                <Icon name="link" className="text-muted-foreground text-[18px] shrink-0" />
                <span className="flex-1 truncate font-mono text-[13px]">{link}</span>
              </div>
            )}

            <div className="mt-3.5 flex flex-wrap gap-2.5">
              <Button
                onClick={share}
                disabled={trip.inviteRevoked}
                className="flex-1 cursor-pointer"
              >
                <Icon name={copied ? "check" : "share"} />
                {copied ? "Link Copied!" : "Share Link"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setQrOpen(true)}
                className="cursor-pointer"
              >
                <Icon name="qr_code_2" />
                QR Code
              </Button>
              {isHost && (
                <Button
                  variant="quiet"
                  onClick={() => {
                    tripStore.regenerateInvite();
                    const t = tripStore.get().trip;
                    if (t?.id)
                      void updateTripRemote(t.id, {
                        invite_code: t.inviteCode,
                        invite_revoked: false,
                      });
                  }}
                  title="Generate new invite link"
                  className="cursor-pointer"
                >
                  <Icon name="refresh" />
                </Button>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Approvals, Roster & Depart (Col 7 to 12) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Pending Approval Section */}
          {isHost && pending.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="overline text-caution font-semibold">
                  Waiting for your approval ({pending.length})
                </h2>
              </div>
              <ul className="divide-y divide-border rounded-[18px] border border-caution/60 bg-caution/5 overflow-hidden">
                {pending.map((o) => (
                  <li
                    key={o.userId}
                    className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2.5"
                  >
                    <VehicleChip letter={o.letter} color={o.color} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[15px]">{o.displayName}</div>
                      <div className="text-[13px] text-muted-foreground">
                        {o.vehicleLabel} • {o.vehicleType === "bike" ? "Two-wheeler" : "Car"}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="md"
                        className="h-9 px-3 text-[13px] cursor-pointer"
                        onClick={() => void setMemberApproval(trip.id!, o.userId, true)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="quiet"
                        size="md"
                        className="h-9 px-3 text-[13px] cursor-pointer"
                        onClick={() => void removeMemberRemote(trip.id!, o.userId)}
                      >
                        Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Active Convoy Roster */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="overline text-tertiary">
                Connected Vehicles ({members.length - pending.length})
              </h2>
              {allReady && (
                <span className="flex items-center gap-1 text-[12px] font-semibold text-leading">
                  <Icon name="check_circle" className="text-[16px]" /> All ready to roll!
                </span>
              )}
            </div>

            <ul className="divide-y divide-border rounded-[20px] border border-border bg-card shadow-sm overflow-hidden">
              {/* Current User */}
              <li className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-3 bg-primary/5">
                <VehicleChip
                  letter={mine?.letter ?? "A"}
                  color={mine?.color ?? me.color}
                  vehicleType={mine?.vehicleType ?? me.vehicleType}
                  ring="me"
                  size={40}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[15px] text-foreground truncate">
                      {mine?.vehicleLabel ?? me.vehicleLabel}
                    </span>
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded-full">
                      You{isHost ? " • Host" : ""}
                    </span>
                  </div>
                  <div className="text-[13px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span>{me.displayName}</span>
                    <span>•</span>
                    <span className="font-medium text-foreground">
                      {(mine?.vehicleType ?? me.vehicleType) === "bike"
                        ? "Two-wheeler (Bike)"
                        : "Car"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomType(mine?.vehicleType ?? me.vehicleType);
                      setCustomLabel(mine?.vehicleLabel ?? me.vehicleLabel);
                      setCustomColor(mine?.color ?? me.color);
                      setCustomizing(true);
                    }}
                    className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12px] font-semibold text-foreground hover:bg-secondary transition-all cursor-pointer shadow-xs"
                    title="Change vehicle type (car/bike) and color"
                  >
                    <Icon name="palette" className="text-[16px] text-primary" />
                    <span>Change</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const r = !(mine?.ready ?? me.ready);
                      tripStore.updateMe({ ready: r });
                      if (trip.id) void updateMemberRemote(trip.id, uid, { ready: r });
                    }}
                    aria-pressed={mine?.ready ?? me.ready}
                    className={cn(
                      "min-h-9 rounded-full px-3.5 text-[12px] font-semibold transition-all shadow-xs cursor-pointer",
                      (mine?.ready ?? me.ready)
                        ? "bg-leading text-white shadow-leading/20"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                    )}
                  >
                    {(mine?.ready ?? me.ready) ? "Ready ✓" : "Tap when ready"}
                  </button>
                </div>
              </li>

              {/* Other Members */}
              {others.map((o) => (
                <li
                  key={o.userId}
                  className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-secondary/20"
                >
                  <VehicleChip
                    letter={o.letter}
                    color={o.color}
                    vehicleType={o.vehicleType}
                    size={36}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[15px] text-foreground">
                      {o.vehicleLabel}{" "}
                      <span className="text-[12px] text-muted-foreground">
                        ({o.vehicleType === "bike" ? "Bike" : "Car"})
                      </span>
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      {o.displayName} • {o.role === "driver" ? "Driver" : "Passenger"}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[13px] font-semibold flex items-center gap-1.5",
                      o.ready ? "text-leading" : "text-tertiary",
                    )}
                  >
                    <span
                      className={cn("h-2 w-2 rounded-full", o.ready ? "bg-leading" : "bg-tertiary")}
                    />
                    {o.ready ? "Ready" : "Waiting"}
                  </span>
                </li>
              ))}
            </ul>

            {/* Inline Customizer Modal for Car/Bike and Color */}
            {customizing && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                <div className="w-full max-w-md rounded-[24px] border border-border bg-card p-6 shadow-float">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Icon name="tune" className="text-primary text-[22px]" />
                      <h3 className="text-[18px] font-semibold text-foreground">
                        Customize Your Vehicle
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomizing(false)}
                      className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary text-muted-foreground cursor-pointer"
                    >
                      <Icon name="close" className="text-[20px]" />
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="mb-2 text-[14px] font-medium text-foreground">
                        Vehicle Type
                      </div>
                      <Segmented
                        label="Vehicle Type"
                        value={customType}
                        onChange={(v) => {
                          setCustomType(v);
                          if (customLabel === "My car" || customLabel === "My bike") {
                            setCustomLabel(v === "bike" ? "My bike" : "My car");
                          }
                        }}
                        options={[
                          { value: "car", label: "Car" },
                          { value: "bike", label: "Bike" },
                        ]}
                      />
                    </div>

                    <Field
                      label="Vehicle Label"
                      value={customLabel}
                      maxLength={24}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder={customType === "bike" ? "e.g. Royal Enfield" : "e.g. Honda City"}
                    />

                    <div>
                      <div className="mb-2 flex items-center justify-between text-[14px]">
                        <span className="font-medium text-foreground">Convoy Color</span>
                        <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                          <Icon name="lock" className="text-[14px]" /> Taken colors locked
                        </span>
                      </div>
                      <div
                        role="radiogroup"
                        aria-label="Vehicle color"
                        className="grid grid-cols-8 gap-2"
                      >
                        {VEHICLE_COLORS.map((c, i) => {
                          const isTaken =
                            takenColors.includes(c) && c !== (mine?.color ?? me.color);
                          return (
                            <button
                              key={c}
                              type="button"
                              role="radio"
                              aria-checked={customColor === c}
                              aria-label={`Color ${i + 1}${isTaken ? ", taken by another member" : ""}`}
                              disabled={isTaken}
                              onClick={() => setCustomColor(c)}
                              className={cn(
                                "relative flex aspect-square items-center justify-center rounded-[10px] transition-all cursor-pointer shadow-xs",
                                vehicleBg(c),
                                isTaken &&
                                  "opacity-25 cursor-not-allowed grayscale ring-1 ring-border",
                                customColor === c &&
                                  "outline-2 outline-offset-2 outline-foreground scale-105 shadow-sm",
                              )}
                              title={
                                isTaken
                                  ? "Already chosen by another convoy member"
                                  : `Color ${i + 1}`
                              }
                            >
                              {customColor === c && <Icon name="check" className="text-[20px]" />}
                              {isTaken && (
                                <Icon name="lock" className="text-[14px] text-white absolute" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[12px] text-muted-foreground">
                        Each vehicle in the convoy has a unique color so everyone is distinct on the
                        live map.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1 cursor-pointer"
                      onClick={() => setCustomizing(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 cursor-pointer"
                      onClick={() => {
                        const finalLabel =
                          customLabel.trim() || (customType === "bike" ? "My bike" : "My car");
                        tripStore.updateMe({
                          vehicleType: customType,
                          vehicleLabel: finalLabel,
                          color: customColor,
                        });
                        if (trip.id) {
                          void updateMemberRemote(trip.id, uid, {
                            vehicle_type: customType,
                            vehicle_label: finalLabel,
                            color: customColor,
                          });
                        }
                        setCustomizing(false);
                      }}
                    >
                      Save Vehicle
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Departure Action Bar */}
          <div className="space-y-2.5 pt-2">
            <Button
              className="w-full text-[17px] shadow-float cursor-pointer"
              size="lg"
              onClick={() => {
                tripStore.updateMe({ ready: true });
                if (trip.id) void updateMemberRemote(trip.id, uid, { ready: true });
                nav({ to: "/trip" });
              }}
            >
              <Icon name="navigation" />
              Start Convoy Navigation
            </Button>
            <Button
              variant="quiet"
              className="w-full text-[14px] cursor-pointer"
              onClick={async () => {
                if (trip.id) await leaveTripRemote(trip.id, uid);
                tripStore.leave();
                tripStore.setTrip(null);
                nav({ to: "/" });
              }}
            >
              Stop sharing and leave convoy
            </Button>
          </div>
        </div>
      </div>

      {/* QR Code Modal for Passenger Scanning */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-xs"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-[24px] border border-border bg-card p-6 text-center shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-[18px] font-semibold text-foreground">Scan to Join Convoy</h3>
              <button
                type="button"
                onClick={() => setQrOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary cursor-pointer"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Point your phone camera to join {trip.name} immediately.
            </p>
            <div className="my-5 flex items-center justify-center p-4 bg-white rounded-2xl border border-border shadow-inner mx-auto w-fit">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`}
                alt="Convoy QR Code"
                className="h-44 w-44 object-contain"
              />
            </div>
            <div className="rounded-xl bg-secondary p-2.5 font-mono text-[14px] font-semibold select-all text-foreground">
              Code: {trip.inviteCode}
            </div>
            <Button className="mt-4 w-full cursor-pointer" onClick={() => setQrOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Screen>
  );
}
