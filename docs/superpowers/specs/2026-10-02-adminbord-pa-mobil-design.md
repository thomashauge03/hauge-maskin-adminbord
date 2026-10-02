# Adminbordet på mobil – design

Godkjent av eier i chat 02.10.2026.

## Mål

Hele adminbordet skal være like brukbart på telefon som på PC: godkjenne folk i
appen, følge med på driften, styre tilgang i systemene, og resten – registeret,
nøkler, utrulling og innstillinger. På PC skal det se ut som i dag, med to
bevisste unntak (statuslinjer med lange meldinger, og fast e-postkolonne i
tilgangsmatrisen – se under).

Adminbordet skal også kunne legges på Hjem-skjermen med HM-ikon og åpne i
fullskjerm.

## Utgangspunkt

Målt 02.10.2026 på 375 px bredde (iPhone) med ekte data, lokalt mot navet:

| Side | På telefon |
|---|---|
| Brukere | Matrisen er 1186 px i en 340 px boks. E-posten og én av åtte systemkolonner syns om gangen. 146 trykkflater under 44 px, 113 forklaringer bare i `title`. |
| Logg | Siden er 31 054 px høy (171 rader à 179 px, fordi JSON-detaljene brytes i en smal celle). Bare «Når» og «Handling» syns. |
| Systemer | Tabellen er 712 px. Prosjekt-ID-ene brytes over tre linjer. |
| Oversikt | Lange feilmeldinger i statuslinjene presses inn i en smal stripe mellom navn og merke. |
| Appen | Handlingslinja for valgte tar fem rader (ca. 40 % av skjermen). Filtervalgene har 14 px skrift, så iPhone zoomer inn. |
| Overalt | Menyen ruller sidelengs og skjuler Logg og Innstillinger. `KNAPP_LITEN` er 36 px. Kodefeltene (`FELT_KODE`) har 13 px skrift og gir zoom. |
| Greie | Appen-lista, personsiden, Grupper, Sider, systemsiden, Innstillinger, innlogging. |

## Tilnærming

Samme sider og komponenter, gjort responsive. Der en tabell ikke kan krympes,
rendres en listevisning ved siden av tabellen fra de samme dataene, og CSS
velger hvilken som vises (`md:hidden` / `hidden md:block`).

Begge visningene rendres på serveren i stedet for at én tabell stables med
`display: block` på radene: Safari tar bort tabellsemantikken når en tabell får
`display: block`, mens `display: none` på visningen som ikke brukes, fjerner
den helt fra tilgjengelighetstreet. Hver visning blir da riktig for seg.

Forkastet:

- **Egne mobilsider.** Dobbelt vedlikehold, og hver endring må gjøres to steder.
- **Visning valgt i nettleseren med JavaScript.** Serveren vet ikke bredden, så
  siden ville blinket fra én visning til en annen ved lasting.

Brytepunkter:

- **`md` (768 px):** meny, Logg, Systemer og handlingslinja i Appen.
- **`lg` (1024 px):** tilgangsmatrisen i Brukere. Den trenger ca. 1186 px med
  åtte systemer, så et nettbrett på høykant får lista.
- **`pointer-coarse` (berøring):** trykkflater og skriftstørrelse i felt.
  Uavhengig av bredde, fordi problemet er finger mot mus, ikke skjermstørrelse:
  et nettbrett får store flater, og PC med mus beholder tettheten
  designsystemet er laget for.

## 1. Meny og ramme

**Bunnmeny** (ny klientkomponent i `src/app/(panel)/meny.tsx`, ved siden av
`Meny`, så punktene og regelen for aktiv fane deles og ikke driver fra
hverandre):

- Fast nederst, `md:hidden`. Fem like kolonner: Oversikt · Appen · Brukere ·
  Systemer · Mer. Etiketter i `hm-display`, uten ikoner – resten av adminbordet
  har ingen.
- Aktiv fane: rød strek øverst (`border-t-4 border-hm-red`), speilet av den
  røde streken under fanene på PC.
- Appen går rett til køen og har tallmerket når noen venter – samme regel som
  `Meny` i dag.
- **Mer** er en knapp som åpner et panel over linja (Popover API: `popover` og
  `popoverTarget`). Panelet har «Innlogget som {navn} · {rolle}», lenker til
  Logg og Innstillinger, og Logg ut (samme server action `loggUt`). Popover gir
  lukking med Escape og trykk utenfor uten egen kode; lenkene lukker panelet når
  de trykkes. Mer er aktiv når man står på Logg eller Innstillinger.

