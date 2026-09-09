import { assert, assertEquals } from "jsr:@std/assert@1";
import { applySender, MAIN_LINE } from "./twilio-sender.ts";

const SERVICE = "MG" + "0".repeat(32);
const SLC_TRACKING_DID = "+18014620526";

// The regression this suite exists to prevent:
// a Messaging Service in the pool silently choosing the sender.
Deno.test("From stays pinned when a Messaging Service is used", () => {
  const params = new URLSearchParams();
  applySender(params, { from: "", msgService: SERVICE });

  assertEquals(params.get("From"), MAIN_LINE);
  assertEquals(params.get("MessagingServiceSid"), SERVICE);
});

Deno.test("From is pinned even when TWILIO_PHONE_NUMBER is missing entirely", () => {
  for (const from of [undefined, null, "", "   "]) {
    const params = new URLSearchParams();
    applySender(params, { from, msgService: SERVICE });
    assertEquals(params.get("From"), MAIN_LINE, `from=${JSON.stringify(from)}`);
    assertEquals(params.get("MessagingServiceSid"), SERVICE);
  }
});

Deno.test("a configured From wins over the pinned fallback", () => {
  const params = new URLSearchParams();
  applySender(params, { from: SLC_TRACKING_DID, msgService: SERVICE });

  assertEquals(params.get("From"), SLC_TRACKING_DID);
  assertEquals(params.get("MessagingServiceSid"), SERVICE);
});

Deno.test("MessagingServiceSid is preserved so A2P registration still applies", () => {
  const params = new URLSearchParams();
  applySender(params, { from: "+14352928802", msgService: SERVICE });

  assert(params.has("MessagingServiceSid"));
  assertEquals(params.get("MessagingServiceSid"), SERVICE);
});

Deno.test("From is set even with no Messaging Service configured", () => {
  for (const svc of [undefined, null, "", "  "]) {
    const params = new URLSearchParams();
    applySender(params, { from: "", msgService: svc });
    assertEquals(params.get("From"), MAIN_LINE);
    assertEquals(
      params.has("MessagingServiceSid"),
      false,
      `svc=${JSON.stringify(svc)} must not set an empty service sid`,
    );
  }
});

Deno.test("From is never left unset for any config permutation", () => {
  const froms = [undefined, "", "  ", "+14352928802"];
  const svcs = [undefined, "", SERVICE];
  for (const from of froms) {
    for (const msgService of svcs) {
      const params = new URLSearchParams();
      applySender(params, { from, msgService });
      const value = params.get("From") ?? "";
      assert(
        value.startsWith("+1") && value.length >= 12,
        `From must always be a real number; got ${JSON.stringify(value)}`,
      );
    }
  }
});

Deno.test("mainLine override is honoured and falls back when blank", () => {
  const custom = "+15550001111";
  const a = new URLSearchParams();
  applySender(a, { from: "", msgService: SERVICE, mainLine: custom });
  assertEquals(a.get("From"), custom);

  const b = new URLSearchParams();
  applySender(b, { from: "", msgService: SERVICE, mainLine: "   " });
  assertEquals(b.get("From"), MAIN_LINE);
});

Deno.test("MAIN_LINE is the canonical public NAP line", () => {
  assertEquals(MAIN_LINE, "+14352928802");
});
