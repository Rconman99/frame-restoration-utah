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
