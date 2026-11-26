#!/usr/bin/env node
/**
 * Contract tests for scripts/run-lead-migrations.sh — the exact-target runner
 * for 20261027221000_lead_spam_classification.sql,
 * 20261027230000_ai_referrer_tagging.sql and
 * 20261122230000_leads_intake_zip_city_source.sql.
 *
 * NOTHING here touches a Supabase project. Each case builds a throwaway git
 * repository, commits a copy of the real runner into it (the runner refuses to
 * execute bytes that differ from `git show <RELEASE_SHA>:scripts/
 * run-lead-migrations.sh`, so the executed script IS the reviewed script), and
 * runs it with `LEAD_MIGRATION_TEST_HARNESS_ROOT` pointing at a directory of
 * stubs. That one documented seam is what lets the suite drive the real script
 * on a Linux CI runner; the runner prints `test_harness=1` and warns on stderr
 * whenever it is set.
 *
 * The stubs are STRICT:
 *   - `supabase` records its argv NUL-separated (so arguments are compared as
 *     an array, never as a joined string), dispatches on the exact argument
 *     vector including `init`, and exits 90/91 on anything unexpected;
 *   - `curl` parses the config the runner pipes into its stdin, asserts the
 *     method, URL, headers and `read_only` flag, records the SQL body it was
 *     given, and replays a per-call fixture;
 *   - `shasum` answers the pinned CLI digest only for a file carrying the stub
 *     CLI's marker line and computes a real SHA-256 for everything else, so the
 *     script's own self-verification digest and the migration digests are real;
 *   - `uname` reports Darwin/arm64, which a Linux runner cannot.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  rewriteForTests,
  SUBSTITUTIONS,
} from "./test/lead-migration-runner-harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER_RELATIVE = "scripts/run-lead-migrations.sh";
const runnerSource = fs.readFileSync(path.join(repoRoot, RUNNER_RELATIVE), "utf8");

const GUARD_PATH = "supabase/migration-baselines/remote-applied-history-guard.sql";
const TARGETS = [
  { version: "20261027221000", basename: "20261027221000_lead_spam_classification.sql" },
  { version: "20261027230000", basename: "20261027230000_ai_referrer_tagging.sql" },
  { version: "20261122230000", basename: "20261122230000_leads_intake_zip_city_source.sql" },
];
const CALL_TRACKING = ["20261027200000", "20261027220000"];
const PROJECT_REF = "hdcflshhomzildwqlmwh";
const CLI_DIGEST = "ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a";
const CLI_MARKER = "#STUB-SUPABASE-CLI";
const SHA = "a".repeat(40);
const RO_URL =
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query/read-only`;

function embeddedList(label) {
  const block = runnerSource.split(`${label}="$(cat <<'VERSIONS'\n`)[1];
  assert.ok(block, `${label} heredoc not found in the runner`);
  return block.split("\nVERSIONS\n")[0].split("\n").filter((line) => line.length > 0);
}
const BASELINE = embeddedList("BASELINE_VERSIONS");
const EMBEDDED_CALL_TRACKING = embeddedList("CALL_TRACKING_VERSIONS");

const JQ = spawnSync("sh", ["-c", "command -v jq"], { encoding: "utf8" }).stdout.trim();
assert.ok(JQ.startsWith("/"), "jq must be on PATH for these tests");

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
  // `aiPresent` describes the COMMIT-before-history shape: objects present
  // while 20261027230000 is not recorded.
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

function pendingFor(recorded) {
  return TARGETS.filter((target) => !recorded.includes(target.version));
}

function guardNames(history) {
  return history.map((version) => `${version}_remote_applied_history_guard.sql`);
}

// ---------------------------------------------------------------------------
// Stubs. Each is generated per case with its state directory baked in, because
// the runner invokes the CLI under `env -i` with a fixed allowlist — no harness
// variable survives into it.
// ---------------------------------------------------------------------------

const stubCli = (state) => `#!${process.execPath}
// ${CLI_MARKER}  (the digest stub recognises this marker; it must be a JS comment)
// Dispatch on the argument ARRAY, never on a joined string: an argument
// containing a space or a newline cannot forge a boundary here.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const state = ${JSON.stringify(state)};
const argv = process.argv.slice(2);
fs.appendFileSync(state + "/argv.nul", argv.join("\\u0000") + "\\u0000" + "\\u001e");
fs.appendFileSync(state + "/cwd.log", fs.realpathSync(process.cwd()) + "\\n");
fs.appendFileSync(state + "/home.log", (process.env.HOME ?? "<unset>") + "\\n");
fs.appendFileSync(state + "/path.log", "PATH=" + (process.env.PATH ?? "<unset>") + "\\n");
fs.appendFileSync(
  state + "/env.log",
  [
    "TOKEN_PRESENT=" + (process.env.SUPABASE_ACCESS_TOKEN ? "yes" : "no"),
    "TOKEN_VALUE_SEEN=" + (process.env.SUPABASE_ACCESS_TOKEN ?? "<unset>"),
    "NO_KEYRING=" + (process.env.SUPABASE_NO_KEYRING ?? "<unset>"),
    "LC_ALL=" + (process.env.LC_ALL ?? "<unset>"),
    "ENV_KEYS=" + Object.keys(process.env).sort().join(","),
  ].join("\\n") + "\\n",
);
// The whole visible command line of this process AND of its parents, so the
// suite can prove the token is in no argv anywhere in the chain.
try {
  const ps = execFileSync("/bin/ps", ["-o", "args=", "-p", String(process.pid) + "," + String(process.ppid)], { encoding: "utf8" });
  fs.appendFileSync(state + "/ps.log", ps);
} catch (error) {
  fs.appendFileSync(state + "/ps.log", "ps-failed\\n");
}

const die = (code, message) => {
  process.stderr.write("stub supabase: " + message + "\\n");
  process.exit(code);
};
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

let rest = argv;
if (!eq(argv, ["--version"])) {
  if (argv[0] !== "--profile" || argv[1] !== "supabase" || argv[2] !== "--workdir" ||
      !(argv[3] ?? "").startsWith("/")) {
    die(91, "missing pinned global flags: " + JSON.stringify(argv));
  }
  fs.appendFileSync(state + "/workdir.log", argv[3] + "\\n");
  rest = argv.slice(4);
}

const read = (name) => fs.readFileSync(path.join(state, name), "utf8");
const nextFixture = (prefix) => {
  const counter = path.join(state, prefix + ".count");
  let n = 1;
  try { n = Number(fs.readFileSync(counter, "utf8").trim()) || 1; } catch {}
  fs.writeFileSync(counter, String(n + 1));
  let file = path.join(state, prefix + "." + n + ".json");
  while (!fs.existsSync(file) && n > 1) { n -= 1; file = path.join(state, prefix + "." + n + ".json"); }
  return fs.readFileSync(file, "utf8");
};

if (eq(rest, ["--version"])) {
  process.stdout.write(read("version.txt"));
} else if (eq(rest, ["--agent", "no", "--output-format", "json", "projects", "list"])) {
  const code = Number(read("projects.exit.txt").trim());
  if (code !== 0) {
    process.stderr.write("refusing, token=would-be-leaked\\n");
    process.exit(code);
  }
  process.stdout.write(read("projects.json"));
} else if (rest.length === 3 && rest[0] === "init" && rest[1] === "--workdir") {
  // exact: init's workdir must equal the pinned global one
  if (rest[2] !== argv[3]) die(92, "init --workdir " + rest[2] + " != pinned " + argv[3]);
  fs.mkdirSync(path.join(rest[2], "supabase"), { recursive: true });
  fs.copyFileSync(path.join(state, "config.toml"), path.join(rest[2], "supabase", "config.toml"));
} else if (eq(rest, ["link", "--project-ref", ${JSON.stringify(PROJECT_REF)}, "--yes"])) {
  fs.mkdirSync("supabase/.temp", { recursive: true });
  fs.writeFileSync("supabase/.temp/project-ref", read("linked-ref.txt"));
} else if (eq(rest, ["--agent", "no", "--output-format", "json", "migration", "up", "--linked", "--include-all", "--yes"])) {
  const staged = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  fs.writeFileSync(path.join(state, "staged.txt"), staged.join("\\n") + "\\n");
  process.stdout.write(read("up.stdout.json"));
  process.stderr.write(read("up.stderr.txt"));
  process.exit(Number(read("up.exit.txt").trim()));
} else {
  die(90, "unexpected invocation: " + JSON.stringify(rest));
}
`;

// curl stub: reads the runner's config from stdin, asserts the request it
// describes, records the SQL body, and replays a per-call fixture.
const stubCurl = (state) => `#!${process.execPath}
const fs = require("node:fs");
const state = ${JSON.stringify(state)};
const argv = process.argv.slice(2);
// -q must be FIRST, so no .curlrc anywhere can be read.
if (argv[0] !== "-q" || argv.join(" ") !== "-q --config -") {
  process.stderr.write("stub curl: expected '-q --config -' but got " + argv.join(" ") + "\\n");
  process.exit(81);
}
fs.appendFileSync(
  state + "/curl.env.jsonl",
  JSON.stringify({
    HOME: process.env.HOME ?? null,
    HTTPS_PROXY: process.env.HTTPS_PROXY ?? null,
    https_proxy: process.env.https_proxy ?? null,
    ALL_PROXY: process.env.ALL_PROXY ?? null,
    CURL_CA_BUNDLE: process.env.CURL_CA_BUNDLE ?? null,
    SSL_CERT_FILE: process.env.SSL_CERT_FILE ?? null,
    keys: Object.keys(process.env).sort(),
  }) + "\\n",
);
const config = fs.readFileSync(0, "utf8");
const value = (key) => {
  const line = config.split("\\n").find((l) => l.startsWith(key + " = "));
  return line ? line.slice(key.length + 4).replace(/^"|"$/g, "") : undefined;
};
const headers = config.split("\\n")
  .filter((l) => l.startsWith("header = "))
  .map((l) => l.slice(9).replace(/^"|"$/g, ""));
const record = {
  method: value("request"),
  url: value("url"),
  headers,
  bodyFile: (value("data-binary") || "").replace(/^@/, ""),
  output: value("output"),
  flags: config.split("\\n").filter((l) => !l.includes(" = ") && l.trim().length > 0),
};
record.body = record.bodyFile && fs.existsSync(record.bodyFile)
  ? JSON.parse(fs.readFileSync(record.bodyFile, "utf8"))
  : null;
fs.appendFileSync(state + "/curl.log.jsonl", JSON.stringify(record) + "\\n");

const counterPath = state + "/ro.count";
let n = 1;
try { n = Number(fs.readFileSync(counterPath, "utf8").trim()) || 1; } catch {}
fs.writeFileSync(counterPath, String(n + 1));
let fixture = state + "/ro." + n + ".json";
while (!fs.existsSync(fixture) && n > 1) { n -= 1; fixture = state + "/ro." + n + ".json"; }

let status = "200";
try { status = fs.readFileSync(state + "/ro.status." + n + ".txt", "utf8").trim(); } catch {}
let exitCode = 0;
try { exitCode = Number(fs.readFileSync(state + "/ro.exit." + n + ".txt", "utf8").trim()) || 0; } catch {}

if (record.output) fs.writeFileSync(record.output, fs.readFileSync(fixture));
process.stdout.write(status);
process.exit(exitCode);
`;

const stubUname = (state) => `#!/bin/sh
case "\${1:-}" in
  -s) cat '${state}/uname-s.txt' ;;
  -m) cat '${state}/uname-m.txt' ;;
  *) cat '${state}/uname-s.txt' ;;
esac
`;

// Real SHA-256 for every input except a file carrying the stub CLI's marker
// line, which answers with the pinned official digest. Path-independent, so it
// works for the copy the runner makes inside its private directory.
const stubShasum = (state) => `#!${process.execPath}
const crypto = require("node:crypto");
const fs = require("node:fs");
const state = ${JSON.stringify(state)};
const target = process.argv.slice(2).find((arg) => !arg.startsWith("-") && arg !== "256");
const pinned = (() => {
  try { return fs.readFileSync(state + "/cli-digest.txt", "utf8").trim(); }
  catch { return ${JSON.stringify(CLI_DIGEST)}; }
})();
if (target) {
  let head = "";
  try { head = fs.readFileSync(target, "utf8").slice(0, 200); } catch {}
  if (head.includes(${JSON.stringify(CLI_MARKER)})) {
    process.stdout.write(pinned + "  " + target + "\\n");
    process.exit(0);
  }
}
const bytes = target ? fs.readFileSync(target) : fs.readFileSync(0);
const digest = crypto.createHash("sha256").update(bytes).digest("hex");
process.stdout.write(digest + "  " + (target ?? "-") + "\\n");
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
  fs.writeFileSync(path.join(dir, name), body, { mode });
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

function runCase(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lead-runner-case-"));
  const work = path.join(root, "work");
  const origin = path.join(root, "origin.git");
  const state = path.join(root, "state");
  const bin = path.join(root, "harness");
  fs.mkdirSync(state);
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(bin, "private-tmp"));
  fs.mkdirSync(path.join(work, "supabase/migrations"), { recursive: true });
  fs.mkdirSync(path.join(work, path.dirname(GUARD_PATH)), { recursive: true });
  fs.mkdirSync(path.join(work, "scripts"), { recursive: true });

  const tamper = options.tamper ?? {};
  for (const target of TARGETS) {
    const relative = `supabase/migrations/${target.basename}`;
    fs.writeFileSync(
      path.join(work, relative),
      tamper[relative] ?? fs.readFileSync(path.join(repoRoot, relative), "utf8"),
    );
  }
  fs.writeFileSync(
    path.join(work, GUARD_PATH),
    tamper[GUARD_PATH] ?? fs.readFileSync(path.join(repoRoot, GUARD_PATH), "utf8"),
  );
  // The runner, rewritten by the TEST-ONLY harness and committed into the
  // fixture: the shipped script has no test mode, so the substitution happens
  // here. Its self-verification then compares the executed bytes with
  // `git show <RELEASE_SHA>:scripts/...` inside this repository.
  const fixtureRunner = path.join(work, RUNNER_RELATIVE);
  fs.writeFileSync(
    fixtureRunner,
    rewriteForTests(runnerSource, {
      harnessDir: bin,
      privateRoot: path.join(bin, "private-tmp"),
      jq: JQ,
    }),
    { mode: 0o755 },
  );
  // A dotenv file in the checkout: the CLI release is a Bun single-file
  // executable, which reads one from its working directory.
  fs.writeFileSync(path.join(work, ".env"), "SUPABASE_PROJECT_ID=wroaxatalhzslxkfmpse\n");

  git(root, "init", "--bare", "--initial-branch=main", origin);
  git(work, "init", "--initial-branch=main");
  git(work, "add", "-A");
  git(work, "commit", "-m", "fixture");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "--quiet", "origin", "main");
  git(work, "fetch", "--quiet", "origin", "main");
  if (options.advanceHead) {
    fs.writeFileSync(path.join(work, "local-only.txt"), "ahead of origin/main\n");
    git(work, "add", "-A");
    git(work, "commit", "-m", "local only");
  }
  const tip = git(work, "rev-parse", "HEAD");
  // Edit the working-tree copy AFTER the commit to break the self-check.
  if (options.tamperSelf) fs.appendFileSync(fixtureRunner, "\n# local edit\n");

  fs.writeFileSync(path.join(state, "version.txt"), `${options.cliVersion ?? "2.113.0"}\n`);
  fs.writeFileSync(path.join(state, "config.toml"), "# runner-only generated config\n");
  fs.writeFileSync(
    path.join(state, "projects.json"),
    `${JSON.stringify(options.projects ?? { projects: [{ id: PROJECT_REF }] })}\n`,
  );
  fs.writeFileSync(path.join(state, "projects.exit.txt"), `${options.projectsExit ?? 0}\n`);
  fs.writeFileSync(path.join(state, "linked-ref.txt"), `${options.linkedRef ?? PROJECT_REF}\n`);
  fs.writeFileSync(path.join(state, "uname-s.txt"), `${options.unameS ?? "Darwin"}\n`);
  fs.writeFileSync(path.join(state, "uname-m.txt"), `${options.unameM ?? "arm64"}\n`);
  fs.writeFileSync(path.join(state, "cli-digest.txt"), `${options.cliDigest ?? CLI_DIGEST}\n`);
  fs.writeFileSync(
    path.join(state, "up.stdout.json"),
    options.upRaw !== undefined
      ? options.upRaw
      : `${JSON.stringify(options.up ?? { applied: [] })}\n`,
  );
  fs.writeFileSync(path.join(state, "up.stderr.txt"), options.upStderr ?? "");
  fs.writeFileSync(path.join(state, "up.exit.txt"), `${options.upExit ?? 0}\n`);
  for (const [index, rows] of (options.catalogs ?? []).entries()) {
    fs.writeFileSync(path.join(state, `ro.${index + 1}.json`), `${JSON.stringify(rows)}\n`);
  }
  // Raw, un-JSON-encoded bodies, for the response-shape cases.
  for (const [index, raw] of (options.roRaw ?? []).entries()) {
    fs.writeFileSync(path.join(state, `ro.${index + 1}.json`), raw);
  }
  for (const [index, status] of (options.roStatus ?? []).entries()) {
    fs.writeFileSync(path.join(state, `ro.status.${index + 1}.txt`), `${status}\n`);
  }
  for (const [index, code] of (options.roExit ?? []).entries()) {
    fs.writeFileSync(path.join(state, `ro.exit.${index + 1}.txt`), `${code}\n`);
  }

  writeStub(bin, "supabase", stubCli(state), options.cliMode ?? 0o755);
  writeStub(bin, "curl", stubCurl(state));
  writeStub(bin, "uname", stubUname(state));
  writeStub(bin, "shasum", stubShasum(state));
  let cliPath = path.join(bin, options.cliName ?? "supabase");
  if ((options.cliName ?? "supabase") !== "supabase") {
    fs.copyFileSync(path.join(bin, "supabase"), cliPath);
    fs.chmodSync(cliPath, 0o755);
  }
  if (options.cliSymlink) {
    const linkPath = path.join(bin, "supabase-link");
    fs.symlinkSync(cliPath, linkPath);
    cliPath = linkPath;
  }

  const env = {
    ...cleanBaseEnv(),
    RELEASE_SHA: options.releaseSha ?? tip,
    SUPABASE_BIN: options.supabaseBin === null ? "" : (options.supabaseBin ?? cliPath),
    LEAD_MIGRATION_EXECUTION_MODE: options.executionMode ?? "preflight",
    LEAD_MIGRATION_AUTH_MODE: options.authMode ?? "injected-token",
    LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK: options.ack ?? options.releaseSha ?? tip,
    SUPABASE_ACCESS_TOKEN: options.accessToken === null
      ? undefined
      : (options.accessToken ?? "stub-token-not-a-real-credential"),
    ...(options.extraEnv ?? {}),
  };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  if (options.supabaseBinRelative) env.SUPABASE_BIN = `harness/supabase`;
  if (options.unsetAck) delete env.LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK;

  // By default the suite launches the script the way the runbook does — by its
  // RELATIVE path from the checkout root — which also proves the self-path
  // resolution happens before the cd. `absoluteLaunch` uses the absolute form.
  const launchPath = options.absoluteLaunch ? fixtureRunner : RUNNER_RELATIVE;
  const result = spawnSync("bash", [...(options.bashArgs ?? []), launchPath], {
    cwd: work,
    encoding: "utf8",
    env,
  });
  const stdout = result.stdout ?? "";

  const readLines = (name) => {
    const file = path.join(state, name);
    return fs.existsSync(file)
      ? fs.readFileSync(file, "utf8").split("\n").filter((l) => l.length > 0)
      : [];
  };
  // argv records: NUL-separated args, record-separated by \x1e.
  const argvFile = path.join(state, "argv.nul");
  const calls = fs.existsSync(argvFile)
    ? fs.readFileSync(argvFile, "utf8").split("\u001e").filter((r) => r.length > 0)
      .map((r) => r.split("\u0000").filter((a) => a.length > 0))
    : [];
  const curlLog = fs.existsSync(path.join(state, "curl.log.jsonl"))
    ? fs.readFileSync(path.join(state, "curl.log.jsonl"), "utf8").split("\n")
      .filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const staged = fs.existsSync(path.join(state, "staged.txt"))
    ? readLines("staged.txt")
    : null;

  const receiptDir = stdout.match(/^receipt_dir=(.+)$/m)?.[1];
  const receipts = {};
  if (receiptDir && fs.existsSync(receiptDir)) {
    for (const entry of fs.readdirSync(receiptDir, { withFileTypes: true })) {
      if (entry.isFile()) {
        receipts[entry.name] = fs.readFileSync(path.join(receiptDir, entry.name), "utf8");
      }
    }
  }
  let runnerDirReal;
  try {
    runnerDirReal = receiptDir ? fs.realpathSync(path.join(receiptDir, "runner")) : undefined;
  } catch { runnerDirReal = undefined; }

  const logs = {
    cwds: readLines("cwd.log"),
    homes: readLines("home.log"),
    paths: readLines("path.log"),
    envLog: readLines("env.log"),
    workdirs: readLines("workdir.log"),
    psLog: readLines("ps.log"),
    curlEnv: readLines("curl.env.jsonl").map((l) => JSON.parse(l)),
  };

  if (process.env.LEAD_RUNNER_DEBUG) {
    console.error(
      `[debug] status=${result.status}\n--stdout--\n${stdout}\n--stderr--\n${result.stderr}\n--calls--\n${
        calls.map((c) => c.join(" ")).join("\n")
      }\n--curl--\n${curlLog.map((c) => `${c.method} ${c.url}`).join("\n")}\n--receipts--\n${receiptDir && fs.existsSync(receiptDir) ? fs.readdirSync(receiptDir).join(" ") : "(none)"}\n--state--\n${fs.readdirSync(state).join(" ")}\n--cli.version--\n${receiptDir && fs.existsSync(receiptDir + "/cli.version.stderr.txt") ? fs.readFileSync(receiptDir + "/cli.version.stderr.txt", "utf8") + "|OUT:" + fs.readFileSync(receiptDir + "/cli.version.stdout.txt", "utf8") : "(none)"}`,
    );
  }

  // The private directory lives under the harness trusted root, inside the
  // case root, so one removal covers everything.
  fs.rmSync(root, { recursive: true, force: true });

  return {
    status: result.status,
    stdout,
    stderr: result.stderr ?? "",
    calls,
    curlLog,
    staged,
    receipts,
    receiptDir,
    runnerDirReal,
    checkout: work,
    ...logs,
  };
}

/** Each CLI call with the pinned global flags stripped, as an array. */
function subcommands(result) {
  return result.calls.map((args) =>
    args[0] === "--profile" ? args.slice(4) : args
  );
}

