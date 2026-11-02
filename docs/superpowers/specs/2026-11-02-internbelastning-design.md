# Internbelastning av maskintimer og masser på prosjekt

Skrevet 2. november 2026. Utgangspunktet er e-posten fra Karl Kristian Vårdal
(tall-teller.no) 30. oktober 2026 etter et møte dagen før.
Punktene der om Tripletex-status, signeringslenke og skilt er utenfor denne
saken, fordi Thomas allerede har dem i arbeid.

Status: **valgene er tatt** (2. november 2026). Thomas ville ikke vente på
svarene fra Karl Kristian: «vi driter i svarene nå, bare forklar valgene
dine så ser vi». Valgene står under «Valgene», med begrunnelse og hva som
skal til for å snu dem. Alt som påvirker tallene, er en innstilling eller en
liste i adminbordet og ikke kode, så et annet svar fra Karl Kristian krever
ingen ny bygging.

---

## Hvorfor

Prosjektregnskapet i Tripletex skal vise hva et prosjekt faktisk har kostet.
I dag kommer maskinbruken ikke med, fordi timene ligger i SmartDok og
kostnaden ligger samlet i regnskapet. Karl Kristian vil at:

1. Hvert prosjekt belastes med **maskintimer ført i SmartDok × internkostnad
   per time for maskinen**, slik den er registrert i SmartDok.
2. Det interne prosjektet **2011700 Direkte objektkostnader** speiler det
   samme beløpet, slik at det som belastes prosjektene godskrives der.
3. Saldoen på 2011700 (de virkelige maskinkostnadene minus det som er
   belastet) blir **over- eller underdekning**. Den går inn i
   administrasjonskostnaden.
4. Administrasjonskostnaden er summen av
   - 2011600 Administrasjon
   - 2011601 Fravær administrasjon
   - 2011800 Salg av driftsmidler
   - 2013100 Service og vedlikehold
   - over- eller underdekningen på 2011700

   Den fordeles på de eksterne prosjektene etter hver enkelts andel av
   omsetningen.
5. Er avviket på 2011700 stort ved normal drift, er internkostnaden per
   maskintime feil satt og må justeres i SmartDok.

Punkt 4 i e-posten handler om internt uttak av masser til prosjekter med
fastpris. Det skal ikke faktureres, men det er en kostnad for prosjektet. Det
er samme mekanisme med en annen kilde: grusappen i stedet for SmartDok, og
massetaket i stedet for 2011700. Derfor hører det hjemme i denne saken. Det
bygges i trinn 2.

**Thomas' egne ord:** «vi har jo mange systemer, vil at dette skal henge litt
sammen.» Derfor skal internbelastningen ligge i adminbordet, ved siden av den
felles prosjektlista og SmartDok-nøkkelen, og ikke bli et sjuende system.

## Mål

- Én månedlig kjøring som henter maskintimene, regner beløpet, viser det for
  kontroll og fører det i Tripletex som ett bilag med prosjekt på hver linje.
- Ingen time belastes to ganger, og ingen time blir glemt.
- En rapport som viser administrasjonspotten, over- eller underdekningen og
  fordelingen etter omsetning.
- Avviket per måned skal være synlig nok til at internkostnaden kan justeres.

## Ikke mål

- Ikke lønn, ikke fakturering til kunde, ikke timepriser ut til kunde
  (`PricePerHour` i SmartDok er utpris og brukes ikke).
- Ingen endring av timer eller maskiner i SmartDok. Det eneste vi skriver
  tilbake, er merket «eksportert eksternt» på timeføringene vi har belastet.
- Fordelingen av administrasjonskostnaden blir ikke bokført automatisk i
  første omgang. Den kommer som rapport. Bilag for fordelingen kan komme
  senere, når tallene har vist seg å stemme.
- Ikke kostnad per maskin i regnskapet. Tripletex vet ikke hva hver enkelt
  maskin har kostet, så avviket kan bare måles samlet.

## Ting som ville gjort dette til en fiasko

- **Dobbel belastning.** Et bilag som føres to ganger, eller timer som
  belastes i to måneder, gir feil prosjektresultat uten at noen ser det.
