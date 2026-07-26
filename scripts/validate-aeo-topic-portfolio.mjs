#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "data/aeo/topic-portfolio-baseline.json");
const requiredIntents = new Set(["definition", "comparison", "alternatives", "use-case", "buying"]);
const errors = [];

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`[aeo-portfolio] cannot read manifest: ${error.message}`);
  process.exit(2);
}

if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (manifest.measurementContract?.doNotGeneratePagesFromPromptVariants !== true) {
  errors.push("measurement contract must explicitly block page generation from prompt variants");
}
if (manifest.measurementContract?.rereadAfterDays !== 28) {
  errors.push("rereadAfterDays must be 28");
}
if (!Array.isArray(manifest.topics) || manifest.topics.length !== 3) {
  errors.push("manifest must contain exactly three topic portfolios");
}

const seenPrompts = new Set();
for (const topic of manifest.topics || []) {
  if (!topic.id || !topic.service || !topic.location) {
    errors.push("each topic requires id, service, and location");
    continue;
  }
  if (!Array.isArray(topic.prompts) || topic.prompts.length !== 5) {
    errors.push(`${topic.id}: expected exactly five prompts`);
    continue;
  }
  const intents = new Set(topic.prompts.map((prompt) => prompt.intent));
  for (const intent of requiredIntents) {
    if (!intents.has(intent)) errors.push(`${topic.id}: missing ${intent} intent`);
  }
  if (intents.size !== requiredIntents.size) {
    errors.push(`${topic.id}: contains duplicate or unsupported intents`);
  }

  for (const prompt of topic.prompts) {
    if (!prompt.text || seenPrompts.has(prompt.text)) {
      errors.push(`${topic.id}: prompt text must be non-empty and unique`);
    }
    seenPrompts.add(prompt.text);
    if (!Array.isArray(prompt.tags)) {
      errors.push(`${topic.id}/${prompt.intent}: tags must be an array`);
      continue;
    }
    const requiredTags = [
      `market:${manifest.market}`,
      `service:${topic.service}`,
      `location:${topic.location}`,
      `topic:${topic.id}`,
      `intent:${prompt.intent}`,
    ];
    for (const tag of requiredTags) {
      if (!prompt.tags.includes(tag)) errors.push(`${topic.id}/${prompt.intent}: missing tag ${tag}`);
    }
  }
}

if (errors.length > 0) {
  console.error(`[aeo-portfolio] FAILED (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[aeo-portfolio] PASS: 3 topics, 15 unique prompts, five intent classes, 28-day reread`);
