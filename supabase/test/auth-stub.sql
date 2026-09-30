-- Det Supabase har som migrasjonene regner med, i minste mulige form.
-- Kjøres før migrasjonene av supabase/test/kjor.mjs. Aldri mot navet.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Hvem som er innlogget, styrt av testen med set_config.
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create function auth.email() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '')
$$;

create function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase gir disse rollene tilgang til alt nytt i public av seg selv. Det
-- er derfor migrasjonene må TA tilgangen fra anon – og testen skal se at de
-- gjør det.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
