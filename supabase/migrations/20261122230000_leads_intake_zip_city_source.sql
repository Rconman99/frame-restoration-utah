-- Store the lead form's ZIP, and where a lead's city came from, on `leads`.
-- `leads.city` already exists (baseline 20260401000003) and handle-lead starts
-- writing the typed city to it in the same change.
--
-- Additive and idempotent. FILE ONLY: nothing applies this automatically.
-- handle-lead tolerates these columns being absent (it retries the insert
-- without them), so the function may deploy before or after this runs.
--
-- Commission note: `leads.commission` is GENERATED from `leads.city`
-- (5% Heber / Heber City / Midway, 10% elsewhere). This migration does not
-- touch that rule. The companion handle-lead change is what starts filling
-- `city` on new web leads; existing rows are not backfilled.

alter table public.leads add column if not exists zip text;
alter table public.leads add column if not exists city_source text;

comment on column public.leads.zip is
  'ZIP typed on the lead form (5-digit or ZIP+4), or null. Not verified against the property.';
comment on column public.leads.city_source is
  'How leads.city was set: ''form'' = typed by the customer on the lead form; null = not recorded or set by hand in the CRM.';
