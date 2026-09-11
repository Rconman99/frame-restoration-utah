#!/usr/bin/env node
// Read-only rollout proof; a green collection workflow or draft PR is not release proof.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function comparePublication(expected, actual, pages) {
  const failures = [];
  if (String(expected.google_cid) !== '8458659884566588108') failures.push('Expected feed is not the Heber profile');
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push('Published review feed differs from the verified snapshot');
  const count = expected.aggregate?.review_count;
  if (!Number.isInteger(count) || count < 1) failures.push('Invalid expected review count');
  for (const [path, html] of Object.entries(pages)) {
    if (!html.includes(`data-surface-marker="google-reviews-${count}"`)) failures.push(`${path}: current review marker missing`);
    const counts = [...html.matchAll(/\b(\d+) Google [Rr]eviews\b/g)].map(m => Number(m[1]));
    if (!counts.length || counts.some(n => n !== count)) failures.push(`${path}: visible review count is absent or stale`);
  }
  if (!Object.hasOwn(pages, '/') || !Object.hasOwn(pages, '/pages/about')) failures.push('Both public review-count pages must be checked');
  return failures;
}

async function main() {
  const expected = JSON.parse(fs.readFileSync(new URL('../reviews.json', import.meta.url), 'utf8'));
  const origin = 'https://www.framerestorationutah.com';
  async function read(path) {
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(30000), redirect: 'error', headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.text();
  }
  const [raw, home, about] = await Promise.all([read('/reviews.json'), read('/'), read('/pages/about')]);
  const failures = comparePublication(expected, JSON.parse(raw), { '/': home, '/pages/about': about });
  console.log(JSON.stringify({ observedAt: new Date().toISOString(), origin, googleCid: expected.google_cid,
    expectedAggregate: expected.aggregate, expectedUpdatedAt: expected.updated_at,
    status: failures.length ? 'PENDING_RELEASE_OR_DRIFT' : 'PUBLISHED_PARITY_PASS', failures,
    readOnly: true, renderedVerificationStillRequired: true }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(`Review publication UNVERIFIED: ${error.message}`); process.exitCode = 1;
});
