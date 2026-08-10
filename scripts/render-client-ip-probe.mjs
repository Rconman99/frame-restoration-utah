#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CLIENT_IP_PROBE_TEMPLATE_PATH =
  "supabase/probe-templates/client-ip-probe/index.ts.tmpl";
export const CLIENT_IP_EXTRACTOR_PATH =
  "supabase/functions/_shared/client-ip.ts";
export const RENDERED_PROBE_PATH =
  "supabase/functions/client-ip-probe/index.ts";
export const RENDERED_EXTRACTOR_PATH =
  "supabase/functions/_shared/client-ip.ts";

const TARGET_SHA_TOKEN = "__TARGET_SOURCE_SHA__";
const FULL_SHA = /^[0-9a-f]{40}$/;

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function renderClientIpProbe(templateSource, deploySha) {
  if (typeof templateSource !== "string" || templateSource.length === 0) {
    throw new Error("client-IP probe template source is unavailable");
  }
  if (!FULL_SHA.test(deploySha ?? "")) {
    throw new Error("client-IP probe render requires an exact 40-character SHA");
  }
  const tokenCount = templateSource.split(TARGET_SHA_TOKEN).length - 1;
  if (tokenCount !== 1) {
    throw new Error("client-IP probe template must contain one target SHA token");
  }
  return templateSource.replace(TARGET_SHA_TOKEN, deploySha);
}

function sourceManifest(files) {
  const entries = Object.entries(files)
    .map(([relativePath, contents]) => ({
      path: relativePath,
      sha256: sha256(contents),
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  const serialized = `${JSON.stringify({
    manifest_version: 1,
    files: entries,
  })}\n`;
  return {
    entries,
    serialized,
    sha256: sha256(serialized),
  };
}

export function expectedClientIpProbeArtifacts({
  deploySha,
  templateSource,
  extractorSource,
}) {
  if (typeof extractorSource !== "string" || extractorSource.length === 0) {
    throw new Error("client-IP extractor source is unavailable");
  }
  const renderedWrapper = renderClientIpProbe(templateSource, deploySha);
  const manifest = sourceManifest({
    "_shared/client-ip.ts": extractorSource,
    "client-ip-probe/index.ts": renderedWrapper,
  });
  return {
    targetSourceSha: deploySha,
    templateSha256: sha256(templateSource),
    renderedWrapper,
    renderedWrapperSha256: sha256(renderedWrapper),
    extractorSha256: sha256(extractorSource),
    sourceManifest: manifest.serialized,
    sourceManifestSha256: manifest.sha256,
    sourceManifestEntries: manifest.entries,
  };
}

function recursiveFiles(directory, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...recursiveFiles(absolute, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`unsupported downloaded source entry: ${relative}`);
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

export function downloadedClientIpProbeManifest(downloadRoot) {
  const functionsRoot = path.resolve(downloadRoot, "supabase/functions");
  const expectedPaths = [
    "_shared/client-ip.ts",
    "client-ip-probe/index.ts",
  ];
  const actualPaths = recursiveFiles(functionsRoot);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(
      `downloaded client-IP source file set differs: ${actualPaths.join(",")}`,
    );
  }
  const files = Object.fromEntries(
    actualPaths.map((relative) => [
      relative,
      fs.readFileSync(path.join(functionsRoot, relative), "utf8"),
    ]),
  );
  return sourceManifest(files);
}

function requireArgument(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) {
    throw new Error(`${name} is required`);
  }
  return args[index + 1];
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  try {
    const args = process.argv.slice(2);
    const deploySha = requireArgument(args, "--deploy-sha");
    const templateSource = fs.readFileSync(CLIENT_IP_PROBE_TEMPLATE_PATH, "utf8");
    const extractorSource = fs.readFileSync(CLIENT_IP_EXTRACTOR_PATH, "utf8");
    const expected = expectedClientIpProbeArtifacts({
      deploySha,
      templateSource,
      extractorSource,
    });
    const renderRootIndex = args.indexOf("--render-root");
    const downloadRootIndex = args.indexOf("--verify-download-root");
    if ((renderRootIndex === -1) === (downloadRootIndex === -1)) {
      throw new Error(
        "choose exactly one of --render-root or --verify-download-root",
      );
    }
    if (renderRootIndex !== -1) {
      const renderRoot = path.resolve(requireArgument(args, "--render-root"));
      const renderRootMetadata = fs.lstatSync(renderRoot);
      if (
        !renderRootMetadata.isDirectory() || renderRootMetadata.isSymbolicLink()
      ) {
        throw new Error("render root must be a real existing directory");
      }
      if (fs.readdirSync(renderRoot).length !== 0) {
        throw new Error("render root must be empty");
      }
      for (
        const [relative, source] of [
          [RENDERED_PROBE_PATH, expected.renderedWrapper],
          [RENDERED_EXTRACTOR_PATH, extractorSource],
        ]
      ) {
        const absolute = path.join(renderRoot, relative);
        fs.mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
        fs.writeFileSync(absolute, source, { mode: 0o600, flag: "wx" });
      }
      console.log(JSON.stringify({
        target_source_sha: expected.targetSourceSha,
        probe_template_sha256: expected.templateSha256,
        rendered_wrapper_sha256: expected.renderedWrapperSha256,
        expected_source_manifest_sha256: expected.sourceManifestSha256,
      }));
    } else {
      const downloaded = downloadedClientIpProbeManifest(
        requireArgument(args, "--verify-download-root"),
      );
      if (downloaded.sha256 !== expected.sourceManifestSha256) {
        throw new Error(
          "downloaded live client-IP source manifest differs from expected render",
        );
      }
      console.log(JSON.stringify({
        target_source_sha: expected.targetSourceSha,
        downloaded_live_source_manifest_sha256: downloaded.sha256,
        matches_expected_source_manifest: true,
      }));
    }
  } catch (error) {
    console.error(`client-IP probe render failed: ${
      error instanceof Error ? error.message : error
    }`);
    process.exit(1);
  }
}
