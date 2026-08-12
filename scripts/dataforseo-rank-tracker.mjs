#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'data', 'rank-tracker', 'config.json');
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

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim() || null;

function itemDomain(item) {
  if (item?.domain) return normalizeDomain(item.domain) || null;
  if (!item?.url) return null;
  try {
    return normalizeDomain(new URL(item.url).hostname) || null;
  } catch {
    return null;
  }
}

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
    paidMapPackPresent: false,
    aiOverviewPresent: false,
    aiOverviewCited: false,
    organicLeaders: [],
    mapPackLeaders: [],
    paidMapPackLeaders: [],
    aiOverviewSources: [],
    serpFeatures: [],
  };
  let mapPosition = 0;
  let paidMapPosition = 0;
  const aiSourceKeys = new Set();

  for (const item of items) {
    if (item?.type) features.add(item.type);

    if (item?.type === 'organic' && reading.organicRank === null && sameDomain(item.domain || item.url, target.domain)) {
      reading.organicRank = item.rank_group ?? item.rank_absolute ?? null;
      reading.rankingUrl = item.url || null;
    }

    if (item?.type === 'organic') {
      const rank = item.rank_group ?? item.rank_absolute ?? null;
      if (Number.isInteger(rank) && rank >= 1 && rank <= 3) {
        reading.organicLeaders.push({
          rank,
          domain: itemDomain(item),
          url: item.url || null,
          title: cleanText(item.title),
          isTarget: sameDomain(item.domain || item.url, target.domain),
        });
      }
    }

    if (item?.type === 'local_pack') {
      const members = Array.isArray(item.items) && item.items.length ? item.items : [item];
      for (const member of members) {
        const isPaid = member?.is_paid === true || (member?.is_paid == null && item?.is_paid === true);
        if (isPaid) {
          reading.paidMapPackPresent = true;
          paidMapPosition += 1;
          if (paidMapPosition <= 3) {
            reading.paidMapPackLeaders.push({
              rank: paidMapPosition,
              name: cleanText(member.title || member.name),
              cid: member.cid ? String(member.cid) : null,
              domain: itemDomain(member),
              url: member.url || null,
              isTarget: sameBusiness(member, target),
            });
          }
          continue;
        }

        reading.mapPackPresent = true;
        mapPosition += 1;
        // The goal is organic Maps rank. Provider rank_group can count a paid
        // local placement ahead of the organic pack, so use the sequential
        // non-paid position after filtering is_paid=true.
        const rank = mapPosition;
        const isTarget = sameBusiness(member, target);
        if (reading.mapPackRank === null && isTarget) {
          reading.mapPackRank = rank;
        }
        if (Number.isInteger(rank) && rank >= 1 && rank <= 3) {
          reading.mapPackLeaders.push({
            rank,
            name: cleanText(member.title || member.name),
            cid: member.cid ? String(member.cid) : null,
            domain: itemDomain(member),
            url: member.url || null,
            isTarget,
          });
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
      for (const reference of references) {
        const domain = itemDomain(reference);
        const url = reference.url || null;
        const key = `${domain || ''}\n${url || ''}`;
        if ((!domain && !url) || aiSourceKeys.has(key) || reading.aiOverviewSources.length >= 10) continue;
        aiSourceKeys.add(key);
        reading.aiOverviewSources.push({
          domain,
          url,
          title: cleanText(reference.title),
          isTarget: referenceMatches(reference, target.domain),
        });
      }
    }
  }

  reading.organicLeaders.sort((a, b) => a.rank - b.rank);
  reading.organicLeaders = reading.organicLeaders.slice(0, 3);
  reading.mapPackLeaders.sort((a, b) => a.rank - b.rank);
  reading.mapPackLeaders = reading.mapPackLeaders.slice(0, 3);
  reading.paidMapPackLeaders.sort((a, b) => a.rank - b.rank);
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

export function validateRegistry(registry) {
  const errors = [];
  if (registry?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!registry?.registryId) errors.push('registryId is required');
  if (!Array.isArray(registry?.panels) || registry.panels.length === 0) errors.push('at least one panel is required');
  const ids = new Set();
  const paths = new Set();
  for (const panel of registry?.panels || []) {
    if (!panel?.id || !panel?.configPath) errors.push('every panel needs id and configPath');
    if (panel?.status && !['active', 'paused'].includes(panel.status)) errors.push(`invalid status for ${panel.id || 'panel'}: ${panel.status}`);
    if (ids.has(panel?.id)) errors.push(`duplicate panel id: ${panel.id}`);
    if (paths.has(panel?.configPath)) errors.push(`duplicate panel configPath: ${panel.configPath}`);
    ids.add(panel?.id);
    paths.add(panel?.configPath);
  }
  if (!(registry?.panels || []).some((panel) => panel.status !== 'paused')) errors.push('at least one panel must be active');
  if (errors.length) throw new Error(`Invalid rank tracker registry:\n- ${errors.join('\n- ')}`);
  return registry;
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

export function buildTaskMatrix(configs) {
  const tasks = configs.flatMap((config) => buildTasks(config));
  const tags = new Set();
  for (const task of tasks) {
    if (tags.has(task.tag)) throw new Error(`Duplicate keyword id across rank panels: ${task.tag}`);
    tags.add(task.tag);
  }
  return tasks;
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
    kind: config.reportKind || 'frame-slc-google-rank-baseline',
    panelId: config.panelId,
    observedAt,
    date,
    city: config.city || null,
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

export function markdownReport(report) {
  const rank = (value) => value === null ? `Not found in top ${report.provider.depth}` : `#${value}`;
  const rows = report.results.map((result) => (
    `| ${result.keyword} | ${rank(result.organicRank)} | ${rank(result.mapPackRank)} | ${result.aiOverviewPresent ? 'Yes' : 'No'} | ${result.aiOverviewCited ? 'Yes' : 'No'} |`
  ));
  const title = report.city ? `${report.city} Google rank tracker` : 'Salt Lake City Google rank tracker';
  const leaderLines = report.results.flatMap((result) => {
    const organic = result.organicLeaders.length
      ? result.organicLeaders.map((leader) => `#${leader.rank} ${leader.domain || leader.title || 'unknown'}${leader.isTarget ? ' (Frame)' : ''}`).join('; ')
      : 'not returned';
    const maps = result.mapPackLeaders.length
      ? result.mapPackLeaders.map((leader) => `#${leader.rank} ${leader.name || leader.domain || 'unknown'}${leader.cid ? ` [CID ${leader.cid}]` : ''}${leader.isTarget ? ' (Frame)' : ''}`).join('; ')
      : (result.mapPackPresent ? 'present, leaders not returned' : 'no local pack');
    const paidMaps = result.paidMapPackLeaders.length
      ? result.paidMapPackLeaders.map((leader) => `#${leader.rank} ${leader.name || leader.domain || 'unknown'}${leader.cid ? ` [CID ${leader.cid}]` : ''}${leader.isTarget ? ' (Frame)' : ''}`).join('; ')
      : 'none';
    const aio = result.aiOverviewSources.length
      ? result.aiOverviewSources.map((source) => `${source.domain || source.title || 'unknown'}${source.isTarget ? ' (Frame)' : ''}`).join('; ')
      : (result.aiOverviewPresent ? 'present, sources not returned' : 'no AI Overview');
    return [
      `### ${result.keyword}`,
      `- Organic top 3: ${organic}.`,
      `- Map-pack top 3: ${maps}.`,
      `- Paid local placements (excluded from Maps rank): ${paidMaps}.`,
      `- AI Overview sources: ${aio}.`,
      '',
    ];
  });
  return `# ${title} — ${report.date}\n\n`
    + `- Panel: \`${report.panelId}\`\n`
    + `- Provider: ${report.provider.name} ${report.provider.mode}\n`
    + `- Location: ${report.provider.locationName}\n`
    + `- Device/depth: ${report.provider.device} / top ${report.provider.depth}\n`
    + `- Observed: ${report.observedAt}\n`
    + `- Estimated panel cost: $${report.provider.estimatedPanelCostUsd.toFixed(4)}\n\n`
    + '| Query | Organic | Exact-CID map pack | AI Overview | Frame cited in AI Overview |\n'
    + '|---|---:|---:|---:|---:|\n'
    + `${rows.join('\n')}\n\n`
    + '## Displacement targets\n\n'
    + `${leaderLines.join('\n')}`
    + `> A missing rank means the exact target was not found within this fixed top-${report.provider.depth} mobile panel. It is not proof of visibility outside the measured depth or location.\n`;
}

async function atomicWrite(filePath, contents) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, contents, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function persistReport(report, outputDir) {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await fs.mkdir(outputDir, { recursive: true });
  await atomicWrite(path.join(outputDir, `${report.date}.json`), json);
  await atomicWrite(path.join(outputDir, 'latest.json'), json);
  await atomicWrite(path.join(outputDir, 'latest.md'), markdownReport(report));
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

async function fetchTaskQueue(configs) {
  const tasks = buildTaskMatrix(configs);
  const auth = credentials();
  const posted = await providerCall(TASK_POST, auth, { method: 'POST', body: tasks });
  const taskIds = new Map();
  for (const task of posted.tasks || []) {
    if (![20000, 20100].includes(task.status_code)) {
      throw new Error(`Provider rejected ${task.data?.tag || task.data?.keyword || 'task'}: ${task.status_code} ${task.status_message}`);
    }
    if (!task.id || !task.data?.tag) throw new Error('Provider did not return a task id and tag');
    taskIds.set(task.id, task.data.tag);
  }
  if (taskIds.size !== tasks.length) {
    throw new Error(`Provider accepted ${taskIds.size}/${tasks.length} tasks`);
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

function repoPath(relativeOrAbsolute) {
  const resolved = path.resolve(REPO_ROOT, relativeOrAbsolute);
  const relative = path.relative(REPO_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Rank tracker path must stay inside the repository: ${relativeOrAbsolute}`);
  }
  return resolved;
}

async function readConfig(configPath = DEFAULT_CONFIG_PATH) {
  return validateConfig(JSON.parse(await fs.readFile(configPath, 'utf8')));
}

function argValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`);
  return args[index + 1];
}

async function registryEntries(registryPath) {
  const registry = validateRegistry(JSON.parse(await fs.readFile(registryPath, 'utf8')));
  const entries = [];
  for (const panel of registry.panels.filter((candidate) => candidate.status !== 'paused')) {
    const configPath = repoPath(panel.configPath);
    const config = await readConfig(configPath);
    if (config.panelId !== panel.id) {
      throw new Error(`Registry id ${panel.id} does not match config panelId ${config.panelId}`);
    }
    entries.push({ config, configPath, outputDir: path.dirname(configPath) });
  }
  return { registry, entries };
}

async function main(args = process.argv.slice(2)) {
  const dryRun = args.includes('--dry-run');
  const registryArg = argValue(args, '--registry');
  const configArg = argValue(args, '--config');
  if (registryArg && configArg) throw new Error('Use either --registry or --config, not both');

  let entries;
  let label;
  if (registryArg) {
    const registryPath = repoPath(registryArg);
    const loaded = await registryEntries(registryPath);
    entries = loaded.entries;
    label = loaded.registry.registryId;
  } else {
    const configPath = configArg ? repoPath(configArg) : DEFAULT_CONFIG_PATH;
    entries = [{ config: await readConfig(configPath), configPath, outputDir: path.dirname(configPath) }];
    label = entries[0].config.panelId;
  }

  const queryCount = entries.reduce((sum, entry) => sum + entry.config.keywords.length, 0);
  const cost = entries.reduce((sum, entry) => sum + estimatedPanelCost(entry.config), 0);
  if (dryRun) {
    console.log(`Validated ${entries.length} panel(s) and ${queryCount} queries for ${label}.`);
    console.log(`Estimated complete-matrix cost: $${cost.toFixed(4)}.`);
    return;
  }

  // Submit every city in one provider batch, then collect every result before
  // writing any file. A failed or partial matrix leaves the previous complete
  // weekly matrix untouched.
  console.log(`Measuring ${entries.length} panel(s) and ${queryCount} queries in one task batch.`);
  const rawMatrix = await fetchTaskQueue(entries.map((entry) => entry.config));
  const reports = entries.map((entry) => ({
    report: buildReport(entry.config, rawMatrix),
    outputDir: entry.outputDir,
  }));
  for (const { report, outputDir } of reports) await persistReport(report, outputDir);
  for (const { report } of reports) {
    console.log(`Wrote complete ${report.date} ${report.panelId}: organic ${report.summary.organicRanked}/${report.summary.queries}, exact-CID map pack ${report.summary.mapPackMatched}/${report.summary.queries}, AIO citations ${report.summary.aiOverviewCitations}/${report.summary.queries}.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Rank tracker failed: ${error.message}`);
    process.exitCode = 1;
  });
}
