import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const handleCall = await Deno.readTextFile(
  "supabase/functions/handle-call/index.ts",
);

Deno.test("unknown callers enter the one-key flow without an area-code exemption", () => {
  assertStringIncludes(
    handleCall,
    "await findTrustedRecentLead(fromNumber)",
  );
  assertStringIncludes(
    handleCall,
    'const route = blocked ? "blocked" : (recentLeadId ? "ring" : "screen")',
  );
  assertStringIncludes(
    handleCall,
    '<Gather input="dtmf" numDigits="1" timeout="6"',
  );
  assertStringIncludes(handleCall, 'actionOnEmptyResult="true"');
  assertEquals(handleCall.includes("await startReceptionist("), false);
  assertStringIncludes(handleCall, "return xml(screenTwiml());");
  assertStringIncludes(handleCall, "await continueReceptionist(");
  assertEquals(handleCall.includes("UTAH_AREA_CODES"), false);
  assertEquals(handleCall.includes("isUtahNumber"), false);
  assertEquals(handleCall.includes("console.log(JSON.stringify(data"), false);
  assertStringIncludes(handleCall, "console.log(`[handle-call] path=${path}`)");
  assertStringIncludes(
    handleCall,
    "isTrustedCallerLead(lead.status, lead.source_page)",
  );
});

Deno.test("short connect prompt uses deterministic speech; legacy voices stay intact", () => {
  assertStringIncludes(
    handleCall,
    'const CALLER_VOICE = "Google.en-US-Chirp3-HD-Aoede"',
  );
  assertStringIncludes(
    handleCall,
    'const OWNER_WHISPER_VOICE = "Polly.Joanna-Neural"',
  );
  assertStringIncludes(
    handleCall,
    'const CONNECT_VOICE = "Polly.Joanna-Neural"',
  );
  assertStringIncludes(
    handleCall,
    '<Say voice="${CONNECT_VOICE}">Hey, this is Frame Restoration',
  );
  assertStringIncludes(
    handleCall,
    '<Say voice="${OWNER_WHISPER_VOICE}">Frame call.',
  );
  assertEquals(handleCall.includes("<Say>"), false);
});

Deno.test("screening cannot create a lead before owner acceptance", () => {
  const screenStart = handleCall.indexOf('if (path === "screen")');
  const ownerStart = handleCall.indexOf('if (path === "whisper-decision")');
  const completedStart = handleCall.indexOf(
    'if (path === "completed" || path === "status")',
  );
  assert(
    screenStart > 0 && ownerStart > screenStart && completedStart > ownerStart,
  );
  assertEquals(
    handleCall.slice(screenStart, ownerStart).includes(
      "createInboundCallLead(",
    ),
    false,
  );
  assertStringIncludes(
    handleCall.slice(ownerStart, completedStart),
    'const requestedAcceptance = digits === "1"',
  );
  assertEquals(
    handleCall.slice(ownerStart, completedStart).includes(
      "createInboundCallLead(",
    ),
    false,
  );
  assertStringIncludes(
    handleCall,
    "leadId = await createInboundCallLead(",
  );
  assertStringIncludes(
    handleCall,
    '"new",',
  );
});

Deno.test("the owner gets a private accept-or-voicemail whisper", () => {
  assertStringIncludes(handleCall, 'answerOnBridge="true"');
  assertStringIncludes(handleCall, "/handle-call/whisper?screenCallSid=");
  assertStringIncludes(
    handleCall,
    "Press one to connect, or two to send to voicemail",
  );
  assertStringIncludes(handleCall, '"screened-owner-rejected"');
  assertStringIncludes(handleCall, "if (ownerDeclined)");
  assertStringIncludes(
    handleCall,
    "Please leave your name, callback number, and message",
  );
});

Deno.test("Twilio retries cannot overwrite the owner decision or duplicate a lead", () => {
  assertStringIncludes(handleCall, "claimWebhook(`screen:${callSid}`, false)");
  const whisperStart = handleCall.indexOf('if (path === "whisper")');
  const ownerStart = handleCall.indexOf('if (path === "whisper-decision")');
  const completedStart = handleCall.indexOf(
    'if (path === "completed" || path === "status")',
  );
  assertEquals(
    handleCall.slice(whisperStart, ownerStart).includes("owner-screen:"),
    false,
  );
  assertEquals(handleCall.includes("claimWebhook(`owner-screen:"), false);
  assertStringIncludes(
    handleCall.slice(ownerStart, completedStart),
    "EdgeRuntime.waitUntil(",
  );
  assertStringIncludes(
    handleCall.slice(ownerStart, completedStart),
    "finalizeOwnerScreenDecision(",
  );
  assertStringIncludes(
    handleCall,
    '("screened-awaiting-owner","screened-owner-accepted","screened-owner-rejected")',
  );
  assertStringIncludes(
    handleCall,
    "const twilioResponseDeadline = Date.now() + TWILIO_RESPONSE_BUDGET_MS",
  );
  assertStringIncludes(
    handleCall.slice(ownerStart, completedStart),
    "persistOwnerScreenDecision(",
  );
  assertStringIncludes(
    handleCall,
    ".abortSignal(twilioDeadlineSignal(deadlineMs))",
  );
  assertStringIncludes(
    handleCall,
    'screeningStatus === "screened-owner-accepted"',
  );
  assertStringIncludes(
    handleCall,
    '"finalize_owner_screen_decision"',
  );
  assertStringIncludes(
    handleCall,
    '"ct=1000&rt=5000&tt=15000&rc=2&rp=5xx,ct,rt&e=umatilla,ashburn"',
  );
  assertStringIncludes(handleCall, '"completed?screened=1"');
  assertEquals(
    handleCall.includes("submissionKeyForCall"),
    false,
  );
});
