export type AppErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

const SENSITIVE_KEYS = new Set([
  "lat",
  "lng",
  "latitude",
  "longitude",
  "coords",
  "coordinates",
  "position",
  "speedms",
  "heading",
  "token",
  "secret",
  "password",
  "apikey",
  "api_key",
  "authorization",
  "invitecode",
  "invite_code",
  "code",
  "body",
  "transcript",
]);

/**
 * Deep recursive scrubber preventing coordinates, tokens, invite codes,
 * and message bodies from leaking into logs or crash handlers (security.md §6, §11).
 */
export function scrubSensitiveData<T>(val: T, depth = 0): T {
  if (depth > 5) return "[REDACTED_NESTED]" as unknown as T;
  if (val === null || val === undefined) return val;
  if (typeof val !== "object") return val;

  if (Array.isArray(val)) {
    return val.map((item) => scrubSensitiveData(item, depth + 1)) as unknown as T;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(val as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      cleaned[key] = "[REDACTED]";
    } else {
      cleaned[key] = scrubSensitiveData(v, depth + 1);
    }
  }
  return cleaned as T;
}

export function reportAppError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  // Never log raw PII, coordinates or tokens
  const safeContext = scrubSensitiveData(context);
  let safeMessage = error instanceof Error ? error.message : String(error);

  // Strip potential coordinates pattern from error message
  safeMessage = safeMessage.replace(/-?\d{1,3}\.\d{4,}/g, "[COORD]");

  if (process.env["NODE_ENV"] !== "production") {
    console.error("[App Error]", safeMessage, safeContext);
  }
}