function assertPinnedFlags(result) {
  for (const args of result.calls) {
    if (args.length === 1 && args[0] === "--version") continue;
    assert.deepEqual(
      args.slice(0, 4).slice(0, 2),
      ["--profile", "supabase"],
      `call did not pin --profile supabase: ${args.join(" ")}`,
    );
    assert.equal(args[2], "--workdir", `call did not pin --workdir: ${args.join(" ")}`);
    assert.ok(args[3].startsWith("/"), "--workdir must be absolute");
  }
  const unique = [...new Set(result.workdirs)];
  if (unique.length > 0) {
    assert.equal(unique.length, 1, `workdir varied: ${unique.join(", ")}`);
    assert.equal(unique[0], `${result.receiptDir}/runner`);
  }
  assert.ok(result.runnerDirReal, "the runner workdir was not resolvable");
  for (const cwd of result.cwds) {
    assert.notEqual(cwd, result.checkout, "the CLI was executed from the checkout");
    assert.equal(cwd, result.runnerDirReal, `the CLI was executed from ${cwd}`);
  }
}

function pristinePreflight(extra = {}) {
  const rows = catalog({ callTracking: extra.callTracking ?? false });
  return { catalogs: [rows, rows], ...extra };
}

function catalogCase(rows, extra = {}) {
  return { catalogs: [rows, rows], ...extra };
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
  assert.match(runnerSource, new RegExp(`BASELINE_SHA256='${digestOfLines(BASELINE)}'`));
  assert.match(
    runnerSource,
    new RegExp(
      `CALL_TRACKING_BASELINE_SHA256='${digestOfLines([...BASELINE, ...CALL_TRACKING].sort())}'`,
    ),
  );
});

