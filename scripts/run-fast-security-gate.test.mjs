#!/usr/bin/env node
/**
 * Contract tests for scripts/run-fast-security-gate.mjs, the blocking
 * Gitleaks + OSV-Scanner runner behind .github/workflows/fast-security-gate.yml.
 *
 * WHY
 * The runner is a security control, so the properties worth pinning are the
 * fail-closed ones: a scanner that is missing, cannot start, or reports a
 * finding must fail the gate; an argument mistake must fail before any scanner
 * runs; and OSV-Scanner must see exactly the lockfiles the selected mode
 * implies, with no extra noise and no silent blind spot. The pass path is
 * asserted too, so a refactor cannot quietly turn the gate into a no-op.
 *
 * HOW
 * Nothing here needs gitleaks or osv-scanner installed. Both are replaced by
 * fake executables on an isolated PATH that append their argv to a JSONL log
 * and exit with the status in FAKE_<TOOL>_EXIT. Every Git repository is a
 * throwaway under the OS temp dir, and every git call (ours and the runner's)
 * is isolated from the developer's global and system config so identity,
 * signing or hook settings cannot leak in. The runner is always exercised
 * through its CLI, exactly as the workflow invokes it.
 *
 * Run: node --test scripts/run-fast-security-gate.test.mjs
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = realpathSync(fileURLToPath(new URL("./run-fast-security-gate.mjs", import.meta.url)));

// realpath matters: the runner compares process.cwd() with `git rev-parse
// --show-toplevel`, and macOS hands out /var/... for a temp dir that is really
// /private/var/....
const SANDBOX = mkdtempSync(join(realpathSync(tmpdir()), "fast-security-gate-test-"));
const HOME = join(SANDBOX, "home");
const TOOLS = join(SANDBOX, "tools");
mkdirSync(HOME);
mkdirSync(TOOLS);
after(() => rmSync(SANDBOX, { recursive: true, force: true }));

const REAL_GIT = execFileSync("/bin/sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

function installExecutable(dir, name, body) {
  const file = join(dir, name);
  writeFileSync(file, body);
  chmodSync(file, 0o755);
  return file;
}

// The only `git` on the runner's PATH: a wrapper that execs the real binary by
// absolute path, so the isolated PATH never has to include a system bin dir
// that might also hold a real gitleaks or osv-scanner.
installExecutable(TOOLS, "git", `#!/bin/sh\nexec ${shellQuote(REAL_GIT)} "$@"\n`);

const GIT_ENV = {
  HOME,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: join(HOME, "no-global-gitconfig"),
  GIT_CEILING_DIRECTORIES: SANDBOX,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  LC_ALL: "C",
};

function git(cwd, args) {
  return execFileSync(REAL_GIT, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...GIT_ENV },
  }).trim();
}

function writeFile(dir, relative, content) {
  mkdirSync(dirname(join(dir, relative)), { recursive: true });
  writeFileSync(join(dir, relative), content);
}

function commitAll(dir, message) {
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]);
}

function makeRepo({ lockfiles = true } = {}) {
  const dir = mkdtempSync(join(SANDBOX, "repo-"));
  git(dir, ["-c", "init.defaultBranch=main", "init", "-q"]);
  writeFile(dir, "README.md", "fixture repository\n");
  writeFile(dir, "src/index.js", "export const ok = true;\n");
  if (lockfiles) {
    writeFile(dir, "package-lock.json", '{"lockfileVersion":3}\n');
    writeFile(dir, "scripts/package-lock.json", '{"lockfileVersion":3}\n');
  }
  return { dir, base: commitAll(dir, "base") };
}

// Fake scanners: a /bin/sh wrapper (so PATH lookup by bare name works) that
// execs this Node binary on a CommonJS implementation. Each invocation appends
// {tool, argv, cwd, noColor} to FAKE_SCANNER_LOG, prints a marker on both
// streams, and exits with FAKE_GITLEAKS_EXIT / FAKE_OSV_SCANNER_EXIT (default 0).
function makeFakeBin(tools = ["gitleaks", "osv-scanner"]) {
  const dir = mkdtempSync(join(SANDBOX, "bin-"));
  for (const tool of tools) {
    const exitVariable = `FAKE_${tool.toUpperCase().replace(/-/g, "_")}_EXIT`;
    const implementation = join(dir, `${tool}.cjs`);
    writeFileSync(implementation, [
      "const { appendFileSync } = require('node:fs');",
      "const record = {",
      `  tool: ${JSON.stringify(tool)},`,
      "  argv: process.argv.slice(2),",
      "  cwd: process.cwd(),",
      "  noColor: process.env.NO_COLOR ?? null,",
      "};",
      "appendFileSync(process.env.FAKE_SCANNER_LOG, JSON.stringify(record) + '\\n');",
      `process.stdout.write(${JSON.stringify(`${tool} fake stdout marker\n`)});`,
      `process.stderr.write(${JSON.stringify(`${tool} fake stderr marker\n`)});`,
      // exitCode rather than process.exit(): pipes are asynchronous on macOS and
      // an immediate exit could drop the marker lines the tests look for.
      `process.exitCode = Number(process.env[${JSON.stringify(exitVariable)}] ?? 0);`,
      "",
    ].join("\n"));
    installExecutable(
      dir,
      tool,
      `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(implementation)} "$@"\n`,
    );
  }
  return dir;
}

function runGate(cwd, args, { fakeBin = makeFakeBin(), env = {} } = {}) {
  const log = join(mkdtempSync(join(SANDBOX, "log-")), "scanners.jsonl");
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
    // Deliberately not process.env: the runner must find git and the scanners
    // on this PATH alone, and NO_COLOR must come from the runner, not from us.
    env: { ...GIT_ENV, PATH: `${fakeBin}:${TOOLS}`, FAKE_SCANNER_LOG: log, ...env },
  });
  assert.equal(result.error, undefined, `runner failed to spawn: ${result.error}`);
  const calls = existsSync(log)
    ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls,
    tools: calls.map((call) => call.tool),
  };
}

function lockfilesScanned(result) {
  const call = result.calls.find((entry) => entry.tool === "osv-scanner");
  assert.ok(call, "osv-scanner was not invoked");
  assert.deepEqual(call.argv.slice(0, 4), ["scan", "source", "--format", "table"]);
  const rest = call.argv.slice(4);
  const paths = [];
  for (let index = 0; index < rest.length; index += 2) {
    assert.equal(rest[index], "--lockfile", `unexpected osv-scanner argument ${rest[index]}`);
    paths.push(rest[index + 1]);
  }
  return paths.sort();
}

const GITLEAKS_COMMON = ["--no-banner", "--no-color", "--redact=100"];
const PASS_LINE = /^fast security gate: pass mode=(?:staged|changed) lockfiles=(?:all|changed) elapsedMs=\d+$/m;
const NO_LOCKFILES_LINE = /^OSV-Scanner: no changed supported lockfiles$/m;
const sha = (char) => char.repeat(40);

// ---------------------------------------------------------------- arguments

test("--help prints usage, exits 0 and starts no scanner", () => {
  const { dir } = makeRepo();
  const result = runGate(dir, ["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /Usage: node scripts\/run-fast-security-gate\.mjs/);
  assert.doesNotMatch(result.stdout, PASS_LINE);
  assert.deepEqual(result.tools, []);
});

const argumentErrors = [
  [["--bogus"], /unknown argument --bogus/],
  [["--mode"], /--mode requires a value/],
  [["--mode", "nightly"], /invalid mode nightly/],
  [["--lockfiles", "some"], /invalid lockfile scope some/],
  [["--mode", "changed"], /--base must be a full lowercase Git SHA in changed mode/],
  [["--mode", "changed", "--base", "abc123"], /--base must be a full lowercase Git SHA/],
  [["--mode", "changed", "--base", sha("a")], /--head must be a full lowercase Git SHA/],
  [["--mode", "changed", "--base", sha("A"), "--head", sha("b")], /--base must be a full lowercase Git SHA/],
  [["--mode", "changed", "--base", sha("a"), "--head", "HEAD"], /--head must be a full lowercase Git SHA/],
];
for (const [args, expected] of argumentErrors) {
  test(`argument error (${args.join(" ")}) exits 2 before any scanner runs`, () => {
    const { dir } = makeRepo();
    const result = runGate(dir, args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^ERROR: /m);
    assert.match(result.stderr, expected);
    assert.match(result.stderr, /Usage: /);
    assert.doesNotMatch(result.stdout, PASS_LINE);
    assert.deepEqual(result.tools, []);
  });
}

// ---------------------------------------------------------------- location

test("refuses to run from a subdirectory of the repository", () => {
  const { dir } = makeRepo();
  const result = runGate(join(dir, "scripts"), []);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^ERROR: run from the repository root: /m);
  assert.deepEqual(result.tools, []);
});

test("fails when the working directory is not a Git repository", () => {
  const plain = mkdtempSync(join(SANDBOX, "plain-"));
  const result = runGate(plain, []);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^ERROR: git exited 128$/m);
  assert.deepEqual(result.tools, []);
});

// ---------------------------------------------------------------- staged mode

test("staged mode: gitleaks scans the staged tree and OSV is skipped when no supported lockfile is staged", () => {
  const { dir } = makeRepo();
  writeFile(dir, "src/new.js", "export const added = true;\n");
  git(dir, ["add", "src/new.js"]);
  const result = runGate(dir, []);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.tools, ["gitleaks"]);
  assert.deepEqual(result.calls[0].argv, ["git", "--pre-commit", "--staged", ...GITLEAKS_COMMON, dir]);
  assert.match(result.stdout, NO_LOCKFILES_LINE);
  assert.match(result.stdout, /^fast security gate: pass mode=staged lockfiles=changed elapsedMs=\d+$/m);
});

test("staged mode: OSV sees exactly the staged supported lockfiles, not unstaged or unsupported changes", () => {
  const { dir } = makeRepo();
  writeFile(dir, "package-lock.json", '{"lockfileVersion":3,"staged":true}\n');
  writeFile(dir, "scripts/package-lock.json", '{"lockfileVersion":3,"unstaged":true}\n');
  writeFile(dir, "notes.txt", "staged, but not a lockfile\n");
  git(dir, ["add", "package-lock.json", "notes.txt"]);
  const result = runGate(dir, ["--mode", "staged", "--lockfiles", "changed"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.tools, ["gitleaks", "osv-scanner"]);
  assert.deepEqual(lockfilesScanned(result), [join(dir, "package-lock.json")]);
  assert.doesNotMatch(result.stdout, NO_LOCKFILES_LINE);
});

// ---------------------------------------------------------------- changed mode

test("changed mode: gitleaks scans base..head and OSV sees every supported lockfile in the range, nested and across ecosystems", () => {
  const { dir, base } = makeRepo();
  writeFile(dir, "package-lock.json", '{"lockfileVersion":3,"bumped":true}\n');
  writeFile(dir, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  writeFile(dir, "services/api/Pipfile.lock", '{"_meta":{}}\n');
  writeFile(dir, "yarn.lock.bak", "# not a supported lockfile name\n");
  writeFile(dir, "README.md", "fixture repository, edited\n");
  const head = commitAll(dir, "head");
  const result = runGate(dir, ["--mode", "changed", "--base", base, "--head", head, "--lockfiles", "changed"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.tools, ["gitleaks", "osv-scanner"]);
  assert.deepEqual(result.calls[0].argv, ["git", `--log-opts=${base}..${head}`, ...GITLEAKS_COMMON, dir]);
  assert.deepEqual(lockfilesScanned(result), [
    join(dir, "package-lock.json"),
    join(dir, "pnpm-lock.yaml"),
    join(dir, "services/api/Pipfile.lock"),
  ]);
  assert.match(result.stdout, /^fast security gate: pass mode=changed lockfiles=changed elapsedMs=\d+$/m);
});

test("changed mode: a lockfile deleted in the range is not handed to OSV", () => {
  const { dir, base } = makeRepo();
  rmSync(join(dir, "package-lock.json"));
  const head = commitAll(dir, "drop lockfile");
  const result = runGate(dir, ["--mode", "changed", "--base", base, "--head", head]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.tools, ["gitleaks"]);
  assert.match(result.stdout, NO_LOCKFILES_LINE);
});

test("changed mode: a lockfile in the range that is absent from the working tree is skipped, not failed (documented behavior)", () => {
  // The runner scans files on disk, so it assumes the checkout matches --head.
  // If it ever does not, the lockfile is skipped silently rather than failing
  // closed. Pinned here so a change in either direction is a deliberate one.
  const { dir, base } = makeRepo();
  writeFile(dir, "go.sum", "example.invalid/mod v1.0.0 h1:fixture\n");
  const head = commitAll(dir, "add go.sum");
  git(dir, ["checkout", "-q", base]);
  assert.equal(existsSync(join(dir, "go.sum")), false);
  const result = runGate(dir, ["--mode", "changed", "--base", base, "--head", head]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.tools, ["gitleaks"]);
  assert.match(result.stdout, NO_LOCKFILES_LINE);
});

// ---------------------------------------------------------------- --lockfiles all

test("--lockfiles all: OSV sees every tracked supported lockfile regardless of the diff, and nothing untracked", () => {
  const { dir, base } = makeRepo();
  writeFile(dir, "Cargo.lock", "# untracked, must not be scanned\n");
  const result = runGate(dir, ["--mode", "changed", "--base", base, "--head", base, "--lockfiles", "all"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.tools, ["gitleaks", "osv-scanner"]);
  assert.deepEqual(lockfilesScanned(result), [
    join(dir, "package-lock.json"),
    join(dir, "scripts/package-lock.json"),
  ]);
  assert.match(result.stdout, /^fast security gate: pass mode=changed lockfiles=all elapsedMs=\d+$/m);
});

test("--lockfiles all: fails closed when the repository tracks no supported lockfile", () => {
  const { dir } = makeRepo({ lockfiles: false });
  const result = runGate(dir, ["--lockfiles", "all"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^ERROR: no supported tracked lockfiles were found$/m);
  assert.deepEqual(result.tools, ["gitleaks"]);
  assert.doesNotMatch(result.stdout, PASS_LINE);
});

// ---------------------------------------------------------------- fail closed

test("a Gitleaks finding fails the gate and OSV never runs", () => {
  const { dir } = makeRepo();
  writeFile(dir, "package-lock.json", '{"lockfileVersion":3,"bumped":true}\n');
  git(dir, ["add", "package-lock.json"]);
  const result = runGate(dir, [], { env: { FAKE_GITLEAKS_EXIT: "1" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^ERROR: gitleaks exited 1$/m);
  assert.deepEqual(result.tools, ["gitleaks"]);
  assert.doesNotMatch(result.stdout, PASS_LINE);
});

test("an OSV-Scanner finding fails the gate", () => {
  const { dir } = makeRepo();
  writeFile(dir, "package-lock.json", '{"lockfileVersion":3,"bumped":true}\n');
  git(dir, ["add", "package-lock.json"]);
  const result = runGate(dir, [], { env: { FAKE_OSV_SCANNER_EXIT: "1" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^ERROR: osv-scanner exited 1$/m);
  assert.deepEqual(result.tools, ["gitleaks", "osv-scanner"]);
  assert.doesNotMatch(result.stdout, PASS_LINE);
});

test("a missing gitleaks binary fails the gate instead of passing silently", () => {
  const { dir } = makeRepo();
  const result = runGate(dir, [], { fakeBin: makeFakeBin(["osv-scanner"]) });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^ERROR: gitleaks could not start: /m);
  assert.deepEqual(result.tools, []);
  assert.doesNotMatch(result.stdout, PASS_LINE);
});

test("a missing osv-scanner binary fails the gate when a lockfile needs scanning", () => {
  const { dir } = makeRepo();
  writeFile(dir, "package-lock.json", '{"lockfileVersion":3,"bumped":true}\n');
  git(dir, ["add", "package-lock.json"]);
  const result = runGate(dir, [], { fakeBin: makeFakeBin(["gitleaks"]) });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^ERROR: osv-scanner could not start: /m);
  assert.deepEqual(result.tools, ["gitleaks"]);
  assert.doesNotMatch(result.stdout, PASS_LINE);
});

test("a missing osv-scanner binary is not noticed when no lockfile changed (documented behavior)", () => {
  // OSV is only spawned when it has something to scan, so a broken OSV install
  // surfaces on the first lockfile change rather than on every run.
  const { dir } = makeRepo();
  const result = runGate(dir, [], { fakeBin: makeFakeBin(["gitleaks"]) });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.tools, ["gitleaks"]);
  assert.match(result.stdout, NO_LOCKFILES_LINE);
});

// ---------------------------------------------------------------- plumbing

test("scanner output is forwarded, and scanners run in the repository root with NO_COLOR=1", () => {
  const { dir } = makeRepo();
  writeFile(dir, "package-lock.json", '{"lockfileVersion":3,"bumped":true}\n');
  git(dir, ["add", "package-lock.json"]);
  const result = runGate(dir, []);
  assert.equal(result.status, 0, result.stderr);
  for (const tool of ["gitleaks", "osv-scanner"]) {
    assert.match(result.stdout, new RegExp(`^${tool} fake stdout marker$`, "m"));
    assert.match(result.stderr, new RegExp(`^${tool} fake stderr marker$`, "m"));
  }
  assert.equal(result.calls.length, 2);
  for (const call of result.calls) {
    assert.equal(call.noColor, "1", `${call.tool} ran without NO_COLOR=1`);
    assert.equal(call.cwd, dir, `${call.tool} ran outside the repository root`);
  }
});
