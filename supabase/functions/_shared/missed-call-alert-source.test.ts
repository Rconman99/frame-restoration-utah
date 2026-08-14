import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const read = (path: string) => Deno.readTextFile(path);
const handleCall = await read("supabase/functions/handle-call/index.ts");
const handleSms = await read("supabase/functions/handle-sms/index.ts");
const migration = await read(
  "supabase/migrations/20260812010000_missed_call_alerts.sql",
);
const workflow = await read(".github/workflows/compliance-gate.yml");
const deployWorkflow = await read(".github/workflows/deploy-edge-function.yml");
const migrationRunner = await read("scripts/run-missed-call-migration.sh");
const deployGuide = await read("supabase/functions/handle-call/DEPLOY.md");

Deno.test("alert sends require a stable call SID and a fail-closed claim", () => {
  assertStringIncludes(
    handleCall,
    'const alertEventKey = callSid ? `missedalert:${callSid}` : ""',
  );
  assertStringIncludes(handleCall, "claimWebhook(alertEventKey, false)");
  assertStringIncludes(handleCall, "EdgeRuntime.waitUntil");
  assertStringIncludes(handleCall, "missed_alert_message_sid: messageSid");
  assertStringIncludes(
    handleCall,
    "missed_alert_sent_at: new Date().toISOString()",
  );
});

Deno.test("BLOCK targets a caller-specific accepted alert, never the latest arbitrary call", () => {
  assertStringIncludes(
    handleSms,
    "const blockCommand = parseBlockCommand(body)",
  );
  assertStringIncludes(handleSms, "isBlockCommandAttempt(body)");
  assertStringIncludes(handleSms, "claimWebhook(blockEventKey, false)");
  assertStringIncludes(handleSms, "releaseWebhookClaim(blockEventKey)");
  assertStringIncludes(handleSms, '.not("missed_alert_sent_at", "is", null)');
  assertStringIncludes(handleSms, "lastFour(phone) === blockCommand.lastFour");
  assertStringIncludes(handleSms, "matchingTargets.length > 1");
  assertEquals(
    handleSms.includes(
      '.order("created_at", { ascending: false })\n          .limit(1)',
    ),
    false,
  );
});

Deno.test("migration is private, receipt-capable, and contains no caller seed data", () => {
  assertStringIncludes(migration, "enable row level security");
  assertStringIncludes(migration, "from public, anon, authenticated");
  assertStringIncludes(
    migration,
    "alert_suppressed_callers_phone_e164_check",
  );
  assertStringIncludes(migration, "missed_alert_sent_at timestamptz");
  assertStringIncludes(migration, "missed_alert_message_sid text");
  assertEquals(
    migration.toLowerCase().includes(
      "insert into public.alert_suppressed_callers",
    ),
    false,
  );
});

Deno.test("the compliance gate executes both missed-call contracts", () => {
  assertStringIncludes(
    workflow,
    "supabase/functions/_shared/missed-call-alert.test.ts",
  );
  assertStringIncludes(
    workflow,
    "supabase/functions/_shared/missed-call-alert-source.test.ts",
  );
  assert(workflow.includes("20260812010000_missed_call_alerts.sql"));
});

Deno.test("production function deployment fails closed until the live schema is complete", () => {
  for (
    const required of [
      "migration_recorded",
      "suppression_table_present",
      "suppression_rls_enabled",
      "phone_constraint_validated",
      "sent_at_column_present",
      "message_sid_column_present",
      "browser_select_revoked",
      "service_role_access_present",
    ]
  ) {
    assertStringIncludes(deployWorkflow, required);
    assertStringIncludes(deployWorkflow, `.[0].${required} == true`);
  }
  assertStringIncludes(deployWorkflow, "database/query/read-only");
  assertStringIncludes(
    deployWorkflow,
    '[[ "$FUNCTION_NAME" != "handle-call" && "$FUNCTION_NAME" != "handle-sms" ]]',
  );
});

Deno.test("missed-call migration runner is exact, isolated, and resumable", () => {
  for (
    const contract of [
      "RELEASE_SHA",
      "UTAH_MIGRATION_EXCLUSIVE_WRITER_ACK",
      "UTAH_MIGRATION_EXECUTION_MODE",
      "SUPABASE_NO_KEYRING=1",
      "20260812010000_missed_call_alerts.sql",
      "19bde86daae30de86bbeb84c27aa899925b54f00d34b3a48e6ec44750e0cb261",
      "ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a",
      "remote_applied_history_guard.sql",
      "exactly 33 regular SQL files",
      "catalog.final-preflight.json",
      "catalog.postflight.json",
      "suppression_rows_preserved",
    ]
  ) {
    assertStringIncludes(migrationRunner, contract);
  }
  assertEquals(migrationRunner.includes("migration repair"), false);
  assertEquals(migrationRunner.includes("db push"), false);
  assertEquals(migrationRunner.includes("database/query"), false);
  assertEquals(migrationRunner.includes("psql"), false);
  assertStringIncludes(
    migrationRunner,
    "migration up --linked --include-all --yes",
  );
  assertStringIncludes(
    migrationRunner,
    'test "$(git -C "$REPO_ROOT" rev-parse origin/main)" = "$RELEASE_SHA"',
  );
  assertStringIncludes(
    migrationRunner,
    "target_recorded=\"$(jq -r '.[0].target_recorded'",
  );
  assertEquals(
    migrationRunner.includes(
      "target_recorded=\"$(jq -er '.[0].target_recorded'",
    ),
    false,
  );
  assertStringIncludes(migrationRunner, "browser_crud_revoked");
});

Deno.test("missed-call rollout preserves deploy order and outbound approval", () => {
  assertStringIncludes(deployGuide, "handle-sms` first");
  assertStringIncludes(deployGuide, "then deploy `handle-call`");
  assertStringIncludes(deployGuide, "without separate explicit approval");
  assertStringIncludes(deployGuide, "delivery-proven");
  assertStringIncludes(deployGuide, "scripts/run-missed-call-migration.sh");
});
