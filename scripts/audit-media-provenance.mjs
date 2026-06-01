#!/usr/bin/env node
/**
 * Media provenance guard for Frame Restoration TX.
 *
 * Blocks public image-registry entries that reference Drive folders held for
 * owner confirmation. This protects against publishing media from a flagged
 * project set before Ryan/Matt/Connor explicitly clears Frame involvement,
 * use rights, and copy direction.
 *
 * Usage:
 *   node scripts/audit-media-provenance.mjs
 *   node scripts/audit-media-provenance.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const json = args.includes('--json');

const registryPath = path.join(repoRoot, 'data/image-registry.json');
const mediaIntakeRoot = path.join(repoRoot, 'data/media-intake');

function normalizeSource(value) {
  return String(value || '')
    .replace(/^FR Tech Team\s*\/\s*Images\s*\/\s*/i, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function compactSource(value) {
  return normalizeSource(value).replace(/[^a-z0-9]/g, '');
}

function walkFiles(root, fileName) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(current)) stack.push(path.join(current, child));
    } else if (stat.isFile() && path.basename(current) === fileName) {
      out.push(current);
    }
  }
  return out.sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function collectHeldFolders() {
  const holds = [];
  for (const manifestPath of walkFiles(mediaIntakeRoot, 'manifest.json')) {
    const manifest = readJson(manifestPath);
    const relManifest = path.relative(repoRoot, manifestPath);
    for (const hold of manifest.policy?.projectSetHolds || []) {
      holds.push({
        folder: hold.projectFolder,
        normalizedFolder: normalizeSource(hold.projectFolder),
        compactFolder: compactSource(hold.projectFolder),
        status: hold.status || 'hold-owner-confirmation',
        reason: hold.reason || '',
        source: `${relManifest}:policy.projectSetHolds`,
      });
    }
    for (const entry of manifest.entries || []) {
      if (!String(entry.publicUseStatus || '').startsWith('hold-')) continue;
      const folder = entry.projectFolder || path.dirname(entry.sourcePath || '');
      holds.push({
        folder,
        normalizedFolder: normalizeSource(folder),
        compactFolder: compactSource(folder),
        status: entry.publicUseStatus,
        reason: entry.holdReason || '',
        source: `${relManifest}:entries`,
      });
    }
  }

  const byFolder = new Map();
  for (const hold of holds) {
    if (!hold.normalizedFolder) continue;
    const existing = byFolder.get(hold.normalizedFolder);
    if (!existing) {
      byFolder.set(hold.normalizedFolder, hold);
    } else if (!existing.reason && hold.reason) {
      byFolder.set(hold.normalizedFolder, { ...existing, reason: hold.reason });
    }
  }
  return [...byFolder.values()];
}

function isOwnerCleared(entry) {
  const approval = entry.ownerApproval || entry.ownerApprovals || entry.provenanceApproval;
  if (!approval) return false;
  const approvals = Array.isArray(approval) ? approval : [approval];
  return approvals.some((item) => {
    const status = String(item.status || item.decision || '').toLowerCase();
    const by = String(item.approvedBy || item.owner || '').trim();
    const at = String(item.approvedAt || item.date || '').trim();
    return ['approved', 'cleared', 'owner-approved'].includes(status) && by && at;
  });
}

const findings = [];
const warnings = [];

let registry;
try {
  registry = readJson(registryPath);
} catch (error) {
  findings.push({
    rule: 'registry-json',
    file: 'data/image-registry.json',
    message: `Could not parse image registry: ${error.message}`,
  });
}

const holds = collectHeldFolders();

if (registry?.entries) {
  for (const [key, entry] of Object.entries(registry.entries)) {
    const driveSources = [
      entry.driveSource,
      ...(Array.isArray(entry.driveSources) ? entry.driveSources : []),
    ].filter(Boolean);
    if (driveSources.length === 0) {
      if (entry.status !== 'approved-cross-use') {
        warnings.push({
          rule: 'missing-drive-source',
          entry: key,
          message: 'Registry entry has no driveSource; provenance cannot be cross-checked.',
        });
      }
      continue;
    }

    const normalizedSources = driveSources.map(normalizeSource);
    const compactSources = driveSources.map(compactSource);
    for (const hold of holds) {
      const matchesHold = normalizedSources.some((source) => source.includes(hold.normalizedFolder))
        || compactSources.some((source) => source.includes(hold.compactFolder));
      if (!matchesHold || isOwnerCleared(entry)) continue;
      findings.push({
        rule: 'held-drive-folder-public-use',
        entry: key,
        image: entry.image || null,
        driveSource: driveSources.join(' | '),
        heldFolder: hold.folder,
        holdStatus: hold.status,
        holdReason: hold.reason,
        holdSource: hold.source,
        message: 'Image registry entry references a Drive folder held for owner confirmation.',
      });
    }
  }
}

const result = {
  schemaVersion: 1,
  heldFolders: holds.length,
  auditedRegistryEntries: registry?.entries ? Object.keys(registry.entries).length : 0,
  findings,
  warnings,
  exitCode: findings.length ? 1 : 0,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('\n=== media provenance audit ===');
  console.log(`held folders: ${result.heldFolders}`);
  console.log(`audited registry entries: ${result.auditedRegistryEntries}`);
  if (warnings.length) {
    console.log('\nWARNINGS');
    for (const warning of warnings) console.log(`- ${warning.entry}: ${warning.message}`);
  }
  if (findings.length) {
    console.error('\nBLOCKERS');
    for (const finding of findings) {
      console.error(`- ${finding.entry}: ${finding.message}`);
      console.error(`  held folder: ${finding.heldFolder}`);
      if (finding.holdReason) console.error(`  reason: ${finding.holdReason}`);
    }
  }
  console.log(findings.length ? '\nFAIL' : '\nPASS');
}

process.exit(result.exitCode);
