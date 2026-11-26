#!/usr/bin/env node
/**
 * Isolated-PostgreSQL contract for the REAL catalog probe SQL and the REAL jq
 * programs inside scripts/run-lead-migrations.sh.
 *
 * The stub-driven suite (scripts/run-lead-migrations.test.mjs) discards the
 * probe SQL — the stub reads stdin to /dev/null and replays a fixture — so the
 * SELECT itself was never executed anywhere. This runs it against a throwaway
 * postgres:16-alpine carrying the real Utah baselines, and feeds its output
 * through the runner's own validator and its COMMIT-before-history detector,
 * extracted from the script so they cannot drift.
 *
 * Three states, including the one the stub cannot produce honestly:
 *   1. pristine        — baselines only, nothing applied
 *   2. unrecorded T2   — 20261027221000 applied+recorded, 20261027230000
 *                        applied with its history insert MISSING (the
 *                        COMMIT-before-history gap)
 *   3. fully applied   — all three applied and recorded
 *
 * Needs psql and jq on PATH and the usual PG* connection environment. Touches
 * no Supabase project.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runnerSource = fs.readFileSync(
  path.join(repoRoot, "scripts/run-lead-migrations.sh"),
  "utf8",
);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lead-probe-"));

const BASELINE = (() => {
  const block = runnerSource.split("BASELINE_VERSIONS=\"$(cat <<'VERSIONS'\n")[1];
  return block.split("\nVERSIONS\n")[0].split("\n").filter(Boolean);
})();
const CALL_TRACKING = ["20261027200000", "20261027220000"];
const T1 = "20261027221000";
const T2 = "20261027230000";
const T3 = "20261122230000";

/** The probe SELECT, exactly as the runner sends it. */
function probeSql() {
  const sql = runnerSource.split("cat > \"$RECEIPT_DIR/probe.sql\" <<'SQL'\n")[1]
    .split("\nSQL\n")[0];
  assert.ok(sql.trim().startsWith("select"), "probe SQL not found in the runner");
  assert.ok(sql.includes("spam_indexes_exact"), "probe SQL is missing the strengthened fields");
  return sql.trim().replace(/;$/, "");
}

/** The runner's catalog validator, extracted verbatim. */
function validatorProgram() {
  const program = runnerSource
    .split('--arg t1 "$T1_VERSION" --arg t2 "$T2_VERSION" --arg t3 "$T3_VERSION" \'')[1]
    .split("\n    ' \"$1\"")[0];
  assert.ok(program.includes("spam_indexes_exact"), "validator program not found");
  return program;
}

/** The runner's COMMIT-before-history detector, extracted verbatim. */
function detectorProgram() {
  const body = runnerSource.split("is_unrecorded_t2_state() {")[1];
  const program = body.split("--arg t1 \"$T1_VERSION\" --arg t2 \"$T2_VERSION\" '")[1]
    .split("\n  ' \"$1\"")[0];
  assert.ok(
    program.includes("ai_referrer_trigger_function"),
    "detector program not found",
  );
  return program;
}

function psql(sql, { expectOk = true } = {}) {
  const file = path.join(scratch, "stmt.sql");
  fs.writeFileSync(file, sql);
  const result = spawnSync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-f", file],
    { encoding: "utf8" },
  );
  if (expectOk) {
    assert.equal(result.status, 0, `psql failed:\n${result.stderr}\n--- sql ---\n${sql}`);
  }
  return { status: result.status, stdout: (result.stdout ?? "").trim(), stderr: result.stderr ?? "" };
}

function psqlFile(relative) {
  const result = spawnSync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-q", "-f", path.join(repoRoot, relative)],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, `psql -f ${relative} failed:\n${result.stderr}`);
}

function runProbe() {
  const { stdout } = psql(
    `select coalesce(json_agg(t), '[]'::json) from (\n${probeSql()}\n) t;`,
  );
  const rows = JSON.parse(stdout);
  assert.equal(rows.length, 1, "the probe must return exactly one row");
  return rows;
}

function jqAccepts(program, rows, args) {
  const programFile = path.join(scratch, "program.jq");
  const inputFile = path.join(scratch, "input.json");
  fs.writeFileSync(programFile, program);
  fs.writeFileSync(inputFile, JSON.stringify(rows));
  const argv = ["-e", "-f", programFile];
  for (const [flag, name, value] of args) argv.splice(1, 0, flag, name, value);
  const result = spawnSync("jq", [...argv, inputFile], { encoding: "utf8" });
  assert.ok(
    result.status === 0 || result.status === 1,
    `jq errored (${result.status}): ${result.stderr}`,
  );
  return result.status === 0;
}

