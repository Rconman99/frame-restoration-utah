import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");

test("the importer stores only the normalized portable reading and rejects a wrong panel", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slv-consumer-ai-import-"));
  const source = path.join(temp, "readings.json");
  const date = "2099-01-05";
  const output = path.join(root, "data/rank-tracker/consumer-ai-imports/salt-lake-city", `${date}.json`);
  const reading = {
    market: "utah-salt-lake-city",
    service: "roofing",
    date,
    rates: { chatgpt: 1, perplexity: 0.67, gemini: 0 },
    namedRates: { chatgpt: 1, perplexity: 1, gemini: 1 },
    citationRates: { chatgpt: 1, perplexity: 0.67, gemini: 0 },
    metric: "named-and-owned-domain-cited",
    panelId: "frame-utah-salt-lake-city-consumer-ai-v1",
    sourceArtifact: "runs/20990105T120000Z.json",
    rawProviderPayload: "must-not-cross-the-repo-bridge",
  };
  try {
    fs.writeFileSync(source, JSON.stringify(reading));
    const result = spawnSync(process.execPath, ["scripts/import-slv-consumer-ai.mjs", "--city", "salt-lake-city", "--source", source], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const imported = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.deepEqual(imported, {
      market: reading.market,
      service: reading.service,
      date: reading.date,
      rates: reading.rates,
      metric: reading.metric,
      panelId: reading.panelId,
      sourceArtifact: reading.sourceArtifact,
    });
    assert.equal(JSON.stringify(imported).includes("rawProviderPayload"), false);

    fs.writeFileSync(source, JSON.stringify({ ...reading, panelId: "wrong-panel" }));
    const rejected = spawnSync(process.execPath, ["scripts/import-slv-consumer-ai.mjs", "--city", "salt-lake-city", "--source", source], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /panel mismatch/);
  } finally {
    fs.rmSync(output, { force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("a missing public artifact remains unmeasured when allow-missing is explicit", () => {
  const result = spawnSync(process.execPath, [
    "scripts/import-slv-consumer-ai.mjs",
    "--city", "salt-lake-city",
    "--source", path.join(os.tmpdir(), "definitely-missing-slv-reading.json"),
    "--allow-missing",
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /UNMEASURED/);
});
