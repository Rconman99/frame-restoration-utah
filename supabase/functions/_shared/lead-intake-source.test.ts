import { assertEquals } from "jsr:@std/assert@1";
import {
  insertLeadRow,
  isPendingLeadColumnError,
  leadLocationColumns,
  withoutPendingLeadColumns,
} from "./lead-location-columns.ts";

const handler = await Deno.readTextFile(
  new URL("../handle-lead/index.ts", import.meta.url),
);
const migration = await Deno.readTextFile(
  new URL(
    "../../../supabase/migrations/20260807000160_lead_intake_rate_limit.sql",
    import.meta.url,
  ),
);
const homepage = await Deno.readTextFile(
  new URL("../../../index.html", import.meta.url),
);
const hero = await Deno.readTextFile(
  new URL("../../../hero.html", import.meta.url),
);
const modal = await Deno.readTextFile(
  new URL("../../../global-modal.js", import.meta.url),
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function occurrences(source: string, pattern: string): number {
  return source.split(pattern).length - 1;
}

Deno.test("lead handler rejects abuse before classification or persistence", () => {
  const parsed = handler.indexOf("await parseLeadRequest(req)");
  const honeypot = handler.indexOf("leadHoneypotFilled(formData)", parsed);
  const rpc = handler.indexOf("LEAD_INTAKE_RATE_LIMIT_RPC", honeypot);
  const contact = handler.indexOf("validateLeadContact(formData)", rpc);
  const classify = handler.indexOf("await classifyLead(", contact);
  const insert = handler.indexOf(".insert({", classify);
  assert(parsed >= 0, "bounded request parser is not called");
  assert(honeypot > parsed, "honeypot is not evaluated after safe parsing");
  assert(rpc > honeypot, "honeypot submissions consume rate-limit state");
  assert(contact > rpc, "invalid submissions can bypass rate reservation");
  assert(classify > contact, "invalid contacts reach the classifier");
  assert(insert > classify, "lead insert flow is missing");

  assert(
    handler.includes("if (!rateReservation)"),
    "malformed rate RPC responses do not fail closed",
  );
  assert(
    occurrences(handler, '"lead_intake_unavailable"') >= 3,
    "missing config, hash, or RPC failures are not visibly unavailable",
  );
  assert(
    !handler.includes('req.headers.get("x-forwarded-for")'),
    "handler trusts a raw X-Forwarded-For value",
  );
  assert(
    handler.includes("nativeForm") &&
      handler.includes("await nativeLeadSubmissionKey("),
    "no-JavaScript submissions lack stable server-side idempotency",
  );
});

Deno.test("lead intake migration is additive, bounded, service-role-only, and CLI-transaction-owned", () => {
  for (
    const contract of [
      "create table if not exists public.lead_intake_rate_limits",
      "ip_hash ~ '^[0-9a-f]{64}$'",
      "create or replace function public.reserve_lead_intake_attempt",
      "security definer",
      "set search_path = ''",
      "delete from public.lead_intake_rate_limits",
      "interval '15 minutes'",
      "on conflict (ip_hash) do update",
      "v_attempt_count <= 5",
      "revoke all on function public.reserve_lead_intake_attempt(text)",
      "grant execute on function public.reserve_lead_intake_attempt(text)",
      "to service_role",
    ]
  ) {
    assert(migration.includes(contract), `rate-limit SQL lacks ${contract}`);
  }
  assert(
    !/^\s*(?:begin(?:\s+(?:work|transaction))?|start\s+transaction|commit(?:\s+(?:work|transaction))?|rollback(?:\s+(?:work|transaction))?|end\s+(?:work|transaction))\s*;\s*$/im
      .test(migration),
    "rate-limit SQL can commit before the CLI migration-history insert",
  );
  assert(
    migration.includes(
      "revoke all on table public.lead_intake_rate_limits",
    ) && migration.includes("from public, anon, authenticated"),
    "rate-limit table is not explicitly denied to every browser role",
  );
  assert(
    !migration.includes("using (true)") &&
      !migration.includes("with check (true)"),
    "rate-limit table exposes a permissive RLS policy",
  );
});

Deno.test("every public lead form carries one blank, non-focusable honeypot", () => {
  assert(
    occurrences(homepage, 'name="company_website"') === 2,
    "homepage hero/contact honeypots are incomplete",
  );
  assert(
    occurrences(hero, 'name="company_website"') === 1,
    "standalone hero honeypot is incomplete",
  );
  assert(
    occurrences(modal, 'name="company_website"') === 1,
    "global modal honeypot is incomplete",
  );
  for (
    const [name, source] of [
      ["homepage", homepage],
      ["hero", hero],
      ["modal", modal],
    ] as const
  ) {
    assert(source.includes('tabindex="-1"'), `${name} honeypot is focusable`);
    assert(
      source.includes('autocomplete="off"'),
      `${name} honeypot may be autofilled`,
    );
  }
  for (const source of [homepage, hero, modal]) {
    assert(
      source.includes('method="post"') &&
        source.includes(
          'action="https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-lead"',
        ),
      "lead form lost its native POST target",
    );
  }
});

const missing = (column: string) => ({
  code: "PGRST204",
  message:
    `Could not find the '${column}' column of 'leads' in the schema cache`,
});

Deno.test("a typed city is stored as typed and marked as coming from the form", () => {
  assertEquals(leadLocationColumns("  Heber City ", "84032"), {
    city: "Heber City",
    zip: "84032",
    city_source: "form",
  });
});

Deno.test("a blank city stays null and is never guessed from the ZIP", () => {
  assertEquals(leadLocationColumns("", "84032-1234"), {
    city: null,
    zip: "84032-1234",
    city_source: null,
  });
  assertEquals(leadLocationColumns("   ", ""), {
    city: null,
    zip: null,
    city_source: null,
  });
});

Deno.test("text that is not a US ZIP is not stored as one", () => {
  assertEquals(leadLocationColumns("Midway", "Utah").zip, null);
  assertEquals(leadLocationColumns("Midway", "8403").zip, null);
  assertEquals(leadLocationColumns("Midway", "840321").zip, null);
});

Deno.test("only a missing pending column counts as a pending-column error", () => {
  assertEquals(isPendingLeadColumnError(missing("zip")), true);
  assertEquals(isPendingLeadColumnError(missing("city_source")), true);
  assertEquals(isPendingLeadColumnError(missing("city")), false);
  assertEquals(
    isPendingLeadColumnError({ code: "23505", message: "'zip'" }),
    false,
  );
  assertEquals(isPendingLeadColumnError(null), false);
});

Deno.test("withoutPendingLeadColumns keeps city and every other field", () => {
  assertEquals(
    withoutPendingLeadColumns({
      name: "A",
      city: "Midway",
      zip: "84049",
      city_source: "form",
    }),
    { name: "A", city: "Midway" },
  );
});

Deno.test("the insert runs once when the columns exist", async () => {
  const seen: Record<string, unknown>[] = [];
  const result = await insertLeadRow(
    { name: "A", city: "Midway", zip: "84049", city_source: "form" },
    (row) => {
      seen.push(row);
      return Promise.resolve({ data: { id: 1 }, error: null });
    },
  );
  assertEquals(seen.length, 1);
  assertEquals(result.retriedWithout, []);
  assertEquals(result.data, { id: 1 });
});

Deno.test("a missing pending column retries once without it and still saves the lead", async () => {
  const seen: Record<string, unknown>[] = [];
  const result = await insertLeadRow(
    { name: "A", city: "Midway", zip: "84049", city_source: "form" },
    (row) => {
      seen.push(row);
      return Promise.resolve(
        seen.length === 1
          ? { data: null, error: missing("zip") }
          : { data: { id: 2 }, error: null },
      );
    },
  );
  assertEquals(seen.length, 2);
  assertEquals(seen[1], { name: "A", city: "Midway" });
  assertEquals(result.retriedWithout, ["zip", "city_source"]);
  assertEquals(result.data, { id: 2 });
  assertEquals(result.error, null);
});

Deno.test("handle-lead writes the form's city and ZIP through the tolerant insert", () => {
  const wrapped = handler.indexOf("await insertLeadRow(");
  const columns = handler.indexOf("leadLocationColumns(city, zip)", wrapped);
  const insert = handler.indexOf(".insert({", columns);
  const spread = handler.indexOf("...location,", insert);
  assertEquals(wrapped >= 0, true, "lead insert is not wrapped");
  assertEquals(columns > wrapped, true, "form city and ZIP are not passed");
  assertEquals(insert > columns, true, "insert is not inside the wrapper");
  assertEquals(spread > insert, true, "location columns are not on the row");
  // The lead row is written in exactly one place.
  assertEquals(handler.split(".insert({").length - 1, 1);
});

Deno.test("any other insert error is returned untouched, with no retry", async () => {
  let calls = 0;
  const duplicate = { code: "23505", message: "duplicate key" };
  const result = await insertLeadRow(
    { name: "A", zip: "84049" },
    () => {
      calls += 1;
      return Promise.resolve({ data: null, error: duplicate });
    },
  );
  assertEquals(calls, 1);
  assertEquals(result.error, duplicate);
  assertEquals(result.retriedWithout, []);
});
