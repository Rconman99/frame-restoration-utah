import {
  bearerToken,
  DASHBOARD_SESSION_TTL_SECONDS,
  DASHBOARD_SESSION_VERSION_MAX,
  dashboardSessionMatchesVersion,
  dashboardSessionSecretReady,
  dashboardSessionVersion,
  issueDashboardSession,
  verifyDashboardSession,
} from "./dashboard-session.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SECRET = "test-session-secret-32-bytes-minimum-value";
const OTHER_SECRET = "other-session-secret-32-bytes-minimum";
const SUBJECT = "123e4567-e89b-42d3-a456-426614174000";
const NOW = 1_800_000_000;
const JTI = "fixed_test_token_id_1234";
const SESSION_VERSION = 7;

async function token() {
  return await issueDashboardSession(SECRET, SUBJECT, SESSION_VERSION, {
    nowSeconds: NOW,
    tokenId: JTI,
  });
}

Deno.test("issues and verifies a short-lived subject/version-only session", async () => {
  const signed = await token();
  const claims = await verifyDashboardSession(
    SECRET,
    signed,
    NOW + DASHBOARD_SESSION_TTL_SECONDS - 1,
  );
  assert(claims?.sub === SUBJECT, "subject missing");
  assert(claims.sv === SESSION_VERSION, "session version missing");
  assert(
    dashboardSessionMatchesVersion(claims, SESSION_VERSION),
    "matching live session version rejected",
  );
  assert(
    !dashboardSessionMatchesVersion(claims, SESSION_VERSION + 1),
    "stale session version accepted",
  );
  assert(
    claims.exp === NOW + 8 * 60 * 60,
    "default expiry is not exactly one workday",
  );
  const encodedPayload = signed.split(".")[1].replace(/-/g, "+").replace(
    /_/g,
    "/",
  );
  const payload = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(encodedPayload + "=".repeat((4 - encodedPayload.length % 4) % 4)),
        (character) => character.charCodeAt(0),
      ),
    ),
  );
  for (const forbidden of ["pin", "key", "name", "role"]) {
    assert(!(forbidden in payload), `token payload exposes ${forbidden}`);
  }
});

Deno.test("expires exactly at exp and rejects excessive or future timing", async () => {
  const signed = await token();
  assert(
    await verifyDashboardSession(
      SECRET,
      signed,
      NOW + DASHBOARD_SESSION_TTL_SECONDS - 1,
    ),
    "valid token rejected",
  );
  assert(
    !(await verifyDashboardSession(
      SECRET,
      signed,
      NOW + DASHBOARD_SESSION_TTL_SECONDS,
    )),
    "expired token accepted",
  );

  let threw = false;
  try {
    await issueDashboardSession(SECRET, SUBJECT, SESSION_VERSION, {
      nowSeconds: NOW,
      ttlSeconds: DASHBOARD_SESSION_TTL_SECONDS + 1,
      tokenId: JTI,
    });
  } catch {
    threw = true;
  }
  assert(threw, "excessive TTL accepted");
  assert(
    !(await verifyDashboardSession(SECRET, signed, NOW - 61)),
    "token issued too far in the future accepted",
  );
});

Deno.test("rejects wrong secrets and tampering of every token section", async () => {
  const signed = await token();
  assert(
    !(await verifyDashboardSession(OTHER_SECRET, signed, NOW)),
    "wrong secret accepted",
  );
  const parts = signed.split(".");
  for (let index = 0; index < 3; index++) {
    const changed = [...parts];
    changed[index] = (changed[index][0] === "A" ? "B" : "A") +
      changed[index].slice(1);
    assert(
      !(await verifyDashboardSession(SECRET, changed.join("."), NOW)),
      `tampered token section ${index} accepted`,
    );
  }
});

Deno.test("rejects malformed tokens, invalid subjects, and weak secrets", async () => {
  assert(!dashboardSessionSecretReady("short"), "weak secret accepted");
  assert(dashboardSessionSecretReady(SECRET), "strong secret rejected");
  for (
    const malformed of ["", "one", "one.two", "one.two.three.four", "!..x.y"]
  ) {
    assert(
      !(await verifyDashboardSession(SECRET, malformed, NOW)),
      `accepted ${malformed}`,
    );
  }
  let subjectRejected = false;
  try {
    await issueDashboardSession(SECRET, "not-a-uuid", SESSION_VERSION, {
      nowSeconds: NOW,
    });
  } catch {
    subjectRejected = true;
  }
  assert(subjectRejected, "invalid subject accepted");
});

Deno.test("rejects missing, fractional, and out-of-range session versions", async () => {
  for (const version of [0, -1, 1.5, DASHBOARD_SESSION_VERSION_MAX + 1]) {
    assert(!dashboardSessionVersion(version), `accepted version ${version}`);
    let rejected = false;
    try {
      await issueDashboardSession(SECRET, SUBJECT, version, {
        nowSeconds: NOW,
        tokenId: JTI,
      });
    } catch {
      rejected = true;
    }
    assert(rejected, `issued session with version ${version}`);
  }
  assert(dashboardSessionVersion(1), "minimum session version rejected");
  assert(
    dashboardSessionVersion(DASHBOARD_SESSION_VERSION_MAX),
    "maximum session version rejected",
  );
});

Deno.test("Authorization parser accepts one strict Bearer session", async () => {
  const signed = await token();
  assert(
    bearerToken(`Bearer ${signed}`) === signed,
    "Bearer token not extracted",
  );
  for (
    const header of [
      null,
      "",
      signed,
      `bearer ${signed}`,
      `Bearer  ${signed}`,
      `Bearer ${signed} extra`,
    ]
  ) {
    assert(bearerToken(header) === null, `accepted malformed header ${header}`);
  }
});
