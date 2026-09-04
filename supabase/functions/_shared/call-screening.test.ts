import { assertEquals } from "jsr:@std/assert@1";
import {
  classifyScreeningResponse,
  isReusableCallerLead,
  isTrustedCallerLead,
  normalizeScreeningTranscript,
  screeningNote,
  transcriptFromScreeningNote,
  xmlEscape,
} from "./call-screening.ts";

Deno.test("silent callers go to voicemail instead of ringing the owner", () => {
  for (const input of [undefined, null, "", "  \n\t "]) {
    assertEquals(classifyScreeningResponse(input).action, "voicemail");
  }
});

Deno.test("explicit sales callers are declined", () => {
  for (
    const input of [
      "sales",
      "This is a sales call.",
      "a solicitation call",
      "telemarketing",
    ]
  ) {
    assertEquals(classifyScreeningResponse(input).action, "reject", input);
  }
});

Deno.test("high-confidence vendor pitches are declined", () => {
  for (
    const input of [
      "I'm calling about your Google Business Profile listing",
      "We provide search engine optimization for roofers",
      "I have a website design proposal",
      "Would you like to buy roofing leads?",
      "We offer merchant services and credit card processing",
      "You are prequalified for a business line of credit",
    ]
  ) {
    assertEquals(classifyScreeningResponse(input).action, "reject", input);
  }
});

Deno.test("customer language stays fail-open and reaches the owner screen", () => {
  for (
    const input of [
      "My name is Sarah and I need an estimate for a leaking roof",
      "I have storm damage and a question about my insurance claim",
      "Roof leak",
      "I am selling my house and need a roof inspection",
      "I found your Google Business Profile and need a roof replacement",
      "I need to speak with Landon about our current project",
    ]
  ) {
    assertEquals(classifyScreeningResponse(input).action, "connect", input);
  }
});

Deno.test("only real prior contact bypasses the assistant", () => {
  for (const status of ["contacted", "estimated", "won"]) {
    assertEquals(isTrustedCallerLead(status, "inbound-call"), true, status);
  }
  assertEquals(isTrustedCallerLead("new", "website-homepage"), true);
  assertEquals(isTrustedCallerLead("new", "inbound-sms"), true);
  assertEquals(isTrustedCallerLead("new", "inbound-call"), false);
  assertEquals(isTrustedCallerLead("spam", "website-homepage"), false);
  assertEquals(isTrustedCallerLead("lost", "website-homepage"), false);
});

Deno.test("spam and closed non-customer rows are never reused as accepted leads", () => {
  for (const status of ["spam", "lost", "third_party", "ul_request"]) {
    assertEquals(isReusableCallerLead(status), false, status);
  }
  for (const status of ["", "new", "contacted", "estimated", "won"]) {
    assertEquals(isReusableCallerLead(status), true, status);
  }
});

Deno.test("screening text is bounded, normalized, and safe inside TwiML", () => {
  assertEquals(
    normalizeScreeningTranscript("  Amy\n\u0000  needs help  "),
    "Amy needs help",
  );
  assertEquals(normalizeScreeningTranscript("x".repeat(700)).length, 500);
  assertEquals(
    xmlEscape(`A&B <roof> "quote" 'today'`),
    "A&amp;B &lt;roof&gt; &quot;quote&quot; &apos;today&apos;",
  );
});

Deno.test("stored assistant notes round-trip into the owner whisper", () => {
  const note = screeningNote("My name is Amy and I need a roof inspection");
  assertEquals(
    transcriptFromScreeningNote(note),
    "My name is Amy and I need a roof inspection",
  );
});
