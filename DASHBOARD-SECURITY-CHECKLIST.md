# Client Dashboard — Security Checklist

Per-project verification. Run this every install + after any migration that touches `leads`, `calls`, or `report_access`.

**Why this matters:** the Supabase anon key is embedded in `dashboard/index.html` (it has to be — the client-side admin panel uses it to manage `report_access` rows). The anon key is therefore visible to anyone who views the page source. **RLS policies are the only thing preventing that anon key from leaking lead data.** If RLS breaks, every lead's name/email/phone/address is publicly readable.

This checklist verifies RLS is correctly applied + tests it actively.

## Required policies (per `db/rls-policies.sql`)

- [ ] `leads` table: RLS enabled, anon role has SELECT=false, UPDATE=false, DELETE=false, INSERT=true
- [ ] `calls` table: RLS enabled, anon role has FOR ALL = false (read or write)
- [ ] `report_access` table: RLS enabled (default Option B = anon SELECT/INSERT/UPDATE allowed; DELETE = false)

Verify in Supabase Dashboard → Database → Tables → leads → Policies.

## Active test (highly recommended)

```bash
# Try to read leads as anon — should fail with 401 or return empty
ANON_KEY="<your anon key>"
PROJECT_URL="https://<project-ref>.supabase.co"

curl "$PROJECT_URL/rest/v1/leads?select=*" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"

# Expected: empty array [] OR 401
# If you see lead data: STOP, RLS is broken, do not deploy
```

```bash
# Try to insert a lead as anon — SHOULD succeed (form submissions need this)
curl "$PROJECT_URL/rest/v1/leads" \
  -X POST \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"name":"TEST","email":"test@example.com","source_page":"/security-test"}'

# Expected: 201 Created
# If 403: RLS is over-restrictive on INSERT, form submissions will break
```

```bash
# Try to read report_access as anon — SHOULD succeed (admin panel needs this)
curl "$PROJECT_URL/rest/v1/report_access?select=name,role,active" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"

# Expected: array of access records
# If 401: admin panel will break; switch to Option B in rls-policies.sql
```

## Edge function uses service-role

```bash
# Check the secret is set
supabase secrets list --project-ref <PROJECT_REF> | grep SUPABASE_SERVICE_ROLE_KEY

# Should output: SUPABASE_SERVICE_ROLE_KEY (existing)
# If missing: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key> --project-ref <PROJECT_REF>
```

## Anon key handling

- [ ] Anon key in `data/dashboard-config.json` — gitignored if file contains other secrets
- [ ] Anon key in `dashboard/index.html` — public by design (RLS-protected)
- [ ] Anon key NOT in any other client-side code that might leak via console.log or referer

## PIN handling

- [ ] PINs stored in plaintext in `report_access.pin` (current v1 design — not hashed)
- [ ] Admin PIN set + verified working
- [ ] Rotation plan: client knows to call you to rotate if a viewer leaves their team
- [ ] Roadmap: hash PINs in v2 (bcrypt or scrypt) — flag in `MODULE-client-dashboard-spec-v1.md`

## Lead-data minimization

- [ ] Edge function `weekly-report` returns only the subset of lead fields needed for display (name, service, source_page, created_at) — does NOT return email/phone in dashboard payload
- [ ] If your edge function does return PII, document in client onboarding that the dashboard URL is a sensitive credential

## Per-client Supabase isolation

- [ ] This client has their OWN Supabase project (not shared with another client)
- [ ] Project ref documented in CLAUDE.md or `data/dashboard-config.json`
- [ ] Service-role key NOT shared between client projects (each project's own)

## Incident response

If the anon key is compromised (leaked, accidentally committed, etc.):

```bash
# Rotate anon key
supabase projects api-keys --rotate --project-ref <PROJECT_REF>

# Re-deploy with new key in dashboard/index.html (rcbuild dashboard reinstall)
rcbuild dashboard reinstall

# Confirm RLS is the actual protection (run all curl tests above against new key)
```

If a PIN is compromised:

```sql
-- Disable the compromised PIN
UPDATE public.report_access SET active = false WHERE pin = '<compromised>';

-- Generate a replacement
INSERT INTO public.report_access (campaign_key, name, pin, role)
VALUES ('<campaign-key>', 'Replacement User', '<new-pin>', 'viewer');
```

## Sign-off

- Installer: ____________
- Date: ____________
- Tested all 3 curl checks: [ ]
- Set admin PIN: [ ]
- Reviewed RLS in Supabase Dashboard: [ ]
- Documented project-ref + admin PIN in client onboarding doc: [ ]
