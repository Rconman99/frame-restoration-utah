#!/usr/bin/env node
/**
 * Contract tests for scripts/run-lead-migrations.sh — the exact-target runner
 * for 20261027221000_lead_spam_classification.sql,
 * 20261027230000_ai_referrer_tagging.sql and
 * 20261122230000_leads_intake_zip_city_source.sql.
 *
 * NOTHING here touches a Supabase project. Every test runs the real,
 * unmodified runner against a throwaway git repository and a stub `supabase`
 * executable on PATH, so each fail-closed gate can be driven to its hard stop
 * and the happy paths can be driven end to end offline.
 *
 * Two environment facts the runner checks cannot be produced on a Linux CI
 * runner, so the harness stubs exactly those two and nothing else:
 *   - `uname` reports Darwin/arm64 (the reviewed CLI binary receipt is macOS
 *     arm64 only);
 *   - `shasum` answers with the pinned official CLI digest for the one stub CLI
 *     path, and computes a real SHA-256 for every other input — the migration
 *     bytes, the poison guard, the history baselines.
 * A passing run is not proof that production is in any particular state, and is
 * not a substitute for the live read-only preflight.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(repoRoot, "scripts/run-lead-migrations.sh");
const runnerSource = fs.readFileSync(runner, "utf8");

const GUARD_PATH = "supabase/migration-baselines/remote-applied-history-guard.sql";
const TARGETS = [
  { version: "20261027221000", basename: "20261027221000_lead_spam_classification.sql" },
  { version: "20261027230000", basename: "20261027230000_ai_referrer_tagging.sql" },
  { version: "20261122230000", basename: "20261122230000_leads_intake_zip_city_source.sql" },
];
const CALL_TRACKING = ["20261027200000", "20261027220000"];
const PROJECT_REF = "hdcflshhomzildwqlmwh";
const CLI_DIGEST = "ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a";
const SHA = "a".repeat(40);

function embeddedList(label) {
  const block = runnerSource.split(`${label}="$(cat <<'VERSIONS'\n`)[1];
  assert.ok(block, `${label} heredoc not found in the runner`);
  return block.split("\nVERSIONS\n")[0].split("\n").filter((line) => line.length > 0);
}
const BASELINE = embeddedList("BASELINE_VERSIONS");
const EMBEDDED_CALL_TRACKING = embeddedList("CALL_TRACKING_VERSIONS");

function digestOfLines(lines) {
  return crypto.createHash("sha256").update(`${lines.join("\n")}\n`).digest("hex");
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function catalog(options = {}) {
  const recorded = new Set(options.recorded ?? []);
  const callTracking = options.callTracking ?? false;
  const history = [
    ...BASELINE,
    ...(callTracking ? CALL_TRACKING : []),
    ...(options.extraHistory ?? []),
    ...TARGETS.filter((target) => recorded.has(target.version)).map((t) => t.version),
  ].sort();
  const t1 = recorded.has(TARGETS[0].version);
  const t2 = recorded.has(TARGETS[1].version);
  const t3 = recorded.has(TARGETS[2].version);
  return [{
    history,
    spam_columns: t1 ? 5 : 0,
    spam_indexes: t1 ? 2 : 0,
    leads_ai_referrer: t2,
    phone_clicks_ai_referrer: t2,
    ai_referrer_function: t2,
    ai_referrer_trigger_function: t2,
    ai_referrer_triggers: t2 ? 2 : 0,
    ai_referrer_service_role_execute: t2,
    leads_zip: t3,
    leads_city_source: t3,
    lead_rows: options.leadRows ?? 412,
    phone_click_rows: options.phoneClickRows ?? 1308,
    ...(options.overrides ?? {}),
  }];
}

function migrationList(catalogRows, pendingVersions) {
  const history = catalogRows[0].history;
  const migrations = history.map((version) => ({ local: version, remote: version }));
  for (const version of pendingVersions) migrations.push({ local: version, remote: "" });
  return { migrations };
}

function pendingFor(recorded) {
  return TARGETS.filter((target) => !recorded.includes(target.version));
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const STUB_CLI = `#!/bin/sh
set -eu
state="$STUB_STATE_DIR"
case "$*" in
  *--version*) cat "$state/version.txt"; exit 0 ;;
esac
mode=''
workdir=''
project=''
prev=''
for arg in "$@"; do
  case "$arg" in
    projects) mode='projects' ;;
    init) mode='init' ;;
    link) mode='link' ;;
    query) mode='query' ;;
    list) test "$mode" = 'projects' || mode='list' ;;
    up) mode='up' ;;
  esac
  case "$prev" in
    --workdir) workdir="$arg" ;;
    --project-ref) project="$arg" ;;
  esac
  prev="$arg"
done
next_fixture() {
  prefix="$1"
  counter="$state/$prefix.count"
  n=1
  if [ -f "$counter" ]; then n=$(cat "$counter"); fi
  echo $((n + 1)) > "$counter"
  file="$state/$prefix.$n.json"
  while [ ! -f "$file" ] && [ "$n" -gt 1 ]; do
    n=$((n - 1))
    file="$state/$prefix.$n.json"
  done
  cat "$file"
}
case "$mode" in
  projects) cat "$state/projects.json" ;;
  init) mkdir -p "$workdir/supabase"; cp "$state/config.toml" "$workdir/supabase/config.toml" ;;
  link) mkdir -p supabase/.temp; cat "$state/linked-ref.txt" > supabase/.temp/project-ref ;;
  query) cat >/dev/null; next_fixture catalog ;;
  list) next_fixture list ;;
  up)
    cat "$state/up.stdout.json"
    cat "$state/up.stderr.txt" >&2
    exit "$(cat "$state/up.exit.txt")"
    ;;
  *) echo "stub supabase: unexpected invocation: $*" >&2; exit 90 ;;
esac
`;

const STUB_UNAME = `#!/bin/sh
case "\${1:-}" in
  -s) cat "$STUB_STATE_DIR/uname-s.txt" ;;
  -m) cat "$STUB_STATE_DIR/uname-m.txt" ;;
  *) cat "$STUB_STATE_DIR/uname-s.txt" ;;
esac
`;

// Real SHA-256 for every input except the one stub CLI path, which answers with
// the pinned official digest. No perl/coreutils dependency, so the harness
// behaves the same on macOS and on a Linux CI runner.
const STUB_SHASUM = `#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const target = process.argv.slice(2).find((arg) => !arg.startsWith("-") && arg !== "256");
if (target && target === process.env.STUB_CLI_PATH) {
  process.stdout.write(\`\${process.env.STUB_CLI_DIGEST}  \${target}\\n\`);
} else {
  const bytes = target ? fs.readFileSync(target) : fs.readFileSync(0);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  process.stdout.write(\`\${digest}  \${target ?? "-"}\\n\`);
}
`;

const STUB_SECURITY = `#!/bin/sh
exit "$(cat "$STUB_STATE_DIR/security.exit.txt")"
`;

function git(cwd, ...args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "runner test",
      GIT_AUTHOR_EMAIL: "runner@example.invalid",
      GIT_COMMITTER_NAME: "runner test",
      GIT_COMMITTER_EMAIL: "runner@example.invalid",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function writeStub(dir, name, body, mode = 0o755) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body, { mode });
  return file;
}

/**
 * Builds a throwaway world and runs the real runner in it.
 * Returns { status, stdout, stderr }.
 */
