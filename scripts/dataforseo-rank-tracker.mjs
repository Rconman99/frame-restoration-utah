#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'data', 'rank-tracker', 'config.json');
const OUTPUT_DIR = path.dirname(CONFIG_PATH);
const API_ROOT = 'https://api.dataforseo.com/v3';
const TASK_POST = '/serp/google/organic/task_post';
const TASKS_READY = '/serp/google/organic/tasks_ready';
const TASK_GET = '/serp/google/organic/task_get/advanced';
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 20 * 60_000;

const normalizeDomain = (value) => String(value || '')
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/^www\./, '')
  .split('/')[0];

const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10);

function sameDomain(candidate, target) {
  const actual = normalizeDomain(candidate);
  const expected = normalizeDomain(target);
  return Boolean(actual && expected && (actual === expected || actual.endsWith(`.${expected}`)));
}

function referenceMatches(reference, domain) {
  if (sameDomain(reference?.domain, domain)) return true;
  if (!reference?.url) return false;
  try {
    return sameDomain(new URL(reference.url).hostname, domain);
  } catch {
    return false;
  }
}

function sameBusiness(item, target) {
  if (target.gbpCid) return String(item?.cid || '') === String(target.gbpCid);
  const expectedPhone = normalizePhone(target.phone);
  return Boolean(expectedPhone) && normalizePhone(item?.phone) === expectedPhone;
}

export function extractRank(result, target) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const features = new Set();
  const reading = {
    organicRank: null,
    rankingUrl: null,
    mapPackPresent: false,
    mapPackRank: null,
    aiOverviewPresent: false,
    aiOverviewCited: false,
    serpFeatures: [],
  };
  let mapPosition = 0;

  for (const item of items) {
    if (item?.type) features.add(item.type);

    if (item?.type === 'organic' && reading.organicRank === null && sameDomain(item.domain, target.domain)) {
      reading.organicRank = item.rank_group ?? item.rank_absolute ?? null;
      reading.rankingUrl = item.url || null;
    }

    if (item?.type === 'local_pack') {
      reading.mapPackPresent = true;
      const members = Array.isArray(item.items) && item.items.length ? item.items : [item];
      for (const member of members) {
        mapPosition += 1;
        if (reading.mapPackRank === null && sameBusiness(member, target)) {
          reading.mapPackRank = member.rank_group ?? mapPosition;
        }
      }
    }

    if (item?.type === 'ai_overview') {
      reading.aiOverviewPresent = true;
      const nestedItems = Array.isArray(item.items) ? item.items : [];
      const references = [
        ...(Array.isArray(item.references) ? item.references : []),
        ...nestedItems.flatMap((nested) => Array.isArray(nested.references) ? nested.references : []),
      ];
      reading.aiOverviewCited ||= references.some((reference) => referenceMatches(reference, target.domain));
    }
  }

  reading.serpFeatures = [...features].filter((type) => type !== 'organic').sort();
  return reading;
}

export function validateConfig(config) {
  const errors = [];
  if (config?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!config?.panelId) errors.push('panelId is required');
  if (!config?.locationName) errors.push('locationName is required');
  if (!Number.isInteger(config?.depth) || config.depth < 10) errors.push('depth must be an integer of at least 10');
  if (!config?.target?.domain) errors.push('target.domain is required');
  if (!config?.target?.gbpCid && !config?.target?.phone) errors.push('target.gbpCid or target.phone is required for exact map-pack attribution');
  if (!Array.isArray(config?.keywords) || config.keywords.length === 0) errors.push('at least one keyword is required');
  const ids = new Set();
  for (const keyword of config?.keywords || []) {
    if (!keyword?.id || !keyword?.keyword) errors.push('every keyword needs id and keyword');
    if (ids.has(keyword?.id)) errors.push(`duplicate keyword id: ${keyword.id}`);
    ids.add(keyword?.id);
  }
  if (errors.length) throw new Error(`Invalid rank tracker config:\n- ${errors.join('\n- ')}`);
  return config;
}

export function buildTasks(config) {
  return config.keywords.map(({ id, keyword }) => ({
    keyword,
    location_name: config.locationName,
    language_code: config.languageCode,
    device: config.device,
    os: config.os,
    depth: config.depth,
    load_async_ai_overview: Boolean(config.loadAsyncAiOverview),
    tag: id,
  }));
}

export function estimatedPanelCost(config) {
  const queueBase = 0.0006;
  const depthCost = queueBase * Math.max(1, Math.ceil(config.depth / 10));
  const asyncAiCost = config.loadAsyncAiOverview ? queueBase : 0;
  return Number(((depthCost + asyncAiCost) * config.keywords.length).toFixed(4));
}

export function buildReport(config, rawResults, observedAt = new Date().toISOString()) {
  const results = config.keywords.map(({ id, keyword }) => {
    if (!rawResults.has(id)) throw new Error(`No complete provider result for ${id}`);
    return { id, keyword, ...extractRank(rawResults.get(id), config.target) };
  });
  const date = observedAt.slice(0, 10);
  return {
    schemaVersion: 1,
    kind: 'frame-slc-google-rank-baseline',
    panelId: config.panelId,
    observedAt,
    date,
    market: config.market,
    service: config.service,
    provider: {
      name: config.provider,
      mode: config.mode,
      device: config.device,
      os: config.os,
      depth: config.depth,
      locationName: config.locationName,
      estimatedPanelCostUsd: estimatedPanelCost(config),
    },
    target: { ...config.target },
    summary: {
      queries: results.length,
      organicRanked: results.filter((result) => result.organicRank !== null).length,
      mapPackMatched: results.filter((result) => result.mapPackRank !== null).length,
      aiOverviewsPresent: results.filter((result) => result.aiOverviewPresent).length,
      aiOverviewCitations: results.filter((result) => result.aiOverviewCited).length,
    },
    results,
  };
}