test("each reviewed target and the poison guard are pinned to their release bytes", () => {
  for (const target of TARGETS) {
    const digest = crypto.createHash("sha256")
      .update(fs.readFileSync(path.join(repoRoot, `supabase/migrations/${target.basename}`)))
      .digest("hex");
    assert.match(runnerSource, new RegExp(`'${digest}'`), `${target.basename} digest not pinned`);
  }
  const guard = crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(repoRoot, GUARD_PATH))).digest("hex");
  assert.match(runnerSource, new RegExp(`GUARD_SHA256='${guard}'`));
});

test("no target carries its own transaction, so the CLI owns it", () => {
  // The CLI wraps a file's statements AND the schema_migrations insert in one
  // BEGIN/COMMIT (legacy-migration-apply.ts:145-153, 205-234). A file with its
  // own `commit;` would end that transaction before the history insert and
  // reopen the applied-but-unrecorded window, which is why 20261027230000 was
  // re-cut without one.
  for (const target of TARGETS) {
    const sql = fs.readFileSync(
      path.join(repoRoot, `supabase/migrations/${target.basename}`),
      "utf8",
    );
    const statements = sql.split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .filter((line) => /^\s*(begin|commit|rollback)\s*;/i.test(line));
    assert.deepEqual(
      statements,
      [],
      `${target.basename} carries its own transaction control: ${statements.join(" ")}`,
    );
  }
  // And every psql-based applier supplies the transaction itself.
  for (
    const [file, pattern] of [
      [".github/workflows/ai-referrer-tagging.yml", /psql [^\n]*-1 [^\n]*20261027230000_ai_referrer_tagging\.sql/],
      [".github/workflows/hook-guards.yml", /psql [^\n]*-1 [^\n]*20261027230000_ai_referrer_tagging\.sql/],
    ]
  ) {
    assert.match(fs.readFileSync(path.join(repoRoot, file), "utf8"), pattern, file);
  }
  assert.match(
    fs.readFileSync(path.join(repoRoot, "scripts/test-lead-migration-probe.mjs"), "utf8"),
    /relative\.startsWith\("supabase\/migrations\/"\) \? \["-1"\]/,
  );
});