function runCase(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lead-runner-case-"));
  const work = path.join(root, "work");
  const origin = path.join(root, "origin.git");
  const state = path.join(root, "state");
  const bin = path.join(root, "bin");
  fs.mkdirSync(state);
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(work, "supabase/migrations"), { recursive: true });
  fs.mkdirSync(path.join(work, path.dirname(GUARD_PATH)), { recursive: true });

  const tamper = options.tamper ?? {};
  for (const target of TARGETS) {
    const relative = `supabase/migrations/${target.basename}`;
    const body = tamper[relative] ??
      fs.readFileSync(path.join(repoRoot, relative), "utf8");
    fs.writeFileSync(path.join(work, relative), body);
  }
  fs.writeFileSync(
    path.join(work, GUARD_PATH),
    tamper[GUARD_PATH] ?? fs.readFileSync(path.join(repoRoot, GUARD_PATH), "utf8"),
  );

  git(root, "init", "--bare", "--initial-branch=main", origin);
  git(work, "init", "--initial-branch=main");
  git(work, "add", "-A");
  git(work, "commit", "-m", "fixture");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "--quiet", "origin", "main");
  git(work, "fetch", "--quiet", "origin", "main");
  if (options.advanceHead) {
    // A commit that exists locally but is ahead of origin/main.
    fs.writeFileSync(path.join(work, "local-only.txt"), "ahead of origin/main\n");
    git(work, "add", "-A");
    git(work, "commit", "-m", "local only");
  }
  const tip = git(work, "rev-parse", "HEAD");

  // Stub CLI + the two environment facts a Linux runner cannot reproduce.
  fs.writeFileSync(path.join(state, "version.txt"), `${options.cliVersion ?? "2.113.0"}\n`);
  fs.writeFileSync(path.join(state, "config.toml"), "# runner-only generated config\n");
  fs.writeFileSync(
    path.join(state, "projects.json"),
    `${JSON.stringify(options.projects ?? { projects: [{ id: PROJECT_REF }] })}\n`,
  );
  fs.writeFileSync(
    path.join(state, "linked-ref.txt"),
    `${options.linkedRef ?? PROJECT_REF}\n`,
  );
  fs.writeFileSync(path.join(state, "uname-s.txt"), `${options.unameS ?? "Darwin"}\n`);
  fs.writeFileSync(path.join(state, "uname-m.txt"), `${options.unameM ?? "arm64"}\n`);
  fs.writeFileSync(path.join(state, "security.exit.txt"), `${options.securityExit ?? 0}\n`);
  fs.writeFileSync(
    path.join(state, "up.stdout.json"),
    `${JSON.stringify(options.up ?? { applied: [] })}\n`,
  );
  fs.writeFileSync(path.join(state, "up.stderr.txt"), options.upStderr ?? "");
  fs.writeFileSync(path.join(state, "up.exit.txt"), `${options.upExit ?? 0}\n`);
  for (const [index, rows] of (options.catalogs ?? []).entries()) {
    fs.writeFileSync(path.join(state, `catalog.${index + 1}.json`), `${JSON.stringify(rows)}\n`);
  }
  for (const [index, list] of (options.lists ?? []).entries()) {
    fs.writeFileSync(path.join(state, `list.${index + 1}.json`), `${JSON.stringify(list)}\n`);
  }

  const cliName = options.cliName ?? "supabase";
  const cliPath = path.join(bin, cliName);
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    TMPDIR: root,
    STUB_STATE_DIR: state,
    STUB_CLI_PATH: cliPath,
    STUB_CLI_DIGEST: options.cliDigest ?? CLI_DIGEST,
    RELEASE_SHA: options.releaseSha ?? tip,
    SUPABASE_BIN: options.supabaseBin === null ? "" : (options.supabaseBin ?? cliPath),
    LEAD_MIGRATION_EXECUTION_MODE: options.executionMode ?? "preflight",
    LEAD_MIGRATION_AUTH_MODE: options.authMode ?? "injected-token",
    LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK: options.ack ?? options.releaseSha ?? tip,
  };
  if (options.unsetAck) delete env.LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK;
  if (env.LEAD_MIGRATION_AUTH_MODE === "injected-token" && options.accessToken !== null) {
    env.SUPABASE_ACCESS_TOKEN = options.accessToken ?? "stub-token-not-a-real-credential";
  } else if (options.accessToken) {
    env.SUPABASE_ACCESS_TOKEN = options.accessToken;
  } else {
    delete env.SUPABASE_ACCESS_TOKEN;
  }

  writeStub(bin, cliName, STUB_CLI, options.cliMode ?? 0o755);
  writeStub(bin, "uname", STUB_UNAME);
  writeStub(bin, "shasum", STUB_SHASUM);
  writeStub(bin, "security", STUB_SECURITY);

  const result = spawnSync("bash", [runner], { cwd: work, encoding: "utf8", env });
  fs.rmSync(root, { recursive: true, force: true });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** Preflight with no target recorded: the ordinary first run. */
