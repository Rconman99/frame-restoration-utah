import { assertEquals } from "jsr:@std/assert@1";
import { functionKeyOk, LEAD_REPORT_KEY, REDDIT_MONITOR_KEY } from "./function-key.ts";

const env = (vals: Record<string, string>) => (k: string) => vals[k];
const req = (headers: Record<string, string> = {}, query = "") =>
  new Request(`https://example.test/functions/v1/x${query}`, { headers });

Deno.test("fails closed when no secret is configured", () => {
  assertEquals(functionKeyOk(req({ "x-monitor-key": "anything" }), REDDIT_MONITOR_KEY, env({})), false);
});

Deno.test("rejects a missing key", () => {
  assertEquals(functionKeyOk(req(), REDDIT_MONITOR_KEY, env({ REDDIT_MONITOR_KEY: "new-secret" })), false);
});

Deno.test("accepts the function secret via header or query", () => {
  const e = env({ REDDIT_MONITOR_KEY: "new-secret" });
  assertEquals(functionKeyOk(req({ "x-monitor-key": "new-secret" }), REDDIT_MONITOR_KEY, e), true);
  assertEquals(functionKeyOk(req({}, "?key=new-secret"), REDDIT_MONITOR_KEY, e), true);
  assertEquals(functionKeyOk(req({ "x-monitor-key": "wrong" }), REDDIT_MONITOR_KEY, e), false);
});

Deno.test("legacy secret only works until the function secret is set", () => {
  const before = env({ LEGACY_ROUTING_KEY: "old" });
  assertEquals(functionKeyOk(req({ "x-report-key": "old" }), LEAD_REPORT_KEY, before), true);
  const after = env({ LEGACY_ROUTING_KEY: "old", LEAD_REPORT_KEY: "new" });
  assertEquals(functionKeyOk(req({ "x-report-key": "old" }), LEAD_REPORT_KEY, after), false);
  assertEquals(functionKeyOk(req({ "x-report-key": "new" }), LEAD_REPORT_KEY, after), true);
});

Deno.test("keys are not interchangeable across functions", () => {
  const e = env({ REDDIT_MONITOR_KEY: "a", LEAD_REPORT_KEY: "b" });
  assertEquals(functionKeyOk(req({ "x-report-key": "a" }), LEAD_REPORT_KEY, e), false);
});
