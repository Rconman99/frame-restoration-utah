#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const detectors = [
  {
    label: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    label: 'github-token',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  },
  {
    label: 'provider-secret',
    pattern: /\b(?:sk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}|[rs]k_(?:live|test)_[A-Za-z0-9]{16,})\b/g,
  },
  {
    label: 'supabase-secret',
    pattern: /\bsb_secret_[A-Za-z0-9_-]{12,}\b/g,
  },
  {
    label: 'google-api-key',
    pattern: /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: 'aws-access-key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    label: 'slack-token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    label: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
];

const placeholderPattern = /(?:example|placeholder|replace[_-]?me|change[_-]?me|your[_-]|dummy|redacted|not[_-]?a[_-]?secret|process\.env|import\.meta\.env|Deno\.env|secrets\.|vars\.|github\.|steps\.|needs\.|env\.|\$|__[A-Z0-9_]+__|<[^>]+>)/i;
const publicClientPrefix = /^(?:phc_|pk[._](?:live|test)[._]|pk\.)/;
const assignmentPattern = /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ROLE_KEY|API_KEY)[A-Z0-9_]*)\b\s*[:=]\s*["'`]?([^\s,"'`;#}]+)/g;

// These are intentionally browser-public API identifiers. Keep the exception
// occurrence-bounded so an additional key in either file still fails the audit.
const publicDetectorBudgets = new Map([
  ['dashboard/config.js\0google-api-key', 1],
  ['data/dashboard-config.json\0google-api-key', 1],
]);

function looksLikeLiteralCredential(variable, value) {
  if (value.length < 20 || placeholderPattern.test(value)) return false;
  if (publicClientPrefix.test(value) || /(?:PUBLIC|PUBLISHABLE|CLIENT)_/.test(variable)) return false;
  if (/(?:PATH|FILE|DIR|FILENAME|METADATA)/.test(variable)) return false;
  if (/^(?:true|false|null|undefined)$/i.test(value)) return false;
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

function findingsForText(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const detector of detectors) {
      detector.pattern.lastIndex = 0;
      if (detector.pattern.test(line)) findings.push({ line: index + 1, label: detector.label });
    }

    assignmentPattern.lastIndex = 0;
    for (const match of line.matchAll(assignmentPattern)) {
      if (looksLikeLiteralCredential(match[1], match[2])) {
        findings.push({ line: index + 1, label: 'literal-secret-assignment' });
      }
    }
  }

  return findings;
}

function selfTest() {
  const synthetic = [
    ['jwt', ['eyJ', 'abcdefgh', '.', 'abcdefgh', '.', 'abcdefgh'].join('')],
    ['github-token', ['ghp_', 'A'.repeat(24)].join('')],
    ['provider-secret', ['sk-', 'proj-', 'A1'.repeat(12)].join('')],
    ['supabase-secret', ['sb_', 'secret_', 'A1'.repeat(8)].join('')],
    ['google-api-key', ['AIza', 'A1'.repeat(12)].join('')],
    ['aws-access-key', ['AKIA', 'A1B2'.repeat(4)].join('')],
    ['slack-token', ['xoxb-', 'A1-'.repeat(6)].join('')],
    ['private-key', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
  ];

  const failures = [];
  for (const [label, value] of synthetic) {
    if (!findingsForText(value).some((finding) => finding.label === label)) failures.push(label);
  }

  const literal = ['SERVICE_', 'API_KEY=', 'A1b2'.repeat(7)].join('');
  if (!findingsForText(literal).some((finding) => finding.label === 'literal-secret-assignment')) {
    failures.push('literal-secret-assignment');
  }

  for (const safe of [
    'API_KEY=process.env.API_KEY',
    'API_KEY=${{ secrets.API_KEY }}',
    'PUBLIC_API_KEY=pk_live_A1b2A1b2A1b2A1b2A1b2',
    'TOKEN=replace-me',
  ]) {
    if (findingsForText(safe).length > 0) failures.push('placeholder-safety');
  }

  if (failures.length > 0) {
    throw new Error(`repository security scanner self-test failed: ${[...new Set(failures)].join(', ')}`);
  }
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function isForbiddenEnvironmentFile(relative) {
  const basename = path.posix.basename(relative);
  if (basename === '.env.example' || basename === '.env.sample') return false;
  return basename === '.env' || basename.startsWith('.env.');
}

function isBinary(buffer) {
  return buffer.subarray(0, 8192).includes(0);
}

if (
  !isForbiddenEnvironmentFile('.env') ||
  !isForbiddenEnvironmentFile('nested/.env.local') ||
  isForbiddenEnvironmentFile('.env.example') ||
  isForbiddenEnvironmentFile('nested/.env.sample')
) {
  throw new Error('repository security scanner self-test failed: environment-file policy');
}

selfTest();

const failures = [];
const publicDetectorCounts = new Map();
for (const relative of trackedFiles()) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) continue;

  if (isForbiddenEnvironmentFile(relative)) {
    failures.push(`${relative}:1 tracked-environment-file`);
  }

  const buffer = fs.readFileSync(absolute);
  if (isBinary(buffer)) continue;
  for (const finding of findingsForText(buffer.toString('utf8'))) {
    const publicBudgetKey = `${relative}\0${finding.label}`;
    const publicBudget = publicDetectorBudgets.get(publicBudgetKey) ?? 0;
    const publicCount = (publicDetectorCounts.get(publicBudgetKey) ?? 0) + 1;
    publicDetectorCounts.set(publicBudgetKey, publicCount);
    if (publicCount <= publicBudget) continue;
    failures.push(`${relative}:${finding.line} ${finding.label}`);
  }
}

if (failures.length > 0) {
  console.error('Repository security audit failed. Potential credential material was found:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('Values are intentionally omitted. Rotate confirmed credentials before removing the finding.');
  process.exit(1);
}

console.log('Repository security audit passed: no tracked environment files or credential-shaped literals found.');
