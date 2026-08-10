const worker = await Deno.readTextFile(
  new URL("../lead-notification-worker/index.ts", import.meta.url),
);
const handleLead = await Deno.readTextFile(
  new URL("../handle-lead/index.ts", import.meta.url),
);
const resendWebhook = await Deno.readTextFile(
  new URL("../resend-webhook/index.ts", import.meta.url),
);
const webhookRequest = await Deno.readTextFile(
  new URL("./webhook-request.ts", import.meta.url),
);
const workflow = await Deno.readTextFile(
  new URL(
    "../../../.github/workflows/lead-notification-worker.yml",
    import.meta.url,
  ),
);
const deployWorkflow = await Deno.readTextFile(
  new URL(
    "../../../.github/workflows/deploy-edge-function.yml",
    import.meta.url,
  ),
);
const reviewedMigrationBasenames = [
  "20260807000090_emergency_dashboard_secret_containment.sql",
  "20260807000100_lead_notification_outbox.sql",
  "20260807000125_add_ul_request_spam_status.sql",
  "20260807000140_atomic_dashboard_auth_throttle.sql",
  "20260807000150_dashboard_session_credentials.sql",
  "20260807000160_lead_intake_rate_limit.sql",
  "20260807000165_activate_lead_notification_outbox.sql",
  "20260807000170_report_test_markers.sql",
] as const;
const reviewedMigrationSources = await Promise.all(
  reviewedMigrationBasenames.map(async (basename) =>
    [
      basename,
      await Deno.readTextFile(
        new URL(`../../../supabase/migrations/${basename}`, import.meta.url),
      ),
    ] as const
  ),
);
const outboxSchema = reviewedMigrationSources[1][1];
const outboxActivation = reviewedMigrationSources[6][1];
const remoteAppliedHistoryGuard = await Deno.readTextFile(
  new URL(
    "../../../supabase/migration-baselines/remote-applied-history-guard.sql",
    import.meta.url,
  ),
);
const deployGuide = await Deno.readTextFile(
  new URL("../handle-lead/DEPLOY.md", import.meta.url),
);
const dashboardChecklist = await Deno.readTextFile(
  new URL("../../../DASHBOARD-SECURITY-CHECKLIST.md", import.meta.url),
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sha256Hex(source: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

Deno.test("notification worker and scheduler share one token contract", () => {
  const tokenName = "LEAD_NOTIFICATION_WORKER_TOKEN";
  assert(
    worker.includes(`Deno.env.get("${tokenName}")`),
    "worker token env is not canonical",
  );
  assert(
    workflow.includes(`secrets.${tokenName}`),
    "scheduler secret is not canonical",
  );
  assert(
    workflow.includes("Bearer $WORKER_TOKEN"),
    "scheduler does not send the canonical token",
  );

  for (
    const stale of [
      "LEAD_NOTIFICATION_WORKER_SECRET",
      "UTAH_LEAD_NOTIFICATION_WORKER_SECRET",
    ]
  ) {
    assert(!worker.includes(stale), `worker still references ${stale}`);
    assert(!workflow.includes(stale), `scheduler still references ${stale}`);
  }
});

Deno.test("outbox schema and trigger activation remain separate rollout phases", () => {
  assert(
    outboxSchema.includes(
      "create table if not exists public.lead_notifications",
    ),
    "phase A lacks outbox storage",
  );
  assert(
    !outboxSchema.includes("create trigger leads_enqueue_notifications"),
    "phase A activates enqueueing too early",
  );
  assert(
    outboxActivation.includes("create trigger leads_enqueue_notifications"),
    "phase B lacks enqueue trigger",
  );
  assert(
    outboxActivation.includes("new.submission_key is not null"),
    "phase B can duplicate-send leads created by the legacy handler",
  );
  assert(
    outboxActivation.includes("on conflict do nothing"),
    "phase B enqueue is not idempotent",
  );
  assert(
    outboxSchema.includes("while the OLD handler is live") &&
      outboxActivation.includes("while the OLD handler is still live"),
    "migration comments encode the unsafe handler-first cutover",
  );
  assert(
    !deployWorkflow.includes("lead_notification_cutover") &&
      !deployWorkflow.includes(
        "worker-webhook-secrets-verified-handler-ready",
      ),
    "manual deploy workflow retains the trusted owner-notification dropdown",
  );
  for (
    const contract of [
      "Read live owner-notification migration, secret, and function state",
      "database/query/read-only",
      "20260807000100",
      "20260807000160",
      "20260807000165",
      "supabase secrets list",
      "supabase functions list",
      "run-owner-notification-deploy-canaries.mjs",
      "Mint signed live owner-notification deployment evidence",
      "verify-owner-notification-deploy-receipt.mjs --issue",
      "verify-owner-notification-deploy-receipt.mjs",
      "Refresh live owner-notification metadata after canaries",
      "LEAD_NOTIFICATION_DEPLOY_RECEIPT_TOKEN",
      "LEAD_NOTIFICATION_DEPLOY_RECEIPT_HMAC_KEY",
    ]
  ) {
    assert(
      deployWorkflow.includes(contract),
      `manual owner-notification deploy gate lacks ${contract}`,
    );
  }
});

Deno.test("worker deployment canary is authenticated, read-only, and no-send", () => {
  const healthStart = worker.indexOf('if (requestedMode === "health-only")');
  const recoveryStart = worker.indexOf(
    "const { data: reconciledCount",
    healthStart,
  );
  assert(
    healthStart >= 0 && recoveryStart > healthStart,
    "worker health-only branch does not precede recovery mutations",
  );
  const healthBranch = worker.slice(healthStart, recoveryStart);
  for (
    const forbidden of [
      "sendResendEmail",
      "LEAD_NOTIFICATION_CLAIM_RPC",
      "LEAD_NOTIFICATION_COMPLETE_RPC",
      "LEAD_NOTIFICATION_EXHAUST_RPC",
      "reconcile_resend_notification_events",
    ]
  ) {
    assert(
      !healthBranch.includes(forbidden),
      `worker health-only branch can execute ${forbidden}`,
    );
  }
  assert(
    worker.indexOf('request.headers.get("authorization")') < healthStart &&
      healthBranch.includes("await readDurableHealth") &&
      healthBranch.includes("await probeResendSendingAccess") &&
      healthBranch.includes("deployment_id: DEPLOYMENT_ID") &&
      healthBranch.includes("provider_auth: providerAuth") &&
      healthBranch.includes('mode: "health-only"') &&
      healthBranch.includes("no_send: true"),
    "worker health-only branch is not authenticated/read-only receipt mode",
  );
  assert(
    worker.includes(
      'const requestedMode = request.headers.get("x-frame-worker-mode") || ""',
    ) && workflow.includes("x-frame-worker-mode: recover"),
    "missing worker mode can still default to the mutating recovery path",
  );
  assert(
    resendWebhook.includes('Deno.env.get("DENO_DEPLOYMENT_ID")') &&
      resendWebhook.includes("deployment_id: DEPLOYMENT_ID"),
    "signed webhook canary does not report its immutable runtime deployment",
  );
  assert(
    worker.includes("!counts.every(validHealthCount)") &&
      worker.includes('"invalid count receipt"') &&
      !worker.includes("durableTerminal || 0") &&
      !worker.includes("durableCredentialOutages || 0") &&
      !worker.includes("durableRetryable || 0") &&
      !worker.includes("staleDelayed || 0") &&
      !worker.includes("staleAccepted || 0"),
    "missing/null durable count receipts can still pass health as zero",
  );
});

Deno.test("migration-owned unique indexes cannot retain adversarial same-name definitions", () => {
  const exactIndexes = [
    {
      name: "leads_submission_key_uidx",
      definition:
        "on public.leads (submission_key)\n  where submission_key is not null;",
    },
    {
      name: "lead_notifications_idempotency_key_uidx",
      definition: "on public.lead_notifications (idempotency_key);",
    },
    {
      name: "lead_notifications_route_uidx",
      definition:
        "on public.lead_notifications (lead_id, recipient_role, channel);",
    },
  ];

  for (const contract of exactIndexes) {
    assert(
      !new RegExp(
        `create\\s+unique\\s+index\\s+if\\s+not\\s+exists\\s+${contract.name}`,
        "i",
      ).test(outboxSchema),
      `${contract.name} can be bypassed by an adversarial same-name index`,
    );
    const dropAt = outboxSchema.indexOf(
      `drop index if exists public.${contract.name};`,
    );
    const createAt = outboxSchema.indexOf(
      `create unique index ${contract.name}\n  ${contract.definition}`,
    );
    assert(dropAt >= 0, `${contract.name} is not transactionally replaced`);
    assert(
      createAt > dropAt,
      `${contract.name} is not recreated with its exact unique definition`,
    );
  }

  assert(
    outboxSchema.includes("from pg_catalog.pg_constraint") &&
      outboxSchema.includes("where conindid =") &&
      outboxSchema.includes(
        "constraint-owned; refusing unsafe index replacement",
      ),
    "migration can drop a constraint-owned same-name index",
  );
  for (
    const duplicateContract of [
      "group by submission_key\n    having count(*) > 1",
      "group by idempotency_key\n    having count(*) > 1",
      "group by lead_id, recipient_role, channel\n    having count(*) > 1",
    ]
  ) {
    assert(
      outboxSchema.includes(duplicateContract),
      `migration does not fail closed on duplicate data: ${duplicateContract}`,
    );
  }
});

Deno.test("runbooks freeze scoped senders and selective migration order", () => {
  for (
    const contract of [
      "UTAH_LEAD_RESEND_API_KEY",
      "UTAH_LEAD_RESEND_FROM",
      "UTAH_LEAD_RESEND_SMS_FROM",
      "verified and sending-enabled",
      "Do not run `supabase db push`",
    ]
  ) {
    assert(deployGuide.includes(contract), `deploy guide lacks ${contract}`);
  }
  assert(
    !deployGuide.includes("`RESEND_FROM`") &&
      !deployGuide.includes("`RESEND_SMS_FROM`") &&
      !deployGuide.includes("or `RESEND_API_KEY`"),
    "deploy guide still permits generic Resend configuration",
  );
  assert(
    dashboardChecklist.includes(
      "Canonical `cf-connecting-ip` is the only",
    ) && dashboardChecklist.includes(
      "`x-real-ip` and `x-forwarded-for` are never accepted as fallbacks",
    ),
    "dashboard checklist does not freeze the CF-only gateway contract",
  );
  const rollout = dashboardChecklist.slice(
    dashboardChecklist.indexOf("## Safe Rollout Order"),
  );
  let previous = -1;
  for (
    const migration of [
      "20260807000090",
      "20260807000100",
      "20260807000125",
      "20260807000140",
      "20260807000150",
      "20260807000160",
      "20260807000165",
      "20260807000170",
      "20260807000200",
    ]
  ) {
    const current = rollout.indexOf(migration);
    assert(current > previous, `selective rollout misorders ${migration}`);
    previous = current;
  }
});

Deno.test("reviewed migration batch delegates transaction ownership to the CLI", () => {
  const topLevelTransactionControl =
    /^\s*(?:begin(?:\s+(?:work|transaction))?|start\s+transaction|commit(?:\s+(?:work|transaction))?|rollback(?:\s+(?:work|transaction))?|end\s+(?:work|transaction))\s*;\s*$/im;
  const transactionFlushingStatement =
    /\b(?:create\s+(?:unique\s+)?index\s+concurrently|reindex\b[^;]*\bconcurrently|vacuum|alter\s+system|cluster)\b/i;
  for (const [basename, source] of reviewedMigrationSources) {
    assert(
      !topLevelTransactionControl.test(source),
      `${basename} can commit schema before the CLI migration-history insert`,
    );
    assert(
      !transactionFlushingStatement.test(source),
      `${basename} can force the CLI to commit before its migration-history insert`,
    );
  }
});

Deno.test("migration runner is release-bound, isolated, and catalog-gated", async () => {
  for (
    const contract of [
      "RELEASE_SHA",
      "git merge-base --is-ancestor",
      "Supabase CLI 2.113.0 is required",
      "SUPABASE_NO_KEYRING=1",
      "SUPABASE_BIN",
      "set SUPABASE_BIN to the reviewed official CLI path",
      "supabase-go",
      "expected_supabase_bin_sha256",
      "macOS arm64 only",
      "exclusive Utah migration-writer window",
      "UTAH_MIGRATION_EXCLUSIVE_WRITER_ACK",
      'UTAH_MIGRATION_EXCLUSIVE_WRITER_ACK:-}" = "$RELEASE_SHA"',
      "pooler-url",
      "mktemp -d",
      '"$SUPABASE_BIN" init --workdir "$UTAH_MIGRATION_WORKDIR"',
      "git archive --format=tar",
      "full repository checkout is",
      "25 other migration versions",
      '"$SUPABASE_BIN" link --project-ref hdcflshhomzildwqlmwh --yes',
      '"$SUPABASE_BIN" --agent no --output-format json migration list --linked',
      '"$SUPABASE_BIN" --agent no -o json db query --linked',
      "migration-list.before.json",
      "migration-list.effective-before.json",
      "remote_applied_history_guard.sql",
      "expected_remote_versions",
      "exact matched prefix plus pending suffix",
      "preflight_ok == true",
      "migration up --linked --include-all --yes",
      "postflight_ok == true",
      "supabase_migrations.schema_migrations",
      "Management API/raw SQL",
      "same reviewed CLI migration runner",
    ]
  ) {
    assert(
      deployGuide.includes(contract),
      `migration runner lacks ${contract}`,
    );
  }

  const manifestMarker = `expected_manifest="$(cat <<'MANIFEST'\n`;
  const manifestStart = deployGuide.indexOf(manifestMarker);
  const manifestEnd = deployGuide.indexOf("\nMANIFEST\n", manifestStart);
  assert(
    manifestStart >= 0 && manifestEnd > manifestStart,
    "migration runner lacks its exact release manifest heredoc",
  );
  const releaseManifest = deployGuide.slice(
    manifestStart + manifestMarker.length,
    manifestEnd,
  );
  const reviewedMigrations = await Promise.all(
    reviewedMigrationSources.map(async ([basename, source]) =>
      [basename, await sha256Hex(source)] as const
    ),
  );
  for (const [basename, digest] of reviewedMigrations) {
    assert(
      releaseManifest.includes(
        `${digest}  supabase/migrations/${basename}`,
      ),
      `migration runner does not freeze ${basename}`,
    );
  }
  assert(
    deployGuide.includes(
      "expected_supabase_bin_sha256='ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a'",
    ),
    "migration runner does not pin the reviewed official macOS arm64 CLI binary",
  );

  const guardDigest = await sha256Hex(remoteAppliedHistoryGuard);
  assert(
    remoteAppliedHistoryGuard.toLowerCase().includes("raise exception") &&
      remoteAppliedHistoryGuard.includes("UTAH_REMOTE_HISTORY_GUARD_SELECTED"),
    "remote-history guard does not fail closed when selected",
  );
  assert(
    deployGuide.includes(
      "supabase/migration-baselines/remote-applied-history-guard.sql",
    ),
    "migration runner does not archive the immutable history guard",
  );
  assert(
    deployGuide.includes(
      `expected_guard_template_sha256='${guardDigest}'`,
    ),
    "migration runner does not freeze the history guard digest",
  );
  const complianceWorkflow = await Deno.readTextFile(
    new URL("../../../.github/workflows/compliance-gate.yml", import.meta.url),
  );
  assert(
    complianceWorkflow.includes("'supabase/migration-baselines/**'") &&
      complianceWorkflow.includes(
        "supabase/migration-baselines/remote-applied-history-guard.sql",
      ) &&
      reviewedMigrationBasenames.every((basename) =>
        complianceWorkflow.includes(`supabase/migrations/${basename}`)
      ),
    "compliance gate neither triggers on nor grants read access to the history guard",
  );

  const remoteVersionsMarker = `expected_remote_versions="$(cat <<'VERSIONS'\n`;
  const remoteVersionsStart = deployGuide.indexOf(remoteVersionsMarker);
  const remoteVersionsEnd = deployGuide.indexOf(
    "\nVERSIONS\n)",
    remoteVersionsStart,
  );
  assert(
    remoteVersionsStart >= 0 && remoteVersionsEnd > remoteVersionsStart,
    "migration runner lacks its exact remote-history baseline",
  );
  const remoteVersions = deployGuide.slice(
    remoteVersionsStart + remoteVersionsMarker.length,
    remoteVersionsEnd,
  ).split("\n");
  const expectedRemoteVersions = [
    "20260320023416",
    "20260320023541",
    "20260320202722",
    "20260320202912",
    "20260320210930",
    "20260409044027",
    "20260410182354",
    "20260411003850",
    "20260411004150",
    "20260427211024",
    "20260427211116",
    "20260427211814",
    "20260427214847",
    "20260427223827",
    "20260427223851",
    "20260507211125",
    "20260508000203",
    "20260511015537",
    "20260511220802",
    "20260512005558",
    "20260527064542",
    "20260608205857",
    "20260610",
    "20260807000095",
  ];
  assert(
    JSON.stringify(remoteVersions) === JSON.stringify(expectedRemoteVersions),
    "migration runner remote-history baseline differs from the reviewed exact set",
  );
  const remoteVersionsDigest = await sha256Hex(
    `${remoteVersions.join("\n")}\n`,
  );
  assert(
    deployGuide.includes(
      `expected_remote_versions_sha256='${remoteVersionsDigest}'`,
    ),
    "migration runner does not freeze the remote-history baseline digest",
  );
  const targetVersions = reviewedMigrations.map(([basename]) =>
    basename.slice(0, basename.indexOf("_"))
  );
  for (
    let prefixLength = 0;
    prefixLength <= reviewedMigrations.length;
    prefixLength++
  ) {
    const fullManifestLines = [
      ...[...remoteVersions, ...targetVersions.slice(0, prefixLength)].map(
        (version) =>
          `${guardDigest}  supabase/migrations/${version}_remote_applied_history_guard.sql`,
      ),
      ...reviewedMigrations.slice(prefixLength).map(([basename, digest]) =>
        `${digest}  supabase/migrations/${basename}`
      ),
    ].sort((left, right) => {
      const leftPath = left.slice(left.indexOf("  ") + 2);
      const rightPath = right.slice(right.indexOf("  ") + 2);
      return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
    });
    const fullManifestDigest = await sha256Hex(
      `${fullManifestLines.join("\n")}\n`,
    );
    assert(
      deployGuide.includes(
        `${prefixLength}) expected_full_manifest_sha256='${fullManifestDigest}'`,
      ),
      `migration runner does not freeze the prefix-${prefixLength} 32-file manifest digest`,
    );
  }

  for (
    const preflightContract of [
      "all_history_versions",
      "target_history_versions",
      "containment_00095_recorded",
      "phase_00090_schema_ahead_exact",
      "phase_00100_pristine",
      "phase_00125_pristine",
      "phase_00140_pristine",
      "phase_00150_pristine",
      "phase_00160_pristine",
      "phase_00165_pristine",
      "phase_00170_pristine",
      "expected_applied_target_versions_json",
      "evaluate_catalog_preflight",
    ]
  ) {
    assert(
      deployGuide.includes(preflightContract),
      `catalog preflight lacks ${preflightContract}`,
    );
  }
  for (
    const postflightContract of [
      "phase_00100_present",
      "phase_00125_present",
      "phase_00140_present",
      "phase_00150_present",
      "phase_00160_present",
      "phase_00165_present",
      "phase_00170_present",
      "postflight_ok:.preflight_ok",
    ]
  ) {
    assert(
      deployGuide.includes(postflightContract),
      `catalog postflight lacks ${postflightContract}`,
    );
  }
  assert(
    deployGuide.includes(
      "$state.all_history_versions == (($expected_baseline + $expected_history) | sort)",
    ) &&
      deployGuide.includes(
        '--argjson expected_baseline "$expected_remote_versions_json"',
      ),
    "catalog gate does not compare every direct history row with the exact baseline and target prefix",
  );
  assert(
    deployGuide.includes("not like '%ul_request%'") &&
      deployGuide.includes("like '%ul_request%'") &&
      !deployGuide.includes("credential_created_at") &&
      deployGuide.includes("report_access_pin_hash_key") &&
      deployGuide.includes("column_name='pin' and is_nullable='YES'"),
    "catalog phase checks do not match the exact 00125/00150 migration contracts",
  );

  assert(
    !deployGuide.includes("UTAH_DATABASE_URL") &&
      !deployGuide.includes("psql ") &&
      !deployGuide.includes("command -v supabase") &&
      !deployGuide.includes("supabase migration up --linked --yes"),
    "migration runner still permits a database URL, psql, implicit CLI, or unbounded migration up",
  );
  const runner = deployGuide.slice(
    deployGuide.indexOf("### Migration execution and history receipt"),
    deployGuide.indexOf("### Resend webhook registration receipt"),
  );
  const init = runner.indexOf(
    '"$SUPABASE_BIN" init --workdir "$UTAH_MIGRATION_WORKDIR"',
  );
  const archive = runner.indexOf("git archive --format=tar");
  const archiveEnd = runner.indexOf("| tar -xf", archive);
  assert(
    init >= 0 && init < archive && archiveEnd > archive &&
      !runner.slice(archive, archiveEnd).includes("supabase/config.toml"),
    "migration runner archives a nonexistent config instead of initializing one",
  );
  for (
    const guardContract of [
      "exactly 32 regular SQL files",
      "duplicate migration versions are forbidden",
      "expected_full_manifest_sha256",
      "verify_runner_file_shape",
      "catalog-preflight.final.json",
      "migration-up.stdout.json",
      "migration-up.stderr.txt",
      '.applied | map(split("/")[-1])',
      "remote_applied_history_guard.sql",
      "supabase/reviewed-targets",
      "expected_applied_target_versions_json",
      "expected_pending_target_versions_json",
      "migration_up_skipped=exact_target_history_already_complete",
      "target history is not an exact ordered prefix",
    ]
  ) {
    assert(
      runner.includes(guardContract),
      `migration runner lacks fail-closed contract ${guardContract}`,
    );
  }
  const beforeList = runner.indexOf("migration-list.before.json");
  const preflight = runner.indexOf("preflight_json=");
  const effectiveList = runner.indexOf("migration-list.effective-before.json");
  const finalPreflight = runner.indexOf("final_preflight_json=");
  const apply = runner.indexOf("migration up --linked --include-all --yes");
  const postflight = runner.indexOf("postflight_json=");
  const afterList = runner.indexOf("migration-list.after.json");
  assert(
    beforeList >= 0 && beforeList < preflight && preflight < effectiveList &&
      effectiveList < finalPreflight && finalPreflight < apply &&
      apply < postflight && postflight < afterList,
    "migration runner does not enforce list/preflight/guarded-list/final-preflight/apply/postflight/list order",
  );
  assert(
    dashboardChecklist.includes(
      "supabase migration up --linked --include-all --yes",
    ) && dashboardChecklist.includes("final `RELEASE_SHA`") &&
      dashboardChecklist.includes("exclusive Utah") &&
      dashboardChecklist.includes("UTAH_MIGRATION_EXCLUSIVE_WRITER_ACK") &&
      dashboardChecklist.includes("postflight_ok: true"),
    "dashboard rollout does not point to the isolated release migration runner",
  );
  assert(
    deployGuide.includes(
      "Keep\n   `UTAH_LEAD_RESEND_SMS_FROM` and `UTAH_LEAD_SMS_ENABLED` absent while Utah",
    ),
    "Utah rollout does not keep the SMS sender absent while SMS is paused",
  );
  assert(
    deployGuide.includes("`UTAH_LEAD_SMS_ENABLED` absent while Utah") &&
      deployGuide.includes("Twilio credentials alone never activate a send"),
    "Utah rollout does not keep the market-wide SMS enable flag absent",
  );
});

Deno.test("Utah SMS pause gates every owner and customer send", () => {
  assert(
    handleLead.includes(
      'const UTAH_LEAD_SMS_ENABLED = smsDeliveryEnabled(\n  Deno.env.get("UTAH_LEAD_SMS_ENABLED"),\n);',
    ),
    "handler does not derive the fail-closed Utah SMS flag",
  );
  const gateStart = handleLead.indexOf("if (UTAH_LEAD_SMS_ENABLED) {");
  const gateEnd = handleLead.indexOf(
    "await Promise.allSettled(smsPromises)",
    gateStart,
  );
  assert(
    gateStart >= 0 && gateEnd > gateStart,
    "Utah SMS send gate is missing",
  );
  const gatedSms = handleLead.slice(gateStart, gateEnd);
  for (const sendPath of ["sendVerizonGatewaySMS", "sendTwilioSMS"]) {
    assert(
      gatedSms.includes(sendPath),
      `${sendPath} is not contained by the Utah SMS enable gate`,
    );
  }
  assert(
    handleLead.includes(
      "Utah SMS paused: UTAH_LEAD_SMS_ENABLED is not true",
    ),
    "handler does not make the paused path observable",
  );
});

Deno.test("rollout receipt uses the exact Resend endpoint contract", () => {
  for (
    const contract of [
      "https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/resend-webhook",
      "email.sent",
      "email.delivered",
      "email.delivery_delayed",
      "email.bounced",
      "email.complained",
      "email.failed",
      "email.suppressed",
      'HTTP 200 `state:"ignored"`',
    ]
  ) {
    assert(deployGuide.includes(contract), `rollout receipt lacks ${contract}`);
  }
  assert(
    deployGuide.includes("shows HTTP 200 from the exact endpoint") &&
      deployGuide.includes("worker run reports HTTP 200 and `healthy:true`"),
    "rollout receipt can pass without provider evidence",
  );
});

Deno.test("delivery events survive provider-id races and never trigger resend", () => {
  for (
    const contract of [
      "applied_at timestamptz",
      "reconcile_resend_notification_events",
      "return 'unmatched'",
      "retryable = false",
    ]
  ) {
    assert(
      outboxSchema.includes(contract),
      `outbox event state machine lacks ${contract}`,
    );
  }
  assert(
    resendWebhook.includes('data === "unmatched"'),
    "webhook does not detect an early unmatched event",
  );
  assert(
    resendWebhook.includes('state: "queued"'),
    "webhook does not acknowledge an early, durably retained event",
  );
  assert(
    handleLead.includes('"reconcile_resend_notification_events"'),
    "inline sender does not reconcile early events",
  );
  assert(
    worker.includes('"reconcile_resend_notification_events"'),
    "recovery worker does not reconcile early events",
  );
  assert(
    !worker.includes('["pending", "failed", "delayed"]'),
    "delivery-delayed mail is incorrectly retryable",
  );
  assert(
    worker.includes("MAX_NOTIFICATION_ATTEMPTS"),
    "worker retries have no hard cap",
  );
  for (
    const chronology of [
      "event_row.occurred_at > jobs.last_event_at",
      ">= public.resend_notification_status_rank(jobs.status)",
      "resend_notification_status_rank(event_row.event_status)",
      "when not event_target.should_apply then jobs.last_error_code",
      "claim_version = case",
    ]
  ) {
    assert(
      outboxSchema.includes(chronology),
      `webhook chronology lacks ${chronology}`,
    );
  }
});

Deno.test("shared Resend webhooks accept only tagged Utah owner notifications", () => {
  assert(
    handleLead.includes("name: job.delivery_tag_name") &&
      handleLead.includes("value: job.delivery_tag_value") &&
      worker.includes("name: claimed.delivery_tag_name") &&
      worker.includes("value: claimed.delivery_tag_value"),
    "an owner notification sender bypasses its frozen account-routing tag",
  );
  assert(
    resendWebhook.includes(
      "isOwnerNotificationWebhookTags(event.data?.tags)",
    ) && resendWebhook.includes('state: "ignored"'),
    "webhook does not acknowledge and ignore unrelated shared-account mail",
  );
  assert(
    worker.includes("{ p_provider_message_id: null }") &&
      worker.includes("invalid reconciliation RPC response") &&
      worker.indexOf("{ p_provider_message_id: null }") <
        worker.indexOf(
          "await supabase.rpc(\n    LEAD_NOTIFICATION_EXHAUST_RPC",
        ),
    "scheduled recovery can strand an acknowledged early provider event",
  );
  const gatewayStart = handleLead.indexOf(
    "async function sendVerizonGatewaySMS",
  );
  const gatewayEnd = handleLead.indexOf(
    "function notificationRecipient",
    gatewayStart,
  );
  assert(
    gatewayStart >= 0 && gatewayEnd > gatewayStart,
    "Verizon gateway helper is missing",
  );
  assert(
    !handleLead.slice(gatewayStart, gatewayEnd).includes(
      "RESEND_OWNER_NOTIFICATION_TAGS",
    ),
    "auxiliary Verizon mail is incorrectly tagged as an owner notification",
  );
});

Deno.test("public webhook body is bounded before signature verification", () => {
  assert(
    resendWebhook.includes("await readBoundedWebhookBody(request)"),
    "webhook does not use the bounded streaming reader",
  );
  assert(
    !resendWebhook.includes("request.text()"),
    "webhook still buffers an unbounded public request body",
  );
  for (
    const contract of [
      "MAX_RESEND_WEBHOOK_BYTES = 64 * 1024",
      'request.headers.get("content-length")',
      'reader.cancel("webhook_body_too_large")',
      'new TextDecoder("utf-8", { fatal: true })',
    ]
  ) {
    assert(
      webhookRequest.includes(contract),
      `bounded webhook reader lacks ${contract}`,
    );
  }
});

Deno.test("duplicate lead retries suppress non-idempotent side effects", () => {
  assert(
    handleLead.includes("let freshInsert = false"),
    "handler does not track the winning insert",
  );
  assert(
    handleLead.includes("freshInsert = true"),
    "winning insert is not marked fresh",
  );
  const duplicateLookup = handleLead.indexOf("const { data: existingLead");
  const classifier = handleLead.indexOf(
    "const classification = await classifyLead",
  );
  assert(
    duplicateLookup >= 0 && classifier > duplicateLookup,
    "known duplicate retries still invoke the classifier",
  );
  const guardedStart = handleLead.indexOf("if (freshInsert) {");
  const guardedEnd = handleLead.indexOf(
    "Idempotent retry: skipped non-idempotent SMS",
    guardedStart,
  );
  assert(
    guardedStart >= 0 && guardedEnd > guardedStart,
    "retry side-effect guard is missing",
  );
  const guarded = handleLead.slice(guardedStart, guardedEnd);
  for (
    const sideEffect of [
      "sendTwilioSMS",
      "sendVerizonGatewaySMS",
      "GOOGLE_SHEET_WEBHOOK",
    ]
  ) {
    assert(
      guarded.includes(sideEffect),
      `${sideEffect} is outside the retry guard`,
    );
  }
});

Deno.test("inline duplicate recovery and worker build email only from the persisted lead row", () => {
  for (const source of [handleLead, worker]) {
    assert(
      source.includes("PERSISTED_LEAD_NOTIFICATION_SELECT"),
      "notification sender does not use the shared persisted-row select",
    );
    assert(
      source.includes("notificationFromPersistedLead("),
      "notification sender does not use the shared persisted-row builder",
    );
  }

  const persistedStart = handleLead.indexOf(
    "const persistedLead = notificationFromPersistedLead(storedLead)",
  );
  const notificationStart = handleLead.indexOf(
    "const notification = persistedLead.notification",
    persistedStart,
  );
  const sendsEnd = handleLead.indexOf(
    "const ownerEmailCredentialOutage",
    notificationStart,
  );
  assert(
    persistedStart >= 0 && notificationStart > persistedStart &&
      sendsEnd > notificationStart,
    "inline persisted notification flow is missing",
  );
  const retryEmailFlow = handleLead.slice(persistedStart, sendsEnd);
  for (
    const currentRequestValue of [
      "classification.reason",
      "classification.classifier",
      "classification.confidence",
      "source_page ||",
    ]
  ) {
    assert(
      !retryEmailFlow.includes(currentRequestValue),
      `retry email still depends on ${currentRequestValue}`,
    );
  }
  assert(
    retryEmailFlow.includes("persistedLead.notification"),
    "retry email does not retain the persisted payload",
  );
  assert(
    retryEmailFlow.includes("persistedLead.replyTo"),
    "retry email reply-to is not persisted",
  );
});

Deno.test("worker and scheduler surface terminal notification health as a failing run", () => {
  assert(
    worker.includes("LEAD_NOTIFICATION_EXHAUST_RPC"),
    "worker does not retain an exhausted-job receipt",
  );
  for (
    const counter of [
      "exhausted",
      "terminalFailed",
      "credentialOutages",
      "durableTerminal",
      "durableCredentialOutages",
      "durableRetryable",
      "staleDelayed",
      "staleAccepted",
      "persistenceErrors",
    ]
  ) {
    assert(worker.includes(counter), `worker health omits ${counter}`);
  }
  assert(
    worker.includes("notificationWorkerHttpStatus(summary)"),
    "worker does not map terminal state to HTTP health",
  );
  assert(
    worker.includes("Response.json(summary, { status })"),
    "worker response status is always 2xx",
  );
  assert(
    workflow.includes('--write-out "%{http_code}"'),
    "scheduler does not capture worker HTTP health",
  );
  assert(
    workflow.includes(
      'if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]',
    ),
    "scheduler does not explicitly fail non-2xx worker health",
  );
});

Deno.test("inline duplicate recovery honors durable backoff and credential outages stay recoverable", () => {
  const candidateStart = handleLead.indexOf(
    "const { data: candidate, error: candidateError }",
  );
  const sendStart = handleLead.indexOf(
    "const result = await sendResendEmail",
    candidateStart,
  );
  assert(
    candidateStart >= 0 && sendStart > candidateStart,
    "inline candidate flow is missing",
  );
  const candidateFlow = handleLead.slice(candidateStart, sendStart);
  for (
    const frozenField of [
      "delivery_from",
      "delivery_to",
      "delivery_reply_to",
      "delivery_subject",
      "delivery_text",
      "delivery_tag_name",
      "delivery_tag_value",
    ]
  ) {
    assert(
      candidateFlow.includes(frozenField),
      `inline candidate omits frozen ${frozenField}`,
    );
  }
  assert(
    candidateFlow.includes("notificationAttemptDue(candidate.next_attempt_at)"),
    "inline duplicate retry ignores persisted next_attempt_at",
  );
  assert(
    candidateFlow.includes("deferredNotificationOutcome(") &&
      handleLead.includes("ownerEmailRetryableFailure") &&
      handleLead.includes(
        '503,\n        "owner_notification_unavailable"',
      ),
    "durably deferred duplicate notification can return false success",
  );
  assert(
    candidateFlow.includes("LEAD_NOTIFICATION_CLAIM_RPC") &&
      outboxSchema.includes("jobs.next_attempt_at <= v_now"),
    "inline claim can race around persisted backoff",
  );
  assert(
    handleLead.includes("notificationCompletionArgs(job, result, now)") &&
      worker.includes(
        "notificationCompletionArgs(claim, outcome, finishedAt)",
      ) &&
      outboxSchema.includes(
        "p_attempts between greatest(jobs.attempts - 1, 0)",
      ),
    "credential outages consume the finite delivery retry budget",
  );
  assert(
    handleLead.includes('"owner_notification_unavailable"'),
    "inline provider-auth outage still returns success",
  );
  assert(
    worker.includes("summary.credentialOutages += 1"),
    "background provider-auth outage is not visibly unhealthy",
  );
  assert(
    worker.includes("SETTINGS.primaryEmail, SETTINGS.backupEmail") &&
      worker.includes("notificationConfigurationOutage(") &&
      !worker.includes("!SETTINGS.apiKey)"),
    "invalid sender or owner recipients can pass an empty-queue health run",
  );
  assert(
    handleLead.includes('"owner_notification_failed"'),
    "inline terminal provider rejection still returns success",
  );
});

Deno.test("worker health remains red for unacknowledged durable provider state", () => {
  for (const status of ["failed", "bounced", "complained"]) {
    assert(worker.includes(`\"${status}\"`), `durable health omits ${status}`);
  }
  for (
    const contract of [
      '.is("health_acknowledged_at", null)',
      '.eq("status", "delayed")',
      '"provider_auth_unavailable"',
      "STALE_DELIVERY_DELAY_MS",
      "UNCONFIRMED_ACCEPTANCE_MS",
      '.eq("status", "accepted")',
      '.lt("last_event_at", delayedBefore)',
      '.lt("accepted_at", acceptedBefore)',
    ]
  ) {
    assert(worker.includes(contract), `durable health lacks ${contract}`);
  }
  assert(
    outboxSchema.includes("health_acknowledged_at timestamptz") &&
      outboxSchema.includes("New adverse provider state clears this value"),
    "outbox has no durable operator acknowledgement model",
  );
});

Deno.test("claims, completions, exhaustion, and legacy projection are version-atomic", () => {
  for (
    const [rpc, constant] of [
      ["claim_lead_notification", "LEAD_NOTIFICATION_CLAIM_RPC"],
      ["complete_lead_notification_claim", "LEAD_NOTIFICATION_COMPLETE_RPC"],
      ["exhaust_lead_notification_claims", "LEAD_NOTIFICATION_EXHAUST_RPC"],
    ]
  ) {
    assert(outboxSchema.includes(rpc), `outbox lacks ${rpc}`);
    assert(worker.includes(constant), `worker does not use ${constant}`);
  }
  for (
    const contract of [
      "jobs.claim_version = p_expected_version",
      "jobs.claim_version = p_claim_version",
      "lease_expires_at = v_now + interval '10 minutes'",
      "jobs.status = 'sending'",
      "notification_attempts = greatest(",
      "if v_role = 'primary'",
      "health_acknowledged_at = null",
    ]
  ) {
    assert(
      outboxSchema.includes(contract),
      `versioned state lacks ${contract}`,
    );
  }
  assert(
    worker.includes("parseNotificationClaim(claimData)") &&
      worker.includes("LEAD_NOTIFICATION_COMPLETE_RPC"),
    "worker bypasses atomic claim/completion RPCs",
  );
  for (
    const contract of [
      "p_delivery_from text",
      "p_delivery_to text",
      "p_delivery_reply_to text",
      "p_delivery_subject text",
      "p_delivery_text text",
      "p_delivery_tag_name text",
      "p_delivery_tag_value text",
      "delivery_from = coalesce(jobs.delivery_from, p_delivery_from)",
      "jobs.delivery_from = p_delivery_from",
      "jobs.delivery_reply_to is not distinct from p_delivery_reply_to",
      "jobs.delivery_tag_name = p_delivery_tag_name",
      "jobs.delivery_tag_value = p_delivery_tag_value",
    ]
  ) {
    assert(
      outboxSchema.includes(contract),
      `claim does not freeze full provider payload: ${contract}`,
    );
  }
  assert(
    handleLead.includes("notificationClaimArgs(") &&
      worker.includes("notificationClaimArgs(") &&
      handleLead.includes("from: job.delivery_from") &&
      worker.includes("from: claimed.delivery_from"),
    "a sender can bypass the atomically frozen provider payload",
  );
  assert(
    !worker.includes('.update(update).eq("id", claimed.id)'),
    "worker still completes claims with an unversioned table update",
  );
  assert(
    outboxSchema.includes("jobs.status in ('pending', 'failed')") &&
      outboxSchema.includes("jobs.status = 'sending'") &&
      outboxSchema.includes("jobs.lease_expires_at"),
    "exhaustion can race an active sending lease",
  );
});

Deno.test("prepared outbox and webhook-event tables are fully repaired before use", () => {
  for (
    const column of [
      "delivery_from",
      "delivery_to",
      "delivery_reply_to",
      "delivery_subject",
      "delivery_text",
      "delivery_tag_name",
      "delivery_tag_value",
      "claim_version",
      "lease_expires_at",
    ]
  ) {
    assert(
      outboxSchema.includes(`add column if not exists ${column}`),
      `prepared outbox repair omits ${column}`,
    );
  }
  assert(
    outboxSchema.includes(
      "alter table public.lead_notification_events\n  add column if not exists event_id text",
    ) &&
      outboxSchema.includes(
        "add column if not exists applied_at timestamptz",
      ) &&
      outboxSchema.includes("$event_schema_contract$"),
    "prepared webhook-event table is not repaired before reconciliation",
  );
  assert(
    outboxSchema.includes(
      "drop trigger if exists leads_enqueue_notifications on public.leads",
    ) && outboxSchema.includes(
      "drop function if exists public.enqueue_lead_notifications()",
    ) && outboxSchema.includes("$prepared_outbox_preflight$"),
    "phase-A repair can retain unsafe superseded enqueue activation",
  );
  assert(
    outboxSchema.includes(
      "drop function if exists public.apply_resend_notification_event(\n  text, text, text, text, timestamptz",
    ),
    "prepared boolean webhook RPC blocks the text-state replacement",
  );
});