**Toppen på mobil:** logo, ADMINBORD og rollemerket. Fanene og Logg ut-knappen
skjules under `md` (de ligger i bunnmenyen).

**Plass rundt kantene:**

- `viewportFit: 'cover'`, så `env(safe-area-inset-*)` virker i fullskjerm på
  iPhone.
- Bunnmenyen har `padding-bottom: env(safe-area-inset-bottom)`. Body og
  bunnmenyen har `padding-left/right: env(safe-area-inset-left/right)`, så
  ingenting havner under hakket på liggende telefon.
- CSS-variabelen `--bunnlinje` er høyden på bunnmenyen pluss safe area under
  `md`, og `0px` fra `md`. Den brukes til `padding-bottom` på body og til
  `bottom` på den klebrige boksen i Appen (svaret og handlingslinja), så
  ingenting legger seg bak menyen.

## 2. Brukere: liste per person under `lg`

- Matrisen pakkes i `hidden lg:block`. Under den, i samme kort, en ny visning
  med `lg:hidden` over de samme dataene. Ingenting hentes to ganger.
- **Søkefelt** filtrerer på e-post (uten forskjell på store og små bokstaver,
  mellomrom foran og bak teller ikke). Under feltet: «Viser X av Y».
- **Én `<details>` per person.** Linja som syns: e-posten (brytes om den er
  lang) og «Tilgang i {antallMedTilgang} av {antall systemer lest} systemer ·
  sist inne {visSiden}». Minst 56 px høy, med en pil som vrir seg når den er
  åpen.
- **Åpen:** én rad per lest system med systemnavn og merke.
  - **Eier:** raden er en knapp som åpner tilgangsskjemaet i full bredde.
    `TilgangsCelle` får `visning: 'celle' | 'rad'` (standard `'celle'`), så
    logikken – gi og ta bort, rolle, midlertidig passord, meldinger – er den
    samme som i matrisen. I `'rad'` er lukket tilstand en knapp i full bredde
    (systemnavn til venstre, merke og › til høyre), og åpen tilstand dropper
    `min-w-[13rem]`.
  - **Drift:** radene er ikke knapper. Forklaringen (`merke.forklaring`) står som
    tekst under merket, fordi hover-tekst ikke finnes på telefon.
- **Oppbygning:** serveren bygger hver persons `<details>` (med `TilgangsCelle`
  inni) og sender dem som ferdige elementer, sammen med e-posten, til en liten
  klientkomponent som bare eier søketeksten. Personer som ikke passer søket
  skjules med `hidden`, ikke fjernes – da beholder et åpent tilgangsskjema
  tilstanden sin mens man søker.
- Cellen bygges av én hjelpefunksjon som både matrisen og lista bruker, så
  `tilgangsmerke(…)` og propsene til `TilgangsCelle` står ett sted.
- **Matrisen (fra `lg`):** e-postcellene (`th scope="row"`) og overskriften over
  dem får `sticky left-0` med bakgrunn, så e-posten står fast når man ruller
  sidelengs. Det trengs også på PC når systemene blir flere enn skjermen rommer.
- Kortene «per system, med handlinger» under matrisen er alt lister, og blir som
  de er.

## 3. Logg under `md`

- Tabellen `hidden md:block`. Ny `<ul className="md:hidden">` med én rad per
  hendelse:
  - Linje 1: tidspunkt til venstre, handlingsmerke til høyre.
  - Linje 2: system · utført av.
  - Detaljene (`Kodebit`) i full bredde under, når det finnes noen.
- Regelen for svart merke (`alvorlig`) blir en hjelpefunksjon begge visningene
  bruker.

## 4. Systemer under `md`

- Tabellen `hidden md:block`. Ny liste med ett kort per system: navnet som
  lenke og merkene Skjult og Uten tilsyn; beskrivelsen; Supabase, Vercel og
  Repo på hver sin linje (koder brytes); `RadHandlinger` under (bare eier).
- De bundne handlingene (`settSystemAktiv.bind(…)` osv.) lages én gang per
  system og gis til begge visningene.

## 5. Trykkflater og zoom

- `KNAPP_LITEN` og `KNAPP_FARLIG`: `pointer-coarse:min-h-11` (44 px).
- Ny felles `VELGER` i `src/components/ui.tsx`, som erstatter de to kopiene i
  `appen/brukerliste.tsx` og `appen/handlingslinje.tsx`, med
  `pointer-coarse:min-h-11`.
- Underfanene i Appen og sorteringsvelgeren på Oversikt: større høyde på
  berøring (minst 44 px).
