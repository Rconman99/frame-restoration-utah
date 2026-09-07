import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildFallbackMessage,
  buildFallbackTwiml,
  tokenMatches,
} from "./message.ts";

Deno.test("relays the sender and body so the lead is not lost", () => {
  const msg = buildFallbackMessage({
    from: "+15551230000",
    body: "hail took out half my roof, can you come look",
  });
  assertStringIncludes(msg, "+15551230000");
  assertStringIncludes(msg, "hail took out half my roof");
  assertStringIncludes(msg, "FALLBACK");
});

Deno.test("names the Twilio error code when one is supplied", () => {
  assertStringIncludes(buildFallbackMessage({ errorCode: "11200" }), "11200");
  const noCode = buildFallbackMessage({ from: "+15551230000" });
  assert(!noCode.includes("(Twilio"), "must not render an empty error code");
});

Deno.test("tells Landon photos exist even though it cannot relay them", () => {
  const one = buildFallbackMessage({ from: "+15551230000", numMedia: "1" });
  assertStringIncludes(one, "1 attachment");
  assertStringIncludes(one, "resend");

  const many = buildFallbackMessage({ from: "+15551230000", numMedia: "3" });
  assertStringIncludes(many, "3 attachments");
});

Deno.test("no attachment line when there is no media", () => {
  for (const numMedia of [undefined, "", "0", "not-a-number"]) {
    const msg = buildFallbackMessage({ from: "+15551230000", numMedia });
    assert(
      !msg.includes("attachment"),
      `numMedia=${JSON.stringify(numMedia)} must not claim attachments`,
    );
  }
});

Deno.test("degrades to 'unknown' rather than dropping the message", () => {
  const msg = buildFallbackMessage({});
  assertStringIncludes(msg, "unknown");
  assert(msg.length > 0);
});

Deno.test("an empty body still produces a relayable message", () => {
  const msg = buildFallbackMessage({ from: "+15551230000", body: "" });
  assertStringIncludes(msg, "+15551230000");
  assert(msg.trim().length > 0);
});

Deno.test("the header always marks the message as a fallback", () => {
  for (
    const p of [{}, { from: "+1555" }, { body: "hi" }, { numMedia: "2" }, {
      errorCode: "11205",
    }]
  ) {
    assertEquals(buildFallbackMessage(p).startsWith("[FALLBACK"), true);
  }
});

Deno.test("token gate rejects empty, wrong, and prefix-matching secrets", () => {
  const secret = "s3cr3t-value";
  assertEquals(tokenMatches(secret, secret), true);
  assertEquals(tokenMatches(secret, ""), false);
  assertEquals(tokenMatches(secret, "wrong-value1"), false);
  assertEquals(tokenMatches(secret, "s3cr3t"), false, "prefix must not pass");
  assertEquals(tokenMatches(secret, secret + "x"), false);
  assertEquals(tokenMatches("", secret), false, "unset secret must fail closed");
  assertEquals(tokenMatches("", ""), false);
});

Deno.test("twiml escapes the body and targets Landon", () => {
  const twiml = buildFallbackTwiml({
    from: "+15551230000",
    body: 'roof & <gutter> "damage"',
  });
  assertStringIncludes(twiml, 'to="+14353024422"');
  assertStringIncludes(twiml, "&amp;");
  assertStringIncludes(twiml, "&lt;gutter&gt;");
  assert(!twiml.includes("<gutter>"), "raw angle brackets must not reach TwiML");
});
