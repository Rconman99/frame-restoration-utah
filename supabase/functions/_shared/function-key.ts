// Shared-secret check for internal edge functions (reddit-monitor, lead-report).
//
// The key lives in a per-function Supabase secret, never in source. Same
// transition rule as review-request: once the function's own secret is set,
// ONLY it is accepted; until then a supplied LEGACY_ROUTING_KEY secret (if
// present) is accepted so nothing breaks between deploy and secret setup.
// If neither secret is set the request is refused (fail closed).
//
// Callers should send the key in a header (kept out of URL logs); ?key= is read
// for backward compatibility with the deployed callers.

export type Env = (k: string) => string | undefined;

export interface FunctionKeySpec {
  secret: string; // e.g. "REDDIT_MONITOR_KEY"
  header: string; // e.g. "x-monitor-key"
}

export const REDDIT_MONITOR_KEY: FunctionKeySpec = { secret: "REDDIT_MONITOR_KEY", header: "x-monitor-key" };
export const LEAD_REPORT_KEY: FunctionKeySpec = { secret: "LEAD_REPORT_KEY", header: "x-report-key" };

export function functionKeyOk(
  req: Request,
  spec: FunctionKeySpec,
  env: Env = (k) => Deno.env.get(k),
): boolean {
  const url = new URL(req.url);
  const provided = req.headers.get(spec.header) || url.searchParams.get("key") || "";
  if (!provided) return false;
  const current = env(spec.secret) || "";
  if (current) return timingSafeEqual(provided, current);
  const legacy = env("LEGACY_ROUTING_KEY") || "";
  return legacy !== "" && timingSafeEqual(provided, legacy);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