function pristinePreflight(extra = {}) {
  const rows = catalog({ callTracking: extra.callTracking ?? false });
  return {
    catalogs: [rows, rows],
    lists: [migrationList(rows, TARGETS.map((t) => t.version))],
    ...extra,
  };
}

function expectHardStop(result, fragment) {
  assert.notEqual(result.status, 0, `expected a hard stop, got:\n${result.stdout}`);
  assert.match(result.stderr, /Hard stop: /);
  assert.match(result.stderr, fragment);
}

// ---------------------------------------------------------------------------
// Pinned constants
// ---------------------------------------------------------------------------

test("the pinned baselines are the digests of the runner's own embedded lists", () => {
  assert.deepEqual(EMBEDDED_CALL_TRACKING, CALL_TRACKING);
  assert.equal(BASELINE.length, 36);
  assert.match(
    runnerSource,
    new RegExp(`BASELINE_SHA256='${digestOfLines(BASELINE)}'`),
  );
  assert.match(
    runnerSource,
    new RegExp(
      `CALL_TRACKING_BASELINE_SHA256='${
        digestOfLines([...BASELINE, ...CALL_TRACKING].sort())
      }'`,
    ),
  );
});

test("each reviewed target and the poison guard are pinned to their release bytes", () => {
  for (const target of TARGETS) {
    const bytes = fs.readFileSync(
      path.join(repoRoot, `supabase/migrations/${target.basename}`),
    );
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    assert.match(runnerSource, new RegExp(`'${digest}'`), `${target.basename} digest not pinned`);
    assert.match(runnerSource, new RegExp(`'${target.version}'`));
  }
  const guard = crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(repoRoot, GUARD_PATH))).digest("hex");
  assert.match(runnerSource, new RegExp(`GUARD_SHA256='${guard}'`));
});

