import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { assertAggregateSql } from './audit-utah-weekly-counts.mjs';

const usage = 'Usage: node scripts/utah-weekly-counts.mjs [--week YYYY-MM-DD | --month YYYY-MM]';
const zone = 'America/Denver';
const isoDate = (date) => date.toISOString().slice(0, 10);

export function reportWindow(args = [], now = new Date()) {
  let start;
  let end;
  if (args.length === 0) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    end = new Date(`${today}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - (end.getUTCDay() + 6) % 7);
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
  } else if (args.length === 2 && args[0] === '--month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(args[1])) {
    start = new Date(`${args[1]}-01T00:00:00Z`);
    end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else if (args.length === 2 && args[0] === '--week' && /^\d{4}-\d{2}-\d{2}$/.test(args[1])) {
    start = new Date(`${args[1]}T00:00:00Z`);
    if (!Number.isFinite(start.getTime()) || isoDate(start) !== args[1] || start.getUTCDay() !== 1) {
      throw new Error('--week must be a valid Monday date.');
    }
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
  } else {
    throw new Error(usage);
  }
  if (start.getUTCFullYear() < 1 || end.getUTCFullYear() > 9999) throw new Error('Invalid report year.');
  // Calendar arithmetic above uses date labels only. PostgreSQL resolves these
  // local midnights in Utah, including weeks crossing daylight-saving changes.
  return {
    start: `${isoDate(start)} 00:00:00 ${zone}`,
    end: `${isoDate(end)} 00:00:00 ${zone}`,
  };
}

export function readOnlyTransaction(sql) {
  assertAggregateSql(sql);
  return 'BEGIN TRANSACTION READ ONLY, ISOLATION LEVEL REPEATABLE READ;\n'
    + "SET LOCAL search_path = pg_catalog;\nSET LOCAL statement_timeout = '30s';\n"
    + `${sql}\nROLLBACK;\n`;
}

function connectionEnvironment(env) {
  if (!env.UTAH_READONLY_DATABASE_URL?.trim()) throw new Error('UTAH_READONLY_DATABASE_URL is required.');
  try {
    const url = new URL(env.UTAH_READONLY_DATABASE_URL);
    const sslmode = url.searchParams.get('sslmode') ?? 'require';
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username
      || url.pathname.length < 2 || url.hash || !['require', 'verify-ca', 'verify-full'].includes(sslmode)
      || [...url.searchParams.keys()].some((key) => key !== 'sslmode')
      || url.searchParams.getAll('sslmode').length > 1) throw new Error();
    // Do not expose the URL in process arguments or inherit another market's
    // libpq settings, service files, password files or psql startup commands.
    return {
      PATH: env.PATH,
      PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: sslmode,
      PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null', PGCONNECT_TIMEOUT: '10',
      PGOPTIONS: '-c default_transaction_read_only=on',
    };
  } catch {
    throw new Error('UTAH_READONLY_DATABASE_URL must be a PostgreSQL URL; only a TLS sslmode option is supported.');
  }
}

export function runCounts(args = [], env = process.env, execute = spawnSync) {
  const connection = connectionEnvironment(env);
  const window = reportWindow(args);
  const sql = readFileSync(new URL('./utah-weekly-counts.sql', import.meta.url), 'utf8');
  let result;
  try {
    result = execute('psql', [
      '-X', '--no-password', '--quiet', '--tuples-only', '--no-align', '--pset=pager=off',
      '--set=ON_ERROR_STOP=1', '--set=ECHO=none', '--set=ECHO_HIDDEN=off',
      `--set=window_start=${window.start}`, `--set=window_end=${window.end}`, '--file=-',
    ], {
      env: connection, input: readOnlyTransaction(sql), encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 300_000, maxBuffer: 16_384,
    });
  } catch {
    throw new Error('psql failed; no counts emitted.');
  }
  // Never echo psql diagnostics: connection errors can contain supplied values.
  if (result.error || result.signal || result.status !== 0) throw new Error('psql failed; no counts emitted.');
  const output = result.stdout.replace(/\r\n/g, '\n');
  if (!/^(?:\d+\n){8}$/.test(output)) throw new Error('psql returned unexpected output; no counts emitted.');
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(runCounts(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
