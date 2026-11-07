import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, signOut, useSession } from "@/lib/auth";
import { Button, Field, Icon, Screen, Segmented } from "@/components/trip/ui";
import { Logo } from "@/components/trip/Logo";
import { dispatchPushNotification } from "@/components/trip/AnnouncementBar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console - Trip Mode" },
      {
        name: "description",
        content:
          "Trip Mode admin console: push notifications, live convoy monitors, and platform usage.",
      },
      { property: "og:title", content: "Admin Console - Trip Mode" },
      {
        property: "og:description",
        content:
          "Trip Mode admin console: push notifications, live convoy monitors, and platform usage.",
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
      <Screen title="Admin Console" back="/">
        <div className="mt-8 rounded-[16px] border border-border bg-card p-6 text-center space-y-4">
          <Icon name="lock" className="text-tertiary text-[36px]" />
          <h2 className="text-[18px] font-semibold">Restricted Access</h2>
          <p className="text-[14px] text-muted-foreground max-w-sm mx-auto">
            This account does not have administrator privileges to dispatch system push
            notifications.
          </p>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
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
      <div className="mt-6 flex justify-center mb-6">
        <Logo size={52} />
      </div>
      <form onSubmit={submit} className="space-y-4 max-w-md mx-auto">
        <Field
          label="Admin Email"
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
          {busy ? "Please wait..." : mode === "login" ? "Sign in to Admin" : "Send reset link"}
        </Button>
        <button
          type="button"
          className="w-full text-[14px] font-medium text-primary hover:underline cursor-pointer"
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

const NOTIFICATION_PRESETS = [
  {
    icon: "report",
    label: "Road Hazard",
    title: "Road Hazard Warning",
    body: "Traffic obstruction or road damage reported ahead on the convoy route corridor. Reduce speed.",
    tone: "alert" as const,
  },
  {
    icon: "group",
    label: "Regroup",
    title: "Convoy Regroup Notice",
    body: "All convoy vehicles: please maintain formation and close gaps to under 2.5 km.",
    tone: "caution" as const,
  },
  {
    icon: "local_gas_station",
    label: "Pitstop",
    title: "Coordinated Pitstop in 5 KM",
    body: "Convoy rest & refueling stop ahead. Prepare to pull in together.",
    tone: "info" as const,
  },
  {
    icon: "thunderstorm",
    label: "Weather",
    title: "Adverse Weather Alert",
    body: "Heavy rain / fog conditions detected on route. Switch on hazard visibility.",
    tone: "caution" as const,
  },
  {
    icon: "campaign",
    label: "Broadcast",
    title: "Trip Mode System Notice",
    body: "System update live. Thank you for travelling with Trip Mode Convoy.",
    tone: "info" as const,
  },
];

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
    <Screen maxWidth="max-w-4xl" className="px-4 sm:px-6">
      {/* Admin Header with Brand Logo */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div className="flex items-center gap-3">
          <Logo size={42} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
                Admin Console
              </h1>
              <span className="flex items-center gap-1 rounded-full border border-status-leading/30 bg-status-leading/10 px-2 py-0.5 text-[11px] font-medium text-status-leading">
                <span className="h-1.5 w-1.5 rounded-full bg-status-leading animate-pulse" />
                LIVE
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground">{email}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Icon name="arrow_back" className="text-[18px]" />
            Back to app
          </Link>
          <Button
            variant="secondary"
            className="text-[13px] min-h-9 px-3"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </div>
      </header>

      <Segmented
        label="Admin section"
        value={tab}
        onChange={setTab}
        options={[
          { value: "notify", label: "Push Notification Studio" },
          { value: "trips", label: "Active Convoys" },
          { value: "usage", label: "Platform Usage" },
        ]}
      />

      <div className="mt-6">
        {tab === "notify" && (
          <NotifyTab notices={notices} reload={load} liveCount={ov?.members ?? 0} />
        )}
        {tab === "trips" && <TripsTab ov={ov} />}
        {tab === "usage" && <UsageTab ov={ov} />}
      </div>
    </Screen>
  );
}

