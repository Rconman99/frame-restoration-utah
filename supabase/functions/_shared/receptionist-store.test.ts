import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  continueReceptionist,
  recordScreeningOutcome,
  type ScreeningConfig,
  startReceptionist,
} from "./receptionist-store.ts";
import { type ScreeningState } from "./receptionist.ts";
const SID = "CA" + "2".repeat(32);
type Row = {
  call_sid: string;
  stage: string;
  state: ScreeningState;
  owner_decision: string | null;
  bridged: boolean | null;
  call_logs: { from_number: string; to_number: string; status: string };
  [key: string]: unknown;
};
const input = { CallSid: SID, From: "+15555550123", To: "+15555550100" };
function fixture() {
  let row: Row | null = null;
  let writes = 0;
  let fail = false;
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const url = new URL(String(_input));
    if (
      url.origin !== "https://screening.test" ||
      !url.pathname.startsWith("/rest/v1/call_screenings")
    ) throw new Error("unexpected network");
    if (fail) return new Response("", { status: 503 });
    if (init?.method === "POST") {
      writes++;
      if (!row) {
        row = {
          ...JSON.parse(String(init.body)),
          owner_decision: null,
          bridged: null,
          call_logs: {
            from_number: input.From,
            to_number: input.To,
            status: "screening",
          },
        };
      }
      return new Response(null, { status: 201 });
    }
    if (init?.method === "PATCH") {
      const stage = url.searchParams.get("stage");
      const ownerFilter = url.searchParams.get("owner_decision");
      const bridgeFilter = url.searchParams.get("bridged");
      if (
        row && (!stage || stage === "eq." + row.stage) &&
        (!ownerFilter || row.owner_decision === null) &&
        (!bridgeFilter || row.bridged === null)
      ) {
        writes++;
        const patch = JSON.parse(String(init.body));
        Object.assign(row, patch);
        if (
          patch.state &&
          ["screening", "screening-insufficient"].includes(row.call_logs.status)
        ) {
          row.call_logs.status = row.state.action === "connect"
            ? "screened-awaiting-owner"
            : row.state.action === "reject"
            ? "screened-solicitation"
            : row.state.action === "voicemail"
            ? "screening-insufficient"
            : "screening";
        }
      }
      return new Response(null, { status: 204 });
    }
    return Response.json(row ? [structuredClone(row)] : []);
  };
  const config: ScreeningConfig = {
    supabaseUrl: "https://screening.test",
    serviceKey: "synthetic-only",
    owner: "Landon",
    voice: "test-voice",
    dial: (_id, sid) =>
      `<Response><Dial><Number url="private-whisper">${sid}</Number></Dial></Response>`,
    voicemail: (intro) =>
      `<Response><Say>${intro || "Leave a message"}</Say><Record/></Response>`,
  };
  return {
    config,
    restore: () => globalThis.fetch = original,
    row: () => row!,
    writes: () => writes,
    fail: () => fail = true,
  };
}
Deno.test("screening POST empty body succeeds and persists a versioned initial prompt", async () => {
  const f = fixture();
  try {
    const xml = await startReceptionist(f.config, SID, input.From);
    assertStringIncludes(xml, "step=purpose");
    assertEquals(f.row().state.turns.length, 1);
  } finally {
    f.restore();
  }
});
Deno.test("purpose-first transition, retries and terminal owner gate are monotonic", async () => {
  const f = fixture();
  try {
    await startReceptionist(f.config, SID, input.From);
    const first = await continueReceptionist(
      f.config,
      { ...input, SpeechResult: "Roof inspection" },
      "purpose",
      input.From,
    );
    assertStringIncludes(first, "step=name");
    assertEquals(f.row().state.turns.length, 3);
    await continueReceptionist(
      f.config,
      { ...input, SpeechResult: "different replay" },
      "purpose",
      input.From,
    );
    assertEquals(f.row().state.turns.length, 3);
    const end = await continueReceptionist(
      f.config,
      { ...input, SpeechResult: "Morgan" },
      "name",
      input.From,
    );
    assertStringIncludes(end, "<Dial>");
    assertStringIncludes(end, "Thanks, Morgan");
    assertEquals(f.row().state.turns.length, 5);
    await recordScreeningOutcome(f.config, SID, "accepted");
    const stale = await continueReceptionist(
      f.config,
      { ...input, SpeechResult: "Roof inspection" },
      "purpose",
      input.From,
    );
    assertEquals(stale, "<Response></Response>");
    await recordScreeningOutcome(f.config, SID, "voicemail");
    assertEquals(f.row().owner_decision, "accepted");
  } finally {
    f.restore();
  }
});
Deno.test("caller identity mismatch, unknown stage and bad SID cannot write a trace", async () => {
  const f = fixture();
  try {
    await startReceptionist(f.config, SID, input.From);
    const n = f.writes();
    for (
      const [data, stage] of [[{ ...input, From: "+15555550999" }, "purpose"], [
        input,
        "done",
      ], [{ ...input, CallSid: "bad" }, "purpose"]] as const
    ) {
      assertStringIncludes(
        await continueReceptionist(
          f.config,
          { ...data, SpeechResult: "Roof" },
          stage,
          input.From,
        ),
        "<Record",
      );
    }
    assertEquals(f.writes(), n);
  } finally {
    f.restore();
  }
});
Deno.test("keypad voicemail records requested-message wording, not an attempted transfer", async () => {
  const f = fixture();
  try {
    await startReceptionist(f.config, SID, input.From);
    const xml = await continueReceptionist(
      f.config,
      { ...input, Digits: "1" },
      "purpose",
      input.From,
    );
    assertStringIncludes(xml, "Please leave your name");
    assertEquals(f.row().state.reason, "message_requested");
  } finally {
    f.restore();
  }
});
Deno.test("late inbound retry cannot rewind an owner-approved call", async () => {
  const f = fixture();
  try {
    await startReceptionist(f.config, SID, input.From);
    await continueReceptionist(
      f.config,
      { ...input, SpeechResult: "Human please" },
      "purpose",
      input.From,
    );
    f.row().call_logs.status = "screened-owner-accepted";
    assertEquals(
      await startReceptionist(f.config, SID, input.From),
      "<Response></Response>",
    );
    assertEquals(f.row().stage, "done");
  } finally {
    f.restore();
  }
});
Deno.test("store errors stay inside a valid voicemail response and leak no payload", async () => {
  const f = fixture();
  try {
    f.fail();
    assertStringIncludes(
      await startReceptionist(f.config, SID, input.From),
      "<Record",
    );
    assertStringIncludes(
      await continueReceptionist(
        f.config,
        { ...input, SpeechResult: "private" },
        "purpose",
        input.From,
      ),
      "<Record",
    );
    assertEquals(
      await recordScreeningOutcome(f.config, SID, "accepted"),
      false,
    );
  } finally {
    f.restore();
  }
});
Deno.test("bridge proof is separate from acceptance and cannot be downgraded by a retry", async () => {
  const f = fixture();
  try {
    await startReceptionist(f.config, SID, input.From);
    await continueReceptionist(
      f.config,
      { ...input, SpeechResult: "Human please" },
      "purpose",
      input.From,
    );
    await recordScreeningOutcome(f.config, SID, "accepted");
    assertEquals(f.row().bridged, null);
    await recordScreeningOutcome(f.config, SID, "bridged");
    await recordScreeningOutcome(f.config, SID, "unbridged");
    assertEquals(f.row().bridged, true);
  } finally {
    f.restore();
  }
});
