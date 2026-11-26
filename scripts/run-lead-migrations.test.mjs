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
 * The stub is STRICT: it dispatches on the exact argument vector, logs every
 * invocation, records the exact staged migration set at mutation time, and
 * exits 90 on anything it was not told to expect. Flag drift in the runner
 * therefore fails the suite instead of being absorbed by a wildcard.
 *
 * Three environment facts a Linux CI runner cannot reproduce are stubbed and
 * nothing else:
 *   - `uname` reports Darwin/arm64 (the reviewed CLI binary receipt is macOS
 *     arm64 only);
 *   - `shasum` answers with the pinned official CLI digest for the one stub CLI
 *     path, and computes a real SHA-256 for every other input — the migration
 *     bytes, the poison guard and the history baselines are digested for real;
 *   - `grep` can be told to return an I/O error for the poison-guard scan, so
 *     the "a failed scan is not a clean scan" gate is exercised.
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
  // `aiPresent` lets a case describe the COMMIT-before-history state: the
  // AI-referrer objects present while 20261027230000 is not recorded.
  const t2 = options.aiPresent ?? recorded.has(TARGETS[1].version);
  const t3 = recorded.has(TARGETS[2].version);
  return [{
    history,
    spam_columns: t1 ? 5 : 0,
    spam_indexes: t1 ? 2 : 0,
    spam_indexes_exact: t1 ? 2 : 0,
    leads_ai_referrer: t2,
    phone_clicks_ai_referrer: t2,
    ai_referrer_function: t2,
    ai_referrer_trigger_function: t2,
    ai_referrer_triggers: t2 ? 2 : 0,
    ai_referrer_triggers_armed: t2 ? 2 : 0,
    ai_referrer_service_role_execute: t2,
    ai_referrer_anon_execute: false,
    ai_referrer_authenticated_execute: false,
    ai_referrer_trigger_anon_execute: false,
    ai_referrer_trigger_authenticated_execute: false,
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

function guardNames(history) {
  return history.map((version) => `${version}_remote_applied_history_guard.sql`);
}

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const STUB_CLI = `#!/bin/sh
set -eu
state="$STUB_STATE_DIR"
printf '%s\\n' "$*" >> "$state/argv.log"
printf '%s\\n' "$(pwd -P)" >> "$state/cwd.log"
# Every call but --version must carry the pinned global flags, in front, with an
# absolute workdir. The workdir seen on each call is recorded for assertions.
argv="$*"
case "$argv" in
  '--version') ;;
  '--profile supabase --workdir /'*)
    seen_workdir=$(printf '%s' "$argv" | sed 's|^--profile supabase --workdir \\([^ ]*\\).*|\\1|')
    printf '%s\\n' "$seen_workdir" >> "$state/workdir.log"
    argv=$(printf '%s' "$argv" | sed "s|^--profile supabase --workdir $seen_workdir ||")
    ;;
  *)
    printf 'stub supabase: missing pinned global flags: %s\\n' "$*" >&2
    exit 91
    ;;
esac
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
case "$argv" in
  '--version')
    cat "$state/version.txt"
    ;;
  '--agent no --output-format json projects list')
    exit_code=$(cat "$state/projects.exit.txt")
    if [ "$exit_code" != '0' ]; then
      printf 'stub supabase: refusing, token=%s\\n' "would-be-leaked" >&2
      exit "$exit_code"
    fi
    cat "$state/projects.json"
    ;;
  'init --workdir '*)
    workdir=$(printf '%s' "$argv" | sed 's/^init --workdir //')
    mkdir -p "$workdir/supabase"
    cp "$state/config.toml" "$workdir/supabase/config.toml"
    ;;
  'link --project-ref ${PROJECT_REF} --yes')
    mkdir -p supabase/.temp
    cat "$state/linked-ref.txt" > supabase/.temp/project-ref
    ;;
  '--agent no --output-format json db query --linked')
    cat >/dev/null
    next_fixture catalog
    ;;
  '--agent no --output-format json migration list --linked')
    next_fixture list
    ;;
  '--agent no --output-format json migration up --linked --include-all --yes')
    find supabase/migrations -maxdepth 1 -type f -name '*.sql' -exec basename {} ';' \\
      | LC_ALL=C sort > "$state/staged.txt"
    cat "$state/up.stdout.json"
    cat "$state/up.stderr.txt" >&2
    exit "$(cat "$state/up.exit.txt")"
    ;;
  *)
    printf 'stub supabase: unexpected invocation: %s\\n' "$argv" >&2
    exit 90
    ;;
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

// Delegates to the real grep, except that the poison-guard scan can be told to
// return an I/O error so the runner's "a failed scan is not a clean scan" gate
// can be driven.
const STUB_GREP = `#!/bin/sh
if [ -n "\${STUB_GREP_GUARD_EXIT:-}" ]; then
  for arg in "$@"; do
    if [ "$arg" = 'remote_applied_history_guard.sql' ]; then
      exit "$STUB_GREP_GUARD_EXIT"
    fi
  done
fi
for candidate in /usr/bin/grep /bin/grep; do
  if [ -x "$candidate" ]; then exec "$candidate" "$@"; fi
done
echo 'no real grep found' >&2
exit 127
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

/** process.env minus anything the runner is required to refuse. */
function cleanBaseEnv() {
  const base = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^SUPABASE_/.test(key) || /^PG/.test(key) || key === "PS4" || key === "SHELLOPTS") {
      continue;
    }
    base[key] = value;
  }
  return base;
}

