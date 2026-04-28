#!/usr/bin/env node
/**
 * Competitor TikTok scan via Apify.
 *
 * Pulls profile-level + recent-posts data for known DFW/Utah competitor
 * TikTok handles. Used to size the YouTube/TikTok line item.
 *
 * Cost: ~$0.30 per profile via clockworks/free-tiktok-scraper actor
 *       (5 Utah competitors = ~$1.50 per sweep)
 *
 * Required env: APIFY_TOKEN
 *   APIFY_TOKEN=... node scripts/competitor-tiktok.mjs
 *
 * Dry-run mode: if APIFY_TOKEN is unset, prints what it WOULD do, exits.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Utah roofing TikTok handles to track (verify before first run — these
// are best-guess; adjust as competitor research improves).
const TIKTOK_HANDLES = [
  '@roofingutah',
  '@utahroofingco',
  '@reignroofing',
  '@frameroofingutah',  // us — for own positioning
  '@wasatchroofing',    // placeholder — verify
];

const APIFY_TOKEN = process.env.APIFY_TOKEN;

async function runApifyActor(actorId, input) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!APIFY_TOKEN) {
    console.log('\n[competitor-tiktok] DRY RUN — APIFY_TOKEN not set');
    console.log(`  handles:        ${TIKTOK_HANDLES.join(', ')}`);
    console.log(`  est spend:      ~$${(TIKTOK_HANDLES.length * 0.30).toFixed(2)}`);
    console.log(`  actor:          clockworks/free-tiktok-scraper`);
    console.log(`  output:         data/competitor-tiktok-{date}.json`);
    console.log('\n  To fire: APIFY_TOKEN=... npm run competitor-tiktok\n');
    return;
  }

  console.log(`\n[competitor-tiktok] LIVE — pulling ${TIKTOK_HANDLES.length} TikTok profiles via Apify…`);

  const items = await runApifyActor('clockworks/free-tiktok-scraper', {
    profiles: TIKTOK_HANDLES,
    resultsPerPage: 30,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
  });

  // Aggregate per-handle stats
  const byHandle = {};
  for (const it of items) {
    const handle = it.authorMeta?.name ? `@${it.authorMeta.name}` : 'unknown';
    if (!byHandle[handle]) {
      byHandle[handle] = {
        handle,
        followers: it.authorMeta?.fans || 0,
        following: it.authorMeta?.following || 0,
        totalLikes: it.authorMeta?.heart || 0,
        verified: it.authorMeta?.verified || false,
        posts: [],
      };
    }
    byHandle[handle].posts.push({
      id: it.id,
      created: it.createTimeISO,
      caption: (it.text || '').slice(0, 200),
      views: it.playCount || 0,
      likes: it.diggCount || 0,
      shares: it.shareCount || 0,
      comments: it.commentCount || 0,
      url: it.webVideoUrl,
    });
  }

  const dataDir = join(PROJECT_ROOT, 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = join(dataDir, `competitor-tiktok-${date}.json`);
  writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), byHandle }, null, 2) + '\n');

  // Summary markdown
  const summary = [];
  summary.push(`# Frame Utah — Competitor TikTok Scan`);
  summary.push(`\n**Generated:** ${date}\n`);
  summary.push(`| Handle | Followers | Total likes | Posts (last 30) | Median views | Top post |`);
  summary.push(`|---|---|---|---|---|---|`);
  for (const h of Object.values(byHandle).sort((a, b) => b.followers - a.followers)) {
    const views = h.posts.map((p) => p.views).sort((a, b) => a - b);
    const median = views[Math.floor(views.length / 2)] || 0;
    const top = h.posts.sort((a, b) => b.views - a.views)[0];
    summary.push(`| ${h.handle} | ${h.followers.toLocaleString()} | ${h.totalLikes.toLocaleString()} | ${h.posts.length} | ${median.toLocaleString()} | ${top ? top.views.toLocaleString() + ' views' : '—'} |`);
  }
  const mdPath = join(dataDir, `competitor-tiktok-${date}.md`);
  writeFileSync(mdPath, summary.join('\n') + '\n');

  console.log(`\n[competitor-tiktok] done.`);
  console.log(`  json:  ${jsonPath}`);
  console.log(`  md:    ${mdPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