test("the runner never reaches for a forbidden write path and owns its env names", () => {
  // Executable lines only: the header comment names the forbidden paths on
  // purpose, to say the runner does not use them.
  const executable = runnerSource
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  for (const forbidden of ["db push", "migration repair", "db reset", "db dump"]) {
    assert.equal(executable.includes(forbidden), false, `runner runs ${forbidden}`);
  }
  for (const name of [
    "LEAD_MIGRATION_EXECUTION_MODE",
    "LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK",
    "LEAD_MIGRATION_AUTH_MODE",
  ]) {
    assert.ok(runnerSource.includes(name), `${name} missing`);
  }
  for (const name of [
    "CALL_MIGRATION_EXECUTION_MODE",
    "UTAH_MIGRATION_EXCLUSIVE_WRITER_ACK",
  ]) {
    assert.equal(runnerSource.includes(name), false, `${name} must not be reused`);
  }
  assert.ok(runnerSource.includes("migration up --linked --include-all --yes"));
  assert.ok(runnerSource.includes("set -euo pipefail"));
  assert.ok(runnerSource.includes("umask 077"));
  // Only the three reviewed targets, never the other two pending Utah files.
  for (const excluded of ["20261111160000", "20261118000000"]) {
    assert.equal(runnerSource.includes(excluded), false, `${excluded} must not be in scope`);
  }
});

// ---------------------------------------------------------------------------
// Operator-input gates
// ---------------------------------------------------------------------------

test("RELEASE_SHA must be a full lowercase 40-character commit", () => {
  expectHardStop(runCase({ ...pristinePreflight(), releaseSha: "abc" }), /full 40-character/);
  expectHardStop(
    runCase({ ...pristinePreflight(), releaseSha: "A".repeat(40) }),
    /lowercase hexadecimal/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), releaseSha: SHA }),
    /does not resolve to a commit/,
  );
});

test("RELEASE_SHA must be the exact current origin/main tip", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), advanceHead: true }),
    /RELEASE_SHA is not the exact current origin\/main tip/,
  );
});

test("SUPABASE_BIN must name an executable CLI", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), supabaseBin: null }),
    /SUPABASE_BIN must name the reviewed executable/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), cliMode: 0o644 }),
    /SUPABASE_BIN must name the reviewed executable/,
  );
});

