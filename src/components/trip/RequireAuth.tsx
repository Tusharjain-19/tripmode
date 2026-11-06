import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { ensureGuest, useSession } from "@/lib/auth";
import { Button, Icon, Screen } from "./ui";

/** Gives the device a guest ID automatically (no sign-in screen), then renders children. */
export function RequireAuth({ children }: { children: (session: Session) => ReactNode; reason?: string }) {
  const session = useSession();
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (session) return;
    setErr(null);
    ensureGuest().catch((e: unknown) => {
      if (!active) return;
      setErr(
        e instanceof Error
          ? e.message
          : "Could not connect to convoy services. Check your internet connection.",
      );
    });
    return () => {
      active = false;
    };
  }, [session, attempt]);

  if (session) return <>{children(session)}</>;
  if (err)
    return (
      <Screen title="Connection" back="/">
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <Icon name="cloud_off" className="text-[44px] text-alert" />
          <h2 className="mt-3 text-[18px] font-semibold text-foreground">Connection Required</h2>
          <p role="alert" className="mt-2 text-alert text-[14px] font-medium max-w-xs">
            {err}
          </p>
          <Button className="mt-6 w-full cursor-pointer" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </Button>
          <Link to="/" className="mt-3 text-[14px] text-muted-foreground underline">
            Back to Home
          </Link>
        </div>
      </Screen>
    );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <Icon name="progress_activity" className="animate-spin text-tertiary text-[32px]" />
      <span className="text-[13px] text-muted-foreground font-medium">Connecting device to convoy...</span>
    </div>
  );
}
