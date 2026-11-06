import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Field, Screen } from "@/components/trip/ui";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password - Trip Mode" },
      { name: "description", content: "Set a new password for your Trip Mode admin account." },
      { property: "og:title", content: "Reset password - Trip Mode" },
      { property: "og:description", content: "Set a new password for your Trip Mode admin account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY") setReady(true); });
    if (window.location.hash.includes("type=recovery")) setReady(true);
    return () => data.subscription.unsubscribe();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setMsg("Use at least 8 characters.");
    if (pw !== pw2) return setMsg("The passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg(error.message);
    nav({ to: "/admin" });
  };

  return (
    <Screen title="Set a new password" back="/admin">
      {!ready ? (
        <p className="mt-6 text-muted-foreground">Open this page from the reset link in your email. Links expire after one hour.</p>
      ) : (
        <form onSubmit={save} className="mt-6 space-y-4">
          <Field label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Field label="Repeat new password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          {msg && <p role="alert" className="text-[14px] text-alert">{msg}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving" : "Save password"}</Button>
        </form>
      )}
    </Screen>
  );
}