test("the exclusive-writer acknowledgement must equal RELEASE_SHA", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), ack: SHA }),
    /exclusive migration-writer window/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), unsetAck: true }),
    /exclusive migration-writer window/,
  );
});

test("execution mode and auth mode are closed enumerations", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), executionMode: "yolo" }),
    /LEAD_MIGRATION_EXECUTION_MODE must be preflight or apply/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), executionMode: "" }),
    /LEAD_MIGRATION_EXECUTION_MODE must be preflight or apply/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), authMode: "anonymous" }),
    /LEAD_MIGRATION_AUTH_MODE must be injected-token or keychain-profile/,
  );
});

test("injected-token mode needs a token and keychain-profile mode forbids one", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), authMode: "injected-token", accessToken: null }),
    /inject SUPABASE_ACCESS_TOKEN/,
  );
  expectHardStop(
    runCase({
      ...pristinePreflight(),
      authMode: "keychain-profile",
      accessToken: "stub-token-not-a-real-credential",
    }),
    /SUPABASE_ACCESS_TOKEN must be absent/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), authMode: "keychain-profile", securityExit: 1 }),
    /Keychain profile is unavailable/,
  );
  const ok = runCase({ ...pristinePreflight(), authMode: "keychain-profile" });
  assert.equal(ok.status, 0, ok.stderr);
});

// ---------------------------------------------------------------------------
// Platform and binary gates
// ---------------------------------------------------------------------------

test("the reviewed CLI receipt is refused off macOS arm64", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), unameS: "Linux" }),
    /only valid on macOS arm64/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), unameM: "x86_64" }),
    /only valid on macOS arm64/,
  );
});

test("only Supabase CLI 2.113.0, not supabase-go, and only the reviewed digest", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), cliVersion: "2.112.0" }),
    /Supabase CLI 2\.113\.0 is required/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), cliName: "supabase-go" }),
    /supabase-go compatibility binary is forbidden/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), cliDigest: "f".repeat(64) }),
    /binary digest differs from the reviewed official release/,
  );
});

test("the CLI login must resolve exactly the Utah project, and link must hit it", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), projects: { projects: [{ id: "wroaxatalhzslxkfmpse" }] } }),
    /cannot resolve the exact Utah project/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), projects: { projects: [] } }),
    /cannot resolve the exact Utah project/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), linkedRef: "wroaxatalhzslxkfmpse" }),
    /runner linked to the wrong project/,
  );
});

// ---------------------------------------------------------------------------
// Release-bytes gates
// ---------------------------------------------------------------------------

test("release bytes of every target and of the poison guard are verified", () => {
  for (const target of TARGETS) {
    const relative = `supabase/migrations/${target.basename}`;
    expectHardStop(
      runCase({
        ...pristinePreflight(),
        tamper: { [relative]: "-- tampered\nselect 1;\n" },
      }),
      new RegExp(`release bytes of ${target.basename} differ`),
    );
  }
  expectHardStop(
    runCase({
      ...pristinePreflight(),
      tamper: { [GUARD_PATH]: "select 1;\n" },
    }),
    /remote-history guard bytes differ/,
  );
});

// ---------------------------------------------------------------------------
// Remote-history and catalog gates
// ---------------------------------------------------------------------------

test("an unreviewed remote history is a hard stop", () => {
  const rows = catalog({ extraHistory: ["20261118000000"] });
  expectHardStop(
    runCase({
      catalogs: [rows, rows],
      lists: [migrationList(rows, TARGETS.map((t) => t.version))],
    }),
    /catalog state in .*catalog\.before\.json differs/,
  );
});

test("one of the two call-tracking versions is a hard stop", () => {
  for (const version of CALL_TRACKING) {
    const rows = catalog({ extraHistory: [version] });
    expectHardStop(
      runCase({
        catalogs: [rows, rows],
        lists: [migrationList(rows, TARGETS.map((t) => t.version))],
      }),
      /catalog state in .*catalog\.before\.json differs/,
    );
  }
});

