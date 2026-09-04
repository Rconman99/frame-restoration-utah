// Inbound MMS helpers for the Utah SMS relay.
// Twilio's inbound media URLs require Basic Auth, so they cannot be sent
// directly as outbound MMS URLs. We sign short-lived proxy tokens instead; the
// proxy fetches the original media with Twilio credentials and streams it to
// Twilio/Landon without exposing an account token.

export const MAX_INBOUND_MEDIA = 10;
export const MEDIA_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 180;

export type InboundMedia = {
  index: number;
  url: string;
  contentType: string;
};

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
}

function safeTwilioMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "api.twilio.com" &&
      !url.search &&
      !url.hash &&
      /^\/2010-04-01\/Accounts\/AC[0-9A-Za-z]{32}\/Messages\/MM[0-9A-Za-z]{32}\/Media\/ME[0-9A-Za-z]{32}\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function collectInboundMedia(params: Record<string, string>): InboundMedia[] {
  const declared = Number.parseInt(params.NumMedia || "0", 10);
  if (!Number.isInteger(declared) || declared <= 0) return [];
  const media: InboundMedia[] = [];
  for (let index = 0; index < Math.min(declared, MAX_INBOUND_MEDIA); index += 1) {
    const url = (params["MediaUrl" + index] || "").trim();
    if (!safeTwilioMediaUrl(url)) continue;
    media.push({
      index,
      url,
      contentType: (params["MediaContentType" + index] || "application/octet-stream").trim().toLowerCase(),
    });
  }
  return media;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createMediaProxyUrl(
  publicFunctionBase: string,
  media: InboundMedia,
  signingSecret: string,
  now = Date.now(),
): Promise<string> {
  if (!signingSecret || !safeTwilioMediaUrl(media.url)) throw new Error("inbound-media-signing-not-ready");
  const expires = Math.floor(now / 1000) + MEDIA_TOKEN_TTL_SECONDS;
  const payload = base64UrlEncode(JSON.stringify({ u: media.url, c: media.contentType, e: expires }));
  const signature = await hmacHex(signingSecret, payload);
  const base = publicFunctionBase.replace(/\/+$/, "");
  return base + "?token=" + payload + "." + signature;
}

export async function verifyMediaProxyToken(
  token: string,
  signingSecret: string,
  now = Date.now(),
): Promise<{ url: string; contentType: string } | null> {
  if (!token || !signingSecret) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = await hmacHex(signingSecret, payload);
  if (signature.length !== expected.length || !/^[0-9a-f]+$/.test(signature) || signature !== expected) return null;
  const decoded = base64UrlDecode(payload);
  if (!decoded) return null;
  try {
    const parsed = JSON.parse(decoded) as { u?: string; c?: string; e?: number };
    if (typeof parsed.u !== "string" || !safeTwilioMediaUrl(parsed.u) || typeof parsed.e !== "number" || !Number.isInteger(parsed.e) || parsed.e < Math.floor(now / 1000)) return null;
    return { url: parsed.u, contentType: parsed.c || "application/octet-stream" };
  } catch {
    return null;
  }
}
