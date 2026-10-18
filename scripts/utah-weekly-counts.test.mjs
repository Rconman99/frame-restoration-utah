import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAggregateSql } from './audit-utah-weekly-counts.mjs';
import { reportWindow, readOnlyTransaction, runCounts } from './utah-weekly-counts.mjs';

const sql = readFileSync(new URL('./utah-weekly-counts.sql', import.meta.url), 'utf8');
const runner = fileURLToPath(new URL('./utah-weekly-counts.mjs', import.meta.url));
// Inert, credential-free fixture, used only with an injected/mock psql.
const env = { UTAH_READONLY_DATABASE_URL: 'postgresql://test_operator@database.invalid/test_counts?sslmode=require' };
const counts = '13\n12\n5\n7\n6\n4\n0\n1\n';
const success = { status: 0, signal: null, stdout: counts, stderr: '' };
const forbidden = 'name email phone address from_number to_number forwarded_to caller_name recording_url call_sid notes message contract_url warranty_doc_url gclid fbclid msclkid gbraid wbraid'.split(' ');

test('the checked-in SQL has only the eight approved count projections', () => {
  assert.doesNotThrow(() => assertAggregateSql(sql));
  assert.doesNotThrow(() => assertAggregateSql(`-- explanatory comment\n${sql}`));
});

test('every forbidden column fails in projections, predicates and grouping', () => {
  for (const column of forbidden) {
    for (const changed of [
      sql.replace('COUNT(*)', `COUNT(${column})`),
      sql.replace('COUNT(*)', `COUNT("${column.toUpperCase()}")`),
      sql.replace('is_test IS NOT TRUE', `is_test IS NOT TRUE AND ${column} IS NULL`),
      sql.replace(';', ` GROUP BY ${column};`),
    ]) assert.throws(() => assertAggregateSql(changed), /forbidden PII column/);
  }
});

test('row data and SQL outside the closed aggregate grammar fail', () => {
  for (const changed of [
    sql.replace('COUNT(*)', '*'),
    sql.replace('COUNT(*)', 'id'),
    sql.replace('COUNT(*)', 'city'),
    sql.replace('COUNT(*)', 'COUNT(*), status'),
    sql.replace('COUNT(*)', 'array_agg(city)'),
    sql.replace('COUNT(*)', "json_agg(to_jsonb(call_logs))"),
    sql.replace('COUNT(*)', 'COUNT(*) OVER ()'),
    sql.replace(';', ' GROUP BY city;'),
    sql.replace(';', ' INTO temporary_counts;'),
    sql.replace(';', ' UNION SELECT id FROM public.leads;'),
    sql.replace('public.call_logs', 'private.call_logs'),
    sql.replace('COUNT(*)', '(SELECT id FROM public.leads LIMIT 1)'),
    sql.replace('COUNT(*)', 'COUNT(/* unsupported block comment */ *)'),
    `${sql}\nSELECT id FROM public.leads;`,
    `${sql}\nCOPY public.leads TO STDOUT;`,
    `${sql}\nROLLBACK; DELETE FROM public.leads;`,
    `${sql}\n\\! echo unexpected`,
    sql.replace('COUNT(*)', 'COUNT(U&"n\\0061me")'),
  ]) assert.throws(() => assertAggregateSql(changed));
});

test('changing exclusions, boundaries or lifecycle timestamps fails the guard', () => {
  for (const changed of [
    sql.replace('is_test IS NOT TRUE', 'is_test = TRUE'),
    sql.replace('is_test IS NOT TRUE', 'TRUE'),
    sql.replace('created_at <', 'created_at <='),
    sql.replace('duration_seconds > 0', 'duration_seconds >= 0'),
    sql.replace("status = 'completed'", "status = 'COMPLETED'"),
    sql.replaceAll('review_requested_at', 'created_at'),
    sql.replaceAll('won_at', 'job_completed_at'),
    sql.replace("OR utm_source ~ '[^[:space:]]'", "AND utm_source ~ '[^[:space:]]'"),
    sql.replace("city ~ '[^[:space:]]'", 'city IS NOT NULL'),
  ]) assert.throws(() => assertAggregateSql(changed));
});

