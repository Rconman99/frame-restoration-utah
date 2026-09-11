import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  advance,
  crmEvidence,
  GREETING,
  initialState,
  isClearPitch,
  renderGather,
  SCRIPT_VERSION,
  volunteeredName,
} from "./receptionist.ts";
const AT = "2026-09-10T20:00:00.000Z";
const step = (speech: string, owner: "Landon" | "Connor" = "Landon") =>
  advance(initialState(AT), { speech }, owner, AT);
Deno.test("approved greeting is help-first and has no phone/spam interview", () => {
  assertEquals(initialState(AT).prompt, GREETING);
  assert(!/sales|number|two quick|one quick/.test(GREETING));
});
Deno.test("volunteered name and purpose skip redundant questions in both markets", () => {
  for (const owner of ["Landon", "Connor"] as const) {
    const s = step("My name is Jamie and I need a roof inspection", owner);
    assertEquals(s.name, "Jamie");
    assertEquals(s.action, "connect");
    assertStringIncludes(s.prompt, "try " + owner);
  }
  assertEquals(volunteeredName("I'm calling about the roof"), "");
  assertEquals(
    volunteeredName("This is José García, I need an estimate"),
    "José García",
  );
});
Deno.test("ordinary service call gets one optional name question", () => {
  const s = step("I need a roof estimate");
  assertEquals(s.stage, "name");
  const end = advance(s, { speech: "Taylor Smith" }, "Connor", AT);
  assertEquals(end.name, "Taylor Smith");
  assertEquals(end.action, "connect");
  assertEquals(end.turns.length, 5);
});
Deno.test("name refusal, no speech and human request never trap a caller", () => {
  for (const speech of ["", "I'd rather not", "A human please"]) {
    assertEquals(
      advance(step("Roof repair"), { speech }, "Landon", AT).action,
      "connect",
    );
  }
});
Deno.test("urgent property requests and explicit human requests skip name", () => {
  for (
    const text of [
      "Water coming through my ceiling",
      "My roof is leaking",
      "A human please",
    ]
  ) {
    assertEquals(step(text).action, "connect");
  }
});
Deno.test("one clarification, then private owner path even for ambiguity", () => {
  const s = step("Can I speak to Connor?");
  assertEquals(s.stage, "clarify");
  const end = advance(
    s,
    { speech: "It's about something we discussed" },
    "Connor",
    AT,
  );
  assertEquals(end.action, "connect");
  assertEquals(end.stage, "done");
});
Deno.test("silence gets exactly one repair then voicemail; not a spam label", () => {
  const s = step("");
  assertEquals(s.stage, "clarify");
  const end = advance(s, { speech: "" }, "Landon", AT);
  assertEquals(end.action, "voicemail");
  assertEquals(end.reason, "no_input_after_repair");
  assertEquals(advance(end, { speech: "roof" }, "Landon", AT), end);
});
Deno.test("keypad message request works from each stage", () => {
  for (const s of [initialState(AT), step("Roof repair"), step("")]) {
    assertEquals(
      advance(s, { digits: "1" }, "Landon", AT).reason,
      "message_requested",
    );
  }
});
Deno.test("clear pitches cannot use roofing as an escape word", () => {
  for (
    const text of [
      "I sell roofing leads",
      "We provide search engine optimization for roofers",
      "We offer merchant services",
      "Would you like to buy roofing leads?",
      "I'm calling about your Google Business Profile",
      "This is a sales call.",
    ]
  ) {
    assertEquals(isClearPitch(text), true, text);
    assertEquals(step(text).action, "reject", text);
  }
});
Deno.test("customer, adjuster, quoted pitch and existing provider counterexamples stay open", () => {
  for (
    const text of [
      "I found your Google Business Profile and need a roof repair",
      "I run a marketing agency and our office roof is leaking",
      "I am an adjuster on an existing claim",
      "I'm selling my house and need a roof inspection",
      "Your SEO provider asked me to call about my roof",
      "I am not selling leads, I need an estimate",
      "I'm returning your call about our existing contract",
    ]
  ) {
    assertEquals(isClearPitch(text), false, text);
    assert(step(text).action !== "reject", text);
  }
});
Deno.test("bounded ASR evidence retains source/confidence but never treats it as verification", () => {
  const s = advance(
    initialState(AT),
    { speech: "<script>roof</script>", confidence: "0.12" },
    "Landon",
    AT,
  );
  assertEquals(s.turns[1].confidence, 0.12);
  assertEquals(s.turns[1].source, "twilio_speech");
  assertStringIncludes(crmEvidence(s), "caller-reported");
  assertStringIncludes(crmEvidence(s), SCRIPT_VERSION);
  const xml = renderGather(
    { ...s, prompt: "<unsafe>&" },
    "https://example.test?a=1&b=2",
    "voice",
  );
  assertStringIncludes(xml, "&lt;unsafe&gt;&amp;");
  assert(!xml.includes("<unsafe>"));
  assert(step("roof " + "x".repeat(20000)).purpose.length <= 1600);
});
Deno.test("an explicit pitch revealed at the optional name step is still screened", () => {
  const s = advance(
    step("Roofing"),
    { speech: "I sell roofing leads" },
    "Landon",
    AT,
  );
  assertEquals(s.action, "reject");
  assertStringIncludes(s.purpose, "I sell roofing leads");
});