test("the runbook's rollback blocks are exactly the ones the rollback contract runs", () => {
  const transactions = (source) =>
    [...source.matchAll(/^begin;$\n([\s\S]*?)^commit;$/gm)].map((match) =>
      match[1].split("\n").map((l) => l.replace(/\s+/g, " ").trim())
        .filter((l) => l.length > 0 && !l.startsWith("--")).join("\n")
    );
  const runbook = transactions(
    fs.readFileSync(path.join(repoRoot, "docs/runbooks/utah-lead-migrations.md"), "utf8"),
  );
  const contract = transactions(
    fs.readFileSync(path.join(repoRoot, "supabase/tests/lead_migrations_rollback.sql"), "utf8"),
  );
  assert.equal(runbook.length, 3, "the runbook must document one rollback per target");
  assert.deepEqual(contract, runbook, "the verified and documented rollbacks have drifted");
  for (const [index, version] of TARGETS.map((t) => t.version).reverse().entries()) {
    assert.match(runbook[index], new RegExp(`schema_migrations where version = '${version}'`));
  }
});

test("the shipped runner has no test-mode switch and no configurable tool paths", () => {
  for (
    const forbidden of [
      "TEST_HARNESS",
      "LEAD_MIGRATION_JQ",
      "LEAD_MIGRATION_TEST",
      "test_harness",
    ]
  ) {
    assert.equal(
      runnerSource.includes(forbidden),
      false,
      `${forbidden} must not exist in the shipped script`,
    );
  }
  // Only these constants may be rewritten, and each must still be present
  // verbatim — otherwise the harness is silently testing something else.
  for (const { name, from } of SUBSTITUTIONS) {
    assert.ok(runnerSource.includes(from), `${name} is not in its expected shipped form`);
  }
  // jq comes from a fixed candidate list with a version gate, not a variable.
  assert.match(runnerSource, /for jq_candidate in \/opt\/homebrew\/bin\/jq \/usr\/bin\/jq; do/);
  assert.match(runnerSource, /jq-1\.6\*\|jq-1\.7\*\|jq-1\.8\*/);
  // and the harness file is test-only: nothing in scripts/ outside the test
  // tree may reference it.
  const referrers = fs.readdirSync(path.join(repoRoot, "scripts"))
    .filter((f) => f.endsWith(".sh") || f.endsWith(".mjs"))
    .filter((f) =>
      fs.readFileSync(path.join(repoRoot, "scripts", f), "utf8")
        .includes("lead-migration-runner-harness")
    );
  assert.deepEqual(referrers, ["run-lead-migrations.test.mjs"]);
});

