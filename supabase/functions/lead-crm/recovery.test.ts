import {
  completeReset,
  readRecoveryBody,
  recoveryConfigured,
  requestReset,
  resetLink,
  sendResetEmail,
  validNewPassword,
} from "./recovery.ts";
import { sha256Hex } from "./recovery.ts";
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const token = "a".repeat(43);
const PEPPER = "test-credential-pepper-at-least-32-bytes";
import { hashDashboardPin } from "../_shared/dashboard-credential.ts";

Deno.test("delivered links remain usable during mail configuration outages", () => {
  const config: Record<string, string> = { CRM_RECOVERY_ENABLED: "true" };
  const env = (name: string) => config[name];
  check(recoveryConfigured("reset_password", env), "mail outage blocked link completion");
  check(!recoveryConfigured("request_password_reset", env), "missing mail config allowed request");
  config.RESEND_API_KEY = "test-key";
  config.CRM_RECOVERY_FROM = "recovery@example.test";
  check(recoveryConfigured("request_password_reset", env), "configured request blocked");
  config.CRM_RECOVERY_ENABLED = "false";
  check(!recoveryConfigured("reset_password", env), "kill switch ignored");
});

Deno.test("recovery link is pinned to the canonical portal and keeps token out of query string", () => {
  const url = new URL(resetLink(token));
  check(
    url.origin === "https://www.framerestorationutah.com" && url.pathname === "/seo-report.html",
    "untrusted destination",
  );
  check(url.search === "" && url.hash === `#reset=${token}`, "token is in server URL");
  for (const invalid of ["", "short", token + "&email=attacker", "https://attacker.test"]) {
    let rejected = false;
    try {
      resetLink(invalid);
    } catch {
      rejected = true;
    }
    check(rejected, "invalid token accepted");
  }
});
Deno.test("new password uses exact Unicode text with a bounded byte ceiling", () => {
  check(validNewPassword("spaces are fine "), "valid spaces rejected");
  check(validNewPassword("a".repeat(72)), "72 ASCII bytes rejected");
  check(!validNewPassword("a".repeat(73)), "oversized password allowed");
  check(!validNewPassword("a".repeat(11)), "short password accepted");
  check(!validNewPassword(" ".repeat(12)), "blank password accepted");
  check(!validNewPassword("😀".repeat(19)), "UTF-8 byte cap ignored");
  check(validNewPassword("😀".repeat(12)), "valid Unicode rejected");
});
Deno.test("recovery body parsing fails closed on malformed, non-object, or over-limit input", async () => {
  for (const body of ["[]", "null", "oops", JSON.stringify({ name: "x".repeat(4096) })]) {
    check(
      await readRecoveryBody(
        new Request("https://test.local", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        }),
      ) === null,
      "invalid body accepted",
    );
  }
  const body = await readRecoveryBody(
    new Request("https://test.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"name":"Example"}',
    }),
  );
  check(body?.name === "Example", "valid body rejected");
});
Deno.test("request response is identical for known, unknown, and throttled accounts; email uses only DB recipient", async () => {
  const responses = [];
  for (const recipient of ["verified@example.test", null]) {
    const tasks: Promise<void>[] = [];
    const sent: string[] = [];
    let issuedHash = "";
    const result = await requestReset(
      { name: "Owner", email: "untrusted@example.test", redirect: "https://attacker.test" },
      "c".repeat(64),
      {
        rpc: async (name, args) => {
          if (name === "crm_request_password_reset") {
            issuedHash = String(args.p_token_hash);
            return { data: recipient ? [{ recipient }] : [], error: null };
          }
          check(name === "crm_mark_password_reset_delivery", "unexpected rpc");
          check(args.p_token_hash === issuedHash && args.p_sent === true, "delivery receipt mismatch");
          return { data: null, error: null };
        },
        background: (task) => tasks.push(task),
        send: async (email, raw, key) => {
          check(await sha256Hex(raw) === issuedHash, "raw token stored");
          check(key === `crm-reset-${issuedHash}`, "unstable idempotency");
          sent.push(email);
          return true;
        },
        log: () => {},
      },
    );
    await Promise.all(tasks);
    responses.push(JSON.stringify(result));
    check(sent.length === (recipient ? 1 : 0), "email count incorrect");
    if (recipient) check(sent[0] === recipient, "requester chose recovery mailbox");
    check(!JSON.stringify(result).includes(issuedHash), "response leaked reset digest");
  }
  check(responses[0] === responses[1], "account enumeration response");
});
Deno.test("failed delivery invalidates its token without changing public response", async () => {
  const tasks: Promise<void>[] = [];
  let marked = false;
  const result = await requestReset({ name: "Owner", email: "owner@example.test" }, "c".repeat(64), {
    rpc: async (name, args) => {
      if (name === "crm_request_password_reset") {
        return { data: [{ recipient: "owner@example.test" }], error: null };
      }
      marked = args.p_sent === false;
      return { data: null, error: null };
    },
    background: (t) => tasks.push(t),
    send: async () => false,
    log: () => {},
  });
  await Promise.all(tasks);
  check(marked && result.status === 202, "failed email left usable token or leaked account");
});
Deno.test("recovery outages fail visibly without leaking database errors", async () => {
  const result = await requestReset({}, "c".repeat(64), {
    rpc: async () => ({ data: null, error: { code: "secret detail" } }),
    background: () => {},
    send: async () => true,
    log: () => {},
  });
  check(
    result.status === 503 && !JSON.stringify(result).includes("secret detail"),
    "database error mishandled",
  );
});
Deno.test("completion hashes the token, preserves password and returns no login session", async () => {
  const password = "a valid password ";
  const result = await completeReset({ token, password }, "c".repeat(64), {
    rpc: async (name, args) => {
      check(
        name === "crm_complete_password_reset" && args.p_token_hash === await sha256Hex(token),
        "wrong redemption token",
      );
      check(args.p_password === password, "password modified");
      check(args.p_password_hash === await hashDashboardPin(PEPPER,password), "credential pepper/hash mismatch");
      return { data: [{ reset_status: "ok", name: "Example" }], error: null };
    },
    log: () => {},
  }, PEPPER);
  check(
    result.status === 200 && result.body.name === "Example" && !("token" in result.body),
    "completion auto-logged in",
  );
  for (const data of [[], [{ reset_status: "expired" }]]) {
    const failed = await completeReset({ token, password }, "c".repeat(64), {
      rpc: async () => ({ data, error: null }),
      log: () => {},
    }, PEPPER);
    check(
      failed.status === 400 && failed.body.error === "invalid_or_expired_link",
      "invalid link error differs",
    );
  }
});
Deno.test("provider retry pins destination and idempotency and does not include password", async () => {
  let attempts = 0;
  let firstBody = "";
  const accepted = await sendResetEmail(
    "test-key",
    "test@example.test",
    "verified@example.test",
    token,
    "test-key-unique",
    async (input, init) => {
      check(input === "https://api.resend.com/emails", "unexpected provider");
      const body = String(init?.body);
      const parsed = JSON.parse(body);
      check(parsed.to.length === 1 && parsed.to[0] === "verified@example.test", "wrong recipient");
      check(parsed.text.includes(resetLink(token)) && !("password" in parsed), "invalid email content");
      check(new Headers(init?.headers).get("Idempotency-Key") === "test-key-unique", "missing idempotency");
      if (attempts++ === 0) {
        firstBody = body;
        return new Response("{}", { status: 503 });
      }
      check(body === firstBody, "retry payload changed");
      return new Response('{"id":"test-email-id"}');
    },
  );
  check(accepted && attempts === 2, "transient failure did not recover");
});

Deno.test("new passwords preserve spaces and Unicode through the existing peppered credential contract", async () => {
  const password = "  a long new password 😀 ";
  check(await hashDashboardPin(PEPPER,password) !== await hashDashboardPin(PEPPER,password.trim()), "spaces lost");
  const result = await completeReset({token,password},"c".repeat(64),{
    rpc:async()=>({data:[{reset_status:"password_unavailable"}],error:null}),log:()=>{}
  },PEPPER);
  check(result.status===400 && result.body.error==="invalid_password", "credential collision mishandled");
});