test("a half-applied target without its history row is a hard stop", () => {
  for (
    const override of [
      { spam_columns: 3 },
      { spam_indexes: 1 },
      { leads_ai_referrer: true },
      { phone_clicks_ai_referrer: true },
      { ai_referrer_function: true },
      { ai_referrer_trigger_function: true },
      { ai_referrer_triggers: 1 },
      { ai_referrer_service_role_execute: true },
      { leads_zip: true },
      { leads_city_source: true },
    ]
  ) {
    const rows = catalog({ overrides: override });
    expectHardStop(
      runCase({
        catalogs: [rows, rows],
        lists: [migrationList(rows, TARGETS.map((t) => t.version))],
      }),
      /catalog state in .*catalog\.before\.json differs/,
    );
  }
});

test("a recorded target whose objects are missing is a hard stop", () => {
  const recorded = [TARGETS[0].version];
  const rows = catalog({ recorded, overrides: { spam_indexes: 0 } });
  expectHardStop(
    runCase({
      catalogs: [rows, rows],
      lists: [migrationList(rows, pendingFor(recorded).map((t) => t.version))],
    }),
    /catalog state in .*catalog\.before\.json differs/,
  );
});

test("the guarded migration list must be the matched history plus exactly the pending targets", () => {
  const rows = catalog();
  const pending = TARGETS.map((t) => t.version);
  const remoteOnly = migrationList(rows, pending);
  remoteOnly.migrations.push({ local: "", remote: "20261118000000" });
  expectHardStop(
    runCase({ catalogs: [rows, rows], lists: [remoteOnly] }),
    /guarded migration list is not the matched history/,
  );
  expectHardStop(
    runCase({ catalogs: [rows, rows], lists: [migrationList(rows, pending.slice(0, 2))] }),
    /guarded migration list is not the matched history/,
  );
  const extraLocal = migrationList(rows, [...pending, "20261111160000"]);
  expectHardStop(
    runCase({ catalogs: [rows, rows], lists: [extraLocal] }),
    /guarded migration list is not the matched history/,
  );
});

test("a catalog that moves between preflight and final preflight is a hard stop", () => {
  const before = catalog();
  const changed = catalog({ recorded: [TARGETS[2].version] });
  expectHardStop(
    runCase({
      catalogs: [before, changed],
      lists: [migrationList(before, TARGETS.map((t) => t.version))],
    }),
    /catalog state in .*catalog\.final-preflight\.json differs|catalog changed between preflight/,
  );
  // Same history, different object state: caught by the explicit comparison.
  const drifted = catalog({ overrides: {} });
  drifted[0].lead_rows = 500;
  const ok = runCase({
    catalogs: [before, drifted],
    lists: [migrationList(before, TARGETS.map((t) => t.version))],
  });
  assert.equal(ok.status, 0, ok.stderr); // row counts are allowed to move
});

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

test("preflight on a pristine baseline reports three pending targets and the lock sizing", () => {
  const result = runCase(pristinePreflight());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /mode=preflight/);
  assert.match(
    result.stdout,
    /pending=20261027221000_lead_spam_classification\.sql 20261027230000_ai_referrer_tagging\.sql 20261122230000_leads_intake_zip_city_source\.sql/,
  );
  assert.match(result.stdout, /lead_rows=412/);
  assert.match(result.stdout, /phone_click_rows=1308/);
  assert.match(result.stdout, /ACCESS EXCLUSIVE on public\.leads \(412 rows\) and public\.phone_clicks \(1308 rows\)/);
  assert.equal(result.stdout.includes("history"), false);
});