/**
 * Builds a throwaway world and runs the real runner in it. Returns the exit
 * status, both streams, the stub's exact invocation log, the exact staged
 * migration set seen at mutation time, and the retained receipt files.
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

  // A dotenv file in the checkout: the CLI release is a Bun single-file
  // executable, which reads one from its working directory, so the runner must
  // never execute it from here.
  fs.writeFileSync(path.join(work, ".env"), "SUPABASE_PROJECT_ID=wroaxatalhzslxkfmpse\n");

  git(root, "init", "--bare", "--initial-branch=main", origin);
  git(work, "init", "--initial-branch=main");
  git(work, "add", "-A");
  git(work, "commit", "-m", "fixture");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "--quiet", "origin", "main");
  git(work, "fetch", "--quiet", "origin", "main");
  if (options.advanceHead) {
    // A commit that exists locally but is ahead of what a fetch receives.
    fs.writeFileSync(path.join(work, "local-only.txt"), "ahead of origin/main\n");
    git(work, "add", "-A");
    git(work, "commit", "-m", "local only");
  }
  const tip = git(work, "rev-parse", "HEAD");

  fs.writeFileSync(path.join(state, "version.txt"), `${options.cliVersion ?? "2.113.0"}\n`);
  fs.writeFileSync(path.join(state, "config.toml"), "# runner-only generated config\n");
  fs.writeFileSync(
    path.join(state, "projects.json"),
    `${JSON.stringify(options.projects ?? { projects: [{ id: PROJECT_REF }] })}\n`,
  );
  fs.writeFileSync(path.join(state, "projects.exit.txt"), `${options.projectsExit ?? 0}\n`);
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
  let cliPath = path.join(bin, cliName);
  writeStub(bin, cliName, STUB_CLI.replace("${PROJECT_REF}", PROJECT_REF), options.cliMode ?? 0o755);
  if (options.cliSymlink) {
    const linkPath = path.join(bin, `${cliName}-link`);
    fs.symlinkSync(cliPath, linkPath);
    cliPath = linkPath;
  }
  writeStub(bin, "uname", STUB_UNAME);
  writeStub(bin, "shasum", STUB_SHASUM);
  writeStub(bin, "security", STUB_SECURITY);
  writeStub(bin, "grep", STUB_GREP);

  const env = {
    ...cleanBaseEnv(),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    TMPDIR: root,
    STUB_STATE_DIR: state,
    // The runner canonicalises SUPABASE_BIN to its physical path before
    // hashing it, so the stub must answer for that same resolved path.
    STUB_CLI_PATH: path.join(fs.realpathSync(bin), cliName),
    STUB_CLI_DIGEST: options.cliDigest ?? CLI_DIGEST,
    RELEASE_SHA: options.releaseSha ?? tip,
    SUPABASE_BIN: options.supabaseBin === null
      ? ""
      : (options.supabaseBin ?? cliPath),
    LEAD_MIGRATION_EXECUTION_MODE: options.executionMode ?? "preflight",
    LEAD_MIGRATION_AUTH_MODE: options.authMode ?? "injected-token",
    LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK: options.ack ?? options.releaseSha ?? tip,
    LEAD_MIGRATION_DB_QUERY_SIDE_EFFECT_ACK: options.sideEffectAck === null
      ? undefined
      : (options.sideEffectAck ?? options.releaseSha ?? tip),
    ...(options.extraEnv ?? {}),
  };
  if (options.sideEffectAck === null) delete env.LEAD_MIGRATION_DB_QUERY_SIDE_EFFECT_ACK;
  if (options.supabaseBinRelative) env.SUPABASE_BIN = `bin/${cliName}`;
  if (options.unsetAck) delete env.LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK;
  if (options.recoverAck !== undefined) {
    env.LEAD_MIGRATION_RECOVER_UNRECORDED_AI_REFERRER = options.recoverAck === true
      ? (options.releaseSha ?? tip)
      : options.recoverAck;
  }
  // A plausible previous receipt directory for the recovery path.
  if (options.priorReceipt !== undefined) {
    if (options.priorReceipt === "missing-dir") {
      env.LEAD_MIGRATION_RECOVER_RECEIPT_DIR = path.join(root, "no-such-receipt-dir");
    } else if (options.priorReceipt !== null) {
      const prior = path.join(root, "prior-receipt");
      fs.mkdirSync(prior, { recursive: true });
      if (options.priorReceipt.run !== null) {
        fs.writeFileSync(
          path.join(prior, "run.json"),
          JSON.stringify({
            release_sha: options.priorReceipt.run?.release_sha ?? (options.releaseSha ?? tip),
            project_ref: PROJECT_REF,
            mode: options.priorReceipt.run?.mode ?? "apply",
            pending: options.priorReceipt.run?.pending
              ?? [TARGETS[1].basename, TARGETS[2].basename],
            recover_unrecorded_ai_referrer: false,
          }),
        );
      }
      if (options.priorReceipt.stderr !== null) {
        fs.writeFileSync(
          path.join(prior, "cli.migration-up.stderr.txt"),
          options.priorReceipt.stderr
            ?? `Applying migration ${TARGETS[1].version}_ai_referrer_tagging.sql...\nERROR: could not record ${TARGETS[1].version}\n`,
        );
      }
      env.LEAD_MIGRATION_RECOVER_RECEIPT_DIR = prior;
    }
  }
  if (env.LEAD_MIGRATION_AUTH_MODE === "injected-token" && options.accessToken !== null) {
    env.SUPABASE_ACCESS_TOKEN = options.accessToken ?? "stub-token-not-a-real-credential";
  } else if (options.accessToken) {
    env.SUPABASE_ACCESS_TOKEN = options.accessToken;
  }
  if (options.grepGuardExit !== undefined) {
    env.STUB_GREP_GUARD_EXIT = String(options.grepGuardExit);
  }

  const result = spawnSync("bash", [...(options.bashArgs ?? []), runner], {
    cwd: work,
    encoding: "utf8",
    env,
  });
  const stdout = result.stdout ?? "";

  const argvLogPath = path.join(state, "argv.log");
  const argv = fs.existsSync(argvLogPath)
    ? fs.readFileSync(argvLogPath, "utf8").split("\n").filter((line) => line.length > 0)
    : [];
  const readLog = (name) => {
    const file = path.join(state, name);
    return fs.existsSync(file)
      ? fs.readFileSync(file, "utf8").split("\n").filter((line) => line.length > 0)
      : [];
  };
  const cwds = readLog("cwd.log");
  const workdirs = readLog("workdir.log");
  const stagedPath = path.join(state, "staged.txt");
  const staged = fs.existsSync(stagedPath)
    ? fs.readFileSync(stagedPath, "utf8").split("\n").filter((line) => line.length > 0)
    : null;

  // Keep the receipts before the throwaway world goes away.
  const receipts = {};
  const receiptDir = stdout.match(/^receipt_dir=(.+)$/m)?.[1];
  if (receiptDir && fs.existsSync(receiptDir)) {
    for (const entry of fs.readdirSync(receiptDir, { withFileTypes: true })) {
      if (entry.isFile()) {
        receipts[entry.name] = fs.readFileSync(path.join(receiptDir, entry.name), "utf8");
      }
    }
  }

  if (process.env.LEAD_RUNNER_DEBUG) {
    console.error(
      `[debug] status=${result.status}\n--- stdout ---\n${stdout}\n--- stderr ---\n${result.stderr}\n--- argv ---\n${argv.join("\n")}\n--- state ---\n${fs.readdirSync(state).join(" ")}\n--- receipts ---\n${receiptDir && fs.existsSync(receiptDir) ? fs.readdirSync(receiptDir).join(" ") : "(none)"}\n--- version stderr ---\n${receiptDir && fs.existsSync(`${receiptDir}/cli.version.stderr.txt`) ? fs.readFileSync(`${receiptDir}/cli.version.stderr.txt`, "utf8") : "(none)"}`,
    );
  }
  // Resolved while the directory still exists: the cwd assertions compare
  // against the physical path, and cleanup is about to remove it.
  let runnerDirReal;
  try {
    runnerDirReal = receiptDir ? fs.realpathSync(path.join(receiptDir, "runner")) : undefined;
  } catch {
    runnerDirReal = undefined;
  }

  fs.rmSync(root, { recursive: true, force: true });
  return {
    status: result.status,
    runnerDirReal,
    stdout,
    stderr: result.stderr ?? "",
    argv,
    staged,
    receipts,
    cwds,
    workdirs,
    receiptDir,
    checkout: work,
  };
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

/** The subcommand of each logged call, with the pinned global flags removed. */
function subcommands(result) {
  return result.argv.map((line) =>
    line.replace(/^--profile supabase --workdir \S+ /, "")
  );
}

