#!/usr/bin/env node

const notice = [
  'RETIRED: scripts/blitz-test-brownbook.js is blocked for live citation use.',
  'Use data/NAP-DIRECTORY-CHECKLIST-2026-06-01.md and an owner-approved vendor data room instead.',
  'Public phone is 435-292-8802; do not publish internal forwarding or legacy numbers.'
].join(' ');

console.error(notice);
process.exit(2);
