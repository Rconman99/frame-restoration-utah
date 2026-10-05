#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="utah-owner-recovery-test-${RANDOM}-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --rm -d --name "$container" -e POSTGRES_PASSWORD=synthetic-test-only postgres:16-alpine >/dev/null
for attempt in $(seq 1 40); do
 # PostgreSQL's initialization server listens only on its Unix socket. Wait
 # for the final TCP listener so setup cannot race the initialization restart.
 if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
 sleep 0.25
done
docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon; create role authenticated; create role service_role;
create schema extensions; create extension pgcrypto with schema extensions;
create table public.report_access(id uuid primary key default extensions.gen_random_uuid(),name text not null,pin text not null unique,role text not null,active boolean not null default true,created_at timestamptz default now(),last_accessed timestamptz);
SQL
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20260807000150_dashboard_session_credentials.sql
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20260909010000_owner_password_recovery.sql
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/owner-password-recovery.sql
python3 scripts/test-owner-recovery-race.py "$container"