/** Every call but --version carries the pinned flags and the same absolute workdir. */
function assertPinnedFlags(result) {
  const authenticated = result.argv.filter((line) => line !== "--version");
  assert.ok(authenticated.length > 0, "no authenticated CLI calls were made");
  for (const line of authenticated) {
    assert.match(
      line,
      /^--profile supabase --workdir \//,
      `call did not pin --profile/--workdir: ${line}`,
    );
  }
  const unique = [...new Set(result.workdirs)];
  assert.equal(unique.length, 1, `workdir varied across calls: ${unique.join(", ")}`);
  assert.equal(unique[0], `${result.receiptDir}/runner`);
  // And the binary is never executed from the repository checkout: the release
  // is a Bun single-file executable, which reads a dotenv file from its working
  // directory, and the throwaway checkout contains one.
  assert.ok(result.runnerDirReal, "the runner workdir was not resolvable");
  for (const cwd of result.cwds) {
    assert.notEqual(cwd, result.checkout, "the CLI was executed from the checkout");
    assert.equal(cwd, result.runnerDirReal, `the CLI was executed from ${cwd}`);
  }
}

function expectHardStop(result, fragment) {
  assert.notEqual(result.status, 0, `expected a hard stop, got:\n${result.stdout}`);
  assert.match(result.stderr, /Hard stop: /);
  assert.match(result.stderr, fragment);
}

// ---------------------------------------------------------------------------
// Pinned constants and shape
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

test("only 20261027230000 carries an explicit transaction, which is why only it needs recovery", () => {
  const withTransaction = TARGETS.filter((target) => {
    const sql = fs.readFileSync(
      path.join(repoRoot, `supabase/migrations/${target.basename}`),
      "utf8",
    );
    const statements = sql.split("\n").filter((line) => !line.trimStart().startsWith("--"));
    return statements.some((line) => /^\s*(begin|commit)\s*;/i.test(line));
  });
  assert.deepEqual(
    withTransaction.map((t) => t.version),
    ["20261027230000"],
    "the COMMIT-before-history recovery path is scoped to the one target that commits itself",
  );
});

test("the runbook's rollback blocks are exactly the ones the rollback contract runs", () => {
  const transactions = (source) =>
    [...source.matchAll(/^begin;$\n([\s\S]*?)^commit;$/gm)]
      .map((match) =>
        match[1]
          .split("\n")
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter((line) => line.length > 0 && !line.startsWith("--"))
          .join("\n")
      );
  const runbook = transactions(
    fs.readFileSync(path.join(repoRoot, "docs/runbooks/utah-lead-migrations.md"), "utf8"),
  );
  const contract = transactions(
    fs.readFileSync(path.join(repoRoot, "supabase/tests/lead_migrations_rollback.sql"), "utf8"),
  );
  assert.equal(runbook.length, 3, "the runbook must document one rollback per target");
  assert.deepEqual(
    contract,
    runbook,
    "the verified rollback and the documented rollback have drifted apart",
  );
  // Each block drops its objects AND removes its history row, in one
  // transaction: catalog and history can never be left disagreeing.
  for (const [index, version] of TARGETS.map((t) => t.version).reverse().entries()) {
    assert.match(runbook[index], new RegExp(`schema_migrations where version = '${version}'`));
    assert.match(runbook[index], /drop (column if exists|trigger if exists|index if exists|function if exists)/);
  }
});

