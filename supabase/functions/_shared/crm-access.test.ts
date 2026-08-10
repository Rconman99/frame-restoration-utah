import {
  actionAllowed,
  normalizeAccessRole,
  publicAccessUser,
  validNewPin,
} from "./crm-access.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("viewer is report-only and cannot use the CRM function", () => {
  assert(normalizeAccessRole("viewer") === "viewer", "viewer role rejected");
  for (
    const action of [
      "list",
      "create",
      "update",
      "clicks",
      "growth_state",
      "growth_update",
      "access_list",
    ]
  ) {
    assert(!actionAllowed("viewer", action), `viewer allowed ${action}`);
  }
});

Deno.test("sales can use CRM actions but cannot manage access", () => {
  for (
    const action of [
      "list",
      "create",
      "update",
      "clicks",
      "growth_state",
      "growth_update",
    ]
  ) {
    assert(actionAllowed("sales", action), `sales denied ${action}`);
  }
  for (
    const action of [
      "access_list",
      "access_create",
      "access_toggle",
      "access_reset",
    ]
  ) {
    assert(!actionAllowed("sales", action), `sales allowed ${action}`);
  }
});

Deno.test("admin can use CRM and access-management actions", () => {
  for (
    const action of [
      "list",
      "create",
      "update",
      "clicks",
      "growth_state",
      "growth_update",
      "access_list",
      "access_create",
      "access_toggle",
      "access_reset",
    ]
  ) {
    assert(actionAllowed("admin", action), `admin denied ${action}`);
  }
});

Deno.test("unknown roles fail closed", () => {
  assert(normalizeAccessRole("owner") === null, "unknown role accepted");
  assert(normalizeAccessRole("") === null, "empty role accepted");
});

Deno.test("access responses never expose PIN material", () => {
  const user = publicAccessUser({
    id: "abc",
    name: "Landon <script>",
    role: "sales",
    active: true,
    pin: "123456",
    pin_hash: "a".repeat(64),
    last_accessed: null,
    created_at: "2026-08-07T00:00:00Z",
  });
  assert(!("pin" in user), "PIN leaked from access response");
  assert(!("pin_hash" in user), "PIN hash leaked from access response");
  assert(
    user.name === "Landon <script>",
    "name changed before DOM-safe render",
  );
});

Deno.test("new and reset PINs require 6-12 digits", () => {
  assert(validNewPin("123456"), "valid PIN rejected");
  assert(validNewPin("123456789012"), "12 digit PIN rejected");
  for (const value of ["12345", "1234567890123", "12ab56", 123456]) {
    assert(!validNewPin(value), `invalid PIN accepted: ${value}`);
  }
});
