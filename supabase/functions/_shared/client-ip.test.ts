import {
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "jsr:@std/assert@1";
import {
  canonicalIp,
  clientIpIdentity,
  ipHashSecretReady,
  keyedClientIpHash,
  validIpHash,
} from "./client-ip.ts";

const SECRET = "test-client-ip-hash-secret-32-bytes-minimum";

Deno.test("canonicalizes strict IPv4 and IPv6 addresses", () => {
  assertEquals(canonicalIp("203.0.113.7"), "203.0.113.7");
  assertEquals(canonicalIp("2001:0DB8:0:0::7"), "2001:db8::7");
  for (
    const bad of [
      "203.0.113.7, 10.0.0.1",
      "203.0.113.7:443",
      "001.2.3.4",
      "256.1.1.1",
      "[2001:db8::7]",
      "2001:db8::7%eth0",
      "not-an-ip",
      "",
    ]
  ) {
    assertEquals(canonicalIp(bad), null, `accepted ${bad}`);
  }
});

Deno.test("trusts only the canonical Cloudflare gateway header", () => {
  assertEquals(
    clientIpIdentity(
      new Headers({
        "cf-connecting-ip": "203.0.113.9",
        "x-real-ip": "198.51.100.4",
        "x-forwarded-for": "192.0.2.3",
      }),
    ),
    { ip: "203.0.113.9", source: "cf-connecting-ip" },
  );
  for (
    const untrusted of [
      new Headers({ "x-real-ip": "2001:db8::4" }),
      new Headers({ "x-forwarded-for": "192.0.2.8" }),
      new Headers({
        "x-real-ip": "192.0.2.8",
        "x-forwarded-for": "attacker.invalid, 192.0.2.8",
      }),
      new Headers({
        "cf-connecting-ip": "invalid",
        "x-real-ip": "192.0.2.8",
      }),
    ]
  ) assertEquals(clientIpIdentity(untrusted), null);
});

Deno.test("produces bounded context-separated HMAC keys without raw IPs", async () => {
  const identity = {
    ip: "203.0.113.7",
    source: "cf-connecting-ip",
  } as const;
  const leadHash = await keyedClientIpHash(SECRET, "lead-intake-v1", identity);
  const authHash = await keyedClientIpHash(
    SECRET,
    "dashboard-auth-v1",
    identity,
  );
  assertEquals(validIpHash(leadHash), true);
  assertEquals(validIpHash(authHash), true);
  assertNotEquals(leadHash, authHash);
  assertEquals(leadHash.includes(identity.ip), false);

  await assertRejects(() => keyedClientIpHash(SECRET, "lead-intake-v1", null));
});

Deno.test("hashing rejects weak secrets and unbounded contexts", async () => {
  assertEquals(ipHashSecretReady("short"), false);
  assertEquals(ipHashSecretReady(SECRET), true);
  assertEquals(ipHashSecretReady("x".repeat(1025)), false);
  await assertRejects(() => keyedClientIpHash("short", "lead-intake-v1", null));
  await assertRejects(() =>
    keyedClientIpHash("x".repeat(1025), "lead-intake-v1", null)
  );
  await assertRejects(() => keyedClientIpHash(SECRET, "bad context", null));
});