- **Stille null.** En maskin uten internkostnad som blir belastet med 0 kr,
  gjør at avviket på 2011700 ser større ut enn det er, og at noen justerer
  feil sats.
- **Bilag uten menneske.** Ingenting føres i regnskapet før noen har sett
  tallene og trykket godkjenn.
- **Sletting i Tripletex.** Integrasjonen sletter aldri noe der. Er et bilag
  feil, reverseres det av et menneske i Tripletex.

---

## Det som er sjekket mot de ekte systemene (2. november 2026)

- **SmartDok-API-et har det som trengs.** `GET /Machines` gir hver maskin med
  `InternalCost` (internkostnad per time) og `PricePerHour` (utpris).
  Timeføringene (`GET /WorkHours` og `/WorkHours/v2`) har prosjekt og
  `MachineHourRegistrations` (maskin-id og timer). `POST
  /WorkHours/SetExportedExternal` merker timeføringer som eksportert, med vår
  egen id, og `GET /WorkHours?exportedExternal=false` henter bare de som ikke
  er merket. SmartDok skriver selv at merket ikke påvirker noe annet hos dem.
- **Nøkkelen i adminbordet mangler rettighetene.** Den virker for prosjekter,
  men maskiner og timer svarer 401 med «Missing claims: MachinesRead» og
  «WorkHoursRead». Det må legges til i SmartDok (se «Venter på Thomas»).
- **Prosjektnumrene er de samme i SmartDok og Tripletex.** 2011600, 2011601,
  2013100, Eikås 2010103, Urdal 2010106 og Skaret 2020144 finnes i SmartDok
  med de numrene Tripletex bruker. 2011700 og 2011800 finnes **ikke** i
  SmartDok. Det er greit, for ingen fører timer på dem; de finnes bare i
  Tripletex.
- **Tripletex brukes allerede fra grusappen** med en API-nøkkel
  (`TRIPLETEX_NOKKEL`, byttes mot sesjonstoken med
  `/token/session/:createFromRefreshToken`, minst 300 sekunder). Fallgruvene
  derfra står i `hauge-maskin-grus/docs/superpowers/TRIPLETEX-OVERLEVERING.md`
  og gjelder her også.

### Tall fra SmartDok, juli til oktober 2026

Hentet 2. november med den nye nøkkelen. Ikke-attesterte timer er med, så
tallene er et anslag og ikke det som ville blitt ført.

| Måned | Maskintimer | Belastning etter internkostnad | Herav «Håndarbeid» |
|---|---|---|---|
| Juli | 1 738 | 483 653 kr | 29 400 kr |
| August | 3 317 | 1 017 934 kr | 58 537 kr |
| September | 3 153 | 916 857 kr | 57 300 kr |
| Oktober | 2 661 | 783 807 kr | 49 067 kr |

- 129 maskiner i registeret, 88 aktive. **49 av de aktive har internkostnad.**
- August til oktober: 9 130 maskintimer på 76 prosjekter. **1 238 av dem er
  på maskiner uten internkostnad** og ville gitt 0 kr. Mest gjelder det
  lastebilene: Scania R770 (563 timer, sats 0) og Volvo FH16/700 (530 timer,
  ingen sats). Resten er firmabiler (Hilux, Sprinter, Partner, Transit) med
  sats 0, Cat 906 og NorSlep tippsemi.
- **«100604 Håndarbeid» er registrert som en maskin** med 50 kr i timen, og
  har flest timer av alle (3 298 timer på tre måneder). Nesten hver
  timeføring har en maskinlinje.
- **Innleide maskiner har internkostnad** (Innleid 8, 15 og 25 tonner,
  Innleid dumper: 140 til 224 kr). Leiekostnaden kommer trolig også på
  prosjektet via leverandørfakturaen.
- Interne prosjekter har maskintimer: 2011600 Adm. (684 timer, 75 279 kr),
  2013100 Service (534 timer, 117 463 kr), Eikås massetak (269 timer,
  41 206 kr) og Massetak Urdalen (92 timer, 7 707 kr).
- Utstyr belastes ved siden av maskinen det sitter på (for eksempel
  «Rotortilt R8 - Volvo 235», 87 kr i timen).

## Hvordan det henger sammen

