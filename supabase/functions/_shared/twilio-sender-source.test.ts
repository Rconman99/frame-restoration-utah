import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

// Repo-wide guard. The sender-pinning bug recurred because the same two lines
// were duplicated across three functions and one of them was redeployed from a
// lane that lacked the fix. These assertions fail if ANY function reintroduces
// conditional sender selection, including a function that does not exist yet.

const read = (path: string) => Deno.readTextFile(path);

const SENDERS = [
  "supabase/functions/handle-lead/index.ts",
  "supabase/functions/send-message/index.ts",
  "supabase/functions/review-request/index.ts",
];

const sources = new Map<string, string>();
for (const path of SENDERS) sources.set(path, await read(path));
const helper = await read("supabase/functions/_shared/twilio-sender.ts");
const workflow = await read(".github/workflows/compliance-gate.yml");

Deno.test("every Messages.json sender routes through applySender", () => {
  for (const [path, src] of sources) {
    assertStringIncludes(src, 'from "../_shared/twilio-sender.ts"');
    assertStringIncludes(src, "applySender(params,");
  }
});

Deno.test("no function sets From in an else branch", () => {
  // The exact anti-pattern: `if (msgService) …MessagingServiceSid…; else …From…`
  const antiPattern = /else\s+params\.set\(\s*["']From["']/;
  for (const [path, src] of sources) {
    assert(
      !antiPattern.test(src),
      `${path} reintroduced the else-From pattern — the Messaging Service ` +
        `pool would choose the sender. Use applySender() instead.`,
    );
  }
});

Deno.test("no function sets MessagingServiceSid without also pinning From", () => {
  for (const [path, src] of sources) {
    const setsService = src.includes('params.set("MessagingServiceSid"');
    assertEquals(
      setsService,
      false,
      `${path} sets MessagingServiceSid directly. That must go through ` +
        `applySender() so From is pinned alongside it.`,
    );
  }
});

Deno.test("the helper always sets From unconditionally", () => {
  assertStringIncludes(helper, 'params.set("From", from || mainLine);');
  // From must not be inside a conditional in the helper either.
  const fromLine = helper
    .split("\n")
    .find((l) => l.includes('params.set("From"'));
  assert(fromLine !== undefined, "helper must set From");
  assert(
    !/^\s*(if|else)\b/.test(fromLine!),
    "helper must set From unconditionally, not in a branch",
  );
});

Deno.test("sender tests are wired into the compliance gate", () => {
  assertStringIncludes(workflow, "_shared/twilio-sender.test.ts");
  assertStringIncludes(workflow, "_shared/twilio-sender-source.test.ts");
});
