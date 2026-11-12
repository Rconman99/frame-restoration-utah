#!/usr/bin/env node
// Fail-closed guard for Claude Code / Cursor hooks. Dependency-free. Never reads or prints secrets.
// Usage: node guard-core.mjs bash|paths   (hook JSON on stdin). Exit 0 = allow, exit 2 = block.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const mode = process.argv[2];
const block = (reason) => {
  process.stdout.write(JSON.stringify({ permission: 'deny', user_message: reason, agent_message: reason }) + '\n');
  process.stderr.write(`BLOCKED by guard-${mode}: ${reason}\n`);
  process.exit(2);
};
process.on('uncaughtException', (e) => block(`guard internal error (${e && e.message ? e.message.slice(0, 120) : 'unknown'})`));

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  if (!raw.trim()) block('empty hook input');
  let input;
  try { input = JSON.parse(raw); } catch { block('malformed hook input'); }
  if (!input || typeof input !== 'object') block('malformed hook input');
  const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  if (mode === 'bash') checkBash(String(ti.command ?? input.command ?? ''), root);
  else if (mode === 'paths') checkPaths([ti.file_path, ti.path, ti.notebook_path, input.file_path].filter(Boolean), root);
  else block(`unknown guard mode ${mode}`);
  process.exit(0);
});

function repoSlug(root) {
  if (process.env.GUARD_REPO_SLUG) return process.env.GUARD_REPO_SLUG.toLowerCase();
  try {
    const url = execFileSync('git', ['-C', root, 'config', '--get', 'remote.origin.url'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/.]+?)(\.git)?$/i);
    return m ? m[1].toLowerCase() : '';
  } catch { return ''; }
}

function checkBash(cmd, root) {
  if (!cmd.trim()) return;
  const segs = cmd.split(/&&|\|\||;|\||\n/).map((s) => s.trim()).filter(Boolean);
  for (const s of segs) {
    const t = s.split(/\s+/);
    if (/--dangerously-skip-permissions|--dangerously-bypass-approvals-and-sandbox/.test(s)) block('permission-bypass flags are not allowed');
    if (/^(sudo\s+)?git\b/.test(s) && /\bpush\b/.test(s) && (/(^|\s)(--force|-f|--force-with-lease)(=|\s|$)/.test(s) || /\s\+\S+/.test(s))) block('force push is not allowed');
    if (/^(sudo\s+)?(npx\s+)?vercel\b/.test(s) && /(^|\s)--prod(\s|$|=)/.test(s)) block('vercel --prod deploys need Ryan\'s OK');
    if (/^(npx\s+)?supabase\b/.test(s) && (/\bdb\s+push\b/.test(s) || /\bmigration\s+(up|repair|squash)\b/.test(s)) && !/--local\b/.test(s)) block('supabase db push / migration against a linked project needs Ryan\'s OK');
    if (/^(sudo\s+)?rm\b/.test(s)) {
      const flags = t.filter((x) => x.startsWith('-')).join('');
      if (/r|R/.test(flags) && /f/.test(flags) || /--recursive/.test(s) && /--force/.test(s)) {
        for (const a of t.slice(1).filter((x) => !x.startsWith('-'))) {
          const p = a.replace(/^['"]|['"]$/g, '');
          if (/^~|\$HOME|\$\{?[A-Z_]+/.test(p)) block(`rm -rf outside the repo: ${p}`);
          const abs = path.resolve(root, p);
          if (abs === root || !abs.startsWith(root + path.sep)) block(`rm -rf outside the repo: ${p}`);
        }
      }
    }
    if (/^gh\b/.test(s)) {
      const mine = repoSlug(root);
      const m = s.match(/(?:-R|--repo)[=\s]+([\w.-]+\/[\w.-]+)/) || s.match(/\bgh\s+api\s+\/?repos\/([\w.-]+\/[\w.-]+)/);
      if (m && (!mine || m[1].toLowerCase() !== mine)) block(`gh against a different repo (${m[1]})`);
    }
  }
}

function checkPaths(paths, root) {
  const home = os.homedir();
  for (const p0 of paths) {
    const p = String(p0).replace(/^~(?=\/|$)/, home);
    const abs = path.resolve(root, p);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    const base = path.basename(abs);
    if (abs.startsWith(path.join(home, '.codex') + path.sep) || abs === path.join(home, '.codex')) block('writes under ~/.codex are not allowed');
    if (/^\.env/.test(base) && !/^\.env\.(example|sample|template)$/.test(base)) block(`env file edits are not allowed (${base})`);
    if (/^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|deno\.lock)$/.test(base) && process.env.CE_ALLOW_LOCKFILE !== '1') block(`lockfile edit (${base}); set CE_ALLOW_LOCKFILE=1 for an intentional dependency fix`);
    if (/(^|\/)\.github\/workflows\//.test(rel)) block('workflow edits need a human-reviewed PR');
    if (/(^|\/)\.claude\/settings\.json$/.test(rel)) block('.claude/settings.json is protected');
    if (/(^|\/)supabase\/migrations\//.test(rel)) block('supabase/migrations edits need Ryan\'s OK');
  }
}
