# Teknisk plan – Hauge Maskin Adminbord

## Hva det er

Ett sted som svarer på tre spørsmål:

1. **Hvor har jeg tingene mine?** Hvilket Supabase-prosjekt, hvilket
   Vercel-prosjekt og hvilket repo hører til hvilken app.
2. **Virker de?** Databasestatus, utrullingsstatus, diskbruk, byggefeil.
3. **Hvem har tilgang?** Brukerne i alle systemene, samlet på e-post, med
   mulighet til å opprette, sette passord og sperre – fra ett sted.

På sikt også: felles innlogging for alle appene. Se
[INNLOGGINGSPORTAL.md](INNLOGGINGSPORTAL.md).

## Stakk

Next.js 16.2.12, React 19.2.4, Tailwind v4, zod 4, `@supabase/ssr`. App Router
med server actions. Rullet ut på Vercel i `fra1`. Samme oppsett som utleieappen,
med vilje: to ulike stakker å holde vedlike er én for mye.

Alt er på norsk – filnavn, funksjonsnavn, databasekolonner, rutestier. Unntaket
er ord som kommer fra et API vi ikke eier: `readyState` fra Vercel og
`ACTIVE_HEALTHY` fra Supabase beholder sin skrivemåte, ellers er de umulige å
slå opp i deres dokumentasjon.

## Sikkerhetsmodellen

Adminbordet holder nøklene til alle de andre systemene. Det er den ene tingen som
former hele designet.

**Ingen hemmelighet kan nå nettleseren.** Hver fil som leser en nøkkel importerer
`server-only`, så bygget feiler i stedet for at nøkkelen stille havner i en
klientpakke. `NEXT_PUBLIC_`-prefiks brukes bare på adminbordets egen
Supabase-URL og anon-nøkkel.

**To roller.** `eier` kan alt. `drift` ser status, men ikke nøkler, ikke
systemregisteret og ikke brukere i andre systemer. Skillet er ikke byråkrati:
`eier` kan lese service role-nøkler til sju produksjonsdatabaser.

**Tilgang sjekkes per handling, ikke per side.** `proxy.ts` frisker bare opp
sesjonen. Hver side og hver server action kaller `krevAdmin()` eller `krevEier()`
selv, fordi en server action er en POST-rute som kan treffes direkte utenfra.

**Plattformtokens i miljøet, prosjektnøkler i databasen.** Management-tokenet og
Vercel-tokenet settes som miljøvariabler på Vercel – de endres nesten aldri. De
andre systemenes service role-nøkler ligger kryptert i databasen med AES-256-GCM,
fordi nye systemer skal kunne legges til uten ny utrulling. Nøkkelen til
krypteringen er `KRYPTONOKKEL` i miljøet, så en databasedump alene er verdiløs.
GCM framfor CBC fordi GCM autentiserer: endres en byte i basen, feiler
dekrypteringen i stedet for å gi ut søppel som deretter sendes til Supabase som
en nøkkel.

**Nøkler vises aldri igjen.** Etter lagring finnes bare et hint på seks pluss
fire tegn. Trenger man nøkkelen, hentes den fra Supabase-konsollet. Adminbordet
er ikke en passordbok man leser fra.

**Alt loggføres.** `hendelseslogg` har ingen update- eller delete-policy, og
skrives bare med service role. En logg den loggede kan endre er ingen logg.

## Hvorfor nøkler for det meste ikke trengs likevel

Supabase sitt Management-API kan kjøre lesespørringer i et prosjekt uten at vi
holder prosjektets nøkkel:

```
POST /v1/projects/{ref}/database/query/read-only
{ "query": "select count(*) from auth.users" }
```

Det betyr at brukerlisten, radtallene og databasestørrelsen leses med **ett**
token, ikke sju nøkler. Alle tabellnavn må være skjemakvalifiserte – også de i
`pg_catalog`.

Nøkler trengs bare til det som *endrer* noe: opprette bruker, sette passord,
sperre konto. Derfor er `hemmeligheter`-tabellen mest tom i praksis, og
grensesnittet sier tydelig hva som mangler når en handling krever en nøkkel som
ikke er lagret.

