-- ═══════════════════════════════════════════════════════════
-- Appkontoar: folk registrerer seg sjølve i mobilappen, og slepp
-- inn når nokon her godkjenner dei.
--
-- `personer` finst frå før og er nøkla på e-post. Den har alt
-- `nav_bruker_id`, med kommentaren «Settes når personen har fått konto i
-- navet». Det er nøyaktig det som skjer her – denne migrasjonen fyller
-- den kolonnen, og legg til ein status for sjølve appkontoen.
--
-- MERK skilnaden mellom dei to flagga på ein person:
--   aktiv   – er personen tilsett? Fanst frå før, blir ikkje rørt her.
--   status  – slepp personen inn i mobilappen?
-- Ein person kan vere tilsett utan å ha appkonto, og ein sperra
-- appkonto skal ikkje gjere personen «ikkje tilsett».
-- ═══════════════════════════════════════════════════════════

alter table public.personer
  add column if not exists status text not null default 'venter'
    check (status in ('venter', 'godkjent', 'sperra'));

alter table public.personer
  add column if not exists godkjent_av uuid references auth.users (id) on delete set null;

alter table public.personer
  add column if not exists godkjent_tid timestamptz;

-- `on delete set null` er ikkje valfritt. Utan det kan ein admin som har
-- godkjent nokon aldri slettast – slettinga feilar på framandnøkkelen.
-- Resten av skjemaet gjer det same, av same grunn.

-- Køen er dei som har registrert seg, ikkje alle som ventar. `personer`
-- inneheld òg folk som berre finst i dei andre systema, og dei har
-- aldri bede om noko.
create index if not exists personer_godkjenningskoe_idx
  on public.personer (status)
  where nav_bruker_id is not null;


-- ── Ny registrering i appen ───────────────────────────────────
--
-- Køyrer INNE i GoTrue sin eigen transaksjon. Det styrer tre val under.
create or replace function public.ny_appbrukar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  oppgitt_namn text;
begin
  oppgitt_namn := nullif(trim(new.raw_user_meta_data->>'navn'), '');

  -- Manglar 'navn', er dette ikkje ei appregistrering. Ein admin oppretta
  -- frå Supabase-dashbordet er den einaste vegen inn for ein ny admin, og
  -- han skal ikkje hamne i godkjenningskøen.
  if oppgitt_namn is null then
    return new;
  end if;

  -- Finst personen frå før, skal han ikkje dublerast. `epost` er unik, så
  -- ein insert ville feila – men verre: personen ville blitt splitta i to
  -- om constrainten ein dag blir slakka.
  update public.personer
     set nav_bruker_id = new.id,
         -- Ein som er avvist skal ikkje kunne registrere seg tilbake i køen.
         status = case when status = 'sperra' then 'sperra' else 'venter' end,
         endret = now()
   where lower(epost) = lower(new.email);

  if not found then
    insert into public.personer (navn, epost, nav_bruker_id, status)
    values (oppgitt_namn, new.email, new.id, 'venter');
  end if;

  return new;
exception
  when others then
    -- Eit unntak her ville fått heile registreringa til å feile med ein
    -- 500 ingen kan tolke. Heller ein navbrukar utan `personer`-rad:
    -- den er synleg i adminbordet under «Registreringar som ikkje kom
    -- fram», og kan rettast. Ei feilmelding brukaren ikkje forstår kan
    -- ikkje rettast av nokon.
    return new;
end;
$$;

drop trigger if exists paa_ny_appbrukar on auth.users;
create trigger paa_ny_appbrukar
  after insert on auth.users
  for each row execute function public.ny_appbrukar();


-- ── Kva appen får vite om seg sjølv ───────────────────────────
--
-- Ei tom sideliste er tvetydig: ho tyder både «ventar på godkjenning»,
-- «sperra» og «godkjent, men ingen sider tildelt». Utan denne visninga
-- kan appen ikkje vise rett skjerm.
--
-- security_invoker = false er standard, men står her med vilje: visninga
-- skal køyre med eigaren sine rettar og handheve regelen sjølv, slik at
-- `personer` kan stå stengd for vanlege brukarar.
create or replace view public.min_status
with (security_invoker = false) as
  select p.status,
         p.navn,
         p.epost
    from public.personer p
   where p.nav_bruker_id = auth.uid();

-- Supabase gir anon, authenticated og service_role select på nye objekt i
-- `public` automatisk. Det held difor ikkje å GI tilgang – det som trengst
-- er å TA den bort frå anon.
revoke all on public.min_status from anon;
grant select on public.min_status to authenticated;