function markdownReport(report) {
  const rank = (value) => value === null ? 'Not found in top 30' : `#${value}`;
  const rows = report.results.map((result) => (
    `| ${result.keyword} | ${rank(result.organicRank)} | ${rank(result.mapPackRank)} | ${result.aiOverviewPresent ? 'Yes' : 'No'} | ${result.aiOverviewCited ? 'Yes' : 'No'} |`
  ));
  return `# Salt Lake City Google rank tracker — ${report.date}\n\n`
    + `- Panel: \`${report.panelId}\`\n`
    + `- Provider: ${report.provider.name} ${report.provider.mode}\n`
    + `- Location: ${report.provider.locationName}\n`
    + `- Device/depth: ${report.provider.device} / top ${report.provider.depth}\n`
    + `- Observed: ${report.observedAt}\n`
    + `- Estimated panel cost: $${report.provider.estimatedPanelCostUsd.toFixed(4)}\n\n`
    + '| Query | Organic | Exact-CID map pack | AI Overview | Frame cited in AI Overview |\n'
    + '|---|---:|---:|---:|---:|\n'
    + `${rows.join('\n')}\n\n`
    + '> A missing rank means the exact target was not found within this fixed top-30 mobile panel. It is not proof of visibility outside the measured depth or location.\n';
}

async function atomicWrite(filePath, contents) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, contents, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function persistReport(report) {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await atomicWrite(path.join(OUTPUT_DIR, `${report.date}.json`), json);
  await atomicWrite(path.join(OUTPUT_DIR, 'latest.json'), json);
  await atomicWrite(path.join(OUTPUT_DIR, 'latest.md'), markdownReport(report));
}

function credentials() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required');
  return Buffer.from(`${login}:${password}`).toString('base64');
}

async function providerCall(endpoint, auth, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${API_ROOT}${endpoint}`, {
        method: options.method || 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(60_000),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
      const json = JSON.parse(body);
      if (json.status_code && json.status_code !== 20000) {
        throw new Error(`${json.status_code} ${json.status_message || 'provider error'}`);
      }
      return json;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw new Error(`DataForSEO ${endpoint} failed after 3 attempts: ${lastError.message}`);
}

async function fetchTaskQueue(config) {
  const auth = credentials();
  const posted = await providerCall(TASK_POST, auth, { method: 'POST', body: buildTasks(config) });
  const taskIds = new Map();
  for (const task of posted.tasks || []) {
    if (![20000, 20100].includes(task.status_code)) {
      throw new Error(`Provider rejected ${task.data?.tag || task.data?.keyword || 'task'}: ${task.status_code} ${task.status_message}`);
    }
    if (!task.id || !task.data?.tag) throw new Error('Provider did not return a task id and tag');
    taskIds.set(task.id, task.data.tag);
  }
  if (taskIds.size !== config.keywords.length) {
    throw new Error(`Provider accepted ${taskIds.size}/${config.keywords.length} tasks`);
  }

  const pending = new Set(taskIds.keys());
  const rawResults = new Map();
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  console.log(`Posted ${pending.size} task(s); waiting for the complete panel.`);

  while (pending.size && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const ready = await providerCall(TASKS_READY, auth);
    const readyIds = (ready.tasks?.[0]?.result || [])
      .map((item) => item.id)
      .filter((id) => pending.has(id));

    for (const taskId of readyIds) {
      const response = await providerCall(`${TASK_GET}/${taskId}`, auth);
      const task = response.tasks?.[0];
      if (task?.status_code && task.status_code !== 20000) {
        throw new Error(`Provider task ${taskId} failed: ${task.status_code} ${task.status_message}`);
      }
      const result = task?.result?.[0];
      if (!result || !Array.isArray(result.items)) throw new Error(`Provider task ${taskId} returned no complete SERP result`);
      rawResults.set(taskIds.get(taskId), result);
      pending.delete(taskId);
    }
    console.log(`Collected ${rawResults.size}/${taskIds.size}; ${pending.size} pending.`);
  }

  if (pending.size) throw new Error(`Timed out with ${pending.size} task(s) pending; no report was written`);
  return rawResults;
}

async function readConfig() {
  return validateConfig(JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8')));
}

async function main() {
  const config = await readConfig();
  if (process.argv.includes('--dry-run')) {
    console.log(`Validated ${config.keywords.length} queries for ${config.locationName}.`);
    console.log(`Estimated panel cost: $${estimatedPanelCost(config).toFixed(4)}.`);
    return;
  }
  const report = buildReport(config, await fetchTaskQueue(config));
  await persistReport(report);
  console.log(`Wrote complete ${report.date} panel: organic ${report.summary.organicRanked}/${report.summary.queries}, exact-CID map pack ${report.summary.mapPackMatched}/${report.summary.queries}, AIO citations ${report.summary.aiOverviewCitations}/${report.summary.queries}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Rank tracker failed: ${error.message}`);
    process.exitCode = 1;
  });
}