Management-API-et kan dessuten hente prosjektets egne nøkler
(`/api-keys?reveal=true`), så «Hent fra Supabase»-knappen på systemsiden fyller
dem inn selv. En nøkkel som kopieres manuelt havner i utklippstavla, og ofte i en
samtale etterpå.

## Hvordan siden holder seg rask når sju API-er er trege

**Oversikten gjør to API-kall totalt, ikke to per system.** Både
`GET /v10/projects` (Vercel) og `GET /v1/projects` (Supabase) gir hele lista i
ett kall, med status og siste utrulling inkludert. Alternativet – ett kall per
system – ville vært tjue kall hver gang forsiden lastes, og da treffer man
ratebegrensningen på en travel dag.

**De to kallene går samtidig.** Etter hverandre ville forsiden brukt summen av
begge tidsfristene.

**Alt har en hard tidsfrist på åtte sekunder**, og en feil er en verdi som kan
vises – ikke et unntak som tar ned siden. `hentJson` returnerer alltid et
resultat. Kallstedene skriver `if (!svar.ok) return maaling('ukjent', …)` uten
try/catch, og den ene kilden som glemte feilhåndtering kan ikke lenger ta ned
oversikten for alle de andre.

**Trege deler ligger bak egne Suspense-grenser.** Tittel og meny kommer med én
gang; status strømmer inn etterpå. På systemsiden har databasedelen og
utrullingsdelen hver sin grense, fordi de spør to ulike leverandører og en treg
Vercel ikke skal holde igjen databasetall som alt er klare.

**`cache: 'no-store'` på hvert plattformkall.** Uten det ville Next bakt svaret
inn ved bygg, og adminbordet ville vist driftsstatus fra det øyeblikket koden ble
rullet ut. Det er verre enn ingen status: den ser riktig ut.

Prosjektet bruker **ikke** `cacheComponents`. Statusen skal være fersk hver gang,
og `'use cache'` gjør ingenting uten flagget.

## Fire tilstander, ikke to

`ok`, `advarsel`, `nede`, `ukjent`.

`ukjent` er den viktigste: den skiller «vi har sjekket og det er nede» fra «vi
klarte ikke sjekke». Uten den ville et manglende token sett ut som et
nedetidsvarsel, og da mister varslene troverdighet.

`advarsel` dekker det som virker men ikke er som det skal. En pauset
gratisdatabase er ikke en feil – den pauses etter en uke uten trafikk – men appen
er nede for brukerne. Et bygg som feilet mens forrige versjon fortsatt kjører er
det motsatte: nettsiden er oppe, det er endringen som ikke kom ut. To helt ulike
ting å rykke ut på, og ingen av dem er rødt.

Verste tilstand vinner på systemkortet, og kortene sorteres verst først. Står de
i registerrekkefølge, må man lese alle tolv for å finne det ene røde.

Status vises alltid med **tekst**, aldri farge alene.

## Statushistorikk

Oversikten henter live. Cron-ruten `/api/status/oppdater` lagrer likevel en
måling tre ganger om dagen, fordi spørsmålet man faktisk stiller er «hvor lenge
har dette vært nede» – og det kan ikke besvares fra en tabell som overskrives.
Målinger eldre enn 60 dager slettes, etter at svaret er sendt, med `after()`.

Ruten krever `CRON_SECRET` som Bearer-token. Uten sjekken er det et åpent
endepunkt hvem som helst kan bruke til å utløse et titalls API-kall på våre
tokens – og til å ratebegrense oss ut av vår egen driftsovervåking. Mangler
hemmeligheten, avvises alt.

## «Finnes ute, står ikke i registeret»

Oversikten sammenligner registeret med hva tokenene faktisk ser, og lister opp
Supabase- og Vercel-prosjekter som ingen har registrert. Det er halve grunnen til
at adminbordet finnes: et prosjekt ingen husker er enten glemt eller noe som
skulle vært slettet, og begge koster penger hver måned.

## Filtre