- Avkrysningsboksene i Appen-lista får et trykkområde på 44 × 44 px rundt seg
  (en `<label>`), så et bomtrykk ikke åpner personsiden. Det samme for «Velg
  alle».
- Frittstående tekstlenker (← Alle brukere, Tilbake til registeret) får høyde
  på berøring. Lenker inne i setninger blir som de er (unntatt i WCAG 2.5.8).
- **iPhone-zoom:** én regel i `globals.css` under `@media (pointer: coarse)`:
  `input` (ikke checkbox og radio), `select` og `textarea` får
  `font-size: 1rem`. Regelen er ikke lagdelt, så den vinner over Tailwinds
  `text-sm` (som ligger i `@layer utilities`), og selektoren er sterkere enn
  `.hm-kode`. Kommentaren på `FELT` oppdateres.

## 6. Småting

- **Handlingslinja i Appen** under `md`: «N valgt» og Fjern valget på første
  linje, Godkjenn med gruppevalg på neste, og en «Flere valg»-knapp som viser
  gruppehandlingene og Steng ute. Fra `md` vises alt som i dag. Steng ute
  beholder bekreftelsen.
- **Statuslinjene på Oversikt (`Kildelinje`):** en melding på mer enn 24 tegn får
  egen linje under navnet og merket, på alle bredder. Korte meldinger («Aktiv»,
  «Klar») står på linja som i dag. På PC endrer dette bare linjene som i dag er
  en smal stripe i tre-kolonne-visningen.
- **Tallkort:** merkelappen får `hyphens-auto break-words` (`<html lang="nb">`),
  så «DATABASESTØRRELSE» deles i stedet for å stikke ut av kortet.

## 7. App-ikon og Hjem-skjerm

- `src/app/manifest.ts`: navn «HM Adminbord», kortnavn «Adminbord», `start_url`
  `/`, `display: 'standalone'`, `lang: 'nb'`, tema- og bakgrunnsfarge
  `#0b0b0c`, ikoner 192 og 512 pluss 512 maskable.
- Ikonene lages én gang med sharp fra `public/hm-logo.png`, sentrert på
  `#0b0b0c`: `src/app/icon.png` (fane), `src/app/apple-icon.png` (180 × 180) og
  `public/ikon-192.png`, `public/ikon-512.png`, `public/ikon-maskable-512.png`
  (logoen innenfor den sikre sonen på 80 %). Ikonfilene sjekkes inn; skriptet
  som lager dem gjør det ikke.
- `metadata.appleWebApp`: `capable`, tittel «Adminbord», `statusBarStyle:
  'black'` – samme svart som innloggingssiden og `themeColor` i dag.
- Proxy-matcheren utelater `manifest.webmanifest`, slik den alt utelater `.png`,
  så manifestet ikke koster et kall mot Supabase.
- Ingen service worker og ikke offline: alt i adminbordet er live, og en
  mellomlagret side ville vist gammel status som om den var ny.
- På iPhone har Hjem-skjerm-versjonen egne informasjonskapsler, så man logger
  inn én gang til der.

## Testing

- **Målescript** i nettleseren, kjørt på hver side:
  - ingen sidelengs rulling utenfor beholdere som er ment å rulle;
  - på berøring ingen knapp, lenke, nedtrekksliste eller felt under 44 px
    (lenker i løpende tekst unntatt);
  - ingen felt med skrift under 16 px på berøring.
- **Sider:** `/`, `/systemer`, `/systemer/[slug]`, `/appen`,
  `/appen/person/[id]`, `/appen/grupper`, `/appen/sider`, `/brukere`, `/logg`,
  `/innstillinger` og `/logg-inn`, på 375 px med berøring og på 1280 px med mus.
  PC-skjermbilder sammenlignes med dem fra før.
- **Interaksjoner som ikke endrer data:** bunnmenyen og Mer-panelet, søk og
  åpning i Brukere-lista, åpne og lukke tilgangsskjemaet uten å sende,
  utvalg og «Flere valg» i Appen.
- Lokalt mot navet trykkes ingen knapper som endrer data, og aldri Logg ut
  (`signOut` logger ut eier overalt).
- **Enhetstest** for ren logikk som legges til (e-postsøket) i
  `src/lib/*.test.mjs`, etter mønsteret som finnes.
- `npm run typecheck`, `npm run lint`, `npm test` og `npm run build` grønne før
  push til `main`.

## Utenfor

- Ingen endring i data, server actions eller tilgangsregler.
- Ingen service worker eller offline.
- Vercel-tokenet som svarer 403, og tjenestehelsen som avviser `timeout_ms`, er
  egne saker.