test("the runner uses trusted absolute utilities and a fixed PATH", () => {
  assert.match(runnerSource, /^PATH='\/usr\/bin:\/bin:\/usr\/sbin:\/sbin'$/m);
  assert.match(runnerSource, /^SHASUM='\/usr\/bin\/shasum'$/m);
  assert.match(runnerSource, /^GIT='\/usr\/bin\/git'$/m);
  assert.match(runnerSource, /^CURL='\/usr\/bin\/curl'$/m);
  assert.match(runnerSource, /^ENV='\/usr\/bin\/env'$/m);
  assert.match(runnerSource, /^AWK='\/usr\/bin\/awk'$/m);
  assert.match(runnerSource, /^BASH='\/bin\/bash'$/m);
  assert.match(runnerSource, /^TRUSTED_TMP_ROOT='\/private\/tmp'$/m);
  // TMPDIR is never read: the private root is fixed.
  assert.equal(/\$\{?TMPDIR/.test(runnerSource), false, "TMPDIR must never be read");
  // and every CLI call goes through env -i
  assert.match(runnerSource, /"\$ENV" -i \\/);
});

test("the runner has no recovery mode and no side-effect acknowledgement left", () => {
  const executable = runnerSource.split("\n")
    .filter((line) => !line.trimStart().startsWith("#")).join("\n");
  for (
    const gone of [
      "LEAD_MIGRATION_RECOVER_UNRECORDED_AI_REFERRER",
      "LEAD_MIGRATION_RECOVER_RECEIPT_DIR",
      "LEAD_MIGRATION_DB_QUERY_SIDE_EFFECT_ACK",
      "db query",
      "migration list",
    ]
  ) {
    assert.equal(executable.includes(gone), false, `${gone} must be gone from the executable lines`);
  }
  assert.ok(runnerSource.includes("STOP AND ESCALATE"));
  // Every subcommand the runner hands the CLI, with continuations joined.
  const invocations = [...runnerSource.replace(/\\\n\s*/g, " ")
    .matchAll(/cli [a-z-]+ ([^\n|>]*)/g)].map((m) => m[1]);
  for (const forbidden of ["db push", "migration repair", "db reset", "db dump", "db query"]) {
    assert.equal(
      invocations.some((i) => i.includes(forbidden)),
      false,
      `runner runs ${forbidden}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 1. Binary copy, hashed copy, trusted root
// ---------------------------------------------------------------------------

test("the CLI is copied into the private root and the COPY is what gets hashed and run", () => {
  const result = runCase(pristinePreflight());
  assert.equal(result.status, 0, result.stderr);
  // Production pins /private/tmp; under the harness the trusted root moves
  // inside the case directory so the suite can run on Linux too.
  assert.match(runnerSource, /^TRUSTED_TMP_ROOT='\/private\/tmp'$/m);
  assert.match(result.receiptDir, /\/private-tmp\/utah-lead-migrations\./,
    `private dir was ${result.receiptDir}`);
  assert.match(runnerSource, /cp "\$SUPABASE_BIN" "\$CLI"/);
  assert.match(runnerSource, /CLI="\$BIN_DIR\/supabase"/);
  assert.match(
    runnerSource,
    /test "\$\("\$SHASUM" -a 256 "\$CLI" \| "\$AWK" '\{print \$1\}'\)" = "\$CLI_SHA256"/,
  );
  // A wrong digest stops before the copy is ever executed.
  const badDigest = runCase({ ...pristinePreflight(), cliDigest: "f".repeat(64) });
  expectHardStop(badDigest, /private copy of the Supabase CLI does not match/);
  assert.deepEqual(badDigest.calls, [], "the CLI must not run before its copy is verified");
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
    runCase({ ...pristinePreflight(), cliName: "supabase-go" }),
    /supabase-go compatibility binary is forbidden/,
  );
});

// ---------------------------------------------------------------------------
// 2. Environment allowlist
// ---------------------------------------------------------------------------

test("every CLI call runs under env -i with only the allowlisted variables", () => {
  const result = runCase(pristinePreflight());
  assert.equal(result.status, 0, result.stderr);
  assertPinnedFlags(result);
  // HOME is redirected into the private directory, never the operator's.
  for (const home of result.homes) {
    assert.equal(home, `${result.receiptDir}/cli-home`, `HOME was ${home}`);
    assert.notEqual(home, process.env.HOME);
  }
  for (const line of result.paths) {
    assert.equal(line, "PATH=/usr/bin:/bin:/usr/sbin:/sbin");
  }
  assert.ok(result.envLog.includes("TOKEN_PRESENT=yes"));
  assert.ok(result.envLog.includes("NO_KEYRING=1"));
  assert.ok(result.envLog.includes("LC_ALL=C"));
  // The child's environment is exactly the allowlist (plus what the shell adds
  // for itself: PWD, SHLVL and macOS's __CF_USER_TEXT_ENCODING).
  const shellAdded = new Set(["PWD", "SHLVL", "_", "__CF_USER_TEXT_ENCODING", "OLDPWD"]);
  for (const line of result.envLog.filter((l) => l.startsWith("ENV_KEYS="))) {
    const keys = line.slice("ENV_KEYS=".length).split(",").filter(Boolean)
      .filter((k) => !shellAdded.has(k));
    assert.deepEqual(keys.sort(), [
      "HOME",
      "LANG",
      "LC_ALL",
      "PATH",
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_NO_KEYRING",
    ]);
  }
});

test("the token reaches the child's environment but never any argv", () => {
  // Assembled from words rather than written as one high-entropy literal: a
  // literal here reads as a credential to the secret scanner, and this value is
  // only ever a distinctive needle to search the logs for.
  const needle = ["not", "a", "real", "token", "only", "test", "text"].join("-");
  const result = runCase({ ...pristinePreflight(), accessToken: needle });
  assert.equal(result.status, 0, result.stderr);

  // It arrived: the CLI saw it in its environment.
  assert.ok(result.envLog.includes(`TOKEN_VALUE_SEEN=${needle}`));
  // And curl received it, as a header in the config it read from stdin.
  assert.ok(
    result.curlLog.every((c) => c.headers.includes(`Authorization: Bearer ${needle}`)),
  );

  // But no recorded argument vector contains it — not the CLI's own, and not
  // any ancestor's as `ps` sees them (which is where `env VAR=secret` would
  // put it).
  for (const args of result.calls) {
    for (const arg of args) {
      assert.equal(arg.includes(needle), false, `needle in CLI argv: ${arg}`);
    }
  }
  assert.ok(result.psLog.length > 0, "ps produced no output to check");
  for (const line of result.psLog) {
    assert.equal(line.includes(needle), false, `needle visible in ps: ${line}`);
  }
  // Nor any retained receipt, nor the terminal.
  for (const [name, body] of Object.entries(result.receipts)) {
    assert.equal(body.includes(needle), false, `needle retained in ${name}`);
  }
  assert.equal(result.stdout.includes(needle), false);
  assert.equal(result.stderr.includes(needle), false);
  // The launcher shape that makes this true.
  assert.match(runnerSource, /printf '%s' "\$SUPABASE_ACCESS_TOKEN" \| "\$ENV" -i/);
  assert.equal(
    /SUPABASE_ACCESS_TOKEN="\$SUPABASE_ACCESS_TOKEN" \\/.test(runnerSource),
    false,
    "the token must not be an argument to env",
  );
});

test("a token with a character outside the safe set is refused before use", () => {
  for (
    const bad of [
      'tok"quote',
      "tok\\backslash",
      "tok with space",
      "tok$(id)",
      "tok\nnewline",
    ]
  ) {
    const result = runCase({ ...pristinePreflight(), accessToken: bad });
    expectHardStop(result, /SUPABASE_ACCESS_TOKEN contains a character outside/);
    assert.deepEqual(result.calls, [], "nothing may run on a malformed token");
  }
});

test("curl runs isolated: no .curlrc, no proxy, no CA override", () => {
  // A hostile .curlrc in the REAL home, and proxy/CA variables in the caller's
  // environment. Neither may reach curl.
  const hostileHome = fs.mkdtempSync(path.join(os.tmpdir(), "hostile-home-"));
  fs.writeFileSync(
    path.join(hostileHome, ".curlrc"),
    'proxy = "http://127.0.0.1:9"\ninsecure\n',
  );
  const result = runCase({
    ...pristinePreflight(),
    extraEnv: {
      HOME: hostileHome,
      HTTPS_PROXY: "http://127.0.0.1:9",
      https_proxy: "http://127.0.0.1:9",
      ALL_PROXY: "socks5://127.0.0.1:9",
      CURL_CA_BUNDLE: "/nonexistent/ca.pem",
      SSL_CERT_FILE: "/nonexistent/ca.pem",
    },
  });
  fs.rmSync(hostileHome, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.curlEnv.length > 0, "the curl stub recorded no environment");
  for (const env of result.curlEnv) {
    assert.equal(env.HOME, `${result.receiptDir}/curl-home`, `curl HOME was ${env.HOME}`);
    assert.notEqual(env.HOME, hostileHome);
    for (const key of ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "CURL_CA_BUNDLE", "SSL_CERT_FILE"]) {
      assert.equal(env[key], null, `${key} reached curl`);
    }
  }
  // -q first is what makes the .curlrc unreadable even if HOME pointed at it.
  assert.match(runnerSource, /"\$CURL" -q --config -/);
});

test("any CLI-redirecting environment variable is refused before anything runs", () => {
  for (
    const name of [
      "SUPABASE_PROJECT_ID",
      "SUPABASE_DB_URL",
      "SUPABASE_WORKDIR",
      "SUPABASE_PROFILE",
      "PGHOST",
      "PGSERVICE",
    ]
  ) {
    const result = runCase({ ...pristinePreflight(), extraEnv: { [name]: "x" } });
    expectHardStop(result, new RegExp(`unset ${name} before running`));
    assert.deepEqual(result.calls, [], `${name} was refused only after invoking the CLI`);
  }
});

test("shell tracing is refused and the PS4 gate accepts only bash's default", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), bashArgs: ["-x"] }),
    /shell tracing is on/,
  );
  assert.ok(/case "\$\{PS4:-\+ \}" in/.test(runnerSource));
});

// ---------------------------------------------------------------------------
// 3. Read-only preflight over the Management API
// ---------------------------------------------------------------------------

test("preflight reads only through the Management API read-only endpoint", () => {
  const result = runCase(pristinePreflight());
  assert.equal(result.status, 0, result.stderr);

  // Exactly two CLI calls, both harmless, and NO link / migration subcommand.
  assert.deepEqual(subcommands(result), [
    ["--version"],
    ["--agent", "no", "--output-format", "json", "projects", "list"],
  ]);
  assert.match(result.stdout, /^cli_calls=version,projects-list$/m);
  assert.match(result.stdout, /^reads=management-api-read-only$/m);

  // Two read-only calls, each the exact request shape.
  assert.equal(result.curlLog.length, 2);
  for (const call of result.curlLog) {
    assert.equal(call.method, "POST");
    assert.equal(call.url, RO_URL);
    assert.ok(
      call.headers.includes("Authorization: Bearer stub-token-not-a-real-credential"),
      call.headers.join(" | "),
    );
    assert.ok(call.headers.includes("Content-Type: application/json"));
    assert.ok(call.headers.includes("User-Agent: SupabaseCLI/2.113.0"));
    // The documented body is exactly {"query": …}; `read_only` is not a member
    // of it and must not be sent.
    assert.deepEqual(Object.keys(call.body), ["query"]);
    assert.equal(call.body.read_only, undefined);
    assert.match(call.body.query, /^select\s/);
    assert.match(call.body.query, /supabase_migrations\.schema_migrations/);
    assert.match(call.body.query, /from public\.leads\) as lead_rows/);
    assert.match(call.body.query, /from public\.phone_clicks\) as phone_click_rows/);
    assert.match(call.body.query, /spam_indexes_exact/);
    assert.match(call.body.query, /ai_referrer_triggers_armed/);
    // Read-only by construction: one statement, no DML/DDL. (The pinned
    // `CREATE INDEX …` strings are literals inside the comparison, not
    // statements, so the screen looks for statement forms.)
    assert.equal(call.body.query.trim().endsWith(";"), false, "no trailing semicolon");
    assert.equal(call.body.query.includes(";"), false, "the probe is a single statement");
    // Screen the code, not the string literals the comparison pins.
    const code = call.body.query.replace(/'[^']*'/g, "''");
    for (
      const statement of [
        /insert\s+into/i,
        /\bupdate\s+\w/i,
        /delete\s+from/i,
        /alter\s+table/i,
        /\bdrop\s+\w/i,
        /\bgrant\s+\w/i,
        /\brevoke\s+\w/i,
        /create\s+(table|index|function|view|trigger)\s+\w/i,
      ]
    ) {
      assert.equal(statement.test(code), false, `${statement} in the probe`);
    }
    assert.ok(call.flags.includes("fail-with-body"));
    assert.ok(call.flags.includes("silent"));
  }
  // The token is passed through curl's stdin config, never argv, never a file.
  assert.match(runnerSource, /"\$CURL" -q --config -/);
  for (const name of Object.keys(result.receipts)) {
    assert.equal(
      result.receipts[name].includes("stub-token-not-a-real-credential"),
      false,
      `${name} retained the bearer token`,
    );
  }
});

test("the documented 201 is accepted, 200 is accepted, anything else stops", () => {
  // The API reference documents 201 as the only success for this endpoint.
  const created = runCase({ ...pristinePreflight(), roStatus: ["201", "201"] });
  assert.equal(created.status, 0, created.stderr);
  const ok = runCase({ ...pristinePreflight(), roStatus: ["200", "200"] });
  assert.equal(ok.status, 0, ok.stderr);
  for (const status of ["202", "204", "400", "401", "403", "429", "500"]) {
    expectHardStop(
      runCase({ ...pristinePreflight(), roStatus: [status] }),
      new RegExp(`returned HTTP ${status}; only 200 and 201 are accepted`),
    );
  }
  expectHardStop(
    runCase({ ...pristinePreflight(), roExit: [22] }),
    /read-only query \(catalog-before\) failed/,
  );
});

test("the read-only response shape is fail-closed, with no type coercion", () => {
  const good = catalog()[0];
  const cases = [
    { label: "empty body", raw: "" },
    { label: "whitespace only", raw: "   \n" },
    { label: "not json", raw: "not json\n" },
    { label: "an object, not an array", raw: JSON.stringify(good) },
    { label: "an empty array", raw: "[]" },
    { label: "two rows", raw: JSON.stringify([good, good]) },
    { label: "an array of a non-object", raw: JSON.stringify([1]) },
    { label: "two documents", raw: `${JSON.stringify([good])}\n${JSON.stringify([good])}` },
    {
      label: 'a string "false" where a boolean belongs',
      raw: JSON.stringify([{ ...good, leads_zip: "false" }]),
    },
    {
      label: 'a string "0" where a count belongs',
      raw: JSON.stringify([{ ...good, spam_columns: "0" }]),
    },
    { label: "a negative count", raw: JSON.stringify([{ ...good, lead_rows: -1 }]) },
    { label: "a fractional count", raw: JSON.stringify([{ ...good, lead_rows: 1.5 }]) },
    { label: "a missing field", raw: JSON.stringify([(() => { const { leads_zip, ...rest } = good; return rest; })()]) },
    { label: "history not an array", raw: JSON.stringify([{ ...good, history: "x" }]) },
    { label: "history with a non-string", raw: JSON.stringify([{ ...good, history: [1] }]) },
  ];
  for (const { label, raw } of cases) {
    const result = runCase({ ...pristinePreflight(), roRaw: [raw] });
    expectHardStop(
      result,
      /did not return exactly one array of one row object with JSON booleans and non-negative integer counts/,
    );
    assert.equal(
      /catalog state in/.test(result.stderr),
      false,
      `${label}: the shape gate must fire before any field is read`,
    );
  }
});

test("keychain-profile mode is refused and a token is required", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), authMode: "keychain-profile" }),
    /keychain-profile mode is not supported/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), authMode: "whatever" }),
    /LEAD_MIGRATION_AUTH_MODE must be injected-token/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), accessToken: null }),
    /inject SUPABASE_ACCESS_TOKEN/,
  );
});

test("apply re-probes read-only and uses the CLI only for init, link and migration up", () => {
  const before = catalog({ callTracking: true });
  const after = catalog({ callTracking: true, recorded: TARGETS.map((t) => t.version) });
  const result = runCase({
    executionMode: "apply",
    catalogs: [before, before, after],
    up: { applied: TARGETS.map((t) => `supabase/migrations/${t.basename}`) },
  });
  assert.equal(result.status, 0, result.stderr);
  assertPinnedFlags(result);
  assert.deepEqual(subcommands(result), [
    ["--version"],
    ["--agent", "no", "--output-format", "json", "projects", "list"],
    // the same absolute workdir the global flag pinned, not a resolved variant
    ["init", "--workdir", result.workdirs[0]],
    ["link", "--project-ref", PROJECT_REF, "--yes"],
    ["--agent", "no", "--output-format", "json", "migration", "up", "--linked", "--include-all", "--yes"],
  ]);
  assert.equal(result.curlLog.length, 3, "before, pre-mutation re-probe, postflight");
  assert.match(result.stdout, /^cli_calls=version,projects-list,init,link,migration-up$/m);
  assert.match(result.stdout, /^apply_side_effects=migration up --linked opens a database connection/m);
  assert.match(result.stdout, /mints a temporary postgres login role/);
  assert.match(result.stdout, /DELETES this project IPv4 network bans/);
  assert.deepEqual(
    [...result.staged].sort(),
    [...guardNames([...BASELINE, ...CALL_TRACKING].sort()), ...TARGETS.map((t) => t.basename)].sort(),
  );
});

// ---------------------------------------------------------------------------
// 4. No recovery mode: the unrecorded state escalates
// ---------------------------------------------------------------------------

test("AI-referrer objects present without a history row stop and escalate", () => {
  const rows = catalog({ recorded: [TARGETS[0].version], aiPresent: true });
  const result = runCase(catalogCase(rows));
  expectHardStop(result, /STOP AND ESCALATE/);
  assert.match(result.stderr, /20261027230000 looks applied but is NOT recorded/);
  assert.match(result.stderr, /exit codes 0\/1 only/);
  assert.match(result.stderr, /never use migration repair/i);
  assert.equal(
    /LEAD_MIGRATION_RECOVER/.test(result.stderr),
    false,
    "no recovery mode may be offered",
  );
});

test("a failed migration up points at escalation, not a replay", () => {
  const before = catalog({ callTracking: true });
  const result = runCase({
    executionMode: "apply",
    catalogs: [before, before, before],
    up: {},
    upStderr: "Applying migration 20261027230000_ai_referrer_tagging.sql...\nERROR: boom\n",
    upExit: 1,
  });
  expectHardStop(result, /migration up failed; retain/);
  assert.match(result.stderr, /STOP AND ESCALATE — this runner has no replay path/);
});

// ---------------------------------------------------------------------------
// 5. Retained streams and the printed field allowlist
// ---------------------------------------------------------------------------

test("every CLI stream is retained and the summary prints only allowlisted fields", () => {
  const result = runCase(pristinePreflight());
  assert.equal(result.status, 0, result.stderr);
  for (
    const name of [
      "cli.version.stdout.txt",
      "cli.version.stderr.txt",
      "cli.projects-list.stdout.txt",
      "cli.projects-list.stderr.txt",
      "ro.catalog-before.body.json",
      "ro.catalog-before.status.txt",
      "ro.catalog-before.stderr.txt",
      "catalog.before.json",
      "catalog.final-preflight.json",
      "probe.sql",
      "run.json",
      "staged-migrations.txt",
      "staged-migrations.expected.txt",
    ]
  ) {
    assert.notEqual(result.receipts[name], undefined, `missing receipt ${name}`);
  }
  const printed = result.stdout.split("\n").filter(Boolean).map((l) => l.split("=")[0]);
  assert.deepEqual(printed, [
    "receipt_dir",
    "mode",
    "release_sha",
    "project_ref",
    "mode",
    "pending",
    "lead_rows",
    "phone_click_rows",
    "call_tracking_recorded",
    "row_count_warning",
    "receipt_dir",
    "lock_note",
    "receipts_contain_cli_diagnostics",
    "reads",
    "cli_calls",
  ]);
  // The catalog JSON is never echoed.
  assert.equal(result.stdout.includes("spam_indexes_exact"), false);
  assert.equal(result.stdout.includes("history"), false);
});

test("an apply that fails still prints the receipt directory first", () => {
  const before = catalog({ callTracking: true });
  const result = runCase({
    executionMode: "apply",
    catalogs: [before, before, before],
    up: {},
    upExit: 1,
  });
  assert.match(result.stdout.split("\n")[0], /^receipt_dir=\/.*\/utah-lead-migrations\./);
});

// ---------------------------------------------------------------------------
// 6. Self-verification
// ---------------------------------------------------------------------------

test("the exact runbook launch form works, and so does the absolute form", () => {
  // The runbook says: cd into a clean checkout, then
  // `LEAD_MIGRATION_EXECUTION_MODE=preflight scripts/run-lead-migrations.sh`.
  // That relative form only works if the script resolves its own absolute path
  // BEFORE it cds into the private directory.
  const relative = runCase(pristinePreflight());
  assert.equal(relative.status, 0, relative.stderr);
  const absolute = runCase({ ...pristinePreflight(), absoluteLaunch: true });
  assert.equal(absolute.status, 0, absolute.stderr);
  // and the resolution really is ahead of the cd
  const selfAt = runnerSource.indexOf("SELF_PATH=");
  const cdAt = runnerSource.indexOf('\ncd "$RUNNER_DIR"');
  assert.ok(selfAt > 0 && cdAt > 0 && selfAt < cdAt, "SELF_PATH must resolve before the cd");
});

test("a no-op apply reports only the CLI calls it actually made", () => {
  const rows = catalog({ callTracking: true, recorded: TARGETS.map((t) => t.version) });
  const result = runCase({ executionMode: "apply", catalogs: [rows, rows, rows] });
  assert.equal(result.status, 0, result.stderr);
  // It skipped init, link and migration up, so it must not claim them.
  assert.match(result.stdout, /^cli_calls=version,projects-list$/m);
  for (const skipped of ["init", "link", "migration-up"]) {
    assert.equal(
      new RegExp(`cli_calls=[^\\n]*${skipped}`).test(result.stdout),
      false,
      `a no-op apply reported ${skipped}`,
    );
  }
  // A real apply does report them.
  const before = catalog({ callTracking: true });
  const after = catalog({ callTracking: true, recorded: TARGETS.map((t) => t.version) });
  const applied = runCase({
    executionMode: "apply",
    catalogs: [before, before, after],
    up: { applied: TARGETS.map((t) => `supabase/migrations/${t.basename}`) },
  });
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /^cli_calls=version,projects-list,init,link,migration-up$/m);
});

test("the CLI's own JSON is shape-gated too", () => {
  const before = catalog({ callTracking: true });
  const after = catalog({ callTracking: true, recorded: TARGETS.map((t) => t.version) });
  for (
    const raw of [
      "",
      "not json\n",
      "[]",
      JSON.stringify({}),
      JSON.stringify({ applied: "x" }),
      JSON.stringify({ applied: [1] }),
    ]
  ) {
    const result = runCase({
      executionMode: "apply",
      catalogs: [before, before, after],
      upRaw: raw,
    });
    expectHardStop(result, /migration up did not return one JSON object with an applied string array/);
  }
});

test("the runner refuses to execute bytes that differ from the release", () => {
  const result = runCase({ ...pristinePreflight(), tamperSelf: true });
  expectHardStop(result, /the running script is not the reviewed release bytes/);
  assert.deepEqual(result.calls, [], "nothing may run before the self-check");
  assert.match(
    runnerSource,
    /"\$GIT" -C "\$REPO_ROOT" show "\$\{RELEASE_SHA\}:scripts\/run-lead-migrations\.sh"/,
  );
});

// ---------------------------------------------------------------------------
// Operator inputs, release commit, history contract
// ---------------------------------------------------------------------------

test("RELEASE_SHA must be a full lowercase commit and the tip this fetch received", () => {
  expectHardStop(runCase({ ...pristinePreflight(), releaseSha: "abc" }), /full 40-character/);
  expectHardStop(
    runCase({ ...pristinePreflight(), releaseSha: "A".repeat(40) }),
    /lowercase hexadecimal/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), releaseSha: SHA }),
    /does not resolve to a commit/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), advanceHead: true }),
    /RELEASE_SHA is not the main tip this fetch received/,
  );
});

test("the writer acknowledgement and the execution mode are closed", () => {
  expectHardStop(
    runCase({ ...pristinePreflight(), ack: SHA }),
    /exclusive migration-writer window/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), unsetAck: true }),
    /exclusive migration-writer window/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), executionMode: "yolo" }),
    /LEAD_MIGRATION_EXECUTION_MODE must be preflight or apply/,
  );
});

test("the platform gate, the CLI version and the project identity all fail closed", () => {
  expectHardStop(runCase({ ...pristinePreflight(), unameS: "Linux" }), /only valid on macOS arm64/);
  expectHardStop(runCase({ ...pristinePreflight(), unameM: "x86_64" }), /only valid on macOS arm64/);
  expectHardStop(
    runCase({ ...pristinePreflight(), cliVersion: "2.112.0" }),
    /Supabase CLI 2\.113\.0 is required/,
  );
  expectHardStop(
    runCase({ ...pristinePreflight(), projects: { projects: [{ id: "wroaxatalhzslxkfmpse" }] } }),
    /cannot resolve the exact Utah project/,
  );
  const failedList = runCase({ ...pristinePreflight(), projectsExit: 7 });
  expectHardStop(failedList, /could not list projects \(exit 7\)/);
  assert.equal(
    failedList.stderr.includes("would-be-leaked"),
    false,
    "the CLI's own failure text must not reach the terminal",
  );
});

test("release bytes of every target and of the poison guard are verified", () => {
  for (const target of TARGETS) {
    expectHardStop(
      runCase({
        ...pristinePreflight(),
        tamper: { [`supabase/migrations/${target.basename}`]: "-- tampered\nselect 1;\n" },
      }),
      new RegExp(`release bytes of ${target.basename} differ`),
    );
  }
  expectHardStop(
    runCase({ ...pristinePreflight(), tamper: { [GUARD_PATH]: "select 1;\n" } }),
    /remote-history guard bytes differ/,
  );
});

test("an unreviewed history, a split call-tracking pair, or a weak catalog is a hard stop", () => {
  expectHardStop(
    runCase(catalogCase(catalog({ extraHistory: ["20261118000000"] }))),
    /catalog state in .*catalog\.before\.json differs/,
  );
  for (const version of CALL_TRACKING) {
    expectHardStop(
      runCase(catalogCase(catalog({ extraHistory: [version] }))),
      /catalog state in .*catalog\.before\.json differs/,
    );
  }
  for (
    const override of [
      { spam_columns: 3 },
      { spam_indexes_exact: 1 },
      { leads_zip: true },
      { ai_referrer_triggers: 1 },
    ]
  ) {
    expectHardStop(
      runCase(catalogCase(catalog({ overrides: override }))),
      /catalog state in .*catalog\.before\.json differs/,
    );
  }
  const recorded = TARGETS.map((t) => t.version);
  for (
    const override of [
      { ai_referrer_triggers_armed: 1 },
      { spam_indexes_exact: 1 },
      { ai_referrer_anon_execute: true },
      { ai_referrer_trigger_authenticated_execute: true },
      { ai_referrer_service_role_execute: false },
    ]
  ) {
    expectHardStop(
      runCase(catalogCase(catalog({ recorded, overrides: override }))),
      /catalog state in .*catalog\.before\.json differs/,
    );
  }
});

test("the staged set is rebuilt locally and must be guards plus exactly the pending targets", () => {
  // No `migration list --linked` in the executable lines: the comparison is local.
  const executable = runnerSource.split("\n")
    .filter((line) => !line.trimStart().startsWith("#")).join("\n");
  assert.equal(executable.includes("migration list"), false);
  const recorded = [TARGETS[0].version, TARGETS[2].version];
  const rows = catalog({ callTracking: true, recorded });
  const result = runCase(catalogCase(rows));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.receipts["staged-migrations.txt"].split("\n").filter(Boolean).sort(),
    [
      ...guardNames([...BASELINE, ...CALL_TRACKING, ...recorded].sort()),
      pendingFor(recorded)[0].basename,
    ].sort(),
  );
  assert.equal(
    result.receipts["staged-migrations.txt"],
    result.receipts["staged-migrations.expected.txt"],
  );
  assert.match(result.stdout, /pending=20261027230000_ai_referrer_tagging\.sql\s/);
});

test("a catalog that moves between the two preflight reads is a hard stop", () => {
  expectHardStop(
    runCase({ catalogs: [catalog(), catalog({ recorded: [TARGETS[2].version] })] }),
    /catalog changed between the first and the final read|catalog state in .*final-preflight/,
  );
});

test("apply refuses until the call-tracking pair is recorded", () => {
  const bare = catalog();
  const result = runCase({
    executionMode: "apply",
    catalogs: [bare, bare, bare],
    up: { applied: TARGETS.map((t) => `supabase/migrations/${t.basename}`) },
  });
  expectHardStop(result, /run-call-tracking-migrations\.sh must be applied first/);
  assert.equal(result.staged, null);
  const preflight = runCase(pristinePreflight());
  assert.equal(preflight.status, 0);
  assert.match(preflight.stdout, /call_tracking_recorded=false/);
});

// ---------------------------------------------------------------------------
// Apply-path gates
// ---------------------------------------------------------------------------

test("a selected poison guard is a hard stop and a failed scan is not a clean scan", () => {
  const before = catalog({ callTracking: true });
  expectHardStop(
    runCase({
      executionMode: "apply",
      catalogs: [before, before, before],
      up: { applied: ["supabase/migrations/20260610_remote_applied_history_guard.sql"] },
      upStderr: "UTAH_REMOTE_HISTORY_GUARD_SELECTED\n",
      upExit: 1,
    }),
    /remote-history poison guard was selected/,
  );
});

test("migration up must report exactly the pending targets", () => {
  const before = catalog({ callTracking: true });
  const after = catalog({ callTracking: true, recorded: TARGETS.map((t) => t.version) });
  expectHardStop(
    runCase({
      executionMode: "apply",
      catalogs: [before, before, after],
      up: { applied: ["supabase/migrations/20261027221000_lead_spam_classification.sql"] },
    }),
    /did not apply exactly the pending targets in order/,
  );
});

test("postflight requires every object armed, the exact history, and reads a row drop as a delete", () => {
  const before = catalog({ callTracking: true });
  const recorded = TARGETS.map((t) => t.version);
  const applyCase = (after) => runCase({
    executionMode: "apply",
    catalogs: [before, before, after],
    up: { applied: TARGETS.map((t) => `supabase/migrations/${t.basename}`) },
  });

  expectHardStop(
    applyCase(catalog({ callTracking: true, recorded, overrides: { ai_referrer_triggers_armed: 1 } })),
    /catalog state in .*catalog\.postflight\.json differs/,
  );
  expectHardStop(
    applyCase(catalog({ callTracking: true, recorded, overrides: { ai_referrer_anon_execute: true } })),
    /catalog state in .*catalog\.postflight\.json differs/,
  );
  expectHardStop(
    applyCase(catalog({ callTracking: true, recorded: [TARGETS[0].version, TARGETS[1].version] })),
    /postflight history lacks a target/,
  );
  expectHardStop(
    applyCase(catalog({ callTracking: true, recorded, extraHistory: ["20261111160000"] })),
    /catalog state in .*catalog\.postflight\.json differs/,
  );

  const warned = applyCase(
    catalog({ callTracking: true, recorded, leadRows: 400, phoneClickRows: 1200 }),
  );
  assert.equal(warned.status, 0, warned.stderr);
  assert.match(warned.stdout, /row_count_warning=1/);
  assert.match(warned.stderr, /public\.leads fell from 412 to 400 rows/);
  assert.match(warned.stderr, /NOT a failed migration/);
  assert.equal(warned.stderr.includes("Hard stop"), false);
});

test("apply with all three recorded is a verified no-op", () => {
  const rows = catalog({ callTracking: true, recorded: TARGETS.map((t) => t.version) });
  const result = runCase({ executionMode: "apply", catalogs: [rows, rows, rows] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /All three targets are already recorded; postflight checks only\./);
  assert.equal(result.staged, null, "a no-op run must not invoke the mutation");
  assert.deepEqual(subcommands(result), [
    ["--version"],
    ["--agent", "no", "--output-format", "json", "projects", "list"],
  ]);
});
