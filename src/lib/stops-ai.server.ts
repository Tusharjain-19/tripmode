// Server-only: asks AI service to extract proposed stops out of trip chat.
import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";

const GATEWAY = process.env["AI_GATEWAY_URL"] || "https://api.openai.com/v1";
const MODEL = process.env["AI_MODEL"] || "gpt-4o-mini";

export const stopSchema = z.object({
  stops: z.array(
    z.object({
      name: z.string().describe("Short place name, for example 'HP petrol pump near Kishangarh'"),
      query: z.string().describe("Search text to find this place on a map in India, including town name"),
      reason: z.string().describe("Why the group wants to stop, in under 12 words, factual"),
    }),
  ),
});
export type ExtractedStop = z.infer<typeof stopSchema>["stops"][number];

export class GatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function extractStopsFromChat(transcript: string, ctx: { origin: string; destination: string }): Promise<ExtractedStop[]> {
  const apiKey = process.env["AI_API_KEY"] || process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new GatewayError(500, "AI is not configured for this app.");
  let runId: string | undefined;

  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    fetch: async (input, init) => {
      const reqHeaders = new Headers(init?.headers);
      if (runId) reqHeaders.set("X-Run-ID", runId);
      const res = await fetch(input, { ...init, headers: reqHeaders });
      runId ??= res.headers.get("X-Run-ID") ?? undefined;
      if (!res.ok) {
        const body = await res.clone().text().catch(() => "");
        let msg = body;
        try { msg = (JSON.parse(body) as { message?: string; error?: { message?: string } }).message ?? JSON.parse(body).error?.message ?? body; } catch { /* keep text */ }
        throw new GatewayError(res.status, res.status === 402 ? msg || "AI credits are used up." : res.status === 429 ? "AI is busy. Try again in a minute." : msg || "AI request failed.");
      }
      return res;
    },
  });
  const result = streamText({
    model: provider(MODEL),
    maxRetries: 0,
    instructions:
      `You read a road-trip group chat (trip from ${ctx.origin} to ${ctx.destination}, India) and list concrete stops the group proposed: fuel, food, tea, rest, toilets, sightseeing, hotels. ` +
      `Only include stops someone actually suggested or agreed to. Merge duplicates. Skip vague wishes with no place or type. Return an empty list if none.`,
    messages: [{ role: "user", content: transcript }],
    output: Output.object({ schema: stopSchema }),
  });
  const out = await result.output;
  return out.stops.slice(0, 8);
}
