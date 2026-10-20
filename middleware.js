// Owner-only route gate (Vercel Routing Middleware, runs before static files).
//
// /dashboard (and every file under /dashboard/), /seo-report and
// /seo-report.html are served only after a server-side check of the same
// dashboard session the Leads CRM already uses: the short-lived bearer token
// issued by lead-crm?action=login (PIN + report_access allowlist). The token is
// re-verified on every request against lead-crm?action=session, which reloads
// the report_access row, its active flag, role and session_version. No new
// secret, env var or account is involved.
//
// Flow: /owner-login exchanges a lead-crm token for an HttpOnly cookie via
// POST /owner-session; DELETE /owner-session clears it. Anonymous page requests
// redirect to /owner-login, anonymous asset requests get 401, malformed paths
// get 400, and an unreachable auth service fails closed with 503.
//
// The matcher is narrow: it runs only on paths that contain dashboard,
// seo-report or owner-session (case-insensitive), or any of %, a backslash,
// //, .. or ; (the characters an encoded, doubled, backslashed or dot-segment
// bypass needs). Ordinary public pages and assets never invoke the middleware.
// Every matched path is decoded and normalized before the protected-route
// decision, so encoded, doubled, backslashed, mixed-case and .html variants
// cannot slip past the gate.
//
// No npm imports: package.json is excluded from the Vercel upload.

export const LEAD_CRM_URL = 'https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/lead-crm';
export const OWNER_COOKIE = '__Host-frame_owner';
export const OWNER_LOGIN_PATH = '/owner-login';
export const OWNER_HOME_PATH = '/dashboard';
export const OWNER_SESSION_PATH = '/owner-session';
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const ALLOWED_ROLES = new Set(['viewer', 'sales', 'admin']);
const BEARER_SHAPE = /^[A-Za-z0-9._~+/=-]{16,4096}$/;
const MAX_DECODE_ROUNDS = 4;

export const config = {
  runtime: 'nodejs',
  matcher: [
    // Protected names, plus the characters any encoding/traversal bypass needs.
    '/(.*(?:dashboard|seo-report|owner-session|%|\\\\|//|\\.\\.|;).*)',
  ],
};

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Vary': 'Cookie',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

// Returns the canonical lowercase path, or null when the encoding is
// malformed (callers fail closed).
export function normalizePath(rawPath) {
  let path = String(rawPath || '/');
  for (let round = 0; round < MAX_DECODE_ROUNDS && path.includes('%'); round += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return null;
    }
    if (decoded === path) break;
    path = decoded;
  }
  if (path.includes('%')) {
    try {
      if (decodeURIComponent(path) !== path) return null; // still encoded: too deep
    } catch {
      return null;
    }
  }
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  // Fold compatibility forms (fullwidth letters) and drop invisible format
  // characters so look-alike names map to the real one.
  const folded = path.normalize('NFKC').replace(/[\u00ad\u200b-\u200f\u2060\ufeff]/g, '');
  // The fold may change letters, never path syntax: a fullwidth / \\ . ; or %
  // that folds into a real one is refused (the filesystem would not fold it).
  const syntax = (value) => (value.match(/[\/\\.;%]/g) || []).join('');
  if (syntax(folded) !== syntax(path)) return null;
  path = folded;
  const segments = [];
  for (const segment of path.replace(/\\/g, '/').toLowerCase().split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  let normalized = `/${segments.join('/')}`;
  normalized = normalized.replace(/\.html?$/, '');
  normalized = normalized.replace(/\/index$/, '');
  return normalized || '/';
}

// /dashboard or /seo-report followed by the end or by any character that
// cannot continue the name (/, ., ;, space, ...) is protected, so near-misses
// such as /dashboard. or /dashboard;x are refused too.
const PROTECTED_PREFIX = /^\/(?:dashboard|seo-report)(?![a-z0-9_-])/;
const SEO_REPORT_PREFIX = /^\/seo-report(?![a-z0-9_-])/;

