// Pure authorization + response-shaping helpers for the PIN-gated Utah CRM.
// Keep these decisions isolated so Deno tests can freeze the server-side role
// contract without importing the Edge runtime or a live Supabase client.

export type AccessRole = "viewer" | "sales" | "admin";

const CRM_ACTIONS = new Set([
  "list",
  "create",
  "update",
  "clicks",
  "growth_state",
  "growth_update",
]);

const ADMIN_ACTIONS = new Set([
  "access_list",
  "access_create",
  "access_toggle",
  "access_reset",
]);

export function normalizeAccessRole(value: unknown): AccessRole | null {
  const role = String(value ?? "").trim().toLowerCase();
  return role === "viewer" || role === "sales" || role === "admin"
    ? role
    : null;
}

export function actionAllowed(role: AccessRole, action: string): boolean {
  if (ADMIN_ACTIONS.has(action)) return role === "admin";
  if (CRM_ACTIONS.has(action)) return role === "sales" || role === "admin";
  return false;
}

export function publicAccessUser(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    role: normalizeAccessRole(row.role),
    active: Boolean(row.active),
    last_accessed: row.last_accessed ?? null,
    created_at: row.created_at ?? null,
  };
}

export function validNewPin(value: unknown): value is string {
  // Numeric PINs keep the existing operator UX, while a minimum of six digits
  // materially raises the cost of online guessing. Existing PINs are not
  // rewritten by this source-only remediation.
  return typeof value === "string" && /^\d{6,12}$/.test(value);
}