```
SmartDok                    Adminbordet (navet)                 Tripletex
─────────                   ──────────────────                  ─────────
Maskiner + internkostnad ─┐
Timeføringer m/maskin ────┼─▶ Månedskjøring: hent, regn, kontroller
                          │        │
                          │        ▼  menneske godkjenner
                          │   Bilag ──────────────────────────▶ Debet: prosjekt X
                          │        │                             Kredit: 2011700
  «Eksportert eksternt» ◀─┘◀───────┘ (etter at bilaget finnes)

Grusappen (trinn 2)
Internt uttak på prosjekt ──▶ samme kjøring ──────────────────▶ Debet: prosjekt X
                                                                 Kredit: massetaket

Tripletex hovedbok ─────────▶ Rapport: adminpott, avvik 2011700, fordeling
```

### Kjøringen, steg for steg

1. **Hent.** Alle attesterte timeføringer med maskintimer fra startdatoen
   for ordningen og fram til slutten av måneden som kjøres, som ikke er
   belastet før, og maskinregisteret med internkostnad. Det er altså ikke bare
   timene datert i måneden: en time som attesteres sent, kommer med i neste
   kjøring i stedet for å bli glemt. Hvilke timer som er belastet, lagres i
   navet (timeførings-id per kjøring) og er det som avgjør. Merket «eksportert
   eksternt» i SmartDok er en speiling for dem som ser i SmartDok, ikke vernet
   mot dobbel belastning (valg 10). SmartDoks regler fra oktober 2026 gjelder: kallene går etter
   hverandre, ikke samtidig, og 429 gir pause og nytt forsøk (se
   `src/lib/prosjekter/smartdok.ts`).
2. **Regn.** Timer × internkostnaden slik den står i SmartDok i det øyeblikket
   kjøringen lages. Satsen lagres på hver linje, så kjøringen kan forklares
   senere selv om satsen endres.
3. **Stopp det som ikke kan føres.** Disse stopper kjøringen fra å godkjennes,
   med et eget statusord og ikke bare en tekst:
   - maskin med internkostnad 0 eller tom som ikke står på listen «belastes
     ikke» (`mangler_sats`, valg 4)
   - prosjekt som ikke finnes i Tripletex (`mangler_prosjekt`)
   - timer ført på maskin som ikke finnes i registeret (`ukjent_maskin`)

   Kontoret retter i SmartDok, eller setter maskinen på listen, og henter på
   nytt. Det skal ikke gå an å godkjenne med null kroner på en linje uten at
   noen har bestemt det.
4. **Vis.** En side i adminbordet med sum per prosjekt, sum per maskin, totalen
   som godskrives 2011700, maskinene som ikke belastes, og alle stopp.
   Interne prosjekter vises for seg, men belastes som de andre (valg 6).
5. **Godkjenn.** Eieren av adminbordet trykker godkjenn (valg 11). Da
   lages ett bilag i Tripletex datert siste dag i måneden: én debetlinje per
   prosjekt og én kreditlinje på 2011700.
6. **Merk.** Først når bilaget finnes i Tripletex, merkes timeføringene i
   SmartDok med bilagsnummeret som `exportedExternalId`. Rekkefølgen er med
   vilje: blir merkingen ikke gjort, kan den gjøres på nytt uten nytt bilag,
   mens et merke uten bilag ville fått timene til å forsvinne.

### Statusord for en kjøring

Samme prinsipp som i grusappens Tripletex-kø: forskjellen mellom to tilstander
skal være et eget ord, ikke en formulering.

| Ord | Betyr |
|---|---|
| `utkast` | Hentet og regnet, ikke godkjent. Kan hentes på nytt. |
| `stoppet` | Har minst én linje som ikke kan føres. |
| `sender` | Bilaget er på vei til Tripletex. |
| `ukjent_utfall` | Tidsavbrudd eller 5xx: bilaget **kan** finnes. Aldri send på nytt før et menneske har sett i Tripletex. |
| `bokfort` | Bilaget finnes, men timene er ikke merket i SmartDok ennå. |
| `ferdig` | Bilaget finnes og timene er merket. Låst. |

### Rapporten om administrasjonskostnaden

