import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const handleCall = await Deno.readTextFile(
  "supabase/functions/handle-call/index.ts",
);

Deno.test("unknown callers must complete the speech interview", () => {
  assertStringIncludes(
    handleCall,
    "await findTrustedRecentLead(fromNumber)",
  );
  assertStringIncludes(
    handleCall,
    'const route = blocked ? "blocked" : (recentLeadId ? "ring" : "screen")',
  );
  assertStringIncludes(handleCall, '<Gather input="dtmf speech"');
  assertStringIncludes(handleCall, 'actionOnEmptyResult="true"');
  assertStringIncludes(
    handleCall.toLowerCase(),
    "please tell me your name, the best number to reach you",
  );
  assertEquals(handleCall.includes("UTAH_AREA_CODES"), false);
  assertEquals(handleCall.includes("isUtahNumber"), false);
  assertStringIncludes(
    handleCall,
    'safeLogData.SpeechResult = "[redacted]"',
  );
  assertStringIncludes(
    handleCall,
    "isTrustedCallerLead(lead.status, lead.source_page)",
  );
});

Deno.test("caller prompts use a humanized generative voice without weakening the owner whisper", () => {
  assertStringIncludes(
    handleCall,
    'const CALLER_VOICE = "Google.en-US-Chirp3-HD-Aoede"',
  );
  assertStringIncludes(
    handleCall,
    'const OWNER_WHISPER_VOICE = "Polly.Joanna-Neural"',
  );
  assertStringIncludes(handleCall, '<Say voice="${CALLER_VOICE}">Hi, thanks');
  assertStringIncludes(
    handleCall,
    '<Say voice="${OWNER_WHISPER_VOICE}">This is a screened Frame call.',
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
    'const accepted = (data.Digits || "").trim() === "1"',
  );
  assertStringIncludes(
    handleCall.slice(ownerStart, completedStart),
    "leadId = await createInboundCallLead(",
  );
  assertStringIncludes(
    handleCall.slice(ownerStart, completedStart),
    '"contacted",',
  );
});

Deno.test("the owner gets a private accept-or-voicemail whisper", () => {
  assertStringIncludes(handleCall, 'answerOnBridge="true"');
  assertStringIncludes(handleCall, "/handle-call/whisper?screenCallSid=");
  assertStringIncludes(handleCall, "Press 1 to accept");
  assertStringIncludes(handleCall, "Press 2 to send the caller to voicemail");
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
  assertStringIncludes(
    handleCall.slice(ownerStart, completedStart),
    "claimWebhook(`owner-screen:${screenCallSid}`, false)",
  );
  assertStringIncludes(
    handleCall,
    '("screened-awaiting-owner","screened-owner-accepted","screened-owner-rejected")',
  );
});
