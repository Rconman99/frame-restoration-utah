#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);

function usage() {
  console.error('Usage: node scripts/audit-route-batch.mjs [--manifest path/to/manifest.json] [file ...]');
  process.exit(2);
}

let manifestPath = null;
const explicitFiles = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--manifest') {
    manifestPath = args[i + 1];
    i += 1;
    if (!manifestPath) usage();
  } else if (args[i] === '--help' || args[i] === '-h') {
    usage();
  } else {
    explicitFiles.push(args[i]);
  }
}

let manifest = {};
if (manifestPath) {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

const routeFiles = (manifest.newRoutes || []).map((route) => route.file).filter(Boolean);
const sharedFiles = manifest.sharedFiles || [];
const extraFiles = manifest.extraFiles || [];
const files = [...new Set([...routeFiles, ...sharedFiles, ...extraFiles, ...explicitFiles])];

if (files.length === 0) usage();

const issues = [];
const warnings = [];

function addIssue(file, message) {
  issues.push({ file, message });
}

function addWarning(file, message) {
  warnings.push({ file, message });
}

function existsLocalRoute(href) {
  const target = href.split('#')[0].split('?')[0];
  if (!target) return true;
  const clean = target.replace(/^\/+/, '').replace(/\/+$/, '');
  const candidates = [
    clean,
    `${clean}.html`,
    path.join(clean, 'index.html')
  ];
  if (candidates.some((candidate) => fs.existsSync(candidate))) return true;

  if (fs.existsSync('vercel.json')) {
    try {
      const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
      const redirects = [...(vercel.redirects || []), ...(vercel.rewrites || [])];
      const normalizedTarget = `/${clean}`;
      if (redirects.some((entry) => {
        if (entry.has?.length) return false;
        return vercelSourceMatches(entry.source, normalizedTarget)
          || vercelSourceMatches(entry.source, `${normalizedTarget}/`);
      })) {
        return true;
      }
    } catch {
      addWarning('vercel.json', 'Could not parse vercel.json while checking redirects.');
    }
  }

  return false;
}

function vercelSourceMatches(source, target) {
  if (source === target) return true;
  const sourceParts = source.replace(/\/+$/, '').split('/').filter(Boolean);
  const targetParts = target.replace(/\/+$/, '').split('/').filter(Boolean);

  for (let i = 0; i < sourceParts.length; i += 1) {
    const sourcePart = sourceParts[i];
    const targetPart = targetParts[i];

    if (sourcePart.startsWith(':') && (sourcePart.endsWith('*') || sourcePart.includes('(.*)'))) {
      return true;
    }
    if (targetPart === undefined) return false;
    if (sourcePart.startsWith(':')) continue;
    if (sourcePart !== targetPart) return false;
  }

  return sourceParts.length === targetParts.length;
}

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function extractAttrs(html, tag, attr) {
  const values = [];
  const re = new RegExp(`<${tag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, 'gi');
  let match;
  while ((match = re.exec(html)) !== null) {
    values.push(match[1]);
  }
  return values;
}

function checkLeakage(file, html) {
  const leakagePatterns = [
    ['Utah leakage', /\butah\b|\bsalt lake\b|\bpark city\b|\borem\b|\bprovo\b|\bwasatch\b|\bmormon\b/i],
    ['Lon Smith mention', /\blon smith\b/i],
    ['disputed project photo reference', /plano-commercial-reroof|mckinney-storm-damage-reroof|McKinney commercial/i]
  ];

  const unsafeCopyPatterns = [
    ['claim outcome promise', /approved claim|claim approved|guaranteed approval|guaranteed coverage|guarantee(?:d)? claim/i],
    ['deductible waiver pitch', /waive (?:your )?deductible|free deductible/i],
    ['response-time promise', /\b24\/7\b|\bsame-day\b|\bimmediate response\b/i],
    // Forbidden compliance terms (zero tolerance, site-wide) — secondary guard mirroring
    // scripts/audit-compliance-words.mjs. Frame is the TDI-compliant alternative; never name
    // "public adjuster" or use the "negotiate" family in user-facing copy.
    ['forbidden term: public adjuster', /\bpublic[- ]adjust(?:er|ers|ing)\b/i],
    ['forbidden term: negotiate', /\bnegotiat(?:e|es|ed|ing|ion|ions)\b/i],
    ['Texas licensing contradiction', /licensed\s*&\s*insured|licensed and insured in texas/i]
  ];

  for (const [label, pattern] of [...leakagePatterns, ...unsafeCopyPatterns]) {
    const match = html.match(pattern);
    if (match) addIssue(file, `${label}: "${match[0]}"`);
  }

  if (!manifest.allowDollarAmounts && /\$[0-9]/.test(html)) {
    addIssue(file, 'Dollar amount found while allowDollarAmounts=false.');
  }
}

function checkFile(file) {
  if (!fs.existsSync(file)) {
    addIssue(file, 'File does not exist.');
    return;
  }

  const html = fs.readFileSync(file, 'utf8');
  const htmlForLeakage = html.replace(/<!--[\s\S]*?-->/g, ' ');
  checkLeakage(file, htmlForLeakage);

  const blocks = extractJsonLd(html);
  if (blocks.length === 0 && file.endsWith('.html')) {
    addWarning(file, 'No JSON-LD blocks found.');
  }

  const types = [];
  blocks.forEach((block, index) => {
    try {
      const parsed = JSON.parse(block);
      types.push(parsed['@type']);
    } catch (error) {
      addIssue(file, `JSON-LD block ${index + 1} does not parse: ${error.message}`);
    }
  });

  const route = (manifest.newRoutes || []).find((item) => item.file === file);
  if (route) {
    for (const expectedType of route.expectedJsonLdTypes || []) {
      if (!types.includes(expectedType)) addIssue(file, `Missing expected JSON-LD type: ${expectedType}`);
    }
    if (route.canonical && !html.includes(`rel="canonical" href="${route.canonical}"`)) {
      addIssue(file, `Missing canonical URL: ${route.canonical}`);
    }
  }

  const links = extractAttrs(html, 'a', 'href');
  for (const href of links) {
    if (/^(https?:|tel:|sms:|mailto:|#)/i.test(href)) continue;
    if (!existsLocalRoute(href)) addIssue(file, `Broken local link: ${href}`);
  }

  const images = extractAttrs(html, 'img', 'src');
  for (const src of images) {
    if (/^(https?:|data:|blob:)/i.test(src)) continue;
    const imagePath = src.replace(/^\/+/, '');
    if (!fs.existsSync(imagePath)) addIssue(file, `Missing image: ${src}`);
  }

  const requiredPhrases = route
    ? [...(manifest.requiredPhrases || []), ...(route.requiredPhrases || [])]
    : [];
  for (const phrase of requiredPhrases) {
    if (!html.toLowerCase().includes(phrase.toLowerCase())) {
      addIssue(file, `Missing required phrase: ${phrase}`);
    }
  }
}

for (const file of files) {
  checkFile(file);
}

if (fs.existsSync('sitemap.xml')) {
  const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
  for (const route of manifest.newRoutes || []) {
    if (route.sitemap && route.canonical && !sitemap.includes(`<loc>${route.canonical}</loc>`)) {
      addIssue('sitemap.xml', `Missing sitemap loc: ${route.canonical}`);
    }
  }
}

if (files.includes('blog/index.html')) {
  const html = fs.readFileSync('blog/index.html', 'utf8');
  const cardUrls = [];
  const cardRe = /<a\b[^>]*class=["'][^"']*\bresource-card\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  let cardMatch;
  while ((cardMatch = cardRe.exec(html)) !== null) cardUrls.push(cardMatch[1]);

  const itemListBlock = extractJsonLd(html)
    .map((block) => {
      try { return JSON.parse(block); } catch { return null; }
    })
    .find((block) => block && block['@type'] === 'ItemList');

  if (itemListBlock && cardUrls.length > 0) {
    const schemaUrls = (itemListBlock.itemListElement || []).map((item) => item.url.replace('https://www.framerestoration.com', ''));
    const firstCards = schemaUrls.slice(0, cardUrls.length);
    if (JSON.stringify(firstCards) !== JSON.stringify(cardUrls)) {
      addIssue('blog/index.html', 'ItemList first entries do not match visible resource-card order.');
    }
  }
}

if (warnings.length) {
  console.log('WARNINGS');
  for (const warning of warnings) console.log(`- ${warning.file}: ${warning.message}`);
}

if (issues.length) {
  console.error('FAIL');
  for (const issue of issues) console.error(`- ${issue.file}: ${issue.message}`);
  process.exit(1);
}

console.log('PASS');
console.log(`Checked ${files.length} file(s).`);
if (manifest.newRoutes) console.log(`Routes in manifest: ${manifest.newRoutes.length}`);
