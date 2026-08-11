# Felles innloggingsportal for alle Hauge Maskin-systemene

Målet: én e-post og ett passord som virker i grus, rørlager, utleie,
tilbudssystemet, QR-admin og alt som kommer siden – og at brukerne styres fra
adminbordet.

I dag har hver app sitt eget Supabase-prosjekt med sin egen `auth.users`. Samme
person kan ha fem kontoer og fem passord, og et passordbytte må gjøres fem
steder.

Det finnes to veier videre. Den ene er dramatisk enklere og billigere enn den
andre, og den anbefales.

---

## Vei A – ett Supabase-prosjekt, ett skjema per app (anbefalt)

Slå de åtte databasene sammen til **ett** Supabase-prosjekt der hver app får sitt
eget Postgres-skjema:

```
hauge-maskin (ett prosjekt)
├── auth.users          ← én felles brukertabell. Dette ER innloggingsportalen.
├── felles              ← personer, system_tilgang, firmaopplysninger
├── grus                ← tabellene som i dag ligger i grus-prosjektet
├── rorlager
├── utleie
├── tilbud
├── qr
└── public              ← det som faktisk er felles for alle
```

### Hvorfor dette er det riktige svaret

**Den felles innloggingen blir gratis og trivielt enkel.** Det er én
`auth.users`. Ingen JWT-føderasjon, ingen JWKS, ingen samtykkeskjerm å bygge, ingen
nøkkelrotasjon å holde styr på. Vei B nedenfor er tolv arbeidstrinn for å oppnå
det Vei A gir ved å ikke gjøre noe.

**Det koster omtrent 840 kroner mindre i måneden.** Supabase fakturerer per
organisasjon *pluss* per prosjekt:

| | Åtte prosjekter | Ett prosjekt |
|---|---|---|
| Pro-plan (organisasjon) | $25 | $25 |
| Compute, Micro, per prosjekt | 8 × $10 = $80 | $10 |
| Inkludert kreditt | −$10 | −$10 |
| **Sum** | **$95/md** | **$25/md** |

**Gratisnivået holder ikke til åtte prosjekter uansett.** Gratisplanen tillater
to aktive prosjekter, og et gratisprosjekt pauses etter én uke uten trafikk. Med
åtte apper betyr det at halvparten alltid står pauset når noen prøver å bruke
dem.

**Én database å ta backup av, oppgradere og holde øye med.** Adminbordet får ett
kort i stedet for åtte, og en pauset database slutter å være en ukentlig hendelse.

### Hva det koster deg

- **Alle appene deler skjebne.** En dårlig migrasjon eller en full disk tar ned
  alt samtidig. Med åtte prosjekter rammer det ett. For en bedrift der alle
  appene brukes av de samme folkene betyr det i praksis lite: er kontoret nede,
  er det nede.
- **Alle appene deler compute.** På Micro er det 2 vCPU og 1 GB minne. Det holder
  godt for åtte små interne apper, men det er én pott.
- **Tilgang må styres, ikke antas.** Med felles `auth.users` finnes en
  grusbrukers konto også i rørlagerets øyne. Det er `felles.system_tilgang` som
  avgjør hvem som får se hva, og RLS-policyene i hvert skjema må sjekke den. Det
  er en reell, men engangs, jobb – og adminbordet har alt tabellen.
- **Migrasjonen må gjøres én gang per app.** Se oppskriften nedenfor.

### Slik gjør du det, per app

1. **Lag skjemaet i det nye prosjektet.**
   ```sql
   create schema rorlager;
   grant usage on schema rorlager to anon, authenticated, service_role;
   alter default privileges in schema rorlager
     grant all on tables to anon, authenticated, service_role;
   ```

2. **Eksporter og importer.** Kjør appens egne migrasjoner mot det nye skjemaet
   (`set search_path = rorlager;` øverst), og flytt dataene med `pg_dump
   --schema=public` fra det gamle prosjektet, med `public` byttet til `rorlager` i
   dumpen.

