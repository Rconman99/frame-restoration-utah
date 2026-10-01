import { hashDashboardPin } from "../_shared/dashboard-credential.ts";

export function randomSessionToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
export async function sha256Hex(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2, "0")).join("");
}

const RESET_ORIGIN = "https://www.framerestorationutah.com";
const ACCEPTED = {
  message: "If the name and email match an active account, a reset link will arrive shortly.",
};
const encoder = new TextEncoder();
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function recoveryConfigured(action: string, env: (name: string) => string | undefined): boolean {
  if (env("CRM_RECOVERY_ENABLED") !== "true") return false;
  if (action === "reset_password") return true;
  return action === "request_password_reset" && Boolean(env("RESEND_API_KEY") && env("CRM_RECOVERY_FROM"));
}

export function validNewPassword(value: unknown): value is string {
  return typeof value === "string" && Array.from(value).length >= 12 &&
    encoder.encode(value).length <= 72 && value.trim().length > 0;
}

export function resetLink(token: string): string {
  if (!RESET_TOKEN_PATTERN.test(token)) throw new Error("invalid_reset_token");
  return `${RESET_ORIGIN}/dashboard#reset=${token}`;
}

export async function readRecoveryBody(req: Request): Promise<Record<string, unknown> | null> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

type RpcResult = { data: any; error: { code?: string } | null };
type Dependencies = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
  background: (task: Promise<void>) => void;
  send: (email: string, token: string, idempotencyKey: string) => Promise<boolean>;
  log: (event: string) => void;
};

export async function requestReset(
  body: Record<string, unknown>,
  clientHash: string,
  deps: Dependencies,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  const token = randomSessionToken();
  const tokenHash = await sha256Hex(token);
  const { data, error } = await deps.rpc("crm_request_password_reset", {
    p_name: name,
    p_email: email,
    p_token_hash: tokenHash,
    p_client_hash: clientHash,
  });
  if (error) {
    deps.log("crm_recovery_request_unavailable");
    return { status: 503, body: { error: "recovery_unavailable" } };
  }
  const row = data?.[0];
  // Mail is sent after the identical public response; mailbox existence and
  // provider timing must not become an account-enumeration channel.
  if (row?.recipient) {
    deps.background((async () => {
      let sent = false;
      try {
        sent = await deps.send(row.recipient, token, `crm-reset-${tokenHash}`);
      } catch {
        deps.log("crm_recovery_email_failed");
      }
      try {
        const marked = await deps.rpc("crm_mark_password_reset_delivery", {
          p_token_hash: tokenHash,
          p_sent: sent,
        });
        if (marked.error) deps.log("crm_recovery_delivery_state_failed");
      } catch {
        deps.log("crm_recovery_delivery_state_failed");
      }
      if (!sent) deps.log("crm_recovery_email_not_accepted");
    })());
  }
  return { status: 202, body: ACCEPTED };
}

export async function completeReset(
  body: Record<string, unknown>,
  clientHash: string,
  deps: Pick<Dependencies, "rpc" | "log">,
  credentialPepper: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (typeof body.token !== "string" || !RESET_TOKEN_PATTERN.test(body.token)) {
    return { status: 400, body: { error: "invalid_or_expired_link" } };
  }
  if (!validNewPassword(body.password)) {
    return {
      status: 400,
      body: {
        error: "invalid_password",
        message: "Use at least 12 characters and no more than 72 UTF-8 bytes.",
      },
    };
  }
  const { data, error } = await deps.rpc("crm_complete_password_reset", {
    p_token_hash: await sha256Hex(body.token),
    p_password: body.password,
    p_password_hash: await hashDashboardPin(credentialPepper, body.password),
    p_client_hash: clientHash,
  });
  if (error) {
    deps.log("crm_recovery_complete_unavailable");
    return { status: 503, body: { error: "recovery_unavailable" } };
  }
  if (data?.[0]?.reset_status === "password_unavailable") return { status: 400, body: { error: "invalid_password", message: "Please choose a different password." } };
  if (data?.[0]?.reset_status !== "ok") return { status: 400, body: { error: "invalid_or_expired_link" } };
  return { status: 200, body: { success: true, name: data[0].name } };
}

export async function sendResetEmail(
  apiKey: string,
  from: string,
  email: string,
  token: string,
  idempotencyKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const link = resetLink(token);
  const payload = {
    from,
    to: [email],
    subject: "Reset your Frame Restoration Utah portal password",
    text:
      `A password reset was requested for your Frame Restoration Utah owner portal.\n\nChoose a new password: ${link}\n\nThis link expires in 15 minutes and can be used once. If you did not request this, ignore this email; your password has not changed.`,
    html:
      `<p>A password reset was requested for your Frame Restoration Utah owner portal.</p><p><a href="${link}">Choose a new password</a></p><p>This link expires in 15 minutes and can be used once. If you did not request this, ignore this email; your password has not changed.</p>`,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const result = await response.json();
        return typeof result?.id === "string" && result.id.length > 0;
      }
      await response.body?.cancel();
      if (response.status !== 429 && response.status < 500) return false;
    } catch { /* bounded retry using the same provider idempotency key */ }
  }
  return false;
}