function NotifyTab({
  notices,
  reload,
  liveCount,
}: {
  notices: Notice[];
  reload: () => Promise<void>;
  liveCount: number;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<"info" | "caution" | "alert">("info");
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Delivery options
  const [pushToShade, setPushToShade] = useState(true);
  const [vibrateDevice, setVibrateDevice] = useState(true);

  const applyPreset = (preset: (typeof NOTIFICATION_PRESETS)[0]) => {
    setTitle(preset.title);
    setBody(preset.body);
    setTone(preset.tone);
  };

  const send = async () => {
    if (!title.trim()) return;
    setIsSending(true);
    setErr(null);
    setSentSuccess(false);

    try {
      const { error } = await supabase
        .from("announcements")
        .insert({ title: title.trim(), body: body.trim(), tone });

      if (error) {
        setErr("Could not deliver push notice. Please try again.");
        return;
      }

      // Also trigger immediate local notification & haptic feedback on this device
      if (pushToShade) {
        dispatchPushNotification(title.trim(), body.trim(), tone);
      }

      setSentSuccess(true);
      setTitle("");
      setBody("");
      void reload();
      setTimeout(() => setSentSuccess(false), 5000);
    } catch {
      setErr("Network error while dispatching notification.");
    } finally {
      setIsSending(false);
    }
  };

  const handleTestOnThisDevice = () => {
    if (!title.trim()) {
      setErr("Enter a title to test the push notification.");
      return;
    }
    dispatchPushNotification(
      `[Test] ${title.trim()}`,
      body.trim() || "Test message from Trip Mode Admin",
      tone,
    );
  };

  const toggle = async (n: Notice) => {
    await supabase.from("announcements").update({ active: !n.active }).eq("id", n.id);
    void reload();
  };

  const deleteNotice = async (id: string) => {
    await supabase.from("announcements").delete().eq("id", id);
    void reload();
  };

  return (
    <div className="space-y-6">
      {/* Broadcast Composer */}
      <section className="space-y-5 rounded-[16px] border border-border bg-card p-5 sm:p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="campaign" className="text-primary text-[24px]" />
              <h2 className="text-[18px] font-semibold text-foreground">
                Push Notification Studio
              </h2>
            </div>
            <p className="text-[14px] text-muted-foreground mt-0.5">
              Broadcast instant push alerts to all installed Android apps and connected browser
              screens.
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-[11px] font-mono text-tertiary uppercase tracking-wider">
              Connected Audience
            </span>
            <span className="text-[14px] font-semibold text-leading">All Active Devices</span>
          </div>
        </div>

        {/* Quick Presets */}
        <div>
          <span className="mb-2 block text-[12px] font-mono uppercase tracking-wider text-muted-foreground">
            Quick Alert Presets
          </span>
          <div className="flex flex-wrap gap-2">
            {NOTIFICATION_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary px-3 py-1.5 text-[13px] font-medium text-foreground transition-all active:scale-95 cursor-pointer"
              >
                <Icon name={p.icon} className="text-[16px] text-primary" />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[14px] font-medium">Notification Title</span>
              <span className="text-[11px] font-mono text-muted-foreground">{title.length}/80</span>
            </div>
            <input
              type="text"
              maxLength={80}
              placeholder="e.g. Convoy Regroup Notice"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-secondary/50 px-4 text-[15px] outline-none focus:border-ring transition-colors"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[14px] font-medium">Notification Message / Details</span>
              <span className="text-[11px] font-mono text-muted-foreground">{body.length}/400</span>
            </div>
            <textarea
              maxLength={400}
              rows={3}
              placeholder="e.g. All vehicles maintain 2 km formation. Road hazard reported ahead."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/50 p-3 text-[15px] outline-none focus:border-ring transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="mb-1.5 block text-[14px] font-medium">Alert Priority / Tone</span>
              <Segmented
                label="Alert priority"
                value={tone}
                onChange={setTone}
                options={[
                  { value: "info", label: "Info (Blue)" },
                  { value: "caution", label: "Caution (Amber)" },
                  { value: "alert", label: "Urgent (Red)" },
                ]}
              />
            </div>

            <div className="flex flex-col justify-end space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-[13px] text-foreground select-none">
                <input
                  type="checkbox"
                  checked={pushToShade}
                  onChange={(e) => setPushToShade(e.target.checked)}
                  className="rounded border-border accent-primary h-4 w-4"
                />
                Push to Android notification shade & heads-up banner
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[13px] text-foreground select-none">
                <input
                  type="checkbox"
                  checked={vibrateDevice}
                  onChange={(e) => setVibrateDevice(e.target.checked)}
                  className="rounded border-border accent-primary h-4 w-4"
                />
                Trigger in-car haptic vibration on drivers' phones
              </label>
            </div>
          </div>
        </div>

        {/* Live Android Device Push Preview */}
        <div className="rounded-[14px] border border-border/80 bg-background/80 p-4 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
            <span>Android Heads-up Notification Preview</span>
            <span className="text-[10px] text-tertiary">System Shade • Lock Screen</span>
          </div>

          <div className="rounded-[12px] border border-border bg-surface-raised p-3.5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Logo size={20} />
                <span className="text-[12px] font-semibold text-foreground tracking-tight">
                  Trip Mode • Convoy Alert
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">now</span>
            </div>

            <div className="space-y-0.5">
              <div className="text-[14px] font-semibold text-foreground flex items-center gap-1.5">
                {tone === "alert" && <span className="h-2 w-2 rounded-full bg-alert shrink-0" />}
                {tone === "caution" && (
                  <span className="h-2 w-2 rounded-full bg-caution shrink-0" />
                )}
                {tone === "info" && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                {title.trim() || "Notification Title"}
              </div>
              <p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed">
                {body.trim() || "Notification message will appear here for drivers and passengers."}
              </p>
            </div>

            <div className="pt-1 flex gap-2">
              <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                Open Convoy Map
              </span>
            </div>
          </div>
        </div>

        {err && (
          <p role="alert" className="text-[14px] text-alert font-medium flex items-center gap-1.5">
            <Icon name="error" className="text-[18px]" />
            {err}
          </p>
        )}

        {sentSuccess && (
          <p
            role="status"
            className="text-[14px] text-status-leading font-medium flex items-center gap-1.5"
          >
            <Icon name="check_circle" className="text-[18px]" />
            Push notification broadcasted successfully to all connected devices!
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            className="flex-1 min-h-12 text-[16px]"
            disabled={!title.trim() || isSending}
            onClick={() => void send()}
          >
            <Icon name="send" />
            {isSending ? "Broadcasting..." : "Broadcast Push Notification to All Devices"}
          </Button>

          <Button
            variant="secondary"
            className="min-h-12 px-4"
            disabled={!title.trim()}
            onClick={handleTestOnThisDevice}
            title="Fire a test notification on your current device"
          >
            <Icon name="notifications_active" />
            Test On This Device
          </Button>
        </div>
      </section>

      {/* Broadcast History */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-mono uppercase tracking-wider text-muted-foreground">
            Broadcast History ({notices.length})
          </h2>
          <button
            onClick={() => void reload()}
            className="text-[12px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Icon name="refresh" className="text-[14px]" />
            Refresh
          </button>
        </div>

        {notices.length === 0 ? (
          <div className="rounded-[14px] border border-border bg-card p-8 text-center text-muted-foreground">
            No previous push notifications.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-[14px] border border-border bg-card overflow-hidden">
            {notices.map((n) => (
              <li
                key={n.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-secondary/20 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        n.tone === "alert"
                          ? "bg-alert"
                          : n.tone === "caution"
                            ? "bg-caution"
                            : "bg-primary",
                      )}
                    />
                    <div className="font-semibold text-[15px] text-foreground">{n.title}</div>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-mono uppercase",
                        n.active
                          ? "bg-status-leading/15 text-status-leading"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {n.active ? "Active" : "Archived"}
                    </span>
                  </div>

                  {n.body && <div className="text-[13px] text-muted-foreground pl-4">{n.body}</div>}

                  <div className="text-[11px] font-mono text-tertiary pl-4">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2 pl-4 sm:pl-0 shrink-0">
                  <Button
                    variant="secondary"
                    className="h-8 text-[12px] px-2.5 min-h-0"
                    onClick={() => void toggle(n)}
                  >
                    {n.active ? "Hide" : "Show"}
                  </Button>
                  <button
                    onClick={() => void deleteNotice(n.id)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-alert hover:bg-alert/10 transition-colors cursor-pointer"
                    aria-label="Delete broadcast"
                    title="Delete broadcast"
                  >
                    <Icon name="delete" className="text-[18px]" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TripsTab({ ov }: { ov: Overview | null }) {
  if (!ov) return <p className="text-muted-foreground py-8 text-center">Loading convoys...</p>;
  if (ov.list.length === 0)
    return <p className="text-muted-foreground py-8 text-center">No convoys yet.</p>;
  return (
    <ul className="divide-y divide-border rounded-[14px] border border-border bg-card overflow-hidden">
      {ov.list.map((t) => (
        <li key={t.id} className="p-4 hover:bg-secondary/20 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-[15px]">{t.name}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium font-mono uppercase",
                t.status === "ended"
                  ? "bg-secondary text-muted-foreground"
                  : "bg-status-leading/15 text-status-leading",
              )}
            >
              {t.status === "ended" ? "Ended" : "Live Active"}
            </span>
          </div>
          <div className="text-[13px] text-muted-foreground mt-0.5">
            {t.origin || "Origin"} → {t.destination}
          </div>
          <div className="font-mono text-[11px] text-tertiary mt-1.5 flex items-center gap-3">
            <span>{t.members} vehicle(s)</span>
            <span>•</span>
            <span>{new Date(t.created_at).toLocaleDateString()}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function UsageTab({ ov }: { ov: Overview | null }) {
  if (!ov)
    return <p className="text-muted-foreground py-8 text-center">Loading platform metrics...</p>;
  const max = Math.max(1, ...ov.daily.map((d) => d.trips));
  const stats = [
    ["Total Convoys", ov.trips, "directions_car"],
    ["Active Right Now", ov.live_trips, "fmd_good"],
    ["Connected Members", ov.members, "groups"],
    ["Convoy Messages", ov.messages, "chat"],
    ["Convoys (Last 7d)", ov.trips_7d, "date_range"],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map(([k, v, icon]) => (
          <div key={k} className="rounded-[14px] border border-border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[12px] font-medium">{k}</span>
              <Icon name={icon} className="text-[18px] text-primary" />
            </div>
            <div className="font-mono text-[26px] font-semibold tracking-tight text-foreground">
              {v}
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-[14px] border border-border bg-card p-5 space-y-4">
        <h2 className="text-[14px] font-medium text-foreground">Convoys Per Day (Last 14 Days)</h2>
        <div className="flex h-36 items-end gap-1.5 pt-4">
          {ov.daily.map((d) => (
            <div
              key={d.day}
              className="flex flex-1 flex-col items-center gap-1 group relative"
              title={`${d.day}: ${d.trips} trips, ${d.messages} messages`}
            >
              <div
                className="w-full rounded-t bg-primary/80 group-hover:bg-primary transition-all"
                style={{ height: `${(d.trips / max) * 100}%`, minHeight: d.trips ? 6 : 2 }}
              />
              <span className="text-[9px] font-mono text-tertiary truncate max-w-full">
                {d.day.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
