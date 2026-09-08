import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const POST = '/serp/google/organic/task_post';
const GET = '/serp/google/organic/task_get/advanced';
const ID = /^[a-zA-Z0-9-]+$/;
const MAX_AGE_MS = 24 * 60 * 60_000;

export async function withRankCheckpointLock(checkpointPath, operation) {
  const lockPath = `${checkpointPath}.lock`;
  let handle;
  try { handle = await fs.open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Checkpoint is locked by another run; verify it stopped before manually recovering the lock');
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await operation();
  } finally {
    await handle.close();
    await fs.unlink(lockPath);
  }
}

export async function assertNoNewerRankReports(reports) {
  // Preflight ALL destinations before any one panel is promoted.
  for (const { report, outputDir } of reports) {
    const observedAt = Date.parse(report.observedAt);
    if (!Number.isFinite(observedAt)) throw new Error('Invalid candidate observation timestamp');
    for (const name of ['latest.json', `${report.date}.json`]) {
      let existing;
      try { existing = JSON.parse(await fs.readFile(path.join(outputDir, name), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const previous = Date.parse(existing.observedAt);
      if (!Number.isFinite(previous) || previous > observedAt) {
        throw new Error(`Refusing to overwrite newer or invalid observation in ${path.join(outputDir, name)}`);
      }
    }
  }
}

export function retryableRankTask(code, message) {
  // 40106 is a completed but partial SERP, NOT a complete rank observation.
  // Documented at https://docs.dataforseo.com/v3/appendix/errors/.
  if (code != null) return [40101, 40103, 40106].includes(code);
  return /internal se server error|internal error|timeout|temporar/iu.test(String(message || ''));
}

// Checkpoints contain public SERPs and provider task IDs, never credentials.
// Persist before every paid POST: a lost response must not silently buy twice.
export async function collectRankTasks(tasks, {
  call, save, checkpoint = null, now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 24 * 60_000, pollMs = 15_000,
}) {
  const fingerprint = createHash('sha256').update(JSON.stringify(tasks)).digest('hex');
  const expected = new Set(tasks.map((task) => task.tag));
  if (expected.size !== tasks.length) throw new Error('Duplicate task tags');
  let state = checkpoint;
  if (state) {
    if (state.version !== 1 || state.fingerprint !== fingerprint) throw new Error('Checkpoint does not match the fixed panel');
    const age = now() - Date.parse(state.observedAt);
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) throw new Error('Checkpoint is outside the 24-hour recovery window');
    if (state.phase !== 'collecting' && state.phase !== 'complete') throw new Error('Ambiguous or rejected submission: reconcile provider task IDs before resuming; no POST made');
    if (!Array.isArray(state.entries) || state.entries.length !== tasks.length) throw new Error('Incomplete checkpoint task registry');
    const tags = new Set();
    const ids = new Set();
    for (const entry of state.entries) {
      if (!expected.has(entry.tag) || tags.has(entry.tag) || !ID.test(entry.id || '') || ids.has(entry.id)
          || !Number.isInteger(entry.reposts) || entry.reposts < 0 || entry.reposts > 2
          || (entry.result != null && (entry.statusCode !== 20000 || !Array.isArray(entry.result.items)))) throw new Error('Invalid checkpoint entry');
      tags.add(entry.tag);
      ids.add(entry.id);
    }
  } else {
    state = { version: 1, fingerprint, observedAt: new Date(now()).toISOString(), phase: 'submitting', entries: [] };
    await save(state);
    const posted = await call(POST, { method: 'POST', body: tasks });
    // Preserve accepted IDs even when a different task in the batch is rejected.
    state.entries = (posted.tasks || []).map((task) => ({
      id: task.id, tag: task.data?.tag, reposts: 0, statusCode: task.status_code,
    }));
    state.phase = 'rejected';
    await save(state);
    const tags = new Set(state.entries.map((entry) => entry.tag));
    const ids = new Set(state.entries.map((entry) => entry.id));
    if (state.entries.length !== tasks.length || tags.size !== tasks.length || ids.size !== tasks.length
        || state.entries.some((entry) => !expected.has(entry.tag) || !ID.test(entry.id || '') || ![20000, 20100].includes(entry.statusCode))) {
      throw new Error('Provider did not accept the exact task matrix; accepted IDs saved for reconciliation');
    }
    state.phase = 'collecting';
    await save(state);
  }

  const expiresAt = Date.parse(state.observedAt) + MAX_AGE_MS;
  const deadline = Math.min(now() + timeoutMs, expiresAt);
  const payloads = new Map(tasks.map((task) => [task.tag, task]));
  while (state.entries.some((entry) => !entry.result) && now() < deadline) {
    // Direct GET also recovers tasks already fetched by an interrupted process;
    // tasks_ready omits those. Result retrieval is not a new paid submission.
    for (const entry of state.entries.filter((candidate) => !candidate.result)) {
      if (now() >= deadline) break;
      const response = await call(`${GET}/${entry.id}`);
      const task = response.tasks?.[0];
      entry.statusCode = task?.status_code ?? null;
      await save(state);
      if ([40601, 40602].includes(entry.statusCode)) continue;
      if (entry.statusCode !== 20000) {
        if (!retryableRankTask(entry.statusCode, task?.status_message) || entry.reposts >= 2) {
          throw new Error(`Provider task ${entry.id} failed: ${entry.statusCode}; completed results remain in checkpoint`);
        }
        state.phase = 'reposting';
        entry.reposts += 1;
        await save(state);
        const posted = await call(POST, { method: 'POST', body: [payloads.get(entry.tag)] });
        const replacement = posted.tasks?.[0];
        if (posted.tasks?.length !== 1 || !ID.test(replacement?.id || '')
            || state.entries.some((candidate) => candidate.id === replacement.id)
            || ![20000, 20100].includes(replacement.status_code)
            || replacement.data?.tag !== entry.tag) throw new Error('Replacement submission needs reconciliation; no automatic resubmission');
        entry.id = replacement.id;
        entry.statusCode = replacement.status_code;
        state.phase = 'collecting';
        await save(state);
        continue;
      }
      const result = task?.result?.[0];
      if (!result || !Array.isArray(result.items)) throw new Error(`Provider task ${entry.id} returned no complete SERP result`);
      entry.result = result;
      await save(state);
    }
    if (state.entries.some((entry) => !entry.result)) await sleep(pollMs);
  }
  if (now() >= expiresAt) throw new Error('Checkpoint crossed the 24-hour recovery window; no report written');
  if (state.entries.some((entry) => !entry.result)) throw new Error('Timed out; completed results saved, no complete report written');
  state.phase = 'complete';
  await save(state);
  return { rawResults: new Map(state.entries.map((entry) => [entry.tag, entry.result])), observedAt: state.observedAt };
}