Leses fra Tripletex' hovedbok for en valgt periode:

- kostnadene på 2011600, 2011601, 2011800 og 2013100
- saldoen på 2011700, altså over- eller underdekningen
- omsetningen per eksternt prosjekt
- hvert prosjekts andel av omsetningen og dermed av administrasjonspotten
- avviket på 2011700 i prosent av det som er belastet, måned for måned

Rapporten skriver ingenting.

### Trinn 2: internt masseuttak

Grusappen har allerede transportseddelen og samlekontoen «Internt masseuttak».
Det som trengs:

- at et internt uttak kan knyttes til et prosjekt fra den felles prosjektlista,
- at det ikke går til fakturagrunnlaget,
- at adminbordet leser uttakene rett fra grusappens database med
  service role-nøkkelen som allerede ligger kryptert i navet,
- at kjøringen i adminbordet tar det med som egne linjer: debet prosjektet,
  kredit massetakets prosjekt (Eikås 2010103, Urdal 2010106, Skaret 2020144),
  til kostprisen i grusappen (valg 9).

---

## Valgene

Tatt 2. november 2026 uten svar fra Karl Kristian, etter Thomas' ønske. Hvert
valg sier hvorfor, og hvor det snus hvis han svarer noe annet.

1. **2011700 tas som Karl Kristian beskrev det.** Vi går ut fra at de
   virkelige maskinkostnadene (drivstoff, avskrivninger, leasing, forsikring,
   reparasjoner) føres på 2011700. Byggingen avhenger ikke av det: bilaget og
   rapporten er de samme uansett. Men avviket i rapporten er bare riktig hvis
   det stemmer, så rapporten viser ved siden av avviket hvor mye som er ført
   på 2011700 utenom bilagene våre. Står det nesten ingenting der, ser man at
   avviket er meningsløst før noen justerer satser etter det.
2. **Samme kostnadskonto på begge sider.** Debet på hvert prosjekt, kredit på
   2011700, samme konto. Internbelastningen går da i null for firmaet og
   flytter bare kostnaden mellom prosjekter, så årsresultatet blir aldri
   påvirket av en feil sats. Kontonummeret er en innstilling i adminbordet.
   Bilag kan ikke sendes før den er satt. *Snus ved:* to ulike kontoer i
   innstillingen.
3. **Start 1. november 2026, én kjøring per måned, datert siste dag i
   måneden.** November er første hele måned etter at nøklene kom på plass.
   Juli til oktober kan regnes og vises, men aldri sendes. Timer som
   attesteres sent, kommer med i neste kjøring og får den månedens dato, i
   stedet for å skrive i en måned som kan være lukket. *Snus ved:* startdatoen
   er en innstilling.
4. **Sats 0 eller tom stopper kjøringen, med mindre maskinen står på listen
   «belastes ikke».** I SmartDok kan vi ikke se forskjell på en 0 noen har
   skrevet med vilje og en sats ingen har fylt inn. Scania R770 med 0 er
   nesten sikkert glemt; firmabilene kan være et valg. Derfor bestemmer et
   menneske det én gang per maskin, i adminbordet, og det huskes. Listen
   startes med firmabilene (Hilux, Sprinter, Partner, Transit). Lastebilene
   Scania R770 og Volvo FH16 settes **ikke** på listen: de må få sats i
   SmartDok før første kjøring.
5. **Håndarbeid belastes.** Den står i SmartDok som maskin med 50 kr i timen.
   Noen har satt den satsen med vilje, og regelen fra Karl Kristian er timer
   på maskin × sats. Den vises som egen linje, så det synes hva den utgjør
   (rundt 55 000 kr i måneden). *Snus ved:* sett den på listen «belastes
   ikke».
6. **Innleide maskiner belastes ikke.** Leien kommer på prosjektet via
   leverandørfakturaen, og leiekostnaden står ikke på 2011700. Belastet vi
   dem, ville prosjektet betalt to ganger og 2011700 blitt godskrevet for noe
   den aldri har kostet. Listen «belastes ikke» startes med de åtte
   «Innleid/Innleie»-maskinene. *Snus ved:* ta dem av listen.
