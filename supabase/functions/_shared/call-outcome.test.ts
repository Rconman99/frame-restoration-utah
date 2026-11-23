import { assertEquals } from "jsr:@std/assert@1";
import { answeredFromDial } from "./call-outcome.ts";

Deno.test("DialBridged wins", () => {
  assertEquals(answeredFromDial("true", "no-answer", 0), true);
  assertEquals(answeredFromDial("false", "completed", 30), false);
});
Deno.test("status + duration fallback", () => {
  assertEquals(answeredFromDial(undefined, "completed", 40), true);
  assertEquals(answeredFromDial(undefined, "completed", 0), false);
  assertEquals(answeredFromDial(undefined, "busy", 0), false);
  assertEquals(answeredFromDial(undefined, "ringing", 0), null);
});
Deno.test("DialBridged is case/whitespace tolerant and always beats status + duration", () => {
  assertEquals(answeredFromDial(" TRUE ", "no-answer", 0), true);
  assertEquals(answeredFromDial("False", "completed", 55), false);
  assertEquals(answeredFromDial(true, "completed", 0), true);
});
Deno.test("declined whisper shape: completed, whisper-leg talk time, never bridged -> missed", () => {
  assertEquals(answeredFromDial("false", "completed", 9), false);
});
Deno.test("unknown or missing status stays null, never a guessed label", () => {
  assertEquals(answeredFromDial(undefined, undefined, 30), null);
  assertEquals(answeredFromDial("", "", 0), null);
  assertEquals(answeredFromDial(undefined, "initiated", 0), null);
  assertEquals(answeredFromDial("maybe", "in-progress", 10), null);
});
Deno.test("answered/completed need real talk time; negative or NaN duration is not talk time", () => {
  assertEquals(answeredFromDial(undefined, "answered", 12), true);
  assertEquals(answeredFromDial(undefined, "ANSWERED", 0), false);
  assertEquals(answeredFromDial(undefined, "completed", -1), false);
  assertEquals(answeredFromDial(undefined, "completed", Number.NaN), false);
});
