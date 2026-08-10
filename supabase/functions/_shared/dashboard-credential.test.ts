import {
  dashboardCredentialPepperReady,
  hashDashboardPin,
  legacyPinCandidate,
  parseDashboardAuthRpcResult,
} from "./dashboard-credential.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const PEPPER = "test-dashboard-pepper-32-bytes-minimum";

Deno.test("PIN HMAC matches the migration's lowercase 64-hex contract", async () => {
  const digest = await hashDashboardPin(PEPPER, "123456");
  assert(/^[0-9a-f]{64}$/.test(digest), `unexpected digest ${digest}`);
  assert(
    digest ===
      "66d5f67f04d7c50b7f2e397b30eb5f7214f3a408f80f6bfb2b31ae663792510d",
    "HMAC fixture changed",
  );
});

Deno.test("PIN HMAC is deterministic and separated by PIN and pepper", async () => {
  const first = await hashDashboardPin(PEPPER, "123456");
  assert(
    await hashDashboardPin(PEPPER, "123456") === first,
    "digest not deterministic",
  );
  assert(
    await hashDashboardPin(PEPPER, "123457") !== first,
    "different PIN collided",
  );
  assert(
    await hashDashboardPin("different-dashboard-pepper-32-bytes", "123456") !==
      first,
    "different pepper collided",
  );
});

Deno.test("bounded legacy fallback accepts old alphanumeric shape only", () => {
  for (const value of ["1234", "legacy_26", "legacy-credential-2026"]) {
    assert(legacyPinCandidate(value), `legacy candidate rejected: ${value}`);
  }
  for (
    const value of ["123", "spaces are bad", "<script>", "x".repeat(33), 123456]
  ) {
    assert(
      !legacyPinCandidate(value),
      `invalid legacy candidate accepted: ${value}`,
    );
  }
});

Deno.test("credential hashing fails closed on a missing or weak pepper", async () => {
  assert(!dashboardCredentialPepperReady(""), "empty pepper accepted");
  assert(!dashboardCredentialPepperReady("too-short"), "weak pepper accepted");
  assert(dashboardCredentialPepperReady(PEPPER), "valid pepper rejected");
  let threw = false;
  try {
    await hashDashboardPin("short", "123456");
  } catch {
    threw = true;
  }
  assert(threw, "hashing continued with weak pepper");
});

Deno.test("dashboard auth RPC parser distinguishes a miss from one safe identity", () => {
  const miss = parseDashboardAuthRpcResult([]);
  assert(miss?.kind === "none", "empty RPC set is not an auth miss");

  const match = parseDashboardAuthRpcResult([{
    access_id: "992e93f9-a120-4f47-8be4-89952eb37955",
    access_name: "Sales User",
    access_role: "sales",
    access_active: true,
    access_session_version: 2,
  }]);
  assert(match?.kind === "match", "valid auth identity rejected");
  assert(match.identity.role === "sales", "role changed during parsing");
  assert(
    match.identity.session_version === 2,
    "version changed during parsing",
  );
});

Deno.test("dashboard auth RPC parser fails closed on ambiguous or unsafe rows", () => {
  const valid = {
    access_id: "992e93f9-a120-4f47-8be4-89952eb37955",
    access_name: "Sales User",
    access_role: "sales",
    access_active: true,
    access_session_version: 2,
  };
  for (
    const value of [
      null,
      {},
      [valid, valid],
      [{ ...valid, access_active: false }],
      [{ ...valid, access_session_version: 0 }],
      [{ ...valid, access_id: "not-a-uuid" }],
      [{ ...valid, pin: "must-never-return" }],
    ]
  ) {
    const parsed = parseDashboardAuthRpcResult(value);
    if (Array.isArray(value) && value.length === 1 && "pin" in value[0]) {
      // Unknown fields alone are harmless, but the safe identity is still the
      // only shape copied out by the parser.
      assert(parsed?.kind === "match", "safe projection rejected");
      assert(!("pin" in parsed.identity), "PIN escaped the safe projection");
    } else {
      assert(parsed === null, "unsafe auth RPC response was accepted");
    }
  }
});
