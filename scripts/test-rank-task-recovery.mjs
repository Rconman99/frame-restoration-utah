import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertNoNewerRankReports, collectRankTasks, retryableRankTask, withRankCheckpointLock } from './lib/rank-task-recovery.mjs';

const tasks = [{ tag: 'slc-repair', keyword: 'roof repair salt lake city' }, { tag: 'slc-replace', keyword: 'roof replacement salt lake city' }];
const done = { tasks: [{ status_code: 20000, result: [{ items: [] }] }] };

test('older recovery cannot replace a newer latest or same-day report; equal replay is allowed', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rank-recovery-freshness-'));
  const candidate = { report: { date: '2026-09-08', observedAt: '2026-09-08T21:00:00Z' }, outputDir: directory };
  try {
    await assertNoNewerRankReports([candidate]);
    for (const name of ['latest.json', '2026-09-08.json']) {
      const target = path.join(directory, name);
      await fs.writeFile(target, JSON.stringify({ observedAt: '2026-09-08T22:00:00Z' }));
      await assert.rejects(assertNoNewerRankReports([candidate]), /newer/);
      await fs.writeFile(target, JSON.stringify(candidate.report));
      await assertNoNewerRankReports([candidate]);
      await fs.unlink(target);
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('one checkpoint writer at a time, including resume; controlled failure releases lock', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rank-recovery-lock-'));
  const checkpointPath = path.join(directory, 'checkpoint.json');
  try {
    let competingCalls = 0;
    await withRankCheckpointLock(checkpointPath, async () => {
      await assert.rejects(withRankCheckpointLock(checkpointPath, async () => { competingCalls++; }), /locked/);
    });
    assert.equal(competingCalls, 0);
    await assert.rejects(withRankCheckpointLock(checkpointPath, async () => { throw new Error('controlled failure'); }), /controlled/);
    await withRankCheckpointLock(checkpointPath, async () => { competingCalls++; });
    assert.equal(competingCalls, 1);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
function harness(handler) {
  let time = Date.parse('2026-09-08T21:00:00Z');
  const h = { saved: null, calls: [], snapshots: [] };
  h.options = {
    now: () => time, sleep: async (ms) => { time += ms; }, pollMs: 1, timeoutMs: 4,
    save: async (state) => { h.saved = structuredClone(state); h.snapshots.push(h.saved); },
    call: async (endpoint, options = {}) => {
      h.calls.push({ endpoint, ...options });
      if (options.method === 'POST' && options.body.length === 2) {
        assert.equal(h.saved.phase, 'submitting');
        return { tasks: tasks.map((task, i) => ({ id: `task-${i}`, data: task, status_code: 20100 })) };
      }
      return handler(endpoint, options, h);
    },
  };
  return h;
}

test('complete matrix is saved; observation time remains the original collection time', async () => {
  const h = harness(() => done);
  const result = await collectRankTasks(tasks, h.options);
  assert.equal(result.rawResults.size, 2);
  assert.equal(h.saved.phase, 'complete');
  assert.equal(result.observedAt, '2026-09-08T21:00:00.000Z');
  assert.equal(h.calls.filter((call) => call.method === 'POST').length, 1);
});

test('interrupted collection resumes known IDs without buying again or re-fetching saved results', async () => {
  const h = harness((endpoint) => {
    if (endpoint.endsWith('task-1')) throw new Error('network interruption');
    return done;
  });
  await assert.rejects(collectRankTasks(tasks, h.options), /network interruption/);
  assert.ok(h.saved.entries[0].result);
  const checkpoint = structuredClone(h.saved);
  const recovered = harness(() => done);
  const result = await collectRankTasks(tasks, { ...recovered.options, checkpoint });
  assert.equal(result.rawResults.size, 2);
  assert.equal(recovered.calls.length, 1);
  assert.ok(recovered.calls[0].endpoint.endsWith('task-1'));
  assert.equal(recovered.calls[0].method, undefined);
});

test('40106 partial SERP retries only that keyword and never stores its partial items', async () => {
  const h = harness((endpoint, options, state) => {
    if (options.method === 'POST') {
      assert.equal(options.body.length, 1);
      assert.equal(options.body[0].tag, 'slc-replace');
      assert.equal(state.saved.phase, 'reposting');
      return { tasks: [{ id: 'replacement-1', status_code: 20100, data: tasks[1] }] };
    }
    return endpoint.endsWith('task-1') ? { tasks: [{ status_code: 40106, result: [{ items: [{ partial: true }] }] }] } : done;
  });
  const result = await collectRankTasks(tasks, h.options);
  assert.equal(h.calls.filter((call) => call.method === 'POST').length, 2);
  assert.deepEqual(result.rawResults.get('slc-replace').items, []);
  assert.equal(h.saved.entries[1].reposts, 1);
});

test('permanent provider failures never trigger paid reposts', async () => {
  for (const code of [40100, 40104, 40200, 40210, 40501]) {
    assert.equal(retryableRankTask(code, 'temporary'), false);
    const h = harness(() => ({ tasks: [{ status_code: code }] }));
    await assert.rejects(collectRankTasks(tasks, h.options), /failed/);
    assert.equal(h.calls.filter((call) => call.method === 'POST').length, 1);
  }
});

test('ambiguous paid POST stays fail-closed on resume', async () => {
  const h = harness(() => done);
  await assert.rejects(collectRankTasks(tasks, { ...h.options, call: async () => { throw new Error('lost POST response'); } }), /lost POST/);
  assert.equal(h.saved.phase, 'submitting');
  let calls = 0;
  await assert.rejects(collectRankTasks(tasks, { ...h.options, checkpoint: h.saved, call: async () => { calls++; } }), /Ambiguous/);
  assert.equal(calls, 0);
});

test('timeouts preserve successes but do not produce a complete matrix', async () => {
  const h = harness((endpoint) => endpoint.endsWith('task-0') ? done : { tasks: [{ status_code: 40602 }] });
  await assert.rejects(collectRankTasks(tasks, h.options), /Timed out/);
  assert.equal(h.saved.phase, 'collecting');
  assert.ok(h.saved.entries[0].result);
  assert.equal(h.saved.entries[1].result, undefined);
});

test('mismatched, stale, future, duplicate-ID and invalid-path checkpoints are rejected before any provider call', async () => {
  const h = harness(() => done);
  await collectRankTasks(tasks, h.options);
  for (const mutate of [
    (state) => { state.fingerprint = 'wrong'; },
    (state) => { state.observedAt = '2026-09-06T21:00:00Z'; },
    (state) => { state.observedAt = '2026-09-10T21:00:00Z'; },
    (state) => { state.entries[0].id = state.entries[1].id; },
    (state) => { state.entries[0].id = '../../account'; },
    (state) => { state.entries[0].tag = state.entries[1].tag; },
    (state) => { state.entries[0].statusCode = 40106; },
  ]) {
    const state = structuredClone(h.saved);
    mutate(state);
    let calls = 0;
    await assert.rejects(collectRankTasks(tasks, { ...h.options, checkpoint: state, call: async () => { calls++; } }));
    assert.equal(calls, 0);
  }
});

test('provider batch registry must match the exact unique IDs and tags', async () => {
  const h = harness(() => done);
  await assert.rejects(collectRankTasks(tasks, { ...h.options, call: async () => ({ tasks: tasks.map(() => ({ id: 'same', data: tasks[0], status_code: 20100 })) }) }), /exact task matrix/);
  assert.equal(h.saved.phase, 'rejected');
});

test('a completed checkpoint can recreate reports with no network or changed timestamp', async () => {
  const h = harness(() => done);
  await collectRankTasks(tasks, h.options);
  let calls = 0;
  const result = await collectRankTasks(tasks, { ...h.options, checkpoint: h.saved, call: async () => { calls++; } });
  assert.equal(calls, 0);
  assert.equal(result.observedAt, h.saved.observedAt);
});

test('recovery cannot cross its age limit while waiting for a result', async () => {
  const h = harness(() => done);
  await collectRankTasks(tasks, h.options);
  const checkpoint = structuredClone(h.saved);
  checkpoint.phase = 'collecting';
  delete checkpoint.entries[0].result;
  let time = Date.parse(checkpoint.observedAt) + 24 * 60 * 60_000 - 60_000;
  await assert.rejects(collectRankTasks(tasks, {
    ...h.options, checkpoint, now: () => time, timeoutMs: 24 * 60_000,
    call: async () => { time += 90_000; return done; },
  }), /crossed the 24-hour/);
  assert.equal(h.saved.phase, 'collecting');
});

test('a lost replacement POST response refuses another paid POST on resume', async () => {
  const h = harness((endpoint, options) => {
    if (options.method === 'POST') throw new Error('lost replacement');
    return { tasks: [{ status_code: 40106 }] };
  });
  await assert.rejects(collectRankTasks(tasks, h.options), /lost replacement/);
  assert.equal(h.saved.phase, 'reposting');
  let calls = 0;
  await assert.rejects(collectRankTasks(tasks, { ...h.options, checkpoint: h.saved, call: async () => { calls++; } }), /Ambiguous/);
  assert.equal(calls, 0);
});

test('both CI entry points block paid reruns and require actual checkpoint artifacts', async () => {
  for (const filename of ['rank-tracker.yml', 'slv-expansion-baseline.yml']) {
    const source = await fs.readFile(new URL(`../.github/workflows/${filename}`, import.meta.url), 'utf8');
    assert.match(source, /if: github\.run_attempt != 1[\s\S]*?exit 1/);
    assert.ok(source.indexOf('Refuse paid batch replay') < source.indexOf('DATAFORSEO_LOGIN:'));
    assert.match(source, /name: Preserve actual current-run recovery checkpoint[\s\S]*?path: data\/rank-tracker\/recovery\/checkpoint\.json[\s\S]*?if-no-files-found: error/);
    assert.match(source, /Collection outcome:.*steps\.collect\.outcome/);
  }
});

test('repost budget persists through recovery and cannot exceed two per keyword', async () => {
  let replacement = 0;
  const h = harness((endpoint, options) => options.method === 'POST'
    ? { tasks: [{ id: `replacement-${++replacement}`, status_code: 20100, data: tasks[0] }] }
    : endpoint.endsWith('task-1') ? done : { tasks: [{ status_code: 40106 }] });
  await assert.rejects(collectRankTasks(tasks, h.options), /failed/);
  assert.equal(replacement, 2);
  const recovered = harness(() => ({ tasks: [{ status_code: 40106 }] }));
  await assert.rejects(collectRankTasks(tasks, { ...recovered.options, checkpoint: h.saved }), /failed/);
  assert.equal(recovered.calls.filter((call) => call.method === 'POST').length, 0);
});
