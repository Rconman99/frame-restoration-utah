-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 0 HARDENED BASELINE — website_leads_report view
-- Authored 2026-06-14 from live schema capture (verbatim 3-branch UNION).
-- Depends on leads + call_logs + sms_logs (created in earlier baseline files).
--
-- HARDENED NOTE: live Utah ships this view as an owner-rights (non-security_invoker)
-- view with GRANT ALL TO anon, so the anon key can read all leads/calls/SMS through it
-- (bypassing base-table RLS). This baseline sets `security_invoker = true` so the view
-- runs with the caller's privileges and honors the locked base-table RLS, and grants
-- it to service_role only (see hardened-rls file). This is the intended hardened shape.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.website_leads_report
  with (security_invoker = true)
  as
   select (leads.id)::text                 as lead_id,
          leads.created_at,
          'form'::text                       as lead_type,
          leads.name                         as contact_name,
          leads.phone                        as contact_phone,
          leads.email                        as contact_email,
          leads.source_page,
          leads.status,
          leads.job_value,
          leads.commission,
          leads.notes
     from public.leads
  union all
   select (call_logs.id)::text             as lead_id,
          call_logs.created_at,
          'call'::text                       as lead_type,
          null::text                         as contact_name,
          call_logs.from_number              as contact_phone,
          null::text                         as contact_email,
          call_logs.city                     as source_page,
          call_logs.status,
          null::numeric                      as job_value,
          null::numeric                      as commission,
          call_logs.notes
     from public.call_logs
    where call_logs.status <> 'initiated'::text
  union all
   select (sms_logs.id)::text              as lead_id,
          sms_logs.created_at,
          'sms'::text                        as lead_type,
          null::text                         as contact_name,
          sms_logs.from_number               as contact_phone,
          null::text                         as contact_email,
          sms_logs.city                      as source_page,
          'new'::text                        as status,
          null::numeric                      as job_value,
          null::numeric                      as commission,
          sms_logs.body                      as notes
     from public.sms_logs
    where sms_logs.direction = 'inbound'::text
    order by 2 desc;
