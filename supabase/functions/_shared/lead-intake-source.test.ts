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

Deno.test("lead intake migration is additive, atomic, bounded, and service-role-only", () => {
  for (
    const contract of [
      "begin;",
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
      "commit;",
    ]
  ) {
    assert(migration.includes(contract), `rate-limit SQL lacks ${contract}`);
  }
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