3. **Flytt brukerne med passordene i behold.** Dette er nøkkelen til at ingen
   merker migrasjonen. Supabase lagrer passord som bcrypt, og
   `POST /auth/v1/admin/users` tar imot `password_hash` direkte:

   ```jsonc
   {
     "id": "<samme uuid som i det gamle prosjektet>",
     "email": "ola@example.no",
     "password_hash": "$2a$10$…",   // rett fra auth.users.encrypted_password
     "email_confirm": true
   }
   ```

   Send **samme `id`**. Da peker alle fremmednøkler og alle
   `admin_brukere.id`-rader fortsatt på riktig bruker, og ingen tabell må skrives
   om. Hashene hentes ut med Management-API-ets lesespørring – de er ikke
   tilgjengelige over Auth-API-et.

4. **Eksponer skjemaet for API-et.** Data API → Exposed schemas → legg til
   `rorlager`. Uten dette svarer PostgREST 404 på alt.

5. **Endre appens klient.**
   ```ts
   const supabase = createClient(URL, ANON_KEY, { db: { schema: 'rorlager' } })
   ```
   PostgREST kan bare bruke ett skjema per forespørsel. Trenger appen noe fra
   `felles`, må det gjøres med `.schema('felles')` på den enkelte spørringen.

6. **Legg tilgangssjekk i RLS.** Hver policy i skjemaet får et krav om at
   brukeren har en aktiv rad i `felles.system_tilgang` for dette systemet.

7. **Bytt miljøvariablene på Vercel** og rull ut. Behold det gamle prosjektet
   pauset i noen uker som fallback før det slettes.

Ta den minste appen først – `qr-admin` eller `tilbudssystem-mal` – så er
oppskriften prøvd før du rører utleien.

---

## Vei B – behold åtte prosjekter, føderer innloggingen

Om Vei A av en eller annen grunn ikke er aktuell, kan ett prosjekt gjøres til
identitetsnav og de andre settes til å stole på det. Dette *virker*, men det er
mange trinn og flere av dem er beta.

Kort om de tre variantene, og hva som faktisk stemmer:

### B1: Third-party auth (spoke stoler på navets JWT)

Naboprosjektene registrerer navet som ekstern JWT-utsteder:

```
POST https://api.supabase.com/v1/projects/{spoke-ref}/config/auth/third-party-auth
{ "oidc_issuer_url": "https://<nav-ref>.supabase.co/auth/v1" }
```

Forutsetninger og fallgruver:

- **Navet må signere asymmetrisk.** Prosjekter laget før 1. oktober 2025 bruker
  en delt HS256-hemmelighet, og et slikt prosjekt publiserer en **tom** JWKS –
  ingen kan verifisere tokenene. Sjekk med
  `GET /v1/projects/{ref}/config/auth/signing-keys` at det finnes en nøkkel med
  `status: in_use` og algoritme `ES256` eller `RS256`. ES256 er Supabase sin egen
  anbefaling; HS256 er det eneste som ikke virker.
- **Dashbordet lar deg ikke gjøre dette.** Grensesnittet tilbyr bare Clerk,
  Firebase, Auth0, Cognito og WorkOS. API-et tar imot en vilkårlig utsteder, så
  dette må gjøres med curl. Det er dokumentert i API-skjemaet, men er ikke en
  velsignet oppsett-vei.
- **RLS må slippe inn to utstedere under migreringen.** Skriver du en
  restriktiv policy som bare godtar navets `iss`, stenger du samtidig ut alle
  som fortsatt logger inn lokalt:
  ```sql
  create policy "kun kjente utstedere" on rorlager.deler
    as restrictive to authenticated
    using (
      auth.jwt()->>'iss' = 'https://<spoke-ref>.supabase.co/auth/v1'
      or auth.jwt()->>'iss' = 'https://<nav-ref>.supabase.co/auth/v1'
    );
  ```
  Først etter at alle er flyttet kan spoke-utstederen fjernes.
