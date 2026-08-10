#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];

const deployWorkflow = read('.github/workflows/deploy-edge-function.yml');
if (deployWorkflow.includes('dashboard_deploy_receipt:')) {
  failures.push('deploy workflow: still accepts a self-attested dashboard receipt input');
}
const dashboardReceiptGateAt = deployWorkflow.indexOf('node scripts/verify-dashboard-deploy-receipt.mjs');
const edgeDeployAt = deployWorkflow.indexOf('supabase functions deploy');
if (dashboardReceiptGateAt < 0 || edgeDeployAt < dashboardReceiptGateAt) {
  failures.push('deploy workflow: dashboard receipt gate does not run before Edge deployment');
}

const browserFiles = ['dashboard/dashboard.js', 'dashboard/index.html', 'seo-report.html', 'leads.html'];
for (const relative of browserFiles) {
  const source = read(relative);
  if (/\/rest\/v1\/report_access/i.test(source)) {
    failures.push(`${relative}: directly queries report_access over PostgREST`);
  }
  if (/select=[^\n"']*\bpin\b/i.test(source)) {
    failures.push(`${relative}: requests PIN values from the browser`);
  }
  for (const line of source.split('\n')) {
    if (/(?:ACCESS_API|FAPI|lead-crm|weekly-report)/.test(line) && /[?&](?:key|pin)=/i.test(line)) {
      failures.push(`${relative}: sends a dashboard credential in a URL`);
    }
  }
}

for (const relative of ['dashboard/dashboard.js', 'seo-report.html', 'leads.html']) {
  const source = read(relative);
  if (!/(?:\?action=login|crmUrl\(["']login["']\))/.test(source) || !/routing_key/.test(source) || !/method\s*:\s*['"]POST['"]/.test(source)) {
    failures.push(`${relative}: login is not a POST-body routing-key flow`);
  }
  if (!/Authorization['"]?\s*:\s*['"]Bearer /.test(source)) {
    failures.push(`${relative}: authenticated requests lack a Bearer header`);
  }
  for (const storageCall of source.matchAll(/sessionStorage\.(?:setItem|getItem)\(([^)]*)\)/g)) {
    if (/\b(?:PIN|ROUTING_KEY|KEY)\b|,\s*p\s*$/i.test(storageCall[1])) {
      failures.push(`${relative}: stores or retrieves a PIN/routing key`);
    }
  }
}

for (const relative of ['dashboard/dashboard.js', 'seo-report.html']) {
  const source = read(relative);
  const start = source.indexOf('async function loadUsers');
  const end = source.indexOf('async function toggleUser', start);
  if (start < 0 || end < 0) {
    failures.push(`${relative}: access-list renderer not found`);
    continue;
  }
  const renderer = source.slice(start, end);
  if (/innerHTML|\.pin\b/.test(renderer)) {
    failures.push(`${relative}: access-list renderer must use DOM/textContent and never read PINs`);
  }
  if (!/textContent/.test(renderer)) {
    failures.push(`${relative}: access-list renderer lacks textContent output`);
  }
  if (!/r\.status\s*===\s*401[\s\S]{0,160}doLogout\(\)/.test(source)) {
    failures.push(`${relative}: authenticated 401 does not clear the stale session`);
  }
  if (!/session_revoked[\s\S]{0,120}doLogout\(\)/.test(source)) {
    failures.push(`${relative}: self-PIN reset does not clear its revoked session`);
  }
}

const crm = read('supabase/functions/lead-crm/index.ts');
const boundedJson = read('supabase/functions/_shared/bounded-json.ts');
for (const action of ['access_list', 'access_create', 'access_toggle', 'access_reset']) {
  if (!crm.includes(`action === "${action}"`)) {
    failures.push(`lead-crm: missing server-side ${action} action`);
  }
}
if (!crm.includes('actionAllowed(role, action)')) {
  failures.push('lead-crm: missing centralized server-side role gate');
}
for (const contract of [
  'action === "login"',
  'body.routing_key',
  'AUTH_THROTTLE_RPC',
  'parseThrottleReservation(throttleData)',
  'dashboardThrottleKey(',
  'await supabase.rpc(',
  'bearerToken(req.headers.get("authorization"))',
  'verifyDashboardSession(SESSION_SECRET, token)',
  'issueDashboardSession(',
  'authenticated.session_version',
  'dashboardSessionMatchesVersion(',
  'dashboardSessionVersion(',
  'dashboardSessionSecretReady(SESSION_SECRET)',
  'dashboardCredentialPepperReady(CREDENTIAL_PEPPER)',
  'SESSION_SECRET === CREDENTIAL_PEPPER',
  'origin_forbidden',
  'https://www.framerestorationutah.com',
  'preview.hostname.endsWith(".vercel.app")',
  '"authenticate_dashboard_access"',
  'parseDashboardAuthRpcResult(authData)',
  '"create_dashboard_access"',
  '"reset_dashboard_access_credential"',
  '"set_dashboard_access_active"',
  'lead_notifications (',
]) {
  if (!crm.includes(contract)) failures.push(`lead-crm: missing session/credential contract ${contract}`);
}
if (/Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/.test(crm)) {
  failures.push('lead-crm: protected bearer API allows wildcard CORS');
}
const originGateAt = crm.indexOf('if (origin && !ALLOWED_ORIGINS.has(origin))');
const optionsAt = crm.indexOf('if (req.method === "OPTIONS")');
const actionParseAt = crm.indexOf('const action = url.searchParams.get');
if (
  originGateAt < 0 || optionsAt < 0 || actionParseAt < 0 ||
  originGateAt > optionsAt || originGateAt > actionParseAt
) {
  failures.push('lead-crm: untrusted browser origins are not rejected before preflight/action handling');
}
if (/searchParams\.get\(["'](?:key|pin)["']\)/.test(crm)) {
  failures.push('lead-crm: accepts a credential from URL parameters');
}
if (/\.eq\(["'](?:pin|pin_hash)["']\s*,/.test(crm)) {
  failures.push('lead-crm: sends a credential or credential hash in a PostgREST filter URL');
}
if (/\.insert\(\{[^}]*pin\s*:\s*body\.pin|\.update\(\{[^}]*pin\s*:\s*body\.pin/s.test(crm)) {
  failures.push('lead-crm: writes a new/reset credential in plaintext');
}
if (/\.update\(\{[^}]*pin_hash\s*:\s*pinHash/s.test(crm)) {
  failures.push('lead-crm: changes a credential outside the atomic revocation RPC');
}
if (/\.from\(["']auth_attempts["']\)|failedAttemptRow|throttleAllows/.test(crm)) {
  failures.push('lead-crm: mutates/decides throttle state outside the atomic RPC');
}
const loginStart = crm.indexOf('if (action === "login")');
const sessionStart = crm.indexOf('// ─── SESSION AUTHORIZATION', loginStart);
const loginFlow = loginStart >= 0 && sessionStart > loginStart
  ? crm.slice(loginStart, sessionStart)
  : '';
const reservationAt = loginFlow.indexOf('await supabase.rpc(');
const boundedBodyReadAt = loginFlow.indexOf('await readBoundedJsonObject(');
const deniedReservationAt = loginFlow.indexOf('if (!reservation.allowed)');
const routingKeyCheckAt = loginFlow.indexOf('routingKey !== API_KEY');
const credentialRpcAt = loginFlow.indexOf('"authenticate_dashboard_access"');
if (
  reservationAt < 0 ||
  boundedBodyReadAt < 0 ||
  deniedReservationAt < 0 ||
  routingKeyCheckAt < 0 ||
  credentialRpcAt < 0 ||
  reservationAt > deniedReservationAt ||
  deniedReservationAt > boundedBodyReadAt ||
  reservationAt > boundedBodyReadAt ||
  boundedBodyReadAt > routingKeyCheckAt ||
  reservationAt > routingKeyCheckAt ||
  reservationAt > credentialRpcAt
) {
  failures.push('lead-crm: atomic reservation/denial must precede login body reading and every credential check/lookup');
}
if (!/atomic login throttle reservation failed:[\s\S]{0,180}auth_unavailable/.test(loginFlow)) {
  failures.push('lead-crm: failed atomic throttle reservation does not fail closed');
}
if (/auth_attempts[\s\S]{0,120}delete\(|delete\([\s\S]{0,120}auth_attempts/.test(loginFlow)) {
  failures.push('lead-crm: successful login clears the fixed-window attempt counter');
}
if (/\breq\.json\s*\(|\bJSON\.parse\s*\(/.test(crm)) {
  failures.push('lead-crm: parses a request body outside the bounded JSON reader');
}
if ((crm.match(/await readBoundedJsonObject\s*\(/g) || []).length !== 7) {
  failures.push('lead-crm: every one of the seven JSON action bodies must use the bounded reader');
}
const declaredLimitAt = boundedJson.indexOf('if (declaredTooLarge) return BODY_TOO_LARGE');
const streamReaderAt = boundedJson.indexOf('req.body.getReader()');
const streamLimitAt = boundedJson.indexOf('if (totalBytes > maxBytes)');
const jsonParseAt = boundedJson.indexOf('JSON.parse(text)');
if (
  !boundedJson.includes('error: "body_too_large"') ||
  !boundedJson.includes('status: 413') ||
  declaredLimitAt < 0 ||
  streamReaderAt < 0 ||
  streamLimitAt < 0 ||
  jsonParseAt < 0 ||
  declaredLimitAt > streamReaderAt ||
  streamLimitAt > jsonParseAt
) {
  failures.push('bounded JSON reader: declared and streamed byte limits do not fail with 413 before JSON parsing');
}
if (!crm.includes('"ul_request"') || !crm.includes('"spam"')) {
  failures.push('lead-crm: missing UL Request or Spam status support');
}
const liveSessionFlow = sessionStart >= 0
  ? crm.slice(sessionStart, crm.indexOf('// ─── ACCESS MANAGEMENT', sessionStart))
  : '';
const liveVersionCheckAt = liveSessionFlow.indexOf('dashboardSessionMatchesVersion(');
const liveRoleGateAt = liveSessionFlow.indexOf('normalizeAccessRole(');
if (
  liveVersionCheckAt < 0 || liveRoleGateAt < 0 ||
  liveVersionCheckAt > liveRoleGateAt
) {
  failures.push('lead-crm: live session version is not checked before authorization');
}
const resetStart = crm.indexOf('if (action === "access_reset")');
const resetEnd = crm.indexOf('// ─── LIST', resetStart);
const resetFlow = resetStart >= 0 && resetEnd > resetStart
  ? crm.slice(resetStart, resetEnd)
  : '';
if (
  !resetFlow.includes('"reset_dashboard_access_credential"') ||
  /\.update\(\{[^}]*pin_hash/s.test(resetFlow) ||
  !resetFlow.includes('session_revoked: id === accessRow.id')
) {
  failures.push('lead-crm: access_reset does not use the atomic session-revoking RPC');
}

const leads = read('leads.html');
if (!/primary\.status==="delivered"[\s\S]{0,220}accepted/.test(leads)) {
  failures.push('leads.html: provider acceptance is not distinguished from delivered email');
}
if (!/notificationDetail\(primaryNotification,"Landon"\)/.test(leads)) {
  failures.push('leads.html: primary and backup outbox receipts are not rendered');
}
if (
  !/notificationFailureIssues\(r\)[\s\S]{0,420}\["primary","Landon"\][\s\S]{0,120}\["backup","Backup"\]/.test(leads) ||
  !/notificationBadge\(r\)[\s\S]{0,160}notificationFailureSummary\(r,false\)/.test(leads) ||
  !/renderNotificationPanel\(rows\)[\s\S]{0,520}notificationFailureSummary\(r,true\)/.test(leads) ||
  !/legacyNotificationFailed\(r\)\{return notificationJobs\(r\)\.length===0&&crmParityReady/.test(leads)
) {
  failures.push('leads.html: KPI/badge/panel do not preserve authoritative recipient-specific notification outcomes');
}

for (const status of ['value="ul_request"', 'value="spam"', 'data-status="ul_request"', 'data-status="spam"']) {
  if (!leads.includes(status)) failures.push(`leads.html: missing status control ${status}`);
}

const credentialMigration = read('supabase/migrations/20260807000150_dashboard_session_credentials.sql');
for (const contract of [
  'add column if not exists pin_hash text',
  'add column if not exists session_version integer not null default 1',
  'alter column pin drop not null',
  "pin_hash ~ '^[0-9a-f]{64}$'",
  'check (session_version between 1 and 2147483647)',
  'create or replace function public.authenticate_dashboard_access(',
  'create or replace function public.create_dashboard_access(',
  'create or replace function public.reset_dashboard_access_credential(',
  'create or replace function public.migrate_dashboard_access_credential(',
  'create or replace function public.set_dashboard_access_active(',
  'session_version = session_version + 1',
  'security definer',
  "set search_path = ''",
  'revoke all on function public.create_dashboard_access(text, text, text, text)',
  'revoke all on function public.authenticate_dashboard_access(text, text)',
  'revoke all on function public.reset_dashboard_access_credential(uuid, text, text)',
  'revoke all on function public.migrate_dashboard_access_credential(uuid, text, text)',
  'revoke all on function public.set_dashboard_access_active(uuid, boolean)',
  'grant execute on function public.create_dashboard_access(text, text, text, text)',
  'grant execute on function public.authenticate_dashboard_access(text, text)',
  'grant execute on function public.reset_dashboard_access_credential(uuid, text, text)',
  'grant execute on function public.migrate_dashboard_access_credential(uuid, text, text)',
  'grant execute on function public.set_dashboard_access_active(uuid, boolean)',
  'to service_role',
]) {
  if (!credentialMigration.includes(contract)) {
    failures.push(`credential migration: missing ${contract}`);
  }
}

const containmentMigration = read('supabase/migrations/20260807000090_emergency_dashboard_secret_containment.sql');
for (const contract of [
  'alter table public.app_config enable row level security',
  'alter table public.report_access enable row level security',
  'revoke all privileges on table public.app_config',
  'revoke all privileges on table public.report_access',
  "tablename in ('app_config', 'report_access')",
]) {
  if (!containmentMigration.toLowerCase().includes(contract.toLowerCase())) {
    failures.push(`emergency-containment migration: missing ${contract}`);
  }
}
if ((credentialMigration.match(/\bsecurity definer\b/gi) || []).length < 5) {
  failures.push('credential migration: every credential/access mutation RPC must be SECURITY DEFINER');
}
if ((credentialMigration.match(/set search_path = ''/gi) || []).length < 5) {
  failures.push('credential migration: every credential/access mutation RPC needs an empty search_path');
}
const authSqlStart = credentialMigration.indexOf('create or replace function public.authenticate_dashboard_access(');
const createSqlStart = credentialMigration.indexOf('create or replace function public.create_dashboard_access(');
const resetSqlStart = credentialMigration.indexOf('create or replace function public.reset_dashboard_access_credential(');
const migrateSqlStart = credentialMigration.indexOf('create or replace function public.migrate_dashboard_access_credential(');
const activeSqlStart = credentialMigration.indexOf('create or replace function public.set_dashboard_access_active(');
const grantsStart = credentialMigration.indexOf('revoke all on function', activeSqlStart);
const authSql = credentialMigration.slice(authSqlStart, createSqlStart);
const createSql = credentialMigration.slice(createSqlStart, resetSqlStart);
const resetSql = credentialMigration.slice(resetSqlStart, migrateSqlStart);
const migrateSql = credentialMigration.slice(migrateSqlStart, activeSqlStart);
const activeSql = credentialMigration.slice(activeSqlStart, grantsStart);
if (
  !/pg_advisory_xact_lock[\s\S]*where pin = p_pin or pin_hash = p_pin_hash[\s\S]*v_match_count <> 1[\s\S]*pin = null[\s\S]*session_version = session_version \+ 1[\s\S]*last_accessed = clock_timestamp\(\)/.test(authSql)
) {
  failures.push('credential migration: POST-body authentication is not an atomic unambiguous legacy transition');
}
if (
  !/pg_advisory_xact_lock[\s\S]*pin = p_pin[\s\S]*pin_hash = p_pin_hash[\s\S]*insert into public\.report_access/.test(createSql)
) {
  failures.push('credential migration: access creation lacks atomic legacy/plaintext collision protection');
}
if (
  !/pg_advisory_xact_lock[\s\S]*pin = p_pin[\s\S]*pin_hash = p_pin_hash[\s\S]*session_version = session_version \+ 1/.test(resetSql)
) {
  failures.push('credential migration: PIN reset and session revocation are not one atomic update');
}
if (
  !/pin_hash = p_pin_hash[\s\S]*session_version = session_version \+ 1[\s\S]*and pin = p_legacy_pin/.test(migrateSql)
) {
  failures.push('credential migration: legacy PIN migration lacks compare-and-revoke semantics');
}
if (
  !/active is distinct from p_active[\s\S]*session_version \+ 1[\s\S]*active = p_active/.test(activeSql)
) {
  failures.push('credential migration: active-state transitions can revive stale sessions');
}

const finalRemediation = read('supabase/cutovers/20260807000200_live_dashboard_security_remediation.sql');
if (
  !finalRemediation.includes('report_access_plaintext_pin_forbidden_check') ||
  !/check \(pin is null\)/i.test(finalRemediation)
) {
  failures.push('live remediation: plaintext dashboard PINs can be reintroduced after transition');
}

const weeklyReport = read('supabase/functions/weekly-report/index.ts');
for (const contract of [
  '.select("id, name, role, active, session_version")',
  'dashboardSessionMatchesVersion(',
  'sessionLookup.data?.session_version',
]) {
  if (!weeklyReport.includes(contract)) {
    failures.push(`weekly-report: missing live session-revocation contract ${contract}`);
  }
}

const throttleMigration = read('supabase/migrations/20260807000140_atomic_dashboard_auth_throttle.sql');
for (const contract of [
  'create or replace function public.reserve_dashboard_login_attempt(p_ip text)',
  'security definer',
  "set search_path = ''",
  'octet_length(p_ip) <> 64',
  "p_ip !~ '^[0-9a-f]{64}$'",
  "delete from public.auth_attempts",
  'insert into public.auth_attempts as attempts',
  'on conflict (ip) do update',
  "interval '15 minutes'",
  'v_attempt_count <= 10',
  'revoke all on function public.reserve_dashboard_login_attempt(text)',
  'from public, anon, authenticated',
  'grant execute on function public.reserve_dashboard_login_attempt(text)',
  'to service_role',
]) {
  if (!throttleMigration.toLowerCase().includes(contract.toLowerCase())) {
    failures.push(`atomic-throttle migration: missing ${contract}`);
  }
}
if (/reserve_dashboard_login_attempt\s*\([^)]*,/.test(throttleMigration)) {
  failures.push('atomic-throttle migration: caller can override a fixed throttle limit/window');
}

const migration = read('supabase/cutovers/20260807000200_live_dashboard_security_remediation.sql');
for (const contract of [
  'begin;',
  'revoke all privileges on table public.%I from anon, authenticated',
  'grant all privileges on table public.%I to service_role',
  'alter view public.website_leads_report set (security_invoker = true)',
  'session_version not between 1 and 2147483647',
  'commit;',
]) {
  if (!migration.toLowerCase().includes(contract.toLowerCase())) {
    failures.push(`live-remediation migration: missing ${contract}`);
  }
}

const handoff = read('data/COWORK-HANDOFF-2026-05-10.md');
const assignedPin = handoff.match(/FRAME_REPORT_PIN\s*=\s*([^\s'"`]+)/);
if (assignedPin && !assignedPin[1].startsWith('[REDACTED')) {
  failures.push('public handoff contains a report PIN assignment');
}

const safeHtmlSource = read('dashboard/safe-html.js');
const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(safeHtmlSource, sandbox, { filename: 'dashboard/safe-html.js' });
const tainted = '<img src=x onerror="globalThis.stolen=1">\'&';
const escaped = sandbox.__dashboardEscapeHtml(tainted);
if (/[<>"']/.test(escaped) || !escaped.includes('&lt;img') || sandbox.stolen) {
  failures.push('dashboard safe-html helper does not neutralize the stored-XSS fixture');
}
for (const relative of ['dashboard/dashboard.js', 'seo-report.html']) {
  const source = read(relative);
  if (!source.includes('__dashboardEscapeHtml')) {
    failures.push(`${relative}: shared HTML escaping helper is not wired`);
  }
  for (const raw of ['+ l.name +', '+l.name+', '+ c.from_number +', '+c.from_number+']) {
    if (source.includes(raw)) failures.push(`${relative}: raw untrusted report field reaches innerHTML (${raw})`);
  }
}

if (failures.length) {
  console.error('Dashboard security audit failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Dashboard security audit passed (${browserFiles.length} browser surfaces, version-revocable bearer sessions, hash-only credentials, atomic login throttle, stored-XSS fixture, transactional RLS migration).`);
