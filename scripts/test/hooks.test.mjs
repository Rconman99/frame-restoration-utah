// node --test scripts/test/hooks.test.mjs : fixture tests for .claude/hooks guards (B1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const env = { ...process.env, CLAUDE_PROJECT_DIR: root, GUARD_REPO_SLUG: 'owner/this-repo', CE_ALLOW_LOCKFILE: '' };
const run = (script, stdin, extra = {}) => spawnSync('bash', [path.join(root, '.claude/hooks', script)], { input: stdin, env: { ...env, ...extra }, encoding: 'utf8' }).status;
const bash = (command) => run('guard-bash.sh', JSON.stringify({ tool_name: 'Bash', tool_input: { command } }));
const write = (file_path, extra) => run('guard-paths.sh', JSON.stringify({ tool_name: 'Write', tool_input: { file_path } }), extra);

for (const c of ['git push --force origin main', 'git push -f', 'git push origin +main', 'cd x && git push --force-with-lease',
  'rm -rf /', 'rm -rf ~/projects', 'rm -fr ../other', 'rm -rf $HOME/x', 'gh pr merge 1 -R someone/else', 'gh api repos/other/repo/pulls',
  'claude --dangerously-skip-permissions', 'codex exec --dangerously-bypass-approvals-and-sandbox', 'vercel --prod', 'npx vercel deploy --prod',
  'supabase db push', 'supabase migration up', 'supabase migration repair 1 --status applied']) {
  test(`blocks: ${c}`, () => assert.equal(bash(c), 2));
}
for (const c of ['git status', 'git push origin HEAD', 'rm -rf node_modules', 'rm -rf ./dist', 'gh pr list', 'gh pr view 3 -R owner/this-repo',
  'vercel', 'supabase db push --local', 'npm test', 'echo force']) {
  test(`allows: ${c}`, () => assert.equal(bash(c), 0));
}
for (const p of ['.env', '.env.local', 'package-lock.json', 'deno.lock', '.github/workflows/ci.yml', '.claude/settings.json',
  'supabase/migrations/20260101_x.sql', path.join(os.homedir(), '.codex/config.toml'), '~/.codex/auth.json']) {
  test(`blocks write: ${p}`, () => assert.equal(write(p), 2));
}
for (const p of ['src/index.ts', 'README.md', '.env.example', 'docs/workflows.md']) {
  test(`allows write: ${p}`, () => assert.equal(write(p), 0));
}
test('lockfile override CE_ALLOW_LOCKFILE=1', () => assert.equal(write('package-lock.json', { CE_ALLOW_LOCKFILE: '1' }), 0));
test('empty stdin is non-zero', () => { assert.notEqual(run('guard-bash.sh', ''), 0); assert.notEqual(run('guard-paths.sh', ''), 0); });
test('malformed stdin is non-zero', () => { assert.notEqual(run('guard-bash.sh', '{nope'), 0); assert.notEqual(run('guard-paths.sh', 'null'), 0); });