export function isProtectedPath(normalized) {
  return PROTECTED_PREFIX.test(normalized);
}

export function isOwnerPagePath(normalized) {
  return normalized === '/dashboard' || normalized === '/seo-report';
}

export function readCookie(header, name) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}

function bearer(header) {
  const match = /^Bearer\s+(\S+)$/i.exec(header || '');
  return match ? match[1] : '';
}

// 'ok' | 'denied' | 'unavailable'
export async function verifyOwnerSession(token, fetchImpl = globalThis.fetch) {
  if (!BEARER_SHAPE.test(token || '')) return 'denied';
  let response;
  try {
    response = await fetchImpl(`${LEAD_CRM_URL}?action=session`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return 'unavailable';
  }
  if (response.status === 401 || response.status === 403) return 'denied';
  if (response.status !== 200) return 'unavailable';
  try {
    const body = await response.json();
    return body && body.user && ALLOWED_ROLES.has(body.user.role) ? 'ok' : 'denied';
  } catch {
    return 'unavailable';
  }
}

function sessionCookie(token) {
  return `${OWNER_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

function clearedCookie() {
  return `${OWNER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function plain(status, text, extra = {}) {
  return new Response(text, {
    status,
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...extra },
  });
}

function redirect(location, extra = {}) {
  return new Response(null, { status: 302, headers: { ...PRIVATE_HEADERS, Location: location, ...extra } });
}

// Continue to the static file. Same contract as next() in @vercel/functions;
// the headers are applied to the final response.
function proceed(extra) {
  return new Response(null, { headers: { 'x-middleware-next': '1', ...(extra || {}) } });
}

async function handleOwnerSession(request, url, fetchImpl) {
  const origin = request.headers.get('origin');
  if (request.method === 'DELETE') {
    if (origin && origin !== url.origin) return plain(403, 'Forbidden');
    return new Response(null, { status: 204, headers: { ...PRIVATE_HEADERS, 'Set-Cookie': clearedCookie() } });
  }
  if (request.method !== 'POST') return plain(405, 'Method Not Allowed', { Allow: 'POST, DELETE' });
  // Browsers always send Origin on a POST; a missing or foreign one is refused.
  if (origin !== url.origin) return plain(403, 'Forbidden');
  const token = bearer(request.headers.get('authorization'));
  const verdict = await verifyOwnerSession(token, fetchImpl);
  if (verdict === 'unavailable') return plain(503, 'Sign-in is temporarily unavailable.');
  if (verdict !== 'ok') return plain(401, 'Unauthorized', { 'Set-Cookie': clearedCookie() });
  return new Response(null, { status: 204, headers: { ...PRIVATE_HEADERS, 'Set-Cookie': sessionCookie(token) } });
}

export async function gate(request, fetchImpl = globalThis.fetch) {
  const url = new URL(request.url);
  const normalized = normalizePath(url.pathname);
  if (normalized === null) return plain(400, 'Bad Request');
  if (normalized === OWNER_SESSION_PATH) return handleOwnerSession(request, url, fetchImpl);
  if (!isProtectedPath(normalized)) return proceed();

  const token = readCookie(request.headers.get('cookie'), OWNER_COOKIE);
  const verdict = token ? await verifyOwnerSession(token, fetchImpl) : 'denied';
  if (verdict === 'ok') {
    if (SEO_REPORT_PREFIX.test(normalized)) return redirect(OWNER_HOME_PATH);
    return proceed({ 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Robots-Tag': 'noindex, nofollow' });
  }
  if (verdict === 'unavailable') return plain(503, 'Sign-in is temporarily unavailable.');
  const clear = token ? { 'Set-Cookie': clearedCookie() } : {};
  if (isOwnerPagePath(normalized)) return redirect(OWNER_LOGIN_PATH, clear);
  return plain(401, 'Unauthorized', clear);
}

// What Vercel runs. Kept as a direct call so the audit can exercise it.
export default function middleware(request) {
  return gate(request);
}