test('weekly default uses the last complete Utah week even around local midnight', () => {
  for (const now of ['2026-10-18T16:52:00Z', '2026-10-19T05:59:59Z']) {
    assert.deepEqual(reportWindow([], new Date(now)), {
      start: '2026-10-05 00:00:00 America/Denver', end: '2026-10-12 00:00:00 America/Denver',
    });
  }
  assert.deepEqual(reportWindow([], new Date('2026-10-19T06:00:00Z')), {
    start: '2026-10-12 00:00:00 America/Denver', end: '2026-10-19 00:00:00 America/Denver',
  });
  assert.deepEqual(reportWindow([], new Date('2026-01-01T12:00:00Z')), {
    start: '2025-12-22 00:00:00 America/Denver', end: '2025-12-29 00:00:00 America/Denver',
  });
});

test('calendar months handle September, leap February and year rollover', () => {
  for (const [month, end] of [['2026-09', '2026-10-01'], ['2024-02', '2024-03-01'], ['2026-12', '2027-01-01']]) {
    assert.deepEqual(reportWindow(['--month', month]), {
      start: `${month}-01 00:00:00 America/Denver`, end: `${end} 00:00:00 America/Denver`,
    });
  }
});

test('explicit weeks preserve local midnights across both DST boundaries', () => {
  for (const [start, end] of [['2026-03-02', '2026-03-09'], ['2026-10-26', '2026-11-02']]) {
    assert.deepEqual(reportWindow(['--week', start]), {
      start: `${start} 00:00:00 America/Denver`, end: `${end} 00:00:00 America/Denver`,
    });
  }
});

test('malformed dates, non-Mondays, injected values and extra flags fail before execution', () => {
  for (const args of [
    ['--week'], ['--week', '2026-09-01'], ['--week', '2026-02-30'], ['--week', '2026-13-01'],
    ['--month', '2026-00'], ['--month', '2026-13'], ['--month', '0000-01'],
    ['--month', '9999-12'], ['--month', '2026-9'], ['--month', "2026-09'; SELECT 1;"],
    ['--month', '2026-09', '--week', '2026-09-07'], ['--all-time'],
  ]) {
    let called = false;
    assert.throws(() => runCounts(args, env, () => { called = true; return success; }));
    assert.equal(called, false, 'invalid dates/options must never reach psql');
  }
});

