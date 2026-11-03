import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  attributeDialedNumber,
  leadPaysCommission,
  NOT_SEO_AEO_BUCKET,
  sourceWhisperLabel,
  sourceWhisperTwiml,
  TRACKING_NUMBERS,
  type TrackingNumber,
} from "./tracking-numbers.ts";

Deno.test("every mapped number declares placement and whisper", () => {
  for (const [n, e] of Object.entries(TRACKING_NUMBERS)) {
    assert(/^\+1\d{10}$/.test(n), n);
    assert(["seo_aeo", "directory", "other"].includes(e.placement), n);
    assert(e.whisper.length > 0, n);
  }
});

Deno.test("SEO/AEO numbers pay commission; unmapped never does", () => {
  assertEquals(attributeDialedNumber("+14352928802").commission, true);
  assertEquals(attributeDialedNumber("(801) 462-0526").commission, true);
  const u = attributeDialedNumber("+15555550100");
  assertEquals(u, { source: "unknown", placement: "unmapped", commission: false });
});

Deno.test("a Twilio number moved to Yelp stops paying commission and lands in Not SEO/AEO", () => {
  const moved: Record<string, TrackingNumber> = {
    ...TRACKING_NUMBERS,
    "+14356108978": { source: "yelp", placement: "directory", where: "Yelp", whisper: "Yelp lead" },
  };
  const before = attributeDialedNumber("+14356108978");
  const after = attributeDialedNumber("+14356108978", moved);
  assertEquals(before.commission, true);
  assertEquals(after.commission, false);
  assertEquals(after.source, `${NOT_SEO_AEO_BUCKET}:yelp`);
  // The lead row handle-call would write:
  const row = { call_source: after.source, commission_eligible: after.commission, source_page: "inbound-call" };
  assertEquals(leadPaysCommission(row), false);
  assertEquals(sourceWhisperLabel("+14356108978", moved), "Yelp lead, not SEO");
});

Deno.test("leadPaysCommission: stored flag wins; calls without flag never pay; forms pay unless directory utm", () => {
  assertEquals(leadPaysCommission({ commission_eligible: true }), true);
  assertEquals(leadPaysCommission({ commission_eligible: false, utm_source: "google" }), false);
  assertEquals(leadPaysCommission({ source_page: "inbound-call" }), false);
  assertEquals(leadPaysCommission({ call_source: "unknown" }), false);
  assertEquals(leadPaysCommission({ source_page: "/contact", utm_source: "google" }), true);
  assertEquals(leadPaysCommission({ source_page: "/contact" }), true);
  assertEquals(leadPaysCommission({ source_page: "/contact", utm_source: "Birdeye.com" }), false);
});

Deno.test("whisper label per source", () => {
  const m: Record<string, TrackingNumber> = {
    "+18015550101": { source: "google_website", placement: "seo_aeo", where: "site", whisper: "Website lead" },
    "+18015550102": { source: "slc_gbp", placement: "seo_aeo", where: "gbp", whisper: "Google lead" },
    "+18015550103": { source: "yelp", placement: "directory", where: "yelp", whisper: "Yelp lead" },
    "+18015550104": { source: "birdeye", placement: "directory", where: "birdeye", whisper: "Birdeye lead" },
    "+18015550105": { source: "bbb", placement: "other", where: "bbb", whisper: "" },
  };
  assertEquals(sourceWhisperLabel("+18015550101", m), "Website lead");
  assertEquals(sourceWhisperLabel("+18015550102", m), "Google lead");
  assertEquals(sourceWhisperLabel("+18015550103", m), "Yelp lead, not SEO");
  assertEquals(sourceWhisperLabel("+18015550104", m), "Birdeye lead, not SEO");
  assertEquals(sourceWhisperLabel("+18015550105", m), "bbb lead, not SEO");
  assertEquals(sourceWhisperLabel("+18015550199", m), "Untracked line, not SEO");
});

Deno.test("whisper TwiML is a single escaped <Say> (no dial, no gather)", () => {
  const t = sourceWhisperTwiml("Yelp lead, not SEO", "Polly.Joanna-Neural");
  assertStringIncludes(t, '<Say voice="Polly.Joanna-Neural">Yelp lead, not SEO.</Say>');
  assert(!/<Dial|<Gather|<Number/.test(t));
  assertStringIncludes(sourceWhisperTwiml("A & <B>"), "A &amp; &lt;B&gt;.");
});

Deno.test("ring-time SMS text per source", async () => {
  const { sourceAlertSmsText } = await import("./tracking-numbers.ts");
  const m: Record<string, TrackingNumber> = {
    "+18015550102": { source: "slc_gbp", placement: "seo_aeo", where: "gbp", whisper: "Google lead" },
    "+18015550103": { source: "yelp", placement: "directory", where: "yelp", whisper: "Yelp lead" },
  };
  assertEquals(sourceAlertSmsText("+18015550102", "+12145550123", m), "Google lead calling from +12145550123");
  assertEquals(sourceAlertSmsText("+18015550103", "2145550123", m), "Yelp lead (not SEO/AEO) calling from +12145550123");
  assertEquals(sourceAlertSmsText("+18015550199", "anonymous", m), "Untracked line (not SEO/AEO) lead calling from unknown number");
});

Deno.test("SMS failure never throws (call is not dropped)", async () => {
  const { sendSourceAlertSafely } = await import("./tracking-numbers.ts");
  let logged = 0;
  await sendSourceAlertSafely(() => Promise.reject(new Error("twilio 500")), () => { logged++; });
  await sendSourceAlertSafely(() => { throw new Error("sync"); }, () => { logged++; });
  assertEquals(logged, 2);
});

Deno.test("existing missed-call SMS carries the source label", async () => {
  const { missedCallAlertText } = await import("./missed-call-alert.ts");
  const t = missedCallAlertText({ fromNumber: "+12145550123", sourceLabel: "Yelp lead, not SEO" });
  assertStringIncludes(t, "Missed call (Yelp lead, not SEO)");
  assert(missedCallAlertText({ fromNumber: "+12145550123" }).startsWith("Missed call: "), "unchanged without label");
});