const validatorArgs = () => [
  ["--argjson", "baseline", JSON.stringify(BASELINE)],
  ["--argjson", "calltracking", JSON.stringify(CALL_TRACKING)],
  ["--arg", "t1", T1],
  ["--arg", "t2", T2],
  ["--arg", "t3", T3],
];
const detectorArgs = [
  ["--arg", "t1", T1],
  ["--arg", "t2", T2],
];

const checks = [];
function check(label, fn) {
  try {
    fn();
    checks.push(`  ok  ${label}`);
  } catch (error) {
    checks.push(`FAIL  ${label}\n      ${error.message}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// State 1: the real baselines, the real history table, nothing applied
// ---------------------------------------------------------------------------
for (
  const file of [
    "supabase/migrations/20260401000003_baseline_leads.sql",
    "supabase/migrations/20260401000004_baseline_phone_clicks.sql",
    "supabase/migrations/20260510_add_attribution_columns.sql",
    "supabase/tests/lead_migrations_rollback_fixture.sql",
  ]
) psqlFile(file);

// The reviewed 36-version baseline plus the call-tracking pair, as the runner
// requires before an apply.
psql(
  `insert into supabase_migrations.schema_migrations (version) values ${
    [...BASELINE, ...CALL_TRACKING].map((v) => `('${v}')`).join(", ")
  } on conflict (version) do nothing;`,
);

const pristine = runProbe();

check("the probe returns every field the validator reads", () => {
  const expected = [
    "history",
    "spam_columns",
    "spam_indexes",
    "spam_indexes_exact",
    "leads_ai_referrer",
    "phone_clicks_ai_referrer",
    "ai_referrer_function",
    "ai_referrer_trigger_function",
    "ai_referrer_triggers",
    "ai_referrer_triggers_armed",
    "ai_referrer_service_role_execute",
    "ai_referrer_anon_execute",
    "ai_referrer_authenticated_execute",
    "ai_referrer_trigger_anon_execute",
    "ai_referrer_trigger_authenticated_execute",
    "leads_zip",
    "leads_city_source",
    "lead_rows",
    "phone_click_rows",
  ];
  assert.deepEqual(Object.keys(pristine[0]).sort(), [...expected].sort());
});

check("a pristine catalog reports every target absent", () => {
  const row = pristine[0];
  assert.deepEqual(row.history.sort(), [...BASELINE, ...CALL_TRACKING].sort());
  for (
    const field of [
      "spam_columns",
      "spam_indexes",
      "spam_indexes_exact",
      "ai_referrer_triggers",
      "ai_referrer_triggers_armed",
    ]
  ) assert.equal(row[field], 0, field);
  for (
    const field of [
      "leads_ai_referrer",
      "phone_clicks_ai_referrer",
      "ai_referrer_function",
      "ai_referrer_trigger_function",
      "ai_referrer_service_role_execute",
      "ai_referrer_anon_execute",
      "ai_referrer_authenticated_execute",
      "ai_referrer_trigger_anon_execute",
      "ai_referrer_trigger_authenticated_execute",
      "leads_zip",
      "leads_city_source",
    ]
  ) assert.equal(row[field], false, field);
  assert.equal(typeof row.lead_rows, "number");
  assert.equal(typeof row.phone_click_rows, "number");
});

check("the real validator accepts the pristine state", () => {
  assert.equal(jqAccepts(validatorProgram(), pristine, validatorArgs()), true);
});
check("the real detector rejects the pristine state", () => {
  assert.equal(jqAccepts(detectorProgram(), pristine, detectorArgs), false);
});

// ---------------------------------------------------------------------------
// State 2: 20261027221000 applied+recorded; 20261027230000 applied with NO
// history row — the COMMIT-before-history gap, reproduced for real
// ---------------------------------------------------------------------------
psqlFile("supabase/migrations/20261027221000_lead_spam_classification.sql");
psql(`insert into supabase_migrations.schema_migrations (version) values ('${T1}') on conflict (version) do nothing;`);
psqlFile("supabase/migrations/20261027230000_ai_referrer_tagging.sql");
// Deliberately NOT inserting the history row for T2: this is what the CLI
// leaves behind when the file's own COMMIT succeeds and the history insert
// afterwards does not.

const unrecorded = runProbe();

check("the probe sees the AI-referrer objects armed while its history row is absent", () => {
  const row = unrecorded[0];
  assert.equal(row.history.includes(T1), true);
  assert.equal(row.history.includes(T2), false);
  assert.equal(row.spam_columns, 5);
  assert.equal(row.spam_indexes, 2);
  assert.equal(row.spam_indexes_exact, 2, "the pinned index definitions must match byte for byte");
  assert.equal(row.leads_ai_referrer, true);
  assert.equal(row.phone_clicks_ai_referrer, true);
  assert.equal(row.ai_referrer_function, true);
  assert.equal(row.ai_referrer_trigger_function, true);
  assert.equal(row.ai_referrer_triggers, 2);
  assert.equal(row.ai_referrer_triggers_armed, 2, "tgtype must be exactly 7 with no WHEN clause");
  assert.equal(row.ai_referrer_service_role_execute, true);
  assert.equal(row.ai_referrer_anon_execute, false);
  assert.equal(row.ai_referrer_authenticated_execute, false);
  assert.equal(row.ai_referrer_trigger_anon_execute, false);
  assert.equal(row.ai_referrer_trigger_authenticated_execute, false);
  assert.equal(row.leads_zip, false);
});

check("the real detector recognises the COMMIT-before-history state", () => {
  assert.equal(jqAccepts(detectorProgram(), unrecorded, detectorArgs), true);
});
check("the real validator rejects the unrecorded state outright", () => {
  // There is no recovery opt-in any more: the runner stops and escalates.
  assert.equal(jqAccepts(validatorProgram(), unrecorded, validatorArgs()), false);
});

// Each of these perturbs the database, so the undo runs in a finally: an
// assertion failure must not leak state into the checks that follow.
check("a disabled trigger is not armed, on real Postgres", () => {
  psql("alter table public.leads disable trigger leads_set_ai_referrer;");
  try {
    const disabled = runProbe();
    assert.equal(disabled[0].ai_referrer_triggers, 2, "existence alone still passes");
    assert.equal(disabled[0].ai_referrer_triggers_armed, 1, "armed must not");
    // The validator is what must reject it. (The escalation detector looks at
    // existence only, by design — it exists to produce a better message, not to
    // decide anything.)
    assert.equal(jqAccepts(validatorProgram(), disabled, validatorArgs()), false);
  } finally {
    psql("alter table public.leads enable trigger leads_set_ai_referrer;");
  }
});

check("EXECUTE granted to PUBLIC surfaces on anon and authenticated, on real Postgres", () => {
  psql("grant execute on function public.frame_ai_referrer(text, text) to public;");
  try {
    const leaked = runProbe();
    assert.equal(leaked[0].ai_referrer_anon_execute, true);
    assert.equal(leaked[0].ai_referrer_authenticated_execute, true);
    assert.equal(jqAccepts(validatorProgram(), leaked, validatorArgs()), false);
  } finally {
    psql("revoke execute on function public.frame_ai_referrer(text, text) from public;");
  }
});

check("a redefined index fails the exact-definition check, on real Postgres", () => {
  psql("drop index public.leads_spam_label_created_idx;");
  psql("create index leads_spam_label_created_idx on public.leads (spam_label);");
  try {
    const redefined = runProbe();
    assert.equal(redefined[0].spam_indexes, 2, "the name is still there");
    assert.equal(redefined[0].spam_indexes_exact, 1, "the definition is not");
    assert.equal(jqAccepts(validatorProgram(), redefined, validatorArgs()), false);
  } finally {
    psql("drop index public.leads_spam_label_created_idx;");
    psql("create index leads_spam_label_created_idx on public.leads (spam_label, created_at desc);");
  }
});

// ---------------------------------------------------------------------------
// State 3: all three applied and recorded
// ---------------------------------------------------------------------------
psql(`insert into supabase_migrations.schema_migrations (version) values ('${T2}') on conflict (version) do nothing;`);
psqlFile("supabase/migrations/20261122230000_leads_intake_zip_city_source.sql");
psql(`insert into supabase_migrations.schema_migrations (version) values ('${T3}') on conflict (version) do nothing;`);

const applied = runProbe();

check("the fully applied state passes the validator and is not a recovery state", () => {
  const row = applied[0];
  assert.deepEqual(row.history.sort(), [...BASELINE, ...CALL_TRACKING, T1, T2, T3].sort());
  assert.equal(row.leads_zip, true);
  assert.equal(row.leads_city_source, true);
  assert.equal(row.spam_indexes_exact, 2);
  assert.equal(row.ai_referrer_triggers_armed, 2);
  assert.equal(jqAccepts(validatorProgram(), applied, validatorArgs()), true);
  assert.equal(jqAccepts(detectorProgram(), applied, detectorArgs), false);
});

fs.rmSync(scratch, { recursive: true, force: true });
process.stdout.write(`${checks.join("\n")}\n`);
process.stdout.write(
  process.exitCode
    ? "lead-migration probe contract: FAILED\n"
    : "lead-migration probe contract: the real probe SQL and the real jq programs agree on all three states\n",
);