7. **Alle prosjekter belastes, også de interne.** Maskintimer på 2011600 Adm.,
   2013100 Service og massetakene belastes som alle andre. 2011700 skal
   godskrives for all maskinbruk, ellers ser avviket større ut enn det er. At
   2011600 og 2013100 da får maskinkostnad, er riktig: de går inn i
   administrasjonspotten likevel, og massetakene får vite hva grusen koster å
   ta ut. Bare 2011700 selv belastes aldri.
8. **Bare attesterte timer.** 93 % av timene august til oktober er attestert
   av admin. Uattesterte timer kan endres, og da ville bilaget sagt noe annet
   enn SmartDok. De tas med når de er attestert, i neste kjøring.
9. **Internt masseuttak til kostpris, godskrevet massetaket.** Kostprisen
   (innkjøpsprisen) finnes alt i grusappen. Utsalgsprisen ville gitt
   massetaket en fortjeneste på eget firma. Bygges i trinn 2, etter
   maskintimene.
10. **Navet er vernet mot dobbel belastning, og merket i SmartDok brukes
    også.** Sjekket 2. november: ingen av 4 121 timeføringer august til
    oktober har «eksportert eksternt», og ingen er eksportert til lønn. Merket
    er altså ledig, og vi bruker det med bilagsnummeret som id, så det synes i
    SmartDok hva som er belastet. Det som avgjør, er likevel listen over
    timeførings-id-er i navet.
11. **Bare Thomas godkjenner, og Karl Kristian får ikke tilgang til
    adminbordet.** Adminbordet holder nøklene til alle systemene, og en egen
    rolle for én ekstern bruker er mye å bygge for lite. Rapporten kan lastes
    ned og sendes til ham. *Snus ved:* en egen rolle senere, hvis han vil inn.
12. **Fordelingen av administrasjonskostnaden er en rapport, ikke et bilag.**
    Den viser både måneden og hittil i år. Eksterne prosjekter er alle
    prosjekter utenom 2011600, 2011601, 2011700, 2011800 og 2013100, og
    massetakene regnes som eksterne fordi de har salg. Omsetning er kontoene
    3000 til 3999. *Snus ved:* listen over interne prosjekter og
    kontointervallet er innstillinger.

## Rekkefølgen

1. **Beregning uten Tripletex.** Hent, regn og vis en måned i adminbordet,
   med stopp og listen «belastes ikke». Ingenting sendes noe sted. Her kan
   tallene for juli til oktober sjekkes før noe føres.
2. **Bilaget.** Konto og startdato i innstillingene, av-bryteren, ett bilag
   per måned, merking i SmartDok. Første bilag føres sammen med Thomas og
   kontrolleres i Tripletex.
3. **Rapporten** om administrasjonskostnaden.
4. **Internt masseuttak** fra grusappen.

## Gjenstår før første bilag

- Kontonummeret (valg 2).
- Sats på Scania R770 og Volvo FH16 i SmartDok (valg 4).
- Prøve at Tripletex-nøkkelen får føre bilag. Det kan bare prøves med et ekte
  bilag.

## Spørsmålene som ble lagt til side

Står her i tilfelle Karl Kristian svarer likevel. Hvert svar snus i valget
med samme tema over.

1. **De virkelige maskinkostnadene på 2011700.** Føres drivstoff,
   avskrivninger, leasing, forsikring og reparasjoner på prosjekt 2011700 i
   Tripletex i dag? Hvis avskrivninger og leasing føres uten prosjekt, består
   saldoen nesten bare av våre egne kreditlinjer, og avviket blir meningsløst.
   Hvor går grensen mot 2013100 Service og vedlikehold, så ingen kostnad telles
   to ganger i administrasjonspotten? Og belaster noen maskinkostnad på
   prosjekter for hånd i dag, som må stoppe når dette starter?
2. **Konto.** Hvilken konto debiteres på prosjektene, og hvilken krediteres på
   2011700? Forslaget er samme kostnadskonto på begge sider, så
   internbelastningen går i null for firmaet som helhet og bare flytter
   kostnaden mellom prosjekter.