test("preflight accepts the call-tracking baseline and an already-recorded subset", () => {
  const recorded = [TARGETS[0].version, TARGETS[2].version];
  const rows = catalog({ callTracking: true, recorded });
  const pending = pendingFor(recorded);
  const result = runCase({
    catalogs: [rows, rows],
    lists: [migrationList(rows, pending.map((t) => t.version))],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pending=20261027230000_ai_referrer_tagging\.sql\s/);
});

test("apply applies exactly the pending targets in timestamp order", () => {
  const before = catalog();
  const after = catalog({ recorded: TARGETS.map((t) => t.version), leadRows: 413 });
  const pending = TARGETS.map((t) => t.basename);
  const result = runCase({
    executionMode: "apply",
    catalogs: [before, before, after],
    lists: [
      migrationList(before, TARGETS.map((t) => t.version)),
      migrationList(after, []),
    ],
    up: { applied: pending.map((basename) => `supabase/migrations/${basename}`) },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /mode=apply/);
  assert.match(result.stdout, /applied=20261027221000_lead_spam_classification\.sql 20261027230000_ai_referrer_tagging\.sql 20261122230000_leads_intake_zip_city_source\.sql/);
});

test("apply is a verified no-op when all three targets are already recorded", () => {
  const recorded = TARGETS.map((t) => t.version);
  const rows = catalog({ recorded, callTracking: true });
  const result = runCase({
    executionMode: "apply",
    catalogs: [rows, rows, rows],
    lists: [migrationList(rows, []), migrationList(rows, [])],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /All three targets are already recorded; postflight checks only\./);
  assert.match(result.stdout, /mode=apply/);
});

// ---------------------------------------------------------------------------
// Apply-path gates
// ---------------------------------------------------------------------------

test("a failed migration up stops without repairing history", () => {
  const before = catalog();
  const result = runCase({
    executionMode: "apply",
    catalogs: [before, before, before],
    lists: [migrationList(before, TARGETS.map((t) => t.version))],
    up: {},
    upStderr: "ERROR: relation does not exist\n",
    upExit: 1,
  });
  expectHardStop(result, /migration up failed; retain receipts and do not repair history/);
});

test("a selected poison guard is a hard stop", () => {
  const before = catalog();
  const result = runCase({
    executionMode: "apply",
    catalogs: [before, before, before],
    lists: [migrationList(before, TARGETS.map((t) => t.version))],
    up: { applied: ["supabase/migrations/20260610_remote_applied_history_guard.sql"] },
    upStderr: "UTAH_REMOTE_HISTORY_GUARD_SELECTED\n",
    upExit: 1,
  });
  expectHardStop(result, /remote-history poison guard was selected/);
});

test("migration up must report exactly the pending targets", () => {
  const before = catalog();
  const after = catalog({ recorded: TARGETS.map((t) => t.version) });
  const result = runCase({
    executionMode: "apply",
    catalogs: [before, before, after],
    lists: [migrationList(before, TARGETS.map((t) => t.version)), migrationList(after, [])],
    up: { applied: ["supabase/migrations/20261027221000_lead_spam_classification.sql"] },
  });
  expectHardStop(result, /did not apply exactly the pending targets in order/);
});

test("postflight requires every object, both row counts and a fully matched list", () => {
  const before = catalog();
  const pendingPaths = TARGETS.map((t) => `supabase/migrations/${t.basename}`);
  const applyCase = (after, lists) => runCase({
    executionMode: "apply",
    catalogs: [before, before, after],
    lists: [migrationList(before, TARGETS.map((t) => t.version)), ...lists],
    up: { applied: pendingPaths },
  });

  const missingObject = catalog({ recorded: TARGETS.map((t) => t.version) });
  missingObject[0].ai_referrer_triggers = 1;
  expectHardStop(
    applyCase(missingObject, [migrationList(missingObject, [])]),
    /catalog state in .*catalog\.postflight\.json differs/,
  );

  const lostLeads = catalog({ recorded: TARGETS.map((t) => t.version), leadRows: 400 });
  expectHardStop(
    applyCase(lostLeads, [migrationList(lostLeads, [])]),
    /leads lost rows during the migration/,
  );

  const lostClicks = catalog({
    recorded: TARGETS.map((t) => t.version),
    phoneClickRows: 1000,
  });
  expectHardStop(
    applyCase(lostClicks, [migrationList(lostClicks, [])]),
    /phone_clicks lost rows during the migration/,
  );

  const after = catalog({ recorded: TARGETS.map((t) => t.version) });
  const unmatched = migrationList(after, []);
  unmatched.migrations.push({ local: "20261111160000", remote: "" });
  expectHardStop(
    applyCase(after, [unmatched]),
    /final migration list is not fully matched/,
  );

  const missingHistoryRow = catalog({ recorded: [TARGETS[0].version, TARGETS[1].version] });
  expectHardStop(
    applyCase(missingHistoryRow, [migrationList(missingHistoryRow, [])]),
    /postflight history lacks a target/,
  );
});
