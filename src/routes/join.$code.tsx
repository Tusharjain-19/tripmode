import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { JoinSteps } from "@/components/trip/JoinSteps";
import { RequireAuth } from "@/components/trip/RequireAuth";
import { btn, Button, Icon, Screen } from "@/components/trip/ui";
import { tripStore } from "@/lib/trip-store";
import { invitePreview, joinTripRemote } from "@/lib/trip-sync";

export const Route = createFileRoute("/join/$code")({
  head: () => ({
    meta: [
      { title: "You are invited to a trip - Trip Mode" },
      { name: "description", content: "Join a shared trip and see your group on one live map." },
      { property: "og:title", content: "You are invited to a trip - Trip Mode" },
      {
        property: "og:description",
        content: "Join a shared trip and see your group on one live map.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAuth reason="Sign in to join this trip. Nothing is shared until you agree on the next screens.">
      {() => <Join />}
    </RequireAuth>
  ),
});

type Preview = { id: string; name: string; destination: string; members: number; revoked: boolean };

function Join() {
  const { code } = Route.useParams();
  const nav = useNavigate();
  const [started, setStarted] = useState(false);
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);

  useEffect(() => {
    invitePreview(code)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [code]);

  if (preview === undefined)
    return (
      <Screen title="Invite" back="/" maxWidth="max-w-lg">
        <div className="flex flex-col items-center justify-center p-8 text-center min-h-[40vh]">
          <Icon name="sync" className="animate-spin text-[36px] text-primary" />
          <p className="mt-4 text-muted-foreground">Checking invite link...</p>
        </div>
      </Screen>
    );

  if (!preview || preview.revoked)
    return (
      <Screen title="Invite" back="/" maxWidth="max-w-lg">
        <div className="flex flex-col items-center text-center p-6">
          <Icon name="link_off" className="text-[44px] text-tertiary" />
          <h2 className="mt-4 text-[22px] font-semibold text-foreground">
            This invite is not available
          </h2>
          <p className="mt-2 text-muted-foreground">Ask the trip host to send you a new link.</p>
          <Link to="/" className={btn({ variant: "secondary", className: "mt-6" })}>
            Go to home
          </Link>
        </div>
      </Screen>
    );

  if (started)
    return (
      <Screen title={preview.name} back="/" maxWidth="max-w-lg">
        <JoinSteps
          onDone={async () => {
            await joinTripRemote(code, tripStore.get().me);
            nav({ to: "/lobby" });
          }}
        />
      </Screen>
    );

  return (
    <Screen title="Invite" back="/" maxWidth="max-w-lg" className="px-4 sm:px-6">
      <div className="screen-in space-y-4">
        <div>
          <p className="overline text-tertiary">You are invited to</p>
          <h2 className="mt-1 text-[26px] sm:text-[30px] font-semibold leading-tight text-foreground">
            {preview.name}
          </h2>
        </div>
        <dl className="mt-4 space-y-3 rounded-[18px] border border-border bg-card p-4 sm:p-5 shadow-sm">
          {[
            ["flag", "Destination", preview.destination],
            [
              "directions_car",
              "Members",
              `${preview.members} ${preview.members === 1 ? "vehicle" : "vehicles"}`,
            ],
          ].map(([i, k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <Icon name={i ?? ""} className="text-tertiary text-[20px]" />
              <dt className="flex-1 text-muted-foreground text-[14px]">{k}</dt>
              <dd className="font-semibold text-foreground text-[15px]">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[13px] text-muted-foreground">
          Nothing is shared until you choose your vehicle and provide explicit location consent.
        </p>
        <Button
          className="w-full text-[16px] cursor-pointer"
          size="lg"
          onClick={() => {
            tripStore.updateMe({ consentAt: null });
            setStarted(true);
          }}
        >
          Join trip
        </Button>
      </div>
    </Screen>
  );
}
