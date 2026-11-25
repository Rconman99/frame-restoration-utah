#!/usr/bin/env node

import { existsSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(process.cwd());
const SUPPORTED_LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Pipfile.lock",
  "poetry.lock",
  "uv.lock",
  "Cargo.lock",
  "go.sum",
  "Gemfile.lock",
  "composer.lock",
]);

function usage(code = 0, message = "") {
  if (message) console.error(`ERROR: ${message}`);
  console.error(
    "Usage: node scripts/run-fast-security-gate.mjs "
      + "[--mode staged|changed] [--base SHA --head SHA] "
      + "[--lockfiles all|changed]",
  );
  process.exit(code);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    mode: "staged",
    lockfiles: "changed",
    base: null,
    head: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help") usage(0);
    if (["--mode", "--lockfiles", "--base", "--head"].includes(token)) {
      index += 1;
      if (!argv[index]) usage(2, `${token} requires a value`);
      args[token.slice(2)] = argv[index];
      continue;
    }
    usage(2, `unknown argument ${token}`);
  }
  if (!["staged", "changed"].includes(args.mode)) {
    usage(2, `invalid mode ${args.mode}`);
  }
  if (!["all", "changed"].includes(args.lockfiles)) {
    usage(2, `invalid lockfile scope ${args.lockfiles}`);
  }
  if (args.mode === "changed") {
    for (const [label, value] of [["base", args.base], ["head", args.head]]) {
      if (!/^[0-9a-f]{40}$/u.test(value || "")) {
        usage(2, `--${label} must be a full lowercase Git SHA in changed mode`);
      }
    }
  }
  return args;
}

function run(command, args, { printOutput = true } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });
  if (printOutput && result.stdout) process.stdout.write(result.stdout);
  if (printOutput && result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    throw new Error(`${command} could not start: ${result.error.message || result.error}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited ${result.status ?? "without a status"}`);
  }
  return result;
}

function gitPaths(args) {
  const result = run("git", args, { printOutput: false });
  return result.stdout
    .split("\0")
    .map((value) => value.trim())
    .filter(Boolean);
}

function trackedLockfiles() {
  return gitPaths(["ls-files", "-z"])
    .filter((path) => SUPPORTED_LOCKFILES.has(basename(path)))
    .filter((path) => existsSync(resolve(ROOT, path)));
}

function changedLockfiles(args) {
  const paths = args.mode === "staged"
    ? gitPaths(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z", "--"])
    : gitPaths(["diff", "--name-only", "--diff-filter=ACMR", "-z", args.base, args.head, "--"]);
  return [...new Set(paths)]
    .filter((path) => SUPPORTED_LOCKFILES.has(basename(path)))
    .filter((path) => {
      const absolute = resolve(ROOT, path);
      const rel = relative(ROOT, absolute);
      if (rel.startsWith("..") || resolve(ROOT, rel) !== absolute) {
        throw new Error(`refusing lockfile outside repository: ${path}`);
      }
      return existsSync(absolute);
    });
}

function runGitleaks(args) {
  const common = ["--no-banner", "--no-color", "--redact=100"];
  if (args.mode === "staged") {
    run("gitleaks", ["git", "--pre-commit", "--staged", ...common, ROOT]);
    return;
  }
  if (args.mode === "changed") {
    run("gitleaks", [
      "git",
      `--log-opts=${args.base}..${args.head}`,
      ...common,
      ROOT,
    ]);
    return;
  }
  throw new Error(`unsupported Gitleaks mode ${args.mode}`);
}

function runOsv(args) {
  const lockfiles = args.lockfiles === "all" ? trackedLockfiles() : changedLockfiles(args);
  if (lockfiles.length === 0) {
    if (args.lockfiles === "all") {
      throw new Error("no supported tracked lockfiles were found");
    }
    console.log("OSV-Scanner: no changed supported lockfiles");
    return;
  }
  const scannerArgs = ["scan", "source", "--format", "table"];
  for (const path of lockfiles) scannerArgs.push("--lockfile", resolve(ROOT, path));
  run("osv-scanner", scannerArgs);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const started = performance.now();
  const repositoryRoot = resolve(
    run("git", ["rev-parse", "--show-toplevel"], { printOutput: false }).stdout.trim(),
  );
  if (repositoryRoot !== ROOT) {
    throw new Error(`run from the repository root: ${repositoryRoot}`);
  }
  runGitleaks(args);
  runOsv(args);
  console.log(
    `fast security gate: pass mode=${args.mode} lockfiles=${args.lockfiles} `
      + `elapsedMs=${Math.round(performance.now() - started)}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`ERROR: ${error.message || error}`);
    process.exit(1);
  }
}
