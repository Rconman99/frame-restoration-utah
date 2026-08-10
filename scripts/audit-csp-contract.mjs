#!/usr/bin/env node

import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const project = fs.readFileSync('projects/heber-valley-roof.html', 'utf8');
const bearerPages = ['dashboard/index.html', 'seo-report.html'];
const globalHeaders = (vercel.headers || []).find((entry) => entry.source === '/(.*)');
const policy = (globalHeaders?.headers || []).find(
  (header) => String(header.key).toLowerCase() === 'content-security-policy',
)?.value;

if (!policy) throw new Error('Global Content-Security-Policy header is missing');

for (const extension of ['css', 'js']) {
  const rule = (vercel.headers || []).find((entry) => entry.source === `/(.*).${extension}`);
  const cacheControl = (rule?.headers || []).find(
    (header) => String(header.key).toLowerCase() === 'cache-control',
  )?.value || '';
  if (/immutable/i.test(cacheControl) || !/max-age=0/i.test(cacheControl)) {
    throw new Error(`Mutable .${extension} assets must revalidate instead of using an immutable cache`);
  }
}

const directives = new Map(
  policy.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, ...values] = part.split(/\s+/);
    return [name, new Set(values)];
  }),
);

function requireSource(directive, source) {
  if (!directives.get(directive)?.has(source)) {
    throw new Error(`${directive} must allow ${source}`);
  }
}

if (!project.includes('cdnjs.cloudflare.com/ajax/libs/leaflet/')) {
  throw new Error('Heber project page no longer declares the expected Leaflet CDN');
}
if (!project.includes('{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')) {
  throw new Error('Heber project page no longer declares the expected OSM tile layer');
}

requireSource('script-src', 'https://cdnjs.cloudflare.com');
requireSource('style-src', 'https://cdnjs.cloudflare.com');
requireSource('img-src', 'https://cdnjs.cloudflare.com');
requireSource('img-src', 'https://*.tile.openstreetmap.org');
requireSource('connect-src', 'https://api.weather.gov');
requireSource('connect-src', 'https://www.googleapis.com');
requireSource('base-uri', "'self'");
requireSource('object-src', "'none'");
requireSource('frame-ancestors', "'self'");
requireSource('form-action', "'self'");
requireSource('form-action', 'https://hdcflshhomzildwqlmwh.supabase.co');
requireSource('connect-src', 'https://hdcflshhomzildwqlmwh.supabase.co');

if (directives.get('connect-src')?.has('https://*.supabase.co')) {
  throw new Error('connect-src must not authorize every Supabase project');
}

for (const relative of bearerPages) {
  const html = fs.readFileSync(relative, 'utf8');
  for (const tag of html.matchAll(/<script\b[^>]*\bsrc=["']https:\/\/[^"']+["'][^>]*>/giu)) {
    if (!/\bintegrity=["']sha384-[A-Za-z0-9+/=]+["']/u.test(tag[0])) {
      throw new Error(`${relative}: external script is missing SHA-384 SRI`);
    }
    if (!/\bcrossorigin=["']anonymous["']/u.test(tag[0])) {
      throw new Error(`${relative}: SRI script is missing anonymous CORS mode`);
    }
  }
}

const dashboard = fs.readFileSync('dashboard/index.html', 'utf8');
if (/<script\b(?![^>]*\bsrc=)[^>]*>/iu.test(dashboard)) {
  throw new Error('dashboard/index.html: inline script returned');
}
if (/\son[a-z]+\s*=/iu.test(dashboard)) {
  throw new Error('dashboard/index.html: inline event handler returned');
}
const dashboardMetaPolicy = dashboard.match(
  /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/iu,
)?.[1] || '';
const dashboardScriptSource = dashboardMetaPolicy.match(/(?:^|;)\s*script-src\s+([^;]+)/iu)?.[1] || '';
if (!dashboardScriptSource || /'unsafe-inline'|'unsafe-eval'/iu.test(dashboardScriptSource)) {
  throw new Error('dashboard/index.html: route script policy is missing or unsafe');
}

console.log('CSP/cache contract passed: protected origins and browser sinks are bounded, required APIs are allowed, and mutable JS/CSS revalidate.');
