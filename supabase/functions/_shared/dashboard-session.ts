// Short-lived, HMAC-signed dashboard session tokens shared by Utah dashboard
// Edge Functions. Tokens contain only a report_access row id, its revocation
// version, and standard token metadata; every request still reloads the active
// user, current role, and current revocation version from the database.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// One workday. sessionStorage binds it to the current tab/window, while every
// request still reloads the active flag, role, and session version for immediate
// server-side disable/demotion/credential-reset revocation. No refresh token or
// persistent browser credential exists.
export const DASHBOARD_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const DASHBOARD_SESSION_MAX_TTL_SECONDS = 8 * 60 * 60;
export const DASHBOARD_SESSION_AUDIENCE = "frame-utah-dashboard";
export const DASHBOARD_SESSION_ISSUER = "frame-utah-lead-crm";
export const DASHBOARD_SESSION_VERSION_MIN = 1;
export const DASHBOARD_SESSION_VERSION_MAX = 2_147_483_647;

export type DashboardSessionClaims = {
  v: 2;
  iss: typeof DASHBOARD_SESSION_ISSUER;
  aud: typeof DASHBOARD_SESSION_AUDIENCE;
  sub: string;
  sv: number;
  iat: number;
  exp: number;
  jti: string;
};

type IssueOptions = {
  nowSeconds?: number;
  ttlSeconds?: number;
  tokenId?: string;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - value.length % 4) % 4);
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(value)));
}

function decodeJson(value: string): unknown {
  const bytes = base64UrlDecode(value);
  if (!bytes) return null;
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function uuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function tokenId(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(18)));
}

export function dashboardSessionSecretReady(secret: string): boolean {
  return encoder.encode(secret).byteLength >= 32;
}

export function dashboardSessionVersion(value: unknown): value is number {
  return integer(value) && value >= DASHBOARD_SESSION_VERSION_MIN &&
    value <= DASHBOARD_SESSION_VERSION_MAX;
}

export function dashboardSessionMatchesVersion(
  claims: DashboardSessionClaims,
  liveVersion: unknown,
): boolean {
  return dashboardSessionVersion(liveVersion) && claims.sv === liveVersion;
}

export function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/,
  );
  return match ? match[1] : null;
}

export async function issueDashboardSession(
  secret: string,
  subject: string,
  sessionVersion: number,
  options: IssueOptions = {},
): Promise<string> {
  if (!dashboardSessionSecretReady(secret)) {
    throw new Error("session_secret_invalid");
  }
  if (!uuid(subject)) throw new Error("session_subject_invalid");
  if (!dashboardSessionVersion(sessionVersion)) {
    throw new Error("session_version_invalid");
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = options.ttlSeconds ?? DASHBOARD_SESSION_TTL_SECONDS;
  if (
    !integer(now) || !integer(ttl) || ttl < 1 ||
    ttl > DASHBOARD_SESSION_MAX_TTL_SECONDS
  ) {
    throw new Error("session_time_invalid");
  }

  const claims: DashboardSessionClaims = {
    v: 2,
    iss: DASHBOARD_SESSION_ISSUER,
    aud: DASHBOARD_SESSION_AUDIENCE,
    sub: subject,
    sv: sessionVersion,
    iat: now,
    exp: now + ttl,
    jti: options.tokenId ?? tokenId(),
  };
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(claims.jti)) {
    throw new Error("session_token_id_invalid");
  }

  const header = encodeJson({ alg: "HS256", typ: "FDS2" });
  const payload = encodeJson(claims);
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await hmacKey(secret),
      encoder.encode(signingInput),
    ),
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export async function verifyDashboardSession(
  secret: string,
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<DashboardSessionClaims | null> {
  if (
    !dashboardSessionSecretReady(secret) || token.length > 4096 ||
    !integer(nowSeconds)
  ) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJson(encodedHeader) as Record<string, unknown> | null;
  const claims = decodeJson(encodedClaims) as Record<string, unknown> | null;
  const signature = base64UrlDecode(encodedSignature);
  if (
    !header || !claims || !signature || header.alg !== "HS256" ||
    header.typ !== "FDS2"
  ) {
    return null;
  }

  const validSignature = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    (() => {
      const buffer = new ArrayBuffer(signature.byteLength);
      new Uint8Array(buffer).set(signature);
      return buffer;
    })(),
    encoder.encode(`${encodedHeader}.${encodedClaims}`),
  );
  if (!validSignature) return null;

  if (
    claims.v !== 2 || claims.iss !== DASHBOARD_SESSION_ISSUER ||
    claims.aud !== DASHBOARD_SESSION_AUDIENCE || !uuid(claims.sub) ||
    !dashboardSessionVersion(claims.sv) || !integer(claims.iat) ||
    !integer(claims.exp) ||
    typeof claims.jti !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(claims.jti)
  ) return null;

  const ttl = claims.exp - claims.iat;
  if (
    ttl < 1 || ttl > DASHBOARD_SESSION_MAX_TTL_SECONDS ||
    claims.iat > nowSeconds + 60 || claims.exp <= nowSeconds
  ) return null;

  return claims as DashboardSessionClaims;
}
