// Shared harness for the middleware.js owner gate: loads the module exactly as
// written, models Vercel's matcher dispatch, and invokes the DEFAULT export
// (what Vercel runs) with a stubbed global fetch.
import fs from 'node:fs';
import path from 'node:path';

export async function loadOwnerGate(repoRoot) {
  const source = fs.readFileSync(path.join(repoRoot, 'middleware.js'), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

// path-to-regexp style: a bare "/(<regex>)" matcher or a literal path with an
// optional trailing ":path*". Matching is case-insensitive like path-to-regexp.
export function compileMatchers(matcher) {
  const list = Array.isArray(matcher) ? matcher : [matcher];
  return list.map((entry) => {
    const group = /^\/\((.*)\)$/s.exec(entry);
    if (group) return new RegExp(`^/(?:${group[1]})/?$`, 'i');
    const literal = entry.replace(/\/:path\*$/, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${literal}${entry.endsWith('/:path*') ? '(?:/.*)?' : ''}/?$`, 'i');
  });
}

function decodedOrRaw(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

// Runs a request through matcher dispatch + the default export.
// Returns { dispatched, response } where response is null if not dispatched.
export async function runDefault(gateModule, request, fetchStub) {
  const matchers = compileMatchers(gateModule.config?.matcher || []);
  const { pathname } = new URL(request.url);
  const candidates = [pathname, decodedOrRaw(pathname)];
  const dispatched = candidates.every((candidate) => matchers.some((re) => re.test(candidate)));
  if (!dispatched) return { dispatched, response: null };
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    return { dispatched, response: await gateModule.default(request) };
  } finally {
    globalThis.fetch = realFetch;
  }
}

export const ENCODED_PROBES = [
  '//dashboard',
  '//dashboard/config.js',
  '/dashboard%2Fconfig.js',
  '/dashboard%2fconfig.js',
  '/dashboard%252Fconfig.js',
  '/dashboard%5Cconfig.js',
  '/%64ashboard/config.js',
  '/dashboard.html',
  '/dashboard/index',
  '/seo-report/',
  '/Dashboard',
  '/DASHBOARD/config.js',
  '/Seo-Report.HTML',
  '/images/../dashboard/config.js',
  '/images/%2e%2e/dashboard/config.js',
  '/assets/..//dashboard/config.js',
  '/assets/%2e%2e//dashboard/config.js',
  // Fullwidth dot/slash/backslash that NFKC would fold into real traversal.
  '/dashboard/%EF%BC%8E%EF%BC%8E/config.js',
  '/dashboard/%EF%BC%8E%EF%BC%8E%EF%BC%8Fconfig.js',
  '/dashboard%EF%BC%8F%EF%BC%8E%EF%BC%8E%EF%BC%8Fx',
  '/dashboard/x%EF%BC%BC%EF%BC%8E%EF%BC%8E%EF%BC%BC%EF%BC%8E%EF%BC%8E%EF%BC%BCconfig.js',
];
