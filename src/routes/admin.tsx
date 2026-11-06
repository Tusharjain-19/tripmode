import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, signOut, useSession } from "@/lib/auth";
import { Button, Field, Icon, Screen, Segmented } from "@/components/trip/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin - Trip Mode" },
      { name: "description", content: "Trip Mode admin: send notices, view trips and usage." },
      { property: "og:title", content: "Admin - Trip Mode" },
      {
        property: "og:description",
        content: "Trip Mode admin: send notices, view trips and usage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const session = useSession();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const realUser = session && !session.user.is_anonymous ? session.user : null;
  useEffect(() => {
    setAdmin(null);
    if (realUser) void isAdmin(realUser.id).then(setAdmin);
  }, [realUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined || (realUser && admin === null))
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Icon name="progress_activity" className="animate-spin text-tertiary" />
      </div>
    );
  if (!realUser) return <Login />;
  if (!admin)
    return (
      <Screen title="Admin" back="/">
        <p className="mt-6 text-muted-foreground">This account does not have admin access.</p>
        <Button variant="secondary" className="mt-4" onClick={() => void signOut()}>
          Sign out
        </Button>
      </Screen>
    );
  return <Panel email={realUser.email ?? ""} />;
}

function Login() {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error)
        setMsg({
          text: error.message.includes("not confirmed")
            ? "Confirm your email first. Check your inbox for the link."
            : "Wrong email or password.",
          bad: true,
        });
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setMsg(
        error
          ? { text: "Could not send the email. Try again in a minute.", bad: true }
          : { text: "If this email has an account, a reset link is on its way.", bad: false },
      );
    }
    setBusy(false);
  };

  return (
    <Screen title="Admin sign in" back="/">
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode === "login" && (
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {msg && (
          <p
            role={msg.bad ? "alert" : "status"}
            className={cn("text-[14px]", msg.bad ? "text-alert" : "text-muted-foreground")}
          >
            {msg.text}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait" : mode === "login" ? "Sign in" : "Send reset link"}
        </Button>
        <button
          type="button"
          className="w-full text-[14px] font-medium text-primary"
          onClick={() => {
            setMode(mode === "login" ? "forgot" : "login");
            setMsg(null);
          }}
        >
          {mode === "login" ? "Forgot password?" : "Back to sign in"}
        </button>
      </form>
    </Screen>
  );
}

type Overview = {
  trips: number;
  live_trips: number;
  members: number;
  messages: number;
  trips_7d: number;
  daily: { day: string; trips: number; messages: number }[];
  list: {
    id: string;
    name: string;
    origin: string;
    destination: string;
    status: string;
    created_at: string;
    members: number;
  }[];
};
type Notice = {
  id: string;
  title: string;
  body: string;
  tone: string;
  active: boolean;
  created_at: string;
};

function Panel({ email }: { email: string }) {
  const [tab, setTab] = useState<"notify" | "trips" | "usage">("notify");
  const [ov, setOv] = useState<Overview | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const load = useCallback(async () => {
    const [{ data: o }, { data: n }] = await Promise.all([
      supabase.rpc("admin_overview"),
      supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (o) setOv(o as unknown as Overview);
    if (n) setNotices(n);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen title="Admin" back="/" maxWidth="max-w-3xl" className="px-4 sm:px-6">
      <div className="mb-4 flex items-center justify-between text-[14px] text-muted-foreground">
        <span className="truncate">{email}</span>
        <button className="underline cursor-pointer" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      <Segmented
        label="Admin section"
        value={tab}
        onChange={setTab}
        options={[
          { value: "notify", label: "Notify" },
          { value: "trips", label: "Trips" },
          { value: "usage", label: "Usage" },
        ]}
      />
      <div className="mt-6">
        {tab === "notify" && <NotifyTab notices={notices} reload={load} />}
        {tab === "trips" && <TripsTab ov={ov} />}
        {tab === "usage" && <UsageTab ov={ov} />}
      </div>
    </Screen>
  );
}

function NotifyTab({ notices, reload }: { notices: Notice[]; reload: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<"info" | "caution" | "alert">("info");
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    setErr(null);
    const { error } = await supabase
      .from("announcements")
      .insert({ title: title.trim(), body: body.trim(), tone });
    if (error) return setErr("Notice not sent. Try again.");
    setTitle("");
    setBody("");
    void reload();
  };
  const toggle = async (n: Notice) => {
    await supabase.from("announcements").update({ active: !n.active }).eq("id", n.id);
    void reload();
  };
  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-[14px] border border-border bg-card p-4">
        <h2 className="text-[18px] font-semibold">Send a notice</h2>
        <p className="text-[14px] text-muted-foreground">
          Shows as a banner at the top of the app for everyone, right away.
        </p>
        <Field
          label="Title"
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-medium">Message (optional)</span>
          <textarea
            maxLength={400}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-lg border border-transparent bg-secondary p-3 text-[16px] outline-none focus:border-ring"
          />
        </label>
        <Segmented
          label="Notice type"
          value={tone}
          onChange={setTone}
          options={[
            { value: "info", label: "Info" },
            { value: "caution", label: "Caution" },
            { value: "alert", label: "Urgent" },
          ]}
        />
        {err && (
          <p role="alert" className="text-[14px] text-alert">
            {err}
          </p>
        )}
        <Button className="w-full" disabled={!title.trim()} onClick={() => void send()}>
          <Icon name="send" />
          Send to everyone
        </Button>
      </section>
      <section>
        <h2 className="overline mb-2 text-tertiary">Sent notices</h2>
        {notices.length === 0 && (
          <p className="text-[14px] text-muted-foreground">No notices yet.</p>
        )}
        <ul className="divide-y divide-border rounded-[14px] border border-border bg-card">
          {notices.map((n) => (
            <li key={n.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{n.title}</div>
                {n.body && <div className="text-[14px] text-muted-foreground">{n.body}</div>}
                <div className="mt-1 text-[12px] text-tertiary">
                  {new Date(n.created_at).toLocaleString()} · {n.active ? "Showing" : "Hidden"}
                </div>
              </div>
              <Button variant="secondary" onClick={() => void toggle(n)}>
                {n.active ? "Hide" : "Show"}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function TripsTab({ ov }: { ov: Overview | null }) {
  if (!ov) return <p className="text-muted-foreground">Loading</p>;
  if (ov.list.length === 0) return <p className="text-muted-foreground">No trips yet.</p>;
  return (
    <ul className="divide-y divide-border rounded-[14px] border border-border bg-card">
      {ov.list.map((t) => (
        <li key={t.id} className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{t.name}</span>
            <span
              className={cn(
                "text-[12px] font-medium",
                t.status === "ended" ? "text-tertiary" : "text-leading",
              )}
            >
              {t.status === "ended" ? "Ended" : "Active"}
            </span>
          </div>
          <div className="text-[14px] text-muted-foreground">
            {t.origin} to {t.destination}
          </div>
          <div className="font-mono text-[12px] text-tertiary">
            {t.members} members · {new Date(t.created_at).toLocaleDateString()}
          </div>
        </li>
      ))}
    </ul>
  );
}

function UsageTab({ ov }: { ov: Overview | null }) {
  if (!ov) return <p className="text-muted-foreground">Loading</p>;
  const max = Math.max(1, ...ov.daily.map((d) => d.trips));
  const stats = [
    ["Trips", ov.trips],
    ["Active now", ov.live_trips],
    ["Members", ov.members],
    ["Messages", ov.messages],
    ["Trips, last 7 days", ov.trips_7d],
  ] as const;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-[14px] border border-border bg-card p-4">
            <div className="text-[12px] text-tertiary">{k}</div>
            <div className="font-mono text-[24px]">{v}</div>
          </div>
        ))}
      </div>
      <section className="rounded-[14px] border border-border bg-card p-4">
        <h2 className="mb-3 text-[14px] font-medium">Trips per day, last 14 days</h2>
        <div className="flex h-32 items-end gap-1">
          {ov.daily.map((d) => (
            <div
              key={d.day}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${d.day}: ${d.trips} trips, ${d.messages} messages`}
            >
              <div
                className="w-full rounded-t bg-primary"
                style={{ height: `${(d.trips / max) * 100}%`, minHeight: d.trips ? 4 : 1 }}
              />
            </div>
          ))}
        </div>
      </section>
      <Link to="/" className="block text-center text-[14px] text-muted-foreground">
        Back to app
      </Link>
    </div>
  );
}
