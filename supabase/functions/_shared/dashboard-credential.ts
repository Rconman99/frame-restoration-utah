// Deterministic HMAC-SHA-256 credential hashing for report_access PINs.
// The pepper lives only in Edge Function secrets. The database stores exactly
// 64 lowercase hexadecimal characters, matching migration 20260807000150.

const encoder = new TextEncoder();

export type DashboardAuthRpcResult =
  | { kind: "none" }
  | {
    kind: "match";
    identity: {
      id: string;
      name: string;
      role: string;
      active: true;
      session_version: number;
    };
  };

export function dashboardCredentialPepperReady(pepper: string): boolean {
  return encoder.encode(pepper).byteLength >= 32;
}

export function legacyPinCandidate(value: unknown): value is string {
  // Existing credentials predate the numeric-only rule. Bound their shape so
  // the temporary fallback cannot become an unbounded plaintext lookup.
  return typeof value === "string" && /^[A-Za-z0-9_-]{4,32}$/.test(value);
}

export async function hashDashboardPin(
  pepper: string,
  pin: string,
): Promise<string> {
  if (!dashboardCredentialPepperReady(pepper)) {
    throw new Error("credential_pepper_invalid");
  }
  if (!legacyPinCandidate(pin)) throw new Error("credential_invalid");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(pin)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

// SECURITY DEFINER table-returning RPCs arrive as arrays through PostgREST.
// Treat every unexpected shape as an authentication outage, never as a miss.
export function parseDashboardAuthRpcResult(
  value: unknown,
): DashboardAuthRpcResult | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return { kind: "none" };
  if (value.length !== 1) return null;

  const row = value[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const candidate = row as Record<string, unknown>;
  const id = candidate.access_id;
  const name = candidate.access_name;
  const role = candidate.access_role;
  const active = candidate.access_active;
  const sessionVersion = candidate.access_session_version;

  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(id) ||
    typeof name !== "string" || name.length < 1 || name.length > 120 ||
    typeof role !== "string" || role.length < 1 || role.length > 32 ||
    active !== true ||
    !Number.isInteger(sessionVersion) ||
    (sessionVersion as number) < 1 ||
    (sessionVersion as number) > 2147483647
  ) {
    return null;
  }

  return {
    kind: "match",
    identity: {
      id,
      name,
      role,
      active,
      session_version: sessionVersion as number,
    },
  };
}