test("the runner never reaches for a forbidden write path and owns its env names", () => {
  // Executable lines only: the header comment names the forbidden paths on
  // purpose, to say the runner does not use them.
  const executable = runnerSource
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  // Every subcommand the runner actually hands the CLI, with line
  // continuations joined, so a forbidden path named inside a diagnostic string
  // is not mistaken for one the runner runs.
  const invocations = [...runnerSource.replace(/\\\n\s*/g, " ")
    .matchAll(/"\$SUPABASE_BIN"([^\n|>]*)/g)].map((match) => match[1]);
  assert.ok(invocations.length >= 5, "no CLI invocations found to inspect");
  for (const forbidden of ["db push", "migration repair", "db reset", "db dump"]) {
    assert.equal(
      invocations.some((invocation) => invocation.includes(forbidden)),
      false,
      `runner runs ${forbidden}`,
    );
  }
  for (const name of [
    "LEAD_MIGRATION_EXECUTION_MODE",
    "LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK",
    "LEAD_MIGRATION_AUTH_MODE",
    "LEAD_MIGRATION_RECOVER_UNRECORDED_AI_REFERRER",
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
  // `a and b and .[0] as $s | …` changed meaning in jq 1.8: `as` takes the
  // whole `and` chain, so every field read dies with "Cannot index boolean with
  // string" and the runner can never complete. Keep the `if … else … end` form,
  // which behaves the same on jq 1.6 through 1.8.1.
  assert.equal(
    /and\s+\.\[0\]\s+as\s+\$/.test(executable),
    false,
    "the catalog validator must not rely on jq's ambiguous `and … as` binding",
  );
  assert.ok(runnerSource.includes('if type != "array" or length != 1 then false else'));
  // Only the three reviewed targets, never the other two pending Utah files.
  for (const excluded of ["20261111160000", "20261118000000"]) {
    assert.equal(runnerSource.includes(excluded), false, `${excluded} must not be in scope`);
  }
});

// ---------------------------------------------------------------------------
// Hostile environment
// ---------------------------------------------------------------------------

test("any CLI-redirecting environment variable is refused before anything runs", () => {
  for (
    const name of [
      "SUPABASE_PROJECT_ID",
      "SUPABASE_DB_URL",
      "SUPABASE_DB_PASSWORD",
      "SUPABASE_WORKDIR",
      "SUPABASE_PROFILE",
      "SUPABASE_CONFIG",
      "PGHOST",
      "PGDATABASE",
      "PGSERVICE",
      "PGUSER",
    ]
  ) {
    const result = runCase({
      ...pristinePreflight(),
      extraEnv: { [name]: name === "SUPABASE_PROJECT_ID" ? "wroaxatalhzslxkfmpse" : "x" },
    });
    expectHardStop(result, new RegExp(`unset ${name} before running`));
    assert.deepEqual(result.argv, [], `${name} was refused only after invoking the CLI`);
  }
  // The two the runner manages itself are not refused.
  const ok = runCase(pristinePreflight());
  assert.equal(ok.status, 0, ok.stderr);
});

// Newer bash builds (Debian's bash 5.2, and so the CI runner) refuse to import
// PS4 from the environment at all, while the bash the runner actually targets —
// macOS /bin/bash 3.2 — does import it. Drive the gate where it can be driven
// and assert its presence where it cannot.
const BASH_IMPORTS_PS4 = spawnSync("bash", ["-c", 'printf %s "${PS4:-}"'], {
  encoding: "utf8",
  env: { ...process.env, PS4: "SENTINEL" },
}).stdout === "SENTINEL";

test("shell tracing and a custom PS4 are refused", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), bashArgs: ["-x"] }),
    /shell tracing is on/,
  );
  assert.ok(
    /case "\$\{PS4:-\+ \}" in/.test(runnerSource),
    "the PS4 gate must accept only bash's own default",
  );
  if (BASH_IMPORTS_PS4) {
    expectHardStop(
      runCase({ ...pristinePreflight(), extraEnv: { PS4: "$(id)" } }),
      /unset PS4/,
    );
  } else {
    // This bash drops an inherited PS4, so a clean run must still pass.
    const ok = runCase({ ...pristinePreflight(), extraEnv: { PS4: "$(id)" } });
    assert.equal(ok.status, 0, ok.stderr);
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

test("RELEASE_SHA is compared against what the fetch received, not a trusted ref", () => {
  const result = runCase({ ...pristinePreflight(), advanceHead: true });
  expectHardStop(result, /RELEASE_SHA is not the main tip this fetch received/);
  assert.ok(
    runnerSource.includes("'FETCH_HEAD^{commit}'"),
    "the tip comparison must use FETCH_HEAD",
  );
});

test("SUPABASE_BIN must be one absolute, non-symlink, executable path", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), supabaseBin: null }),
    /SUPABASE_BIN must name the reviewed executable/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), supabaseBin: "supabase" }),
    /must be an absolute path, never a PATH-resolved command name/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), supabaseBinRelative: true }),
    /must be an absolute path, never a PATH-resolved command name/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), cliSymlink: true }),
    /not a symlink whose target can change/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), cliMode: 0o644 }),
    /SUPABASE_BIN must name the reviewed executable/,
  );
});

test("the db-query side effects must be acknowledged, bound to the release", () => {
  const missing = runCase({ ...pristinePreflight(), sideEffectAck: null });
  expectHardStop(missing, /preflight is NOT read-only/);
  assert.match(missing.stderr, /mints a temporary postgres login role/);
  assert.match(missing.stderr, /DELETES the IPv4 network bans/);
  assert.match(missing.stderr, /LEAD_MIGRATION_DB_QUERY_SIDE_EFFECT_ACK/);
  assert.deepEqual(missing.argv, [], "the CLI must not run before the acknowledgement");
  expectHardStop(
    runCase({ ...pristinePreflight(), sideEffectAck: "c".repeat(40) }),
    /preflight is NOT read-only/,
  );
  // And a run that does acknowledge prints the banner.
  const ok = runCase(pristinePreflight());
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^side_effects=a temporary postgres login role is minted/m);
});

