// Strict client-IP extraction shared by public lead intake and dashboard login
// throttles. Live gateway/spoof receipts authorize only Cloudflare's canonical
// cf-connecting-ip. X-Real-IP and X-Forwarded-For are diagnostic-only and never
// become identity fallbacks. Callers persist only a context-keyed HMAC.

const encoder = new TextEncoder();

export const IP_HASH_HEX_LENGTH = 64;
export const IP_HASH_SECRET_MIN_BYTES = 32;
export const IP_HASH_SECRET_MAX_BYTES = 1024;

export type ClientIpSource = "cf-connecting-ip";

export type ClientIpIdentity = {
  ip: string;
  source: ClientIpSource;
};

function canonicalIpv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const normalized: string[] = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    normalized.push(String(octet));
  }
  return normalized.join(".");
}

function canonicalIpv6(value: string): string | null {
  if (
    !value.includes(":") || value.includes("%") ||
    !/^[0-9a-f:.]+$/i.test(value)
  ) return null;
  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    if (!hostname.startsWith("[") || !hostname.endsWith("]")) return null;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

export function canonicalIp(value: string | null): string | null {
  if (value === null) return null;
  const candidate = value.trim();
  if (!candidate || candidate.includes(",") || candidate.length > 64) {
    return null;
  }
  return canonicalIpv4(candidate) ?? canonicalIpv6(candidate);
}

export function clientIpIdentity(headers: Headers): ClientIpIdentity | null {
  // Live Supabase gateway receipts prove Cloudflare overwrites this header and
  // rejects a forged value before the function. X-Real-IP was absent and XFF
  // was a chain, so neither is an identity fallback.
  const ip = canonicalIp(headers.get("cf-connecting-ip"));
  return ip ? { ip, source: "cf-connecting-ip" } : null;
}

export function ipHashSecretReady(secret: string): boolean {
  const byteLength = encoder.encode(secret).byteLength;
  return byteLength >= IP_HASH_SECRET_MIN_BYTES &&
    byteLength <= IP_HASH_SECRET_MAX_BYTES;
}

export function validIpHash(value: unknown): value is string {
  return typeof value === "string" &&
    new RegExp(`^[0-9a-f]{${IP_HASH_HEX_LENGTH}}$`).test(value);
}

export async function keyedClientIpHash(
  secret: string,
  context: string,
  identity: ClientIpIdentity | null,
): Promise<string> {
  if (!ipHashSecretReady(secret)) throw new Error("ip_hash_secret_invalid");
  if (!/^[a-z0-9._-]{4,64}$/.test(context)) {
    throw new Error("ip_hash_context_invalid");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  if (!identity) throw new Error("trusted_client_ip_unavailable");
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${context}\0${identity.ip}`),
    ),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