- **`accessToken`-alternativet i supabase-js sprenger `supabase.auth`.**
  Klienten bytter ut `auth` med en Proxy som **kaster** ved all bruk – ikke bare
  gjør ingenting. Hvert `supabase.auth.onAuthStateChange(...)`,
  `supabase.auth.getUser()` og `supabase.auth.signOut()` i alle sju appene må
  *fjernes*, ellers krasjer appen ved første oppslag.

### B2: Navet som OIDC-innloggingsleverandør (ryddigste av de tre)

Hver app registrerer navet som en egen innloggingsleverandør, og brukeren får en
helt vanlig lokal sesjon etterpå. Da slipper man `accessToken`-problemet over.

Rekkefølgen, med de to flaggene som er lette å glemme:

1. På **navet**: `PATCH /v1/projects/{nav}/config/auth` med
   `{"oauth_server_enabled": true}`.
2. På **hvert naboprosjekt**: `PATCH /v1/projects/{spoke}/config/auth` med
   `{"custom_oauth_enabled": true}`. Uten denne feiler trinn 4 med at funksjonen
   ikke er slått på.
3. På **navet**, én per app:
   ```
   POST https://<nav-ref>.supabase.co/auth/v1/admin/oauth/clients
   { "client_name": "rorlager",
     "redirect_uris": ["https://<spoke-ref>.supabase.co/auth/v1/callback"],
     "client_type": "confidential",
     "token_endpoint_auth_method": "client_secret_basic" }
   ```
   Feltet heter `client_name`, ikke `name`. Svaret er 201 og inneholder
   `client_secret` – den vises bare denne ene gangen.
4. På **hvert naboprosjekt**:
   ```
   POST https://<spoke-ref>.supabase.co/auth/v1/admin/custom-providers
   { "provider_type": "oidc", "identifier": "hm", "name": "Hauge Maskin",
     "issuer": "https://<nav-ref>.supabase.co/auth/v1",
     "client_id": "…", "client_secret": "…" }
   ```
   Appen logger så inn med
   `supabase.auth.signInWithOAuth({ provider: 'custom:hm' })`.
5. **Samtykkeskjermen må du bygge selv.** Navet peker på en sti du oppgir i
   `oauth_server_authorization_path`, og siden bak den er din egen kode – i
   praksis en side i dette adminbordet. Dette er den skjulte arbeidsposten i
   hele Vei B.

Gratisplanen tillater tre egendefinerte leverandører per prosjekt. Hver app
trenger én, så alle kan bli stående på gratis.

### B3: SAML

Virker ikke til dette. Supabase kan bare være *Service Provider*, altså
konsumere en ekstern identitetsleverandør. Et Supabase-prosjekt kan ikke være
SAML-IdP for et annet. SAML er bare relevant hvis dere en dag får Entra ID eller
Google Workspace og vil logge inn med det.

---

## Det som er bygget nå

Uansett vei er dette på plass i adminbordet i dag:

- **`personer`** – én rad per menneske, samlet på e-post.
- **`system_tilgang`** – hvem har tilgang til hvilket system, med hvilken rolle
  der, og hvilken bruker-ID de har i det systemet.
- **`/brukere`** – matrisen som viser hvem som finnes hvor. Den er også
  forarbeidet til migrasjonen: hver rad med flere kryss er en person som i dag
  har flere passord.
- **Brukerstyring på tvers** – opprette bruker, sette passord og sperre konto i
  hvilket som helst av systemene, fra ett sted.

Merk én begrensning: adminbordet oppretter bare `auth`-brukeren. De fleste appene
krever i tillegg en rad i sin egen rolletabell (`admin_brukere`,
`super_admin_users`), og den må legges inn i appen selv. Adminbordet later ikke
som det kjenner hver apps rollemodell – å gjette feil der gir en bruker som kan
logge inn, men ikke se noe, og det er verre enn å ikke ha opprettet den.

Går du for Vei A, forsvinner denne begrensningen: da er det én rolletabell.

## Anbefaling

Gå for Vei A. Start med `qr-admin`, som har minst data og færrest brukere. Er den
flyttet og virker, er resten mekanisk arbeid – og innloggingsportalen er ferdig
uten at en linje føderasjonskode er skrevet.