test('missing/blank connection variable fails closed even with ambient PG settings', () => {
  for (const value of [undefined, '', '   ']) {
    assert.throws(() => runCounts([], { UTAH_READONLY_DATABASE_URL: value, PGDATABASE: 'ambient' },
      () => assert.fail('psql must not run')), /UTAH_READONLY_DATABASE_URL is required/);
  }
  const result = spawnSync(process.execPath, [runner], { env: {}, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'UTAH_READONLY_DATABASE_URL is required.\n');
});

test('invalid connection settings are rejected without exposing the supplied value', () => {
  for (const value of ['invalid-connection', `${env.UTAH_READONLY_DATABASE_URL}&host=elsewhere`,
    env.UTAH_READONLY_DATABASE_URL.replace('require', 'disable')]) {
    assert.throws(() => runCounts([], { UTAH_READONLY_DATABASE_URL: value },
      () => assert.fail('psql must not run')), (error) => {
      assert.equal(error.message.includes(value), false);
      return /must be a PostgreSQL URL/.test(error.message);
    });
  }
});

test('every mode uses one read-only snapshot and ROLLBACK; no URL is passed in argv', () => {
  for (const args of [[], ['--month', '2026-09'], ['--week', '2026-09-07']]) {
    let calls = 0;
    const output = runCounts(args, { ...env, PGHOST: 'ambient', PGOPTIONS: 'ambient', PGSERVICE: 'ambient' },
      (command, argv, options) => {
        calls++;
        assert.equal(command, 'psql');
        for (const flag of ['-X', '--no-password', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--file=-']) {
          assert.ok(argv.includes(flag));
        }
        assert.ok(argv.every((arg) => !arg.includes(env.UTAH_READONLY_DATABASE_URL)));
        assert.match(options.input, /^BEGIN TRANSACTION READ ONLY, ISOLATION LEVEL REPEATABLE READ;\n/);
        assert.match(options.input, /\nROLLBACK;\n$/);
        assert.equal((options.input.match(/\bBEGIN\b/g) || []).length, 1);
        assert.doesNotMatch(options.input, /\bCOMMIT\b|READ WRITE/);
        assert.ok(options.input.includes(sql));
        assert.equal(options.env.PGHOST, 'database.invalid');
        assert.equal(options.env.PGUSER, 'test_operator');
        assert.equal(options.env.PGDATABASE, 'test_counts');
        assert.equal(options.env.PGSSLMODE, 'require');
        assert.equal(options.env.PGOPTIONS, '-c default_transaction_read_only=on');
        assert.equal(options.env.PGPASSFILE, '/dev/null');
        assert.equal(options.env.PGSERVICE, undefined);
        assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
        return success;
      });
    assert.equal(calls, 1);
    assert.equal(output, counts);
  }
  assert.throws(() => readOnlyTransaction(sql.replace('COUNT(*)', 'id')));
});

test('psql failures and unexpected output cannot emit partial counts or diagnostics', () => {
  for (const result of [
    { ...success, status: 3, stdout: '1\n', stderr: 'private diagnostic sentinel' },
    { ...success, error: new Error('private diagnostic sentinel') },
    { ...success, status: null, signal: 'SIGTERM' },
    { ...success, stdout: `${counts}extra-row\n` },
    { ...success, stdout: counts.replace('13', 'row-data') },
    { ...success, stdout: counts.replace('13', '-1') },
    { ...success, stdout: '' },
  ]) {
    assert.throws(() => runCounts([], env, () => result), /no counts emitted/);
  }
  assert.throws(() => runCounts([], env, () => { throw new Error('private diagnostic sentinel'); }), /psql failed; no counts emitted/);
});

test('CLI integrates with a local psql stub only, including transaction and count-only stdout', () => {
  const temp = mkdtempSync(join(tmpdir(), 'ut-counts-test-'));
  try {
    const capture = join(temp, 'capture.json');
    const fakePsql = `#!${process.execPath}
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({argv: process.argv.slice(2), sql: fs.readFileSync(0, 'utf8')}));
process.stderr.write('diagnostic sentinel that must stay private');
process.stdout.write(${JSON.stringify(counts)});
`;
    writeFileSync(join(temp, 'psql'), fakePsql, { mode: 0o700 });
    const result = spawnSync(process.execPath, [runner, '--month', '2026-09'], {
      cwd: temp, env: { ...env, PATH: `${temp}:${dirname(process.execPath)}` }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, counts);
    assert.equal(result.stderr, '');
    const recorded = JSON.parse(readFileSync(capture, 'utf8'));
    assert.ok(recorded.argv.includes('--set=window_start=2026-09-01 00:00:00 America/Denver'));
    assert.ok(recorded.argv.includes('--set=window_end=2026-10-01 00:00:00 America/Denver'));
    assert.equal(recorded.sql, readOnlyTransaction(sql));
    writeFileSync(join(temp, 'psql'), `${fakePsql}\nprocess.exitCode = 3;\n`, { mode: 0o700 });
    const failed = spawnSync(process.execPath, [runner, '--month', '2026-09'], {
      cwd: temp, env: { ...env, PATH: `${temp}:${dirname(process.execPath)}` }, encoding: 'utf8',
    });
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, '');
    assert.equal(failed.stderr, 'psql failed; no counts emitted.\n');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
