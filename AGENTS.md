# Hauge Maskin Adminbord

Sentralt adminbord for alle Hauge Maskin-systemene: register over Supabase-databaser
og Vercel-prosjekter, driftsstatus, og – på sikt – én felles innloggingsportal med
brukerstyring for alle appene.

Les `docs/TEKNISK-PLAN.md` før du endrer arkitektur, og
`docs/INNLOGGINGSPORTAL.md` før du rører auth.

## Dette er ikke den Next.js du kjenner

Prosjektet står på Next.js 16. API-er, konvensjoner og filstruktur kan alle avvike
fra treningsdata. Les den relevante guiden i `node_modules/next/dist/docs/` før du
skriver kode. Ta utfasingsvarsler på alvor.

Fallgruver som alt har bitt oss:

- Mellomvaren heter `src/proxy.ts` og eksporterer `proxy`, ikke `middleware`.
- `cookies()`, `headers()`, `params` og `searchParams` er `Promise` – må `await`es.
- `images.domains` er borte, bruk `images.remotePatterns`.

## Språk

Alt er på norsk: filnavn, funksjonsnavn, typer, databasekolonner, rutestier og
grensesnittekst. Det gjelder også kode som bare utviklere ser. Grunnen er at
resten av Hauge Maskin-appene er skrevet slik, og halvveis engelsk gir
`getSystemer`-hybrider som ingen finner igjen.

Unntaket er ord som kommer fra et API vi ikke eier: `readyState` fra Vercel og
`ACTIVE_HEALTHY` fra Supabase beholder sin egen skrivemåte, ellers blir det umulig
å slå opp i deres dokumentasjon.

## Kommentarer

Kommentarer forklarer **hvorfor**, aldri hva. Koden viser hva den gjør; det den
ikke kan vise er hvilket alternativ som ble vurdert og forkastet, og hva som går
galt hvis noen «rydder opp». Skriv ingen kommentar du kunne lest ut av linja under.

## Sikkerhet

Adminbordet holder nøklene til alle de andre systemene. Det gir noen regler som
ikke er til forhandling:

- Ingen hemmelighet skal kunne nå nettleseren. Alle filer som leser en nøkkel
  importerer `server-only`, slik at bygget feiler i stedet for at nøkkelen stille
  havner i en klientpakke.
- `NEXT_PUBLIC_`-prefiks brukes kun på adminbordets egen Supabase-URL og anon-nøkkel.
  Aldri på noe som gjelder et annet system.
- Service role-nøkler for de andre prosjektene ligger kryptert i databasen, ikke i
  miljøvariabler. De kommer og går etter hvert som systemer legges til, og skal ikke
  kreve ny utrulling.
- Hver server action og hver route handler sjekker tilgang selv. `proxy.ts` og
  layouten er ikke nok: en server action er en POST-rute som kan treffes direkte.

## Rutiner

- Commit og push etter hver endring, til `github.com/thomashauge03/hauge-maskin-adminbord`.
- Commit-meldinger skrives til fil og sendes med `git commit -F <fil>`. På Windows
  ødelegger PowerShell `-m` når meldingen inneholder anførselstegn.
- `npm run typecheck` og `npm run build` skal være grønne før push.