3. **Start, hyppighet og dato.** Fra hvilken dato skal timer belastes? Er en
   kjøring per måned, datert siste dag i måneden, riktig? Timer som attesteres
   sent, kommer med i neste kjøring og får den måneds dato. Er det greit, og
   låses perioder i Tripletex slik at et bilag på en lukket måned blir avvist?
4. **Internkostnad på alle maskiner.** 39 av 88 aktive maskiner mangler
   internkostnad, og lastebilene Scania R770 og Volvo FH16 (til sammen rundt
   1 100 timer på tre måneder) står uten. Skal de ha sats før vi starter? Er
   sats 0 på firmabilene et valg (ikke belast) eller bare ikke fylt inn? Er
   alle satsene per time? Utstyr som er satt opp med pris per dag eller per
   enhet, blir feil med timer × sats.
4b. **Håndarbeid.** «Håndarbeid» er lagt inn som maskin med 50 kr i timen og
   står for over en tredjedel av maskintimene. Skal den belastes som
   maskinkostnad, og skal den godskrives 2011700?
4c. **Innleide maskiner.** De innleide maskinene har internkostnad i SmartDok.
   Hvis leien også kommer på prosjektet via leverandørfakturaen, blir
   prosjektet belastet to ganger. Skal de holdes utenfor?
5. **Timer på interne prosjekter.** Skal maskintimer ført på 2011600 eller
   2013100 (for eksempel en maskin brukt til service) også belastes, eller
   bare timer på eksterne prosjekter?
6. **Internt masseuttak.** Til hvilken pris: innkjøpsprisen (kostprisen i
   grusappen) eller en egen internpris? Og skal det godskrives massetakets
   prosjekt?
7. **Fordelingen.** Over hvilken periode regnes omsetningsandelen (måned eller
   hittil i år)? Hvilke prosjekter regnes som eksterne, og hvilke kontoer er
   omsetning?
8. **Bilag eller rapport.** Holder det med en rapport for fordelingen av
   administrasjonskostnaden i første omgang, slik dette utkastet foreslår?

## Nøklene (gjort 2. november)

1. **SmartDok:** ny nøkkel med Les prosjekter,
   Les maskiner, Les timer og Skriv timer. «Skriv timer» trengs for
   eksportmerket, men gir også lov til å registrere og endre timer. Koden
   skal bare bruke den til `SetExportedExternal`.
2. **Tripletex:** lagt inn under Innstillinger → Tripletex (cfa785c,
   9044d63). Prøven fant Hauge Maskin AS, prosjekt 2011700 og lesetilgang til
   kontoplanen. Thomas bestemte 02.11.2026 at alt skal ligge i adminbordets
   database (navet), der de andre nøklene allerede er. SmartDok-nøkkelen og
   grusappens service role-nøkkel ligger der kryptert. Tripletex-nøkkelen gjør
   ikke det: grusappens nøkkel er en hemmelighet i grusappens edge-funksjon og
   kan ikke leses ut. En nøkkel må derfor legges inn i navet, kryptert som de
   andre. Det bør være en egen nøkkel, ikke den grusappen bruker, så den ene
   kan trekkes tilbake uten å stoppe den andre.

## Overlatt til den som bygger

- `GET /WorkHours` (v1, maks 93 dager per kall) ser ut som det beste valget:
  med `includeMachineHours=true` kommer maskintimene som egne rader med
  `MachineHourId`, `EquipmentId`, `ProjectNumber` og `AdminAttested`, og
  feltet `ExportedExternal` finnes bare der. Lengre perioder hentes i biter.
- Tabellene i navet for kjøringer og linjer, og hvordan siden i adminbordet
  ser ut, innenfor adminbordets egne regler i `AGENTS.md`.
- Hvordan bilaget bygges mot Tripletex' `/ledger/voucher` (postering med
  `project`, mva-kode uten mva). Prøv mot regnskapet først med ett lite bilag
  sammen med Thomas, slik grusappen gjorde med første ordre.

## Stående regler, arvet fra grusappens Tripletex-arbeid

- Integrasjonen sletter aldri noe i Tripletex.
- En av-bryter som bare Thomas setter.
- Svarteksten fra Tripletex lagres aldri, bare status, feilkode og vår egen
  melding.
- Bokmål i kode, tekst og databasekolonner.
