-- Reconcile an owner-accepted screened call without delaying Twilio's private
-- whisper callback. The call row is the serialization point, so concurrent
-- decision/completion retries cannot create duplicate CRM leads.
begin;

-- Persist the owner digit and its call-log state in one transaction. Existing
-- terminal decisions win on retries, so a repeated webhook cannot rewind one.
create or replace function public.commit_owner_screen_decision(
  p_call_sid text,
  p_requested_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  screening_row public.call_screenings%rowtype;
  final_decision text;
begin
  if p_call_sid is null or p_call_sid !~ '^CA[0-9a-fA-F]{32}$'
    or p_requested_decision is null
    or p_requested_decision not in ('accepted', 'voicemail', 'timeout') then
    return null;
  end if;

  -- Use the same lock order as lead reconciliation.
  perform 1 from public.call_logs where call_sid = p_call_sid for update;
  if not found then
    return null;
  end if;
  select * into screening_row
  from public.call_screenings
  where call_sid = p_call_sid
  for update;
  if not found or screening_row.stage is distinct from 'done' then
    return null;
  end if;

  final_decision := coalesce(screening_row.owner_decision, p_requested_decision);
  if screening_row.owner_decision is null then
    update public.call_screenings
    set owner_decision = final_decision,
        updated_at = pg_catalog.now()
    where call_sid = p_call_sid and owner_decision is null;
  end if;

  update public.call_logs
  set status = case final_decision
    when 'accepted' then 'screened-owner-accepted'
    else 'screened-owner-rejected'
  end
  where call_sid = p_call_sid
    and status in (
      'screened-awaiting-owner',
      'screened-owner-accepted',
      'screened-owner-rejected'
    );
  return final_decision;
end
$$;

revoke all on function public.commit_owner_screen_decision(text, text)
  from public, anon, authenticated;
grant execute on function public.commit_owner_screen_decision(text, text)
  to service_role;
comment on function public.commit_owner_screen_decision(text, text) is
  'Atomically persists one immutable private owner decision and its terminal call-log state.';

create or replace function public.reconcile_screened_call_lead(p_call_sid text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_row public.call_logs%rowtype;
  screening_row public.call_screenings%rowtype;
  phone_digits text;
  matched_lead_id bigint;
  reported_name text;
  lead_notes text;
  lead_source text;
  lead_commission boolean;
begin
  if p_call_sid is null or p_call_sid !~ '^CA[0-9a-fA-F]{32}$' then
    return null;
  end if;

  select * into call_row
  from public.call_logs
  where call_sid = p_call_sid
  for update;
  if not found then
    return null;
  end if;

  select * into screening_row
  from public.call_screenings
  where call_sid = p_call_sid;
  if not found or screening_row.owner_decision is distinct from 'accepted' then
    return null;
  end if;

  if call_row.lead_id is not null then
    return call_row.lead_id;
  end if;

  phone_digits := pg_catalog.right(
    pg_catalog.regexp_replace(coalesce(call_row.from_number, ''), '\D', '', 'g'),
    10
  );
  if phone_digits !~ '^[0-9]{10}$' then
    return null;
  end if;

  select l.id into matched_lead_id
  from public.leads as l
  where pg_catalog.right(
      pg_catalog.regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'),
      10
    ) = phone_digits
    and l.created_at >= pg_catalog.now() - interval '90 days'
    and pg_catalog.lower(coalesce(l.status, '')) not in
      ('spam', 'lost', 'third_party', 'ul_request')
  order by l.created_at desc
  limit 1;

  if matched_lead_id is null then
    reported_name := pg_catalog.left(
      nullif(
        pg_catalog.btrim(
          pg_catalog.regexp_replace(
            coalesce(screening_row.state->>'name', ''),
            '[[:cntrl:]]',
            ' ',
            'g'
          )
        ),
        ''
      ),
      120
    );
    lead_source := case call_row.to_number
      when '+14352928802' then 'google_website'
      when '+14356108978' then 'slc_backlink'
      when '+18014620526' then 'slc_gbp'
      else 'unknown'
    end;
    lead_commission := lead_source in ('google_website', 'slc_backlink', 'slc_gbp');
    lead_notes := case
      when coalesce(call_row.notes, '') like 'Assistant screening (%'
        then call_row.notes
      else 'Virtual assistant response: ' ||
        pg_catalog.left(coalesce(call_row.notes, 'not provided'), 500)
    end || ' Caller-ID locality is not the service address. Confirm name and job details with the caller.';

    insert into public.leads (
      name,
      phone,
      address,
      city,
      source_page,
      call_source,
      commission_eligible,
      status,
      tier,
      tier_classifier,
      tier_reason,
      notes,
      submission_key
    ) values (
      coalesce(reported_name, 'Inbound caller — ' || pg_catalog.right(phone_digits, 4)),
      '+1' || phone_digits,
      null,
      nullif(pg_catalog.btrim(pg_catalog.split_part(coalesce(call_row.city, ''), ',', 1)), ''),
      'inbound-call',
      lead_source,
      lead_commission,
      'new',
      'general',
      'auto-inbound-call-assistant',
      'Auto-created by handle-call on first call from this number',
      lead_notes,
      null
    ) returning id into matched_lead_id;
  end if;

  update public.call_logs
  set lead_id = matched_lead_id
  where call_sid = p_call_sid and lead_id is null;

  return matched_lead_id;
end
$$;

revoke all on function public.reconcile_screened_call_lead(text)
  from public, anon, authenticated;
grant execute on function public.reconcile_screened_call_lead(text)
  to service_role;
comment on function public.reconcile_screened_call_lead(text) is
  'Atomically reuses or creates and links one CRM lead after a private owner acceptance. Does not set submission_key or enqueue owner notifications.';

-- One synchronous round trip durably commits the private owner decision and,
-- for an acceptance, reconciles the CRM lead before Twilio receives success.
-- The edge function keeps a separate background retry only for an ambiguous
-- transport timeout; normal success never depends on waitUntil durability.
create or replace function public.finalize_owner_screen_decision(
  p_call_sid text,
  p_requested_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  final_decision text;
  reconciled_lead_id bigint;
begin
  final_decision := public.commit_owner_screen_decision(
    p_call_sid,
    p_requested_decision
  );
  if final_decision = 'accepted' then
    reconciled_lead_id := public.reconcile_screened_call_lead(p_call_sid);
    if reconciled_lead_id is null then
      raise exception 'accepted call lead reconciliation failed';
    end if;
  end if;
  return final_decision;
end
$$;

revoke all on function public.finalize_owner_screen_decision(text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_owner_screen_decision(text, text)
  to service_role;
comment on function public.finalize_owner_screen_decision(text, text) is
  'Durably commits an immutable owner decision and atomically reconciles any accepted CRM lead in one edge-to-database round trip.';

commit;