```
src/
  proxy.ts                     Frisker opp Supabase-sesjonen. Ikke tilgangskontroll.
  app/
    layout.tsx                 Fonter, metadata, noindex.
    globals.css                Designsystemet.
    error.tsx                  Feilgrense. Bruker unstable_retry, ikke reset.
    logg-inn/                  Innlogging.
    bytt-passord/              Tvunget passordbytte ved midlertidig passord.
    (panel)/
      layout.tsx               krevAdmin + toppbar. Meny i egen klientkomponent.
      page.tsx                 Oversikten.
      status.tsx               Den trege delen av oversikten, bak Suspense.
      systemer/                Registeret. CRUD, nøkler, detaljside per system.
      brukere/                 Brukere i alle systemer, matrise og handlinger.
      logg/                    Hendelsesloggen.
      innstillinger/           Viser om tokenene virker. Redigerer dem ikke.
    api/status/oppdater/       Cron.
  lib/
    env.ts                     Validerer miljøet ved oppstart. Valgfrie tokens er valgfrie.
    krypto.ts                  AES-256-GCM for de andre systemenes nøkler.
    auth.ts                    hentAdmin / krevAdmin / krevEier.
    data.ts                    Lesing og skriving mot egen database. snake_case → camelCase.
    typer.ts                   Domenetypene.
    format.ts                  Datoer, bytes, «for 3 min siden».
    helse.ts                   Slår sammen begge plattformene til det oversikten viser.
    systemdetalj.ts            Det systemsiden trenger. Seks kall, parallelt.
    brukere.ts                 Brukerlister og samling på e-post.
    supabase/{client,server,admin,fremmed}.ts
    plattform/{hent,vercel,supabase-api}.ts
  components/
    ui.tsx                     Byggeklossene. Ett sted å endre.
    tilstand.tsx               Ett sted som bestemmer hva en tilstand ser ut som.
    hm-logo.tsx
supabase/migrations/
  0001_init.sql                Skjemaet, med RLS på alt.
  0002_seed_systemer.sql       Systemene som fantes da adminbordet ble laget.
```

## Oppsett

1. Lag et nytt Supabase-prosjekt til adminbordet. Det er ikke noen av de andre.
2. Kjør `supabase/migrations/0001_init.sql` og `0002_seed_systemer.sql` i
   SQL-editoren.
3. Kopier `.env.local.example` til `.env.local` og fyll inn. `KRYPTONOKKEL`
   lages med `openssl rand -base64 32`.
4. Lag den første brukeren i Supabase-konsollet (Authentication → Add user), og
   legg inn raden:
   ```sql
   insert into public.admin_brukere (id, navn, epost, rolle)
   values ('<uuid fra auth.users>', 'Thomas Hauge', 'thomashauge03@gmail.com', 'eier');
   ```
5. `npm run dev`.

Uten `SUPABASE_MANAGEMENT_TOKEN` og `VERCEL_TOKEN` starter adminbordet fint, men
viser «uvisst» i stedet for status. Det er med vilje: var de påkrevd, ville en
manglende variabel tatt ned også siden som forklarer hva som mangler.

## Fallgruver som alt har bitt oss

- Mellomvaren heter `src/proxy.ts` og eksporterer `proxy`. `middleware.ts` er
  utfaset i Next 16.
- `cookies()`, `headers()`, `params` og `searchParams` er `Promise`.
- `Date.now()` i en komponent er en lint-feil (`react-hooks/purity`).
  Tidspunktet følger derfor med dataene – `Oversikt.hentetMs` – som er det det
  egentlig er.
- Vercel versjonerer stiene ulikt per ressurs: prosjektlisten er `v10`, ett
  prosjekt `v9`, deploy-listen `v7`, én deploy `v13`. Det ser ut som en skrivefeil.
  Ikke «rett opp».
- Vercel sender alltid `teamId` – uten det svarer et fullkonto-token 403, eller,
  verre, gir en redusert visning der byggefeilene mangler uten at noe ser galt ut.
- Supabase sin helsesjekk krever `services`-parameteren. Uten den er svaret en
  valideringsfeil, ikke alle tjenestene.
- Lesespørringer via Management-API-et svarer **201**, ikke 200, og krever
  skjemakvalifiserte tabellnavn.
