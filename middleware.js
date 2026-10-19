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
// redirect to /owner-login, anonymous asset requests get 401, and an
// unreachable auth service fails closed with 503.
//
// No npm imports: package.json is excluded from the Vercel upload.

export const LEAD_CRM_URL = 'https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/lead-crm';
export const OWNER_COOKIE = '__Host-frame_owner';
export const OWNER_LOGIN_PATH = '/owner-login';
export const OWNER_HOME_PATH = '/dashboard';
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const ALLOWED_ROLES = new Set(['viewer', 'sales', 'admin']);
const BEARER_SHAPE = /^[A-Za-z0-9._~+/=-]{16,4096}$/;

export const config = {
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/seo-report',
    '/seo-report.html',
    '/owner-session',
  ],
};

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

export function isOwnerPagePath(pathname) {
  return /^\/(?:dashboard(?:\/(?:index(?:\.html)?)?)?|seo-report(?:\.html)?)$/i.test(pathname);
}

export function isProtectedPath(pathname) {
  const lower = pathname.toLowerCase();
  return lower === '/dashboard' || lower.startsWith('/dashboard/') ||
    lower === '/seo-report' || lower === '/seo-report.html';
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
export async function verifyOwnerSession(token, fetchImpl = fetch) {
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

function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}

async function handleOwnerSession(request, url, fetchImpl) {
  if (!sameOrigin(request, url)) return plain(403, 'Forbidden');
  if (request.method === 'DELETE') {
    return new Response(null, { status: 204, headers: { ...PRIVATE_HEADERS, 'Set-Cookie': clearedCookie() } });
  }
  if (request.method !== 'POST') return plain(405, 'Method Not Allowed', { Allow: 'POST, DELETE' });
  const token = bearer(request.headers.get('authorization'));
  const verdict = await verifyOwnerSession(token, fetchImpl);
  if (verdict === 'unavailable') return plain(503, 'Sign-in is temporarily unavailable.');
  if (verdict !== 'ok') return plain(401, 'Unauthorized', { 'Set-Cookie': clearedCookie() });
  return new Response(null, { status: 204, headers: { ...PRIVATE_HEADERS, 'Set-Cookie': sessionCookie(token) } });
}

export async function gate(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  const { pathname } = url;
  if (pathname === '/owner-session') return handleOwnerSession(request, url, fetchImpl);
  if (!isProtectedPath(pathname)) return undefined;

  const token = readCookie(request.headers.get('cookie'), OWNER_COOKIE);
  const verdict = token ? await verifyOwnerSession(token, fetchImpl) : 'denied';
  if (verdict === 'ok') {
    if (/^\/seo-report(?:\.html)?$/i.test(pathname)) return redirect(OWNER_HOME_PATH);
    // Continue to the static file. Same contract as next() in @vercel/functions.
    return new Response(null, { headers: { 'x-middleware-next': '1' } });
  }
  if (verdict === 'unavailable') return plain(503, 'Sign-in is temporarily unavailable.');
  const clear = token ? { 'Set-Cookie': clearedCookie() } : {};
  if (isOwnerPagePath(pathname)) return redirect(OWNER_LOGIN_PATH, clear);
  return plain(401, 'Unauthorized', clear);
}

export default function middleware(request) {
  return gate(request);
}
