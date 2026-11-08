import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { JoinSteps } from "@/components/trip/JoinSteps";
import { ShareCardModal } from "@/components/trip/ShareCardModal";
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
  type Member,
} from "@/lib/trip-sync";
import { soundFx } from "@/lib/sound";
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
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [qrSvg, setQrSvg] = useState<string>("");
  const members = useMembers(trip?.id);
  const mine = members.find((m) => m.userId === uid);
  const others = members.filter((m) => m.userId !== uid && m.approved);
  const pending = members.filter((m) => m.userId !== uid && !m.approved);
  const isHost = trip?.hostId === uid;

  // Sound chime when a new member joins the pending approval queue
  const prevPendingCount = useRef(pending.length);
  useEffect(() => {
    if (isHost && pending.length > prevPendingCount.current) {
      soundFx.alertChime();
    }
    prevPendingCount.current = pending.length;
  }, [pending.length, isHost]);

  // Host self-heal: auto-enroll host into trip_members if missing
  useEffect(() => {
    if (trip && isHost && !mine) {
      void joinTripRemote(trip.inviteCode, me).catch(() => undefined);
    }
  }, [trip, isHost, mine, me]);

  // Effective vehicle record for current user (with host fallback)
  const effectiveMine: Member = mine ?? {
    userId: uid,
    letter: "A",
    displayName: me.displayName || "Host",
    vehicleLabel: me.vehicleLabel || "Lead Vehicle",
    vehicleType: me.vehicleType || "car",
    color: me.color || "v1",
    role: "driver",
    ready: me.ready,
    approved: true,
  };

  const [customizing, setCustomizing] = useState(false);
  const [customType, setCustomType] = useState<"car" | "bike">(
    () => effectiveMine.vehicleType ?? "car",
  );
  const [customLabel, setCustomLabel] = useState(
    () => effectiveMine.vehicleLabel ?? "My car",
  );
  const [customColor, setCustomColor] = useState<VehicleColor>(
    () => effectiveMine.color ?? "v1",
  );
  const takenColors = others.map((o) => o.color);

  const link =
    typeof window !== "undefined" && trip?.inviteCode
      ? `${window.location.origin}/join/${trip.inviteCode}`
      : trip?.inviteCode
        ? `/join/${trip.inviteCode}`
        : "";

  useEffect(() => {
    if (link) {
      QRCode.toString(link, {
        type: "svg",
        margin: 1,
        color: {
          dark: "#0F261E",
          light: "#FFFFFF",
        },
      })
        .then(setQrSvg)
        .catch(() => undefined);
    }
  }, [link]);

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

  // Non-host visitors must select vehicle and give explicit per-trip location consent
  if (!mine && !isHost) {
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

  // Non-host members waiting for host approval
  if (mine && !mine.approved && !isHost)
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

  const share = async () => {
    const shareMessage = `Join our live convoy on Trip Mode!\n\nTrip: ${trip.name}\nDestination: ${trip.destination}\nConvoy Room Code: ${trip.inviteCode}\n\nTap to join live on the map:\n${link}\n\nOr open Trip Mode and enter room code: ${trip.inviteCode}`;

    // 1. Android Native App Bridge (Opens native Android Share Sheet: WhatsApp, Telegram, etc.)
    const androidBridge = (
      window as unknown as {
        AndroidBridge?: { share: (title: string, text: string, url: string) => void };
      }
    ).AndroidBridge;

    if (typeof window !== "undefined" && androidBridge?.share) {
      androidBridge.share(`Join ${trip.name} Convoy`, shareMessage, link);
      return;
    }

    // 2. Web Share API (Mobile Browsers)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `Trip Mode: ${trip.name}`,
          text: shareMessage,
          url: link,
        });
        return;
      } catch {
        // User closed share sheet without picking an app
      }
    }

    // 3. Fallback: Copy to Clipboard
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const activeRoute = ROUTES[trip.routeIndex] ?? ROUTES[0];
  const allReady = (effectiveMine.ready ?? me.ready) && others.length > 0 && others.every((o) => o.ready);

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
      {/* Convoy Hero Header: Room Code & Immediate WhatsApp/Share Trigger */}
      <div className="mb-6 rounded-[22px] border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[20px] sm:text-[22px] font-bold tracking-wider text-primary bg-card px-3.5 py-1 rounded-xl border border-primary/20 shadow-xs">
                {trip.inviteCode}
              </span>
              <button
                type="button"
                onClick={share}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border bg-card text-[12px] font-semibold text-foreground hover:bg-secondary cursor-pointer shadow-xs active:scale-95 transition-all"
                title="Copy invite link"
              >
                <Icon name={copied ? "check" : "content_copy"} className="text-[15px] text-primary" />
                <span>{copied ? "Copied!" : "Copy Link"}</span>
              </button>
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Share this code or tap WhatsApp below. Friends can enter this code in the app or open the link directly.
            </p>
          </div>

          {/* Quick Share Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 flex-wrap">
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                `Join our live convoy on Trip Mode!\n\nTrip: ${trip.name}\nDestination: ${trip.destination}\nConvoy Room Code: ${trip.inviteCode}\n\nTap to join live on the map:\n${link}\n\nOr open Trip Mode and enter room code: ${trip.inviteCode}`,
              )}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-[#25D366] text-white font-semibold text-[13px] hover:bg-[#20ba59] active:scale-95 transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Icon name="chat" className="text-[18px]" />
              <span>Share on WhatsApp</span>
            </a>

            <Button
              size="md"
              onClick={share}
              className="flex-1 sm:flex-initial h-11 px-4 cursor-pointer whitespace-nowrap"
            >
              <Icon name="share" className="text-[18px]" />
              <span>Share Link</span>
            </Button>

            <Button
              variant="secondary"
              size="md"
              onClick={() => setShareCardOpen(true)}
              className="h-11 px-3.5 cursor-pointer whitespace-nowrap"
              title="QR Code & Social Card Poster"
            >
              <Icon name="qr_code_2" className="text-[18px]" />
              <span>QR Poster</span>
            </Button>
          </div>
        </div>
      </div>

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
                onClick={() => setShareCardOpen(true)}
                className="cursor-pointer bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/20"
                title="WhatsApp & Social Card Poster"
              >
                <Icon name="chat" />
                WhatsApp Card
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
          {/* Pending Approval Section for Host */}
          {isHost && (
            <section className="rounded-[20px] border border-caution/50 bg-caution/5 p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={cn("flex h-2.5 w-2.5 rounded-full bg-caution", pending.length > 0 && "animate-ping")} />
                  <h2 className="text-[15px] sm:text-[16px] font-semibold text-foreground">
                    Waiting for your approval ({pending.length})
                  </h2>
                </div>
                {pending.length > 0 && (
                  <span className="text-[11px] font-bold text-caution bg-caution/15 px-2.5 py-0.5 rounded-full">
                    Action Required
                  </span>
                )}
              </div>

              {pending.length === 0 ? (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border/70 text-[13px] text-muted-foreground shadow-2xs">
                  <Icon name="group_add" className="text-[22px] text-primary shrink-0" />
                  <span>Friends joining with convoy code <strong className="font-mono text-foreground">{trip.inviteCode}</strong> will appear here for one-tap approval.</span>
                </div>
              ) : (
                <ul className="divide-y divide-border/60 rounded-[16px] border border-border bg-card overflow-hidden shadow-xs">
                  {pending.map((o) => (
                    <li
                      key={o.userId}
                      className="flex min-h-16 flex-wrap items-center justify-between gap-3 p-3.5 hover:bg-secondary/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <VehicleChip letter={o.letter} color={o.color} size={38} />
                        <div className="min-w-0">
                          <div className="font-semibold text-[15px] text-foreground truncate">
                            {o.displayName}
                          </div>
                          <div className="text-[13px] text-muted-foreground flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{o.vehicleLabel}</span>
                            <span>•</span>
                            <span className="capitalize">{o.vehicleType === "bike" ? "Two-wheeler" : "Car"}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                        <Button
                          variant="quiet"
                          size="md"
                          className="h-9 px-3 text-[13px] text-alert hover:bg-alert/10 cursor-pointer"
                          onClick={() => void removeMemberRemote(trip.id!, o.userId)}
                        >
                          Decline
                        </Button>
                        <Button
                          size="md"
                          className="h-9 px-4 text-[13px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shadow-xs"
                          onClick={() => void setMemberApproval(trip.id!, o.userId, true)}
                        >
                          <Icon name="check" className="text-[16px]" />
                          Approve
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
              <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-primary/5">
                <div className="flex items-center gap-3.5 min-w-0">
                  <VehicleChip
                    letter={effectiveMine.letter ?? "A"}
                    color={effectiveMine.color ?? me.color}
                    vehicleType={effectiveMine.vehicleType ?? me.vehicleType}
                    ring="me"
                    size={42}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[15px] text-foreground truncate">
                        {effectiveMine.vehicleLabel ?? me.vehicleLabel}
                      </span>
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                        You{isHost ? " • Host" : ""}
                      </span>
                    </div>
                    <div className="text-[13px] text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                      <span>{me.displayName}</span>
                      <span>•</span>
                      <span className="font-medium text-foreground">
                        {(effectiveMine.vehicleType ?? me.vehicleType) === "bike"
                          ? "Two-wheeler (Bike)"
                          : "Car"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40 justify-between sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomType(effectiveMine.vehicleType ?? me.vehicleType);
                      setCustomLabel(effectiveMine.vehicleLabel ?? me.vehicleLabel);
                      setCustomColor(effectiveMine.color ?? me.color);
                      setCustomizing(true);
                    }}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12px] font-semibold text-foreground hover:bg-secondary transition-all cursor-pointer shadow-xs whitespace-nowrap"
                    title="Change vehicle type (car/bike) and color"
                  >
                    <Icon name="palette" className="text-[16px] text-primary" />
                    <span>Change Vehicle</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const r = !(effectiveMine.ready ?? me.ready);
                      tripStore.updateMe({ ready: r });
                      if (trip.id) void updateMemberRemote(trip.id, uid, { ready: r });
                    }}
                    aria-pressed={effectiveMine.ready ?? me.ready}
                    className={cn(
                      "min-h-9 shrink-0 rounded-full px-3.5 text-[12px] font-semibold transition-all shadow-xs cursor-pointer whitespace-nowrap",
                      (effectiveMine.ready ?? me.ready)
                        ? "bg-leading text-white shadow-leading/20"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                    )}
                  >
                    {(effectiveMine.ready ?? me.ready) ? "Ready ✓" : "Tap when ready"}
                  </button>
                </div>
              </li>

              {/* Other Members */}
              {others.map((o) => (
                <li
                  key={o.userId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-secondary/20 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <VehicleChip
                      letter={o.letter}
                      color={o.color}
                      vehicleType={o.vehicleType}
                      size={38}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[15px] text-foreground truncate">
                        {o.vehicleLabel}{" "}
                        <span className="text-[12px] font-normal text-muted-foreground">
                          ({o.vehicleType === "bike" ? "Bike" : "Car"})
                        </span>
                      </div>
                      <div className="text-[13px] text-muted-foreground truncate">
                        {o.displayName} • {o.role === "driver" ? "Driver" : "Passenger"}
                      </div>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[13px] font-semibold flex items-center gap-1.5 shrink-0 self-end sm:self-auto",
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
            <div className="my-5 flex items-center justify-center p-3 bg-white rounded-2xl border border-border shadow-inner mx-auto w-fit min-h-[190px] min-w-[190px]">
              {qrSvg ? (
                <div
                  className="h-44 w-44 [&>svg]:w-full [&>svg]:h-full [&>svg]:rounded-lg"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-10">
                  <Icon name="sync" className="animate-spin text-[28px] text-primary" />
                  <span className="text-[12px]">Generating QR...</span>
                </div>
              )}
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

      {/* WhatsApp & Social Card Poster Modal */}
      {shareCardOpen && (
        <ShareCardModal
          tripName={trip.name}
          destination={trip.destination}
          inviteCode={trip.inviteCode}
          memberCount={members.length}
          qrSvg={qrSvg}
          onClose={() => setShareCardOpen(false)}
        />
      )}
    </Screen>
  );
}
