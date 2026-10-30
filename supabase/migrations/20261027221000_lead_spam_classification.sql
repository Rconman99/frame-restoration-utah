-- Utah copy of Frame's shared lead_spam_classification migration (same columns,
-- same classifier contract in every market). MIGRATION FILE ONLY — not applied.
--
-- Machine-owned spam classification for leads.
--
-- Why new columns instead of reusing `status`: `status` is owner-maintained and
-- is not kept current. Measured 2026-08-07 in the first Frame market to run the
-- classifier (72 days of production data; Utah is unmeasured until its first
-- classified month), the weekly marked-spam rate ran
-- 0%, 0%, 0%, 23%, 54%, 52%, 44%, 0%, 2.7%, 54%, 0% — a manual sweep cadence,
-- not a spam signal. The zero weeks are unprocessed, not clean. A 10-minute regex
-- over that market's 57 message-bearing leads found 18 spam rows the sweep had
-- missed, and only 2 of those 57 showed real roofing intent.
--
-- These columns are written ONLY by scripts/classify-lead-spam.py (local Ollama,
-- $0). Nothing here is owner-editable, so the signal cannot rot when nobody
-- clicks. `status` is left untouched — the CRM UI keeps owning it.

alter table public.leads
  add column if not exists spam_label text
    check (spam_label in ('spam', 'real', 'uncertain')),
  add column if not exists spam_score numeric
    check (spam_score >= 0 and spam_score <= 1),
  add column if not exists spam_reason text,
  add column if not exists spam_classifier text,
  add column if not exists spam_classified_at timestamptz;

comment on column public.leads.spam_label is
  'Machine-assigned: spam | real | uncertain. Written only by classify-lead-spam.py. Never hand-edited; use status for human judgement.';
comment on column public.leads.spam_score is
  'Classifier confidence 0-1 that the lead is SPAM. NULL = not yet classified (never treat NULL as real).';
comment on column public.leads.spam_reason is
  'Short model rationale, kept for auditability and for eyeballing false positives.';
comment on column public.leads.spam_classifier is
  'Model + prompt version that produced the label, e.g. "ollama/qwen3:8b@v1". Lets a reclassify sweep target one version.';

-- Partial index: the classifier repeatedly scans for unclassified rows.
create index if not exists leads_spam_unclassified_idx
  on public.leads (created_at desc)
  where spam_label is null;

-- Reporting index for the qualified-lead counts the revenue model depends on.
create index if not exists leads_spam_label_created_idx
  on public.leads (spam_label, created_at desc);