test("apply refuses to run before the call-tracking pair is recorded", () => {
  const bare = catalog();
  const applyOnBare = runCase({
    executionMode: "apply",
    catalogs: [bare, bare, bare],
    lists: [migrationList(bare, TARGETS.map((t) => t.version))],
    up: { applied: TARGETS.map((t) => `supabase/migrations/${t.basename}`) },
  });
  expectHardStop(
    applyOnBare,
    /scripts\/run-call-tracking-migrations\.sh must be applied first/,
  );
  assert.match(applyOnBare.stderr, /once a lead target is recorded it can never run again/);
  assert.equal(applyOnBare.staged, null, "nothing may be staged for the mutation");

  // Preflight still reports on the bare baseline, so the state can be seen.
  const preflightOnBare = runCase(pristinePreflight());
  assert.equal(preflightOnBare.status, 0, preflightOnBare.stderr);
  assert.match(preflightOnBare.stdout, /call_tracking_recorded=false/);

  // With the pair recorded, apply proceeds.
  const withPair = catalog({ callTracking: true });
  const after = catalog({ callTracking: true, recorded: TARGETS.map((t) => t.version) });
  const ok = runCase({
    executionMode: "apply",
    catalogs: [withPair, withPair, after],
    lists: [migrationList(withPair, TARGETS.map((t) => t.version)), migrationList(after, [])],
    up: { applied: TARGETS.map((t) => `supabase/migrations/${t.basename}`) },
  });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /mode=apply/);
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

test("execution mode, auth mode and the recovery ack are closed enumerations", () => {
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
  expectHardStop(
    runCase({ ...pristinePreflight(), recoverAck: SHA }),
    /RECOVER_UNRECORDED_AI_REFERRER must be bound to RELEASE_SHA/,
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
// Platform, binary and identity gates
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

test("the binary is hashed before it is ever executed", () => {
  const badDigest = runCase({ ...pristinePreflight(), cliDigest: "f".repeat(64) });
  expectHardStop(badDigest, /binary digest differs from the reviewed official release/);
  assert.deepEqual(
    badDigest.argv,
    [],
    "the CLI must not be executed, not even --version, before its digest is verified",
  );
  const wrongPlatform = runCase({ ...pristinePreflight(), unameS: "Linux" });
  assert.deepEqual(wrongPlatform.argv, []);
  expectHardStop(
    runCase({ ...pristinePreflight(), cliName: "supabase-go" }),
    /supabase-go compatibility binary is forbidden/,
  );
  const wrongVersion = runCase({ ...pristinePreflight(), cliVersion: "2.112.0" });
  expectHardStop(wrongVersion, /Supabase CLI 2\.113\.0 is required/);
  assert.deepEqual(wrongVersion.argv, ["--version"]);
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

test("a failed projects list reports its status without reproducing CLI output", () => {
  const result = runCase({ ...pristinePreflight(), projectsExit: 7 });
  expectHardStop(result, /could not list projects \(exit 7\)/);
  assert.match(
    result.stderr,
    /is NOT reproduced here: the CLI puts server response bodies into its errors/,
  );
  assert.match(result.stderr, /cli\.projects-list\.stderr\.txt/);
  assert.equal(
    result.stderr.includes("would-be-leaked"),
    false,
    "the CLI's own failure text must not reach the operator's terminal",
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

function catalogCase(rows, pendingVersions) {
  return {
    catalogs: [rows, rows],
    lists: [migrationList(rows, pendingVersions ?? TARGETS.map((t) => t.version))],
  };
}

test("an unreviewed remote history is a hard stop", () => {
  const rows = catalog({ extraHistory: ["20261118000000"] });
  expectHardStop(
    runCase(catalogCase(rows)),
    /catalog state in .*catalog\.before\.json differs/,
  );
});

test("one of the two call-tracking versions is a hard stop", () => {
  for (const version of CALL_TRACKING) {
    const rows = catalog({ extraHistory: [version] });
    expectHardStop(
      runCase(catalogCase(rows)),
      /catalog state in .*catalog\.before\.json differs/,
    );
  }
});

test("a half-applied target without its history row is a hard stop", () => {
  for (
    const override of [
      { spam_columns: 3 },
      { spam_indexes: 1 },
      { spam_indexes_exact: 1 },
      { leads_zip: true },
      { leads_city_source: true },
      { ai_referrer_triggers: 1 },
      { ai_referrer_service_role_execute: true },
    ]
  ) {
    const rows = catalog({ overrides: override });
    expectHardStop(
      runCase(catalogCase(rows)),
      /catalog state in .*catalog\.before\.json differs/,
    );
  }
});

test("a recorded target whose objects are missing, disabled or over-granted is a hard stop", () => {
  const recorded = TARGETS.map((t) => t.version);
  const pending = [];
  for (
    const override of [
      { spam_indexes: 0 },
      { spam_indexes_exact: 1 }, // an INVALID index passes an existence check
      { ai_referrer_triggers_armed: 1 }, // a DISABLED trigger passes an existence check
      { ai_referrer_triggers_armed: 0 },
      { ai_referrer_anon_execute: true }, // EXECUTE granted via PUBLIC
      { ai_referrer_authenticated_execute: true },
      { ai_referrer_trigger_anon_execute: true },
      { ai_referrer_trigger_authenticated_execute: true },
      { ai_referrer_service_role_execute: false },
    ]
  ) {
    const rows = catalog({ recorded, overrides: override });
    expectHardStop(
      runCase(catalogCase(rows, pending)),
      /catalog state in .*catalog\.before\.json differs/,
    );
  }
});

test("the guarded migration list must be the COMPLETE matched history plus exactly the pending targets", () => {
  const rows = catalog();
  const pending = TARGETS.map((t) => t.version);

  const remoteOnly = migrationList(rows, pending);
  remoteOnly.migrations.push({ local: "", remote: "20261118000000" });
  expectHardStop(
    runCase({ catalogs: [rows, rows], lists: [remoteOnly] }),
    /guarded migration list is not the complete matched history/,
  );

  expectHardStop(
    runCase({ catalogs: [rows, rows], lists: [migrationList(rows, pending.slice(0, 2))] }),
    /guarded migration list is not the complete matched history/,
  );

  expectHardStop(
    runCase({ catalogs: [rows, rows], lists: [migrationList(rows, [...pending, "20261111160000"])] }),
    /guarded migration list is not the complete matched history/,
  );

  // An empty list must not pass.
  expectHardStop(
    runCase({ catalogs: [rows, rows], lists: [{ migrations: [] }] }),
    /guarded migration list is not the complete matched history/,
  );

  // A list that omits a recorded version must not pass, even with no contradiction.
  const short = migrationList(rows, pending);
  short.migrations.splice(0, 1);
  expectHardStop(
    runCase({ catalogs: [rows, rows], lists: [short] }),
    /guarded migration list is not the complete matched history/,
  );

  // Duplicates must not pass.
  const duplicated = migrationList(rows, pending);
  duplicated.migrations.push({ ...duplicated.migrations[0] });
  expectHardStop(
    runCase({ catalogs: [rows, rows], lists: [duplicated] }),
    /guarded migration list is not the complete matched history/,
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
  const drifted = catalog();
  drifted[0].lead_rows = 500;
  const ok = runCase({
    catalogs: [before, drifted],
    lists: [migrationList(before, TARGETS.map((t) => t.version))],
  });
  assert.equal(ok.status, 0, ok.stderr); // row counts are allowed to move
});

// ---------------------------------------------------------------------------
// COMMIT-before-history recovery
// ---------------------------------------------------------------------------

test("AI-referrer objects present with no history row stop with the sanctioned recovery", () => {
  // The narrow state: 20261027221000 recorded (migration up applies in order),
  // 20261027230000 unrecorded, the full strengthened AI-referrer catalog armed.
  const rows = catalog({ recorded: [TARGETS[0].version], aiPresent: true });
  const result = runCase(catalogCase(rows, [TARGETS[1].version, TARGETS[2].version]));
  expectHardStop(result, /20261027230000 is applied but NOT recorded/);
  assert.match(result.stderr, /COMMIT-before-history gap/);
  assert.match(result.stderr, /LEAD_MIGRATION_RECOVER_UNRECORDED_AI_REFERRER/);
  assert.match(result.stderr, /LEAD_MIGRATION_RECOVER_RECEIPT_DIR/);
  assert.match(result.stderr, /RE-TAKES ACCESS EXCLUSIVE/);
  assert.match(result.stderr, /Never use migration repair/);
  // It never asks for an `applied` list, which a failed run does not emit.
  assert.equal(/reported .*20261027230000 as applied/.test(result.stderr), false);
});

test("the recovery state is NOT recognised when its predecessor is unrecorded or the catalog is weak", () => {
  // 20261027230000's objects present while 20261027221000 is unrecorded is not
  // the COMMIT-before-history gap — migration up applies in timestamp order —
  // so it falls through to the generic contract.
  const orphan = catalog({ aiPresent: true });
  const orphanResult = runCase(catalogCase(orphan));
  expectHardStop(orphanResult, /catalog state in .*catalog\.before\.json differs/);
  assert.equal(orphanResult.stderr.includes("applied but NOT recorded"), false);

  // Present but not fully armed is also not the recovery state.
  for (
    const override of [
      { ai_referrer_triggers_armed: 1 },
      { ai_referrer_service_role_execute: false },
      { ai_referrer_anon_execute: true },
    ]
  ) {
    const weak = catalog({ recorded: [TARGETS[0].version], aiPresent: true, overrides: override });
    const weakResult = runCase(catalogCase(weak, [TARGETS[1].version, TARGETS[2].version]));
    expectHardStop(weakResult, /catalog state in .*catalog\.before\.json differs/);
    assert.equal(weakResult.stderr.includes("applied but NOT recorded"), false);
  }
});

test("a history insert that fails after the file's own COMMIT lands in exactly that state", () => {
  const before = catalog({ callTracking: true });
  const afterPartial = catalog({ callTracking: true, recorded: [TARGETS[0].version], aiPresent: true });
  const failed = runCase({
    executionMode: "apply",
    catalogs: [before, before, afterPartial],
    lists: [migrationList(before, TARGETS.map((t) => t.version))],
    up: { applied: ["supabase/migrations/20261027221000_lead_spam_classification.sql"] },
    upStderr: "Applying migration 20261027230000_ai_referrer_tagging.sql...\nERROR: could not record 20261027230000 in supabase_migrations.schema_migrations\n",
    upExit: 1,
  });
  expectHardStop(failed, /migration up failed; retain receipts and do not repair history/);
  assert.match(failed.stderr, /COMMIT-before-history recovery/);
  assert.match(failed.stderr, /LEAD_MIGRATION_RECOVER_RECEIPT_DIR/);
  // The run record a later recovery has to match was written before the mutation.
  const run = JSON.parse(failed.receipts["run.json"]);
  assert.equal(run.mode, "apply");
  assert.deepEqual(run.pending, TARGETS.map((t) => t.basename));
  assert.match(failed.receipts["cli.migration-up.stderr.txt"], /20261027230000/);

  // The next preflight recognises the state rather than reading as drift.
  const nextPreflight = runCase(
    catalogCase(afterPartial, [TARGETS[1].version, TARGETS[2].version]),
  );
  expectHardStop(nextPreflight, /20261027230000 is applied but NOT recorded/);
});

test("recovery demands the previous run's own receipt, release, pending set and failure evidence", () => {
  const unrecorded = catalog({ recorded: [TARGETS[0].version], aiPresent: true });
  const pendingVersions = [TARGETS[1].version, TARGETS[2].version];
  const base = { ...catalogCase(unrecorded, pendingVersions), recoverAck: true };

  expectHardStop(
    runCase({ ...base, priorReceipt: null }),
    /recovery requires LEAD_MIGRATION_RECOVER_RECEIPT_DIR/,
  );
  expectHardStop(
    runCase({ ...base, priorReceipt: "missing-dir" }),
    /LEAD_MIGRATION_RECOVER_RECEIPT_DIR is not a directory/,
  );
  expectHardStop(
    runCase({ ...base, priorReceipt: { run: null } }),
    /has no run\.json; that is not a receipt directory from this runner/,
  );
  expectHardStop(
    runCase({ ...base, priorReceipt: { run: { release_sha: "b".repeat(40) } } }),
    /is not an apply of this RELEASE_SHA with 20261027230000 pending/,
  );
  expectHardStop(
    runCase({ ...base, priorReceipt: { run: { mode: "preflight" } } }),
    /is not an apply of this RELEASE_SHA with 20261027230000 pending/,
  );
  expectHardStop(
    runCase({
      ...base,
      priorReceipt: { run: { pending: [TARGETS[2].basename] } },
    }),
    /is not an apply of this RELEASE_SHA with 20261027230000 pending/,
  );
  expectHardStop(
    runCase({ ...base, priorReceipt: { stderr: null } }),
    /is missing: without the failed run's own CLI stderr/,
  );
  expectHardStop(
    runCase({ ...base, priorReceipt: { stderr: "ERROR: something unrelated\n" } }),
    /does not name 20261027230000/,
  );
});

test("the recovery opt-in replays the idempotent target and records it", () => {
  const unrecorded = catalog({
    recorded: [TARGETS[0].version],
    aiPresent: true,
    callTracking: true,
  });
  const pendingVersions = [TARGETS[1].version, TARGETS[2].version];
  const preflight = runCase({
    ...catalogCase(unrecorded, pendingVersions),
    recoverAck: true,
    priorReceipt: {},
  });
  assert.equal(preflight.status, 0, preflight.stderr);
  assert.match(preflight.stderr, /replaying 20261027230000 onto present objects/);
  assert.match(preflight.stderr, /RE-TAKES ACCESS EXCLUSIVE/);
  assert.match(
    preflight.stdout,
    /pending=20261027230000_ai_referrer_tagging\.sql 20261122230000_leads_intake_zip_city_source\.sql/,
  );

  const after = catalog({ recorded: TARGETS.map((t) => t.version), callTracking: true });
  const applied = runCase({
    executionMode: "apply",
    recoverAck: true,
    priorReceipt: {},
    catalogs: [unrecorded, unrecorded, after],
    lists: [migrationList(unrecorded, pendingVersions), migrationList(after, [])],
    up: {
      applied: [
        "supabase/migrations/20261027230000_ai_referrer_tagging.sql",
        "supabase/migrations/20261122230000_leads_intake_zip_city_source.sql",
      ],
    },
  });
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /mode=apply/);
});

test("recovery also covers a resumed run that already recorded the third target", () => {
  const unrecorded = catalog({
    recorded: [TARGETS[0].version, TARGETS[2].version],
    aiPresent: true,
    callTracking: true,
  });
  const result = runCase({
    ...catalogCase(unrecorded, [TARGETS[1].version]),
    recoverAck: true,
    priorReceipt: {},
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pending=20261027230000_ai_referrer_tagging\.sql\s/);
});

test("the recovery opt-in is refused when the state does not call for it", () => {
  const recordedRows = catalog({ recorded: TARGETS.map((t) => t.version) });
  expectHardStop(
    runCase({ ...catalogCase(recordedRows, []), recoverAck: true, priorReceipt: {} }),
    /the catalog is not in the COMMIT-before-history state/,
  );
  const absentRows = catalog();
  expectHardStop(
    runCase({ ...catalogCase(absentRows), recoverAck: true, priorReceipt: {} }),
    /the catalog is not in the COMMIT-before-history state/,
  );
});

// ---------------------------------------------------------------------------
// Happy paths, exact staging and exact CLI flags
// ---------------------------------------------------------------------------

test("preflight on a pristine baseline reports three pending targets and the lock sizing", () => {
  const result = runCase(pristinePreflight());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.split("\n")[0], /^receipt_dir=/);
  assert.match(result.stdout, /mode=preflight/);
  assert.match(
    result.stdout,
    /pending=20261027221000_lead_spam_classification\.sql 20261027230000_ai_referrer_tagging\.sql 20261122230000_leads_intake_zip_city_source\.sql/,
  );
  assert.match(result.stdout, /lead_rows=412/);
  assert.match(result.stdout, /phone_click_rows=1308/);
  assert.match(
    result.stdout,
    /ACCESS EXCLUSIVE on public\.leads \(412 rows\) and public\.phone_clicks \(1308 rows\)/,
  );
  assert.match(result.stdout, /no lock_timeout is set, so run off-peak/);
  assert.equal(result.stdout.includes("history"), false);

  // Exact flags, in order, and nothing else.
  assertPinnedFlags(result);
  assert.deepEqual(subcommands(result), [
    "--version",
    "--agent no --output-format json projects list",
    `init --workdir ${result.receiptDir}/runner`,
    `link --project-ref ${PROJECT_REF} --yes`,
    "--agent no --output-format json db query --linked",
    "--agent no --output-format json migration list --linked",
    "--agent no --output-format json db query --linked",
  ]);
  assert.equal(result.staged, null, "preflight must not reach the mutation");

  // Receipts retained, and the staged-set receipt agrees with itself.
  for (
    const name of [
      "catalog.before.json",
      "catalog.final-preflight.json",
      "migration-list.guarded.json",
      "staged-migrations.txt",
      "staged-migrations.expected.txt",
      "run.json",
      "cli.projects-list.stderr.txt",
      "cli.db-query-before.stderr.txt",
    ]
  ) {
    // Empty is fine for a captured stderr stream; present is the contract.
    assert.notEqual(result.receipts[name], undefined, `missing receipt ${name}`);
  }
  assert.equal(
    result.receipts["staged-migrations.txt"],
    result.receipts["staged-migrations.expected.txt"],
  );
  assert.deepEqual(
    result.receipts["staged-migrations.txt"].split("\n").filter(Boolean).sort(),
    [...guardNames(BASELINE), ...TARGETS.map((t) => t.basename)].sort(),
  );
  assert.equal(result.receipts["migration-up.stdout.json"], undefined);
});

test("preflight accepts the call-tracking baseline and an already-recorded subset", () => {
  const recorded = [TARGETS[0].version, TARGETS[2].version];
  const rows = catalog({ callTracking: true, recorded });
  const pending = pendingFor(recorded);
  const result = runCase(catalogCase(rows, pending.map((t) => t.version)));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pending=20261027230000_ai_referrer_tagging\.sql\s/);
  assert.deepEqual(
    result.receipts["staged-migrations.txt"].split("\n").filter(Boolean).sort(),
    [
      ...guardNames([...BASELINE, ...CALL_TRACKING, ...recorded].sort()),
      TARGETS[1].basename,
    ].sort(),
  );
});

test("apply stages exactly the guarded set and applies the pending targets in order", () => {
  const before = catalog({ callTracking: true });
  const after = catalog({ callTracking: true, recorded: TARGETS.map((t) => t.version), leadRows: 413 });
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
  assert.match(
    result.stdout,
    /applied=20261027221000_lead_spam_classification\.sql 20261027230000_ai_referrer_tagging\.sql 20261122230000_leads_intake_zip_city_source\.sql/,
  );
  assert.match(result.stdout, /row_count_warning=0/);
  assert.match(result.stdout, /receipts_contain_cli_diagnostics=1/);

  // The exact file set the CLI saw at mutation time: one guard per recorded
  // version, plus the three pending targets, and nothing else.
  assert.deepEqual(
    [...result.staged].sort(),
    [...guardNames([...BASELINE, ...CALL_TRACKING].sort()), ...pending].sort(),
  );
  assert.equal(result.staged.length, BASELINE.length + CALL_TRACKING.length + 3);

  assertPinnedFlags(result);
  assert.deepEqual(subcommands(result).slice(-4), [
    "--agent no --output-format json db query --linked",
    "--agent no --output-format json migration up --linked --include-all --yes",
    "--agent no --output-format json db query --linked",
    "--agent no --output-format json migration list --linked",
  ]);
  for (const name of ["migration-up.stdout.json", "cli.migration-up.stderr.txt", "catalog.postflight.json", "migration-list.after.json", "run.json"]) {
    assert.ok(result.receipts[name] !== undefined, `missing receipt ${name}`);
  }
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
  assert.equal(result.staged, null, "a no-op run must not invoke the mutation");
  assert.equal(
    subcommands(result).includes(
      "--agent no --output-format json migration up --linked --include-all --yes",
    ),
    false,
  );
});

// ---------------------------------------------------------------------------
// Apply-path gates
// ---------------------------------------------------------------------------

test("a failed migration up stops without repairing history", () => {
  const before = catalog({ callTracking: true });
  const result = runCase({
    executionMode: "apply",
    catalogs: [before, before, before],
    lists: [migrationList(before, TARGETS.map((t) => t.version))],
    up: {},
    upStderr: "ERROR: relation does not exist\n",
    upExit: 1,
  });
  expectHardStop(result, /migration up failed; retain receipts and do not repair history/);
  assert.match(result.stdout, /^receipt_dir=/m);
});

test("a selected poison guard is a hard stop, and a failed scan is not a clean scan", () => {
  const before = catalog({ callTracking: true });
  const base = {
    executionMode: "apply",
    catalogs: [before, before, before],
    lists: [migrationList(before, TARGETS.map((t) => t.version))],
  };
  expectHardStop(
    runCase({
      ...base,
      up: { applied: ["supabase/migrations/20260610_remote_applied_history_guard.sql"] },
      upStderr: "UTAH_REMOTE_HISTORY_GUARD_SELECTED\n",
      upExit: 1,
    }),
    /remote-history poison guard was selected/,
  );
  const scanError = runCase({
    ...base,
    up: { applied: [] },
    upExit: 0,
    grepGuardExit: 2,
  });
  expectHardStop(scanError, /could not scan the CLI output for a selected poison guard \(grep exit 2\)/);
});

test("migration up must report exactly the pending targets", () => {
  const before = catalog({ callTracking: true });
  const after = catalog({ callTracking: true, recorded: TARGETS.map((t) => t.version) });
  const result = runCase({
    executionMode: "apply",
    catalogs: [before, before, after],
    lists: [migrationList(before, TARGETS.map((t) => t.version)), migrationList(after, [])],
    up: { applied: ["supabase/migrations/20261027221000_lead_spam_classification.sql"] },
  });
  expectHardStop(result, /did not apply exactly the pending targets in order/);
});

test("postflight requires every object armed, the complete list, and reads a row drop as a delete", () => {
  const before = catalog({ callTracking: true });
  const recorded = TARGETS.map((t) => t.version);
  const pendingPaths = TARGETS.map((t) => `supabase/migrations/${t.basename}`);
  const applyCase = (after, lists) => runCase({
    executionMode: "apply",
    catalogs: [before, before, after],
    lists: [migrationList(before, recorded), ...lists],
    up: { applied: pendingPaths },
  });

  const disabledTrigger = catalog({ callTracking: true, recorded, overrides: { ai_referrer_triggers_armed: 1 } });
  expectHardStop(
    applyCase(disabledTrigger, [migrationList(disabledTrigger, [])]),
    /catalog state in .*catalog\.postflight\.json differs/,
  );

  const publicExecute = catalog({ callTracking: true, recorded, overrides: { ai_referrer_anon_execute: true } });
  expectHardStop(
    applyCase(publicExecute, [migrationList(publicExecute, [])]),
    /catalog state in .*catalog\.postflight\.json differs/,
  );

  const invalidIndex = catalog({ callTracking: true, recorded, overrides: { spam_indexes_exact: 1 } });
  expectHardStop(
    applyCase(invalidIndex, [migrationList(invalidIndex, [])]),
    /catalog state in .*catalog\.postflight\.json differs/,
  );

  const after = catalog({ callTracking: true, recorded });
  const unmatched = migrationList(after, []);
  unmatched.migrations.push({ local: "20261111160000", remote: "" });
  expectHardStop(
    applyCase(after, [unmatched]),
    /final migration list is not the complete expected version set/,
  );

  const shortFinal = migrationList(after, []);
  shortFinal.migrations.splice(0, 1);
  expectHardStop(
    applyCase(after, [shortFinal]),
    /final migration list is not the complete expected version set/,
  );

  const duplicatedFinal = migrationList(after, []);
  duplicatedFinal.migrations.push({ ...duplicatedFinal.migrations[0] });
  expectHardStop(
    applyCase(after, [duplicatedFinal]),
    /final migration list is not the complete expected version set/,
  );

  const missingHistoryRow = catalog({ callTracking: true, recorded: [TARGETS[0].version, TARGETS[1].version] });
  expectHardStop(
    applyCase(missingHistoryRow, [migrationList(missingHistoryRow, [])]),
    /postflight history lacks a target/,
  );

  // A row count that fell after a committed, recorded, fully matched apply is a
  // concurrent delete — reported as exactly that, and NOT as a failed migration.
  const fewerLeads = catalog({ callTracking: true, recorded, leadRows: 400, phoneClickRows: 1200 });
  const warned = applyCase(fewerLeads, [migrationList(fewerLeads, [])]);
  assert.equal(warned.status, 0, warned.stderr);
  assert.match(warned.stdout, /row_count_warning=1/);
  assert.match(warned.stderr, /public\.leads fell from 412 to 400 rows/);
  assert.match(warned.stderr, /NOT a failed migration/);
  assert.match(warned.stderr, /public\.phone_clicks fell from 1308 to 1200 rows/);
  assert.equal(warned.stderr.includes("Hard stop"), false);
});
