# handle-lead v7 — Deploy & Test Guide

## What's new in v7

Lead-intake LLM classifier. Every form submission now gets a `tier`:

| Tier | What it means | What changes |
|---|---|---|
| `emergency` | Active leak, water inside, structural risk | 🚨 SMS to Landon, `[EMERGENCY]` email subject, customer auto-text says "calling within 15 min" |
| `urgent` | Recent storm/hail damage, insurance with timeline pressure | 🔥 SMS, `[URGENT]` email, customer auto-text says "calling within the hour" |
| `scheduled` | Quote request, planning a project | Standard notification (current v6 behavior) |
| `general` | Vague info question, browsing | `[INFO]` email, customer auto-text says "back to you within one business day" |
| `spam` | Bot, off-topic, gibberish | **Silent drop.** Saved to DB only. No email. No SMS. |

Classifier picks the tier in two passes:

1. **Heuristic** (instant, $0) — if the form's `issue` dropdown maps cleanly (`leak` → emergency, `hail` → urgent, `insurance`/`old_roof` → scheduled), use that.
2. **OpenRouter LLM** (~300ms, ~$0.00005/lead with Gemini Flash 2.0) — for free-text messages or `issue=other`.
3. **Fail-open** — if both fail, default to `scheduled` so we never lose a lead.

Tier + reason + confidence + classifier-model are persisted to the `leads` table for review.

---

## Pre-deploy: add OpenRouter API key

The classifier reads `OPENROUTER_API_KEY` from the `app_config` table. Without it, the function still works — it just falls back to `scheduled` for anything the heuristic can't handle.

Add the key (replace `sk-or-...` with the real value from https://openrouter.ai/keys):

```sql
INSERT INTO public.app_config (key, value)
VALUES ('OPENROUTER_API_KEY', 'sk-or-...')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

**Optionally** override the model (defaults to `google/gemini-2.0-flash-001`):

```sql
INSERT INTO public.app_config (key, value)
VALUES ('OPENROUTER_MODEL', 'google/gemini-2.0-flash-001')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### Model picker (good options on OpenRouter)

| Model | Cost / 1M in / out | Speed | Notes |
|---|---|---|---|
| `google/gemini-2.0-flash-001` | $0.075 / $0.30 | ~300ms | **Default. Best $/quality balance.** |
| `google/gemini-flash-1.5-8b` | $0.0375 / $0.15 | ~250ms | Half the price; slightly less smart. |
| `meta-llama/llama-3.1-8b-instruct` | $0.018 / $0.018 | ~400ms | Cheapest. JSON output less reliable. |
| `openai/gpt-4o-mini` | $0.15 / $0.60 | ~500ms | More expensive; not better for this task. |
| `anthropic/claude-haiku-4-5` | $1.00 / $5.00 | ~500ms | Overkill for a 5-tier classifier. |

To swap models later, just `UPDATE app_config SET value = 'new/model-slug' WHERE key = 'OPENROUTER_MODEL';` — no redeploy needed.

---

## Deploy

From the Frame Utah repo root:

```bash
cd ~/projects/frame-restoration-utah
supabase functions deploy handle-lead --project-ref hdcflshhomzildwqlmwh --no-verify-jwt
```

The `--no-verify-jwt` flag matches v6's setting (the form posts unauthenticated from the browser — anti-spam relies on the spam tier classifier, not JWT).

---

## Test (after deploy)

Five payloads — one per tier. Run from any terminal. Each should:
- Return `{"success":true,"message":"Lead received!"}`
- Land in the `leads` table with the expected tier
- Trigger (or NOT trigger, for spam) the right notifications

Use a test phone you control instead of `5551234567` if you want to actually receive SMS.

```bash
ENDPOINT="https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-lead"

# 1. EMERGENCY — heuristic short-circuit (issue=leak)
curl -X POST "$ENDPOINT" -H "Content-Type: application/json" -d '{
  "name":"Test Emergency","phone":"5551234567","zip":"84032",
  "issue":"leak","source_page":"/test"
}'

# 2. URGENT — heuristic (issue=hail)
curl -X POST "$ENDPOINT" -H "Content-Type: application/json" -d '{
  "name":"Test Urgent","phone":"5551234567","zip":"84032",
  "issue":"hail","source_page":"/test"
}'

# 3. SCHEDULED — heuristic (issue=insurance)
curl -X POST "$ENDPOINT" -H "Content-Type: application/json" -d '{
  "name":"Test Scheduled","phone":"5551234567","zip":"84032",
  "issue":"insurance","source_page":"/test"
}'

# 4. EMERGENCY via LLM — long free-text overrides dropdown
curl -X POST "$ENDPOINT" -H "Content-Type: application/json" -d '{
  "name":"Test LLM","phone":"5551234567","zip":"84032",
  "issue":"other",
  "message":"Roof is actively leaking right now, water dripping into living room ceiling, can someone come today??",
  "source_page":"/test"
}'

# 5. SPAM — should silently drop (no email, no SMS, but row in DB)
curl -X POST "$ENDPOINT" -H "Content-Type: application/json" -d '{
  "name":"Bot McBot","phone":"0000000000","zip":"00000",
  "message":"Buy cheap viagra now click here http://spam.example.com",
  "source_page":"/test"
}'
```

### Verify in DB

```sql
SELECT id, created_at, name, tier, tier_reason, tier_confidence, tier_classifier
FROM public.leads
WHERE name LIKE 'Test%' OR name LIKE 'Bot%'
ORDER BY created_at DESC LIMIT 10;
```

Expected:
- Tests 1-3: `tier_classifier = 'heuristic'`, `tier_confidence = NULL`
- Test 4: `tier = 'emergency'`, `tier_classifier = 'google/gemini-2.0-flash-001'`, confidence 0.7-1.0
- Test 5: `tier = 'spam'`, `tier_classifier = 'google/gemini-2.0-flash-001'`

### Verify notifications

- Tests 1-4: Landon should receive SMS (Verizon gateway) within ~15s. Subject prefix shows the tier.
- Test 5: Landon should receive **nothing**. Lead is in DB only.

### Cleanup test rows

```sql
DELETE FROM public.leads WHERE name LIKE 'Test%' OR name LIKE 'Bot%';
```

---

## Rollback

If something breaks, redeploy v6:

```bash
# v6 source can be re-fetched via:
supabase functions download handle-lead --project-ref hdcflshhomzildwqlmwh
# (but only if Supabase still has v6 cached — better to keep this file as backup)
```

The DB columns added by the migration are non-destructive — old rows have `tier='unclassified'` and v6 doesn't reference them. Safe to leave in place even on rollback.

---

## What v7 does NOT change

- Form HTML / JS — no changes needed
- Form endpoint URL — same
- Existing leads — none of them get reclassified retroactively (would need a backfill script if desired)
- Twilio 10DLC — still pending; Verizon gateway still primary
- Formspree configuration — still in use for email + Verizon SMS path

---

## Future enhancements (next playbook items)

- **Backfill historical leads** with classification (one-time script, ~3 leads in DB right now)
- **Weekly tier-distribution report** in daily ops digest ("this week: 2 emergency, 1 urgent, 8 scheduled, 3 spam")
- **Telemetry to local-llm-toolkit** — log each classification to `~/.cache/local-llm-telemetry.jsonl` so cost shows up in `llm_telemetry.py weekly`
