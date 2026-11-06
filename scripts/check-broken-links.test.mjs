// Tests for the live broken-link checker. Everything runs against loopback
// http servers started here; no request ever leaves the machine.
// Run: node --test scripts/check-broken-links.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

// Async on purpose: spawnSync would block the event loop and the loopback
// fixture server in this process could never answer the child.
async function runCli(args) {
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr };
  } catch (err) {
    return { status: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}
import { assertMarketSite, checkLinks, classifyLink, classifySeed, marketHosts, parseArgs, parseUrlList } from "./check-broken-links.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-broken-links.mjs");

function serve(routes, hits) {
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    const r = routes[req.url];
    if (!r) {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<h1>404</h1>");
      return;
    }
    if (r.redirect) {
      res.writeHead(r.status || 301, { location: r.redirect });
      res.end();
      return;
    }
    res.writeHead(r.status || 200, { "content-type": r.type || "text/html; charset=utf-8" });
    res.end(r.body || "");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

test("--site refuses anything that is not this market's host or loopback", () => {
  const { canonical } = marketHosts();
  assert.equal(assertMarketSite(`https://${canonical}`), `https://${canonical}`);
  assert.equal(assertMarketSite("http://127.0.0.1:8080/x"), "http://127.0.0.1:8080");
  assert.throws(() => assertMarketSite("https://example.com"), /refusing to check example\.com/);
  assert.throws(() => assertMarketSite("https://www.frameroofingutah.com"), /refusing/); // retired brand host is not a crawl target
  assert.throws(() => assertMarketSite("not a url"), /not a URL/);
});

test("seeds: market-host URLs are re-homed onto the site origin, other hosts are off-market", () => {
  const { hosts, canonical } = marketHosts();
  const origin = "http://127.0.0.1:9";
  assert.deepEqual(classifySeed(`https://${canonical}/pages/roof-repair/`, origin, hosts), { kind: "seed", path: "/pages/roof-repair" });
  assert.deepEqual(classifySeed("/locations/provo?utm=1#x", origin, hosts), { kind: "seed", path: "/locations/provo" });
  assert.equal(classifySeed("https://example.com/other-market", origin, hosts).kind, "off_market");
  assert.equal(classifySeed("# comment", origin, hosts), null);
  assert.equal(classifySeed("", origin, hosts), null);
});

test("links: internal / external / legacy / skip classification", () => {
  const { hosts, canonical } = marketHosts();
  const origin = `https://${canonical}`;
  const page = `${origin}/blog/post`;
  assert.deepEqual(classifyLink("../pages/roof-repair/", page, origin, hosts), { kind: "internal", path: "/pages/roof-repair" });
  assert.deepEqual(classifyLink(`https://${canonical}/x`, page, origin, hosts), { kind: "internal", path: "/x" });
  assert.equal(classifyLink("https://www.google.com/maps", page, origin, hosts).kind, "external");
  assert.equal(classifyLink("https://frameroofingutah.com/old", page, origin, hosts).kind, "legacy");
  for (const h of ["tel:4352928802", "mailto:a@b.c", "sms:1", "#top", "javascript:void(0)"]) {
    assert.equal(classifyLink(h, page, origin, hosts).kind, "skip", h);
  }
});

test("parseUrlList reads newline lists and sitemaps", () => {
  assert.deepEqual(parseUrlList("/a\n\n/b \n"), ["/a", "/b"]);
  assert.deepEqual(parseUrlList('<urlset><url><loc> https://x/a </loc></url><url><loc>https://x/b</loc></url></urlset>'), ["https://x/a", "https://x/b"]);
});

test("parseArgs: defaults to the live sitemap, rejects unknown flags and bad numbers", () => {
  assert.equal(parseArgs([]).sitemap, true);
  assert.equal(parseArgs(["--urls", "x.txt"]).sitemap, undefined);
  assert.equal(parseArgs(["--sitemap", "sitemap.xml"]).sitemap, "sitemap.xml");
  assert.equal(parseArgs(["--sitemap", "--dry-run"]).sitemap, true);
  assert.throws(() => parseArgs(["--bogus"]), /unknown argument/);
  assert.throws(() => parseArgs(["--max-pages", "0"]), /positive number/);
  assert.throws(() => parseArgs(["--out"]), /needs a value/);
});

test("finds broken links with sources, never fetches other hosts, follows same-origin redirects only", async () => {
  const otherHits = [];
  const other = await serve({ "/": { body: "<p>other market</p>" } }, otherHits);
  const hits = [];
  const site = await serve(
    {
      "/": {
        body: `<a href="/pages/roof-repair">ok</a>
               <a href="/pages/missing">gone</a>
               <a href="/old">redirect</a>
               <a href="/leaves">leaves origin</a>
               <a href="${other.origin}/">cross-market</a>
               <a href="https://frameroofingutah.com/legacy">legacy</a>
               <a href="tel:4352928802">call</a>`,
      },
      "/pages/roof-repair": { body: `<a href="/pages/missing">gone again</a><a href="/loop-a">loop</a>` },
      "/old": { redirect: "/pages/roof-repair" },
      "/leaves": { redirect: `${other.origin}/landing` },
      "/loop-a": { redirect: "/loop-b" },
      "/loop-b": { redirect: "/loop-a" },
      "/sitemap-only-404": undefined,
    },
    hits,
  );
  try {
    const report = await checkLinks({
      site: site.origin,
      seeds: ["/", "/pages/roof-repair", "https://example.com/not-ours", "/sitemap-only-404"],
      concurrency: 2,
      timeout: 5000,
    });
    assert.equal(report.failed, undefined);
    assert.equal(report.seeds.fetched, 3);
    assert.deepEqual(report.seeds.off_market, ["https://example.com/not-ours"]);

    const brokenUrls = report.broken.map((b) => b.url);
    assert.ok(brokenUrls.includes(`${site.origin}/pages/missing`), "404 target reported");
    assert.ok(brokenUrls.includes(`${site.origin}/sitemap-only-404`), "listed 404 reported");
    assert.ok(brokenUrls.includes(`${site.origin}/loop-a`), "redirect loop reported");
    assert.ok(!brokenUrls.includes(`${site.origin}/old`), "a clean same-origin redirect is not broken");
    assert.ok(!brokenUrls.includes(`${site.origin}/leaves`), "an off-origin redirect is recorded, not broken");

    const missing = report.broken.find((b) => b.url === `${site.origin}/pages/missing`);
    assert.deepEqual(missing.sources, [`${site.origin}/`, `${site.origin}/pages/roof-repair`]);

    assert.equal(otherHits.length, 0, "the other host must never receive a request");
    assert.ok(!hits.some((u) => u.includes("example.com")));
    const otherHost = new URL(other.origin).hostname;
    assert.equal(report.links.external_hosts[otherHost].count, 1, "cross-market link is counted, not fetched");
    assert.equal(report.links.legacy_host_links, 1);
    assert.ok(report.issues.some((i) => i.type === "legacy-host-link"));
    assert.ok(report.issues.some((i) => i.type === "external-redirect"));
    // Every request stayed on the market origin.
    assert.ok(hits.every((u) => u.startsWith("/")));
  } finally {
    site.server.close();
    other.server.close();
  }
});

test("a run that fetched nothing fails instead of reporting zero broken links", async () => {
  const report = await checkLinks({ site: "http://127.0.0.1:1", seeds: ["/"], timeout: 500 });
  assert.equal(report.failed, true);
});

test("CLI: --dry-run prints results, writes no report and exits 0 despite a broken link; --strict exits 1", async () => {
  const hits = [];
  const site = await serve({ "/": { body: `<a href="/nope">x</a>` } }, hits);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "linkcheck-"));
  const out = path.join(tmp, "report.json");
  const list = path.join(tmp, "urls.txt");
  fs.writeFileSync(list, `${site.origin}/\nhttps://example.com/elsewhere\n`);
  try {
    const dry = await runCli(["--site", site.origin, "--urls", list, "--dry-run", "--strict", "--out", out, "--timeout", "5000"]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /1 broken link target/);
    assert.match(dry.stdout, /\/nope/);
    assert.match(dry.stdout, /off-market listed URLs/);
    assert.match(dry.stderr, /DRY RUN/);
    assert.ok(!fs.existsSync(out), "dry run must not write the report");

    const strict = await runCli(["--site", site.origin, "--urls", list, "--strict", "--out", out, "--timeout", "5000"]);
    assert.equal(strict.status, 1);
    assert.ok(fs.existsSync(out), "non-dry run writes the report");
    const report = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(report.mode, "report");
    assert.equal(report.broken.length, 1);

    const refused = await runCli(["--site", "https://example.com", "--url", "/", "--dry-run"]);
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /refusing to check example\.com/);
  } finally {
    site.server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
