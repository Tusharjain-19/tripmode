import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Host only: read recent chat, ask AI for proposed stops, save them as suggestions. */
export const suggestStopsFromChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tripId: string }) => {
    if (typeof input?.tripId !== "string" || input.tripId.length > 64)
      throw new Error("Invalid trip");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trip } = await supabase
      .from("trips")
      .select("id, host_id, origin, destination")
      .eq("id", data.tripId)
      .maybeSingle();
    if (!trip || trip.host_id !== userId)
      return { ok: false as const, error: "Only the host can review stops." };

    const [{ data: msgs }, { data: members }, { data: existing }] = await Promise.all([
      supabase
        .from("trip_messages")
        .select("user_id, kind, body, created_at")
        .eq("trip_id", trip.id)
        .in("kind", ["chat", "quick"])
        .order("created_at", { ascending: false })
        .limit(80),
      supabase.from("trip_members").select("user_id, display_name").eq("trip_id", trip.id),
      supabase.from("trip_stops").select("name").eq("trip_id", trip.id),
    ]);
    if (!msgs?.length) return { ok: true as const, added: 0 };
    const names = new Map((members ?? []).map((m) => [m.user_id, m.display_name]));
    const transcript = [...msgs]
      .reverse()
      .map((m) => `${names.get(m.user_id) ?? "Member"}: ${m.body}`)
      .join("\n");

    const { extractStopsFromChat, GatewayError } = await import("./stops-ai.server");
    let stops;
    try {
      stops = await extractStopsFromChat(transcript, {
        origin: trip.origin,
        destination: trip.destination,
      });
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof GatewayError ? e.message : "Could not read the chat right now.",
      };
    }
    const seen = new Set((existing ?? []).map((s) => s.name.trim().toLowerCase()));
    const rows = stops
      .filter((s) => s.name.trim() && !seen.has(s.name.trim().toLowerCase()))
      .map((s) => ({
        trip_id: trip.id,
        name: s.name.trim().slice(0, 120),
        query: s.query.slice(0, 200),
        reason: s.reason.slice(0, 200),
      }));
    if (rows.length) {
      const { error } = await supabase.from("trip_stops").insert(rows);
      if (error) return { ok: false as const, error: error.message };
    }
    return { ok: true as const, added: rows.length };
  });
