# Adminbordet på mobil – implementeringsplan

> **For agentiske arbeidere:** PÅKREVD UNDERSKILL: Bruk superpowers:subagent-driven-development (anbefalt) eller superpowers:executing-plans for å gjennomføre planen oppgave for oppgave. Stegene bruker avkrysning (`- [ ]`).

**Mål:** Hele adminbordet skal være like brukbart på telefon som på PC, og kunne legges på Hjem-skjermen med HM-ikon. PC skal se ut som i dag.

**Arkitektur:** Samme sider og komponenter, gjort responsive med Tailwind. Tabeller som ikke kan krympes, får en listevisning ved siden av seg fra de samme dataene, og CSS velger hvilken som vises. Berøring (`pointer-coarse:`) gir 44 px flater og 16 px skrift i felt, uavhengig av bredde. En fast bunnmeny erstatter fanene under `md`.

**Teknologi:** Next.js 16.2 (App Router, `src/proxy.ts`), React 19.2, Tailwind 4.3, TypeScript 5, Node 24 (`node --test` med TS-stripping), sharp 0.34 (bare for å lage ikonene).

**Spec:** `docs/superpowers/specs/2026-10-02-adminbord-pa-mobil-design.md`

## Globale krav

- Alt på norsk bokmål: filnavn, funksjoner, typer, tekst (AGENTS.md).
- Kommentarer forklarer hvorfor, aldri hva (AGENTS.md).
- Brytepunkter: `md` = 768 px (meny, Logg, Systemer, handlingslinja), `lg` = 1024 px (matrisen i Brukere). Berøring: `pointer-coarse:`.
- Trykkflater på berøring: minst 44 × 44 px. Lenker inne i setninger er unntatt.
- Felt (`input` utenom checkbox/radio, `select`, `textarea`) har minst 16 px skrift på berøring.
- PC (1280 px, mus) skal se ut som før, unntatt statuslinjer med meldinger over 24 tegn og fast e-postkolonne i matrisen.
- Ingen endring i data, server actions eller tilgangsregler. Ingen service worker.
- Under testing lokalt mot navet: trykk aldri knapper som endrer data, og aldri «Logg ut» (`signOut` logger eier ut overalt).
- Commit-meldinger skrives til fil og sendes med `git commit -F <fil>` (PowerShell ødelegger `-m` med anførselstegn). Avslutt med `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm run typecheck` og `npm run lint` grønne etter hver oppgave; `npm test` og `npm run build` grønne før push. Alt pushes samlet til `main` i oppgave 9, etter at helheten er testet.

## Filer

| Fil | Ansvar | Oppgave |
|---|---|---|
| `src/components/ui.tsx` | `KNAPP_LITEN`/`KNAPP_FARLIG` på berøring, ny `VELGER` og `LENKE_ALENE`, `Tallkort` deler lange ord | 1 |
| `src/app/globals.css` | 16 px i felt på berøring; `--bunnlinje` og luft til hakket på liggende iPhone | 1, 2 |
| `src/app/(panel)/appen/brukerliste.tsx` | felles `VELGER`, større avkrysning, klebrig boks over bunnmenyen | 1, 2 |
| `src/app/(panel)/appen/handlingslinje.tsx` | felles `VELGER`; «Flere valg» på telefon | 1, 6 |
| `src/app/(panel)/appen/underfaner.tsx`, `src/app/(panel)/sortering.tsx` | høyde på berøring | 1 |
| Lenker og småkontroller (se oppgave 1) | høyde på berøring | 1 |
| `src/app/(panel)/meny.tsx` | `Meny` (PC) og ny `Bunnmeny` med «Mer»-panel, felles punkter | 2 |
| `src/app/(panel)/layout.tsx` | fanene og Logg ut bare fra `md`; `Bunnmeny` | 2 |
| `src/app/layout.tsx` | `viewportFit: 'cover'`, `appleWebApp` | 2, 8 |
| `src/app/(panel)/logg/page.tsx` | liste under `md` | 3 |
| `src/app/(panel)/systemer/page.tsx` | kort under `md` | 4 |
| `src/lib/personsok.ts` (+ test) | `passerSøk` | 5 |
| `src/app/(panel)/brukere/personsok.tsx` | klientkomponent: søketekst og skjuling | 5 |
| `src/app/(panel)/brukere/tilgangs-celle.tsx` | `visning: 'celle' \| 'rad'`, `TilgangsMerket` | 5 |
| `src/app/(panel)/brukere/brukerliste.tsx` | felles `celle(…)`, liste per person under `lg`, fast e-postkolonne | 5 |
| `src/components/tilstand.tsx` | lange meldinger på egen linje | 7 |
| `src/app/manifest.ts`, `src/app/icon.png`, `src/app/apple-icon.png`, `public/ikon-*.png` | Hjem-skjerm | 8 |
| `src/proxy.ts` | matcheren utelater manifest og ikoner | 8 |
| `README.md` | én linje om mobil | 9 |

## Målescriptet

Brukes i hver oppgave. Lim inn i nettleseren (`javascript_exec`) på siden som skal måles. På 375 px med berøring (forhåndsvalget «mobile» gir `pointer: coarse`) skal `sidebredde === vindu`, og `rullere`, `små` og `zoom` skal være tomme.

```js
(() => {
  const vindu = document.documentElement.clientWidth
  const grov = matchMedia('(pointer: coarse)').matches
  const synlig = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  // Lenker inne i en setning er unntatt (WCAG 2.5.8).
  const iSetning = (el) => el.tagName === 'A' && getComputedStyle(el).display === 'inline' &&
    (el.parentElement?.innerText.trim().length ?? 0) > el.innerText.trim().length + 2
  // En avkrysningsboks inni en <label> trykkes via hele etiketten.
  const flate = (el) => (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) || el
  const små = []
  for (const el of document.querySelectorAll('a, button, input:not([type=hidden]), select, textarea, summary')) {
    if (!synlig(el) || iSetning(el)) continue
    const r = flate(el).getBoundingClientRect()
    if (grov && (r.height < 44 || r.width < 44)) {
      små.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
  }
  const rullere = [...document.querySelectorAll('body *')]
    .filter((e) => synlig(e) && /(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1)
    .map((e) => `${e.tagName.toLowerCase()} ${e.clientWidth}->${e.scrollWidth}`)
  const zoom = grov ? [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')]
    .filter((e) => synlig(e) && parseFloat(getComputedStyle(e).fontSize) < 16)
    .map((e) => `${e.tagName.toLowerCase()} ${getComputedStyle(e).fontSize}`) : []
  return { side: location.pathname, sidebredde: document.documentElement.scrollWidth, vindu, høyde: document.documentElement.scrollHeight, rullere, små, zoom }
})()
```

Lokal server: `adminbord-mobiltest` i `hauge-maskin-mobil/.claude/launch.json` (port 3010, eier er innlogget). Telefon: `resize_window` med `preset: 'mobile'` (375 × 812, berøring). PC: `resize_window` med `width: 1280, height: 800`.

---

### Oppgave 0: Før-bilder på PC

Ingen kodeendring. Bildene er fasiten for «PC ser ut som før».

- [ ] **Steg 1:** Sett vinduet til 1280 × 800. Ta skjermbilde (`computer` → `screenshot`) av toppen av hver side: `/`, `/systemer`, `/systemer/rorlager`, `/appen`, `/appen/person/a5a325a2-edfe-4be1-b6c9-a34963f0d902`, `/appen/grupper`, `/appen/sider`, `/brukere` (vent til matrisen er lastet, rull til den), `/logg`, `/innstillinger`.
- [ ] **Steg 2:** Noter for hver side sidehøyden fra målescriptet. Brukes til å se at PC ikke har endret seg.

---

### Oppgave 1: Trykkflater, zoom og felles byggeklosser

**Filer:**
- Endre: `src/components/ui.tsx`, `src/app/globals.css`
- Endre: `src/app/(panel)/appen/brukerliste.tsx`, `src/app/(panel)/appen/handlingslinje.tsx`, `src/app/(panel)/appen/underfaner.tsx`, `src/app/(panel)/sortering.tsx`
- Endre: `src/app/(panel)/appen/person/[id]/page.tsx`, `src/app/(panel)/systemer/[slug]/page.tsx`, `src/app/(panel)/appen/grupper/page.tsx`, `src/app/(panel)/status.tsx`, `src/app/(panel)/systemer/[slug]/utrulling.tsx`, `src/app/(panel)/systemer/[slug]/hold-i-live.tsx`, `src/components/tilstand.tsx`, `src/app/(panel)/systemer/system-skjema.tsx`, `src/app/(panel)/appen/side-handlinger.tsx`, `src/app/(panel)/brukere/tilgangs-celle.tsx`

**Grensesnitt:**
- Produserer: `VELGER: string` og `LENKE_ALENE: string` fra `@/components/ui`. Oppgave 6 bruker `VELGER`.

- [ ] **Steg 1: Mål før (telefon).** Kjør målescriptet på `/appen`, `/appen/person/a5a325a2-edfe-4be1-b6c9-a34963f0d902` og `/systemer/rorlager` på 375 px. Forventet: `små` med blant annet `button "Logg ut" 71x36`, `zoom` med `select 14px` (Appen) og `input 13px` (systemsiden).

- [ ] **Steg 2: `ui.tsx` – knappene, `VELGER`, `LENKE_ALENE`, `Tallkort`.** Toppkommentaren får et nytt avsnitt rett før `═══`-linja som avslutter den:

```ts
   På berøringsskjerm går de små knappene og nedtrekkslistene opp til
   44 px (`pointer-coarse:`). Det er fingeren, ikke skjermbredden, som
   trenger plassen: et nettbrett får store flater, og PC-en med mus
   beholder tettheten.
```

`KNAPP_LITEN` og `KNAPP_FARLIG` får ` pointer-coarse:min-h-11 pointer-coarse:min-w-11` lagt til sist i strengen. Kommentaren på `FELT` og to nye konstanter rett etter `FELT_KODE`:

```ts
/** 16 px hindrer at iOS zoomer inn når feltet får fokus. Felt som krymper
    skriften – FELT_KODE, og text-sm i matrisecellene – får 16 px igjen på
    berøring fra regelen nederst i globals.css. */
export const FELT =
  'w-full border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-3 py-2.5 text-base text-[var(--blekk)] outline-none transition-colors placeholder:text-[var(--blekk-svak)] focus:border-hm-red'

/** Nøkler og prosjekt-ID-er limes inn og leses tegn for tegn. */
export const FELT_KODE = `${FELT} hm-kode`

/** Nedtrekksliste i filtre og handlingslinjer. Smalere enn FELT, som tar
    hele bredden. */
export const VELGER =
  'border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-2 py-1.5 text-sm pointer-coarse:min-h-11'

/** Lenke som står alene, ikke inne i en setning – som «← Alle brukere». På
    berøring er den like høy som en knapp; lenker i løpende tekst er unntatt
    (WCAG 2.5.8). */
export const LENKE_ALENE =
  'inline-flex items-center text-sm underline pointer-coarse:min-h-11'
```

I `Tallkort`: `<p className={ETIKETT}>{merkelapp}</p>` blir

```tsx
      {/* «DATABASESTØRRELSE» med full sperring stakk ut av kortet i to
          kolonner på telefon. */}
      <p className={`${ETIKETT} hyphens-auto break-words`}>{merkelapp}</p>
```

- [ ] **Steg 3: `globals.css` – 16 px i felt på berøring, og designkommentaren.** Toppkommentaren: erstatt linjene fra «Utleieappen brukes ute i sollys» til «Derfor: tettere flater, mindre knapper, mer tabell.» med

```css
   Utleieappen brukes ute i sollys med hansker, og har derfor 56 px
   trykkflater. Adminbordet brukes mest ved skrivebord, med mus, og skal
   vise mange systemer samtidig. Derfor: tettere flater, mindre knapper,
   mer tabell.

   Det brukes også fra telefonen – godkjenne folk i appen, se om noe er
   nede. Derfor går flatene opp til 44 px på berøring, brede tabeller blir
   lister på smal skjerm, og menyen flytter ned (Bunnmeny i meny.tsx).
```

Nederst i fila:

```css
/* ── Felt på berøringsskjerm ──────────────────────────────────
   iPhone zoomer inn på et felt med skrift under 16 px, og zoomer ikke ut
   igjen. Kodefeltene (.hm-kode, 13 px) og de små nedtrekkslistene gjorde
   det. Regelen står utenfor lagene med vilje: da slår den Tailwinds
   text-sm, og selektoren er sterkere enn .hm-kode. */
@media (pointer: coarse) {
  :is(input, select, textarea):not([type='checkbox'], [type='radio']) {
    font-size: 1rem;
  }
}
```

- [ ] **Steg 4: Appen-lista og handlingslinja bruker `VELGER`.** I `appen/brukerliste.tsx` og `appen/handlingslinje.tsx`: slett linja `const VELGER = 'border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-2 py-1.5 text-sm'` og legg `VELGER` til importen fra `@/components/ui`.

- [ ] **Steg 5: Avkrysningen i Appen-lista.** I `appen/brukerliste.tsx` blir «Velg alle»-etiketten

```tsx
          <label className="flex items-center gap-2 border-b border-[var(--kant)] px-4 py-2 text-sm pointer-coarse:min-h-11">
            <input
              type="checkbox"
              checked={alleTreffValgt}
              onChange={veksleAlleTreff}
              className="pointer-coarse:size-5"
            />
            {alleTreffValgt ? 'Fjern valget av treffene' : `Velg alle ${treff.length} treff`}
          </label>
```

og avkrysningen i hver rad (bare på berøring vokser etiketten, så PC-raden står der den sto)

```tsx
                {erEier && (
                  /* På berøring er trykkområdet hele høyden på raden rundt
                     boksen. Boksen alene er 16 px, og et bomtrykk ved siden av
                     åpnet personsiden. */
                  <label className="flex flex-none cursor-pointer items-center justify-center pointer-coarse:-my-3 pointer-coarse:-ml-3 pointer-coarse:min-w-11 pointer-coarse:self-stretch pointer-coarse:px-3">
                    <input
                      type="checkbox"
                      checked={valgte.has(b.id)}
                      onChange={() => veksle(b.id)}
                      aria-label={`Velg ${b.navn}`}
                      className="h-4 w-4 pointer-coarse:size-5"
                    />
                  </label>
                )}
```

- [ ] **Steg 6: Faner og sortering.** `appen/underfaner.tsx`: klassen på lenken `-mb-[2px] border-b-4 px-3 py-2 text-sm font-semibold` får ` pointer-coarse:py-3`. `sortering.tsx`: `px-3 py-2 text-xs font-bold tracking-wide uppercase transition-colors` får ` pointer-coarse:py-3.5`.

- [ ] **Steg 7: Lenker som står alene.**
  - `appen/person/[id]/page.tsx`: importer `LENKE_ALENE` fra `@/components/ui`; `<Link href="/appen" className="text-sm underline">` → `<Link href="/appen" className={LENKE_ALENE}>`.
  - `systemer/[slug]/page.tsx`: importer `LENKE_ALENE`; de tre lenkene i `handling` (Åpne appen, GitHub, Supabase) og «Tilbake til registeret» får `className={LENKE_ALENE}` i stedet for `"text-sm underline"`.
  - `appen/grupper/page.tsx`: «Se medlemmer»-lenken får `className="inline-flex items-center text-xs underline pointer-coarse:min-h-11"`.
  - `status.tsx`: lenken i `KortTittel` får `className="hover:underline pointer-coarse:-my-3 pointer-coarse:inline-block pointer-coarse:py-3"` (treffområdet vokser, raden gjør det ikke).
  - `systemer/[slug]/utrulling.tsx`: «åpne»-lenken får `className="underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"`, domenelenken `className="hm-kode underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"`.

- [ ] **Steg 8: Småkontroller.**
  - `systemer/[slug]/hold-i-live.tsx`: `<summary className="cursor-pointer px-3 py-2 text-xs font-bold tracking-widest uppercase">` får ` pointer-coarse:py-3.5`.
  - `components/tilstand.tsx`: `<summary className="cursor-pointer text-xs text-[var(--blekk-svak)] underline">` får ` pointer-coarse:py-3.5`.
  - `systemer/system-skjema.tsx`: begge `<label className="flex items-center gap-2.5">` får ` pointer-coarse:min-h-11`.
  - `appen/side-handlinger.tsx`: `<label className="flex items-center gap-2 pt-1 text-sm">` (Nøkkelknapp) får ` pointer-coarse:min-h-11`; fargefeltet `h-8 w-12 cursor-pointer …` får ` pointer-coarse:h-11`.
  - `brukere/tilgangs-celle.tsx`: knappen i lukket celle, `mx-auto block cursor-pointer rounded-none px-1 py-0.5 hover:bg-[var(--flate-2)]`, får ` pointer-coarse:min-h-11 pointer-coarse:min-w-11`; nedtrekkslista og passordfeltet i den åpne cellen (`${FELT} py-1 text-sm`) får ` pointer-coarse:min-h-11`.
  - `(panel)/layout.tsx`: logolenken `flex items-center gap-3` får ` pointer-coarse:min-h-11`.

- [ ] **Steg 9: Typesjekk og lint.** Kjør i `hauge-maskin-adminbord`: `npm run typecheck` og `npm run lint`. Forventet: ingen feil.

- [ ] **Steg 10: Mål etter (telefon).** Kjør målescriptet på de samme tre sidene. Forventet: `zoom` tom; i `små` bare menyfanene og `button "Logg ut"` i toppen (de flyttes i oppgave 2). Skjermbilde av `/appen`.

- [ ] **Steg 11: Sjekk PC.** 1280 × 800, `/appen` og `/systemer/rorlager`: skjermbilde likt før-bildet (musepeker: ingen `pointer-coarse`).

- [ ] **Steg 12: Commit.**

```text
Mobil: fingerstore flater og 16 px i felt på berøring

KNAPP_LITEN og KNAPP_FARLIG går til 44 px på berøring, og en felles
VELGER og LENKE_ALENE gjør det samme for nedtrekkslister og lenker som
står alene. En regel i globals.css gir alle felt 16 px på berøring, så
iPhone slutter å zoome inn i kodefeltene og filtervalgene. PC med mus er
uendret.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

`git add` filene over, `git commit -F <fil>`.

---

### Oppgave 2: Bunnmeny og ramme

**Filer:**
- Endre: `src/app/(panel)/meny.tsx` (hele fila, under)
- Endre: `src/app/(panel)/layout.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/(panel)/appen/brukerliste.tsx`

**Grensesnitt:**
- Produserer: `Bunnmeny({ ventende: number, navn: string, rolle: string })` og CSS-variabelen `--bunnlinje` (høyde på bunnmenyen + safe area under `md`, `0px` fra `md`).

- [ ] **Steg 1: `globals.css` – `--bunnlinje` og luft.** Rett etter `@media (prefers-color-scheme: dark) { … }`:

```css
/* ── Bunnmenyen på telefon ────────────────────────────────────
   Høyden står ett sted fordi tre ting må vite den: menyen selv,
   plassholderen under siden og den klebrige handlingslinja i Appen.
   Ellers legger noe seg bak menyen den dagen høyden endres. 3.625rem er
   56 px fane pluss 2 px kant. */
:root {
  --bunnlinje: calc(3.625rem + env(safe-area-inset-bottom));
}
@media (min-width: 48rem) {
  :root {
    --bunnlinje: 0px;
  }
}
```

`body`-regelen får to linjer til (luften i bunnen ligger i `Bunnmeny`, ikke her – innloggingssiden har ingen meny, og der ville den blitt en lys stripe under den svarte flaten):

```css
  /* Luft til hakket på liggende iPhone – viewportFit: 'cover' i
     layout.tsx lar siden gå helt ut i kantene. */
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
```

- [ ] **Steg 2: `src/app/layout.tsx` – viewport.**

```ts
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Uten cover er env(safe-area-inset-*) alltid 0, og bunnmenyen ville lagt
  // seg under streken nederst på iPhone i fullskjerm.
  viewportFit: 'cover',
  themeColor: '#0b0b0c',
}
```

- [ ] **Steg 3: `meny.tsx` – hele fila.**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { loggUt } from '@/app/logg-inn/actions'
import { KNAPP_SEKUNDÆR } from '@/components/ui'

/**
 * Klientkomponenter kun fordi de må vite hvilken side som er åpen.
 * Resten av panelet er server-rendret.
 *
 * Fanene på PC og bunnmenyen på telefon bruker de samme punktene og den
 * samme regelen for hva som er aktivt. To lister ville drevet fra hverandre
 * den første gangen en side kom til.
 */
const punkter = [
  { href: '/', tekst: 'Oversikt' },
  { href: '/systemer', tekst: 'Systemer' },
  { href: '/appen', tekst: 'Appen' },
  { href: '/brukere', tekst: 'Brukere' },
  { href: '/logg', tekst: 'Logg' },
  { href: '/innstillinger', tekst: 'Innstillinger' },
] as const

type Adresse = (typeof punkter)[number]['href']

// Forsiden matcher bare seg selv; de andre matcher også undersider, slik at
// /systemer/rorlager holder «Systemer» tent.
function erAktiv(href: Adresse, sti: string) {
  return href === '/' ? sti === '/' : sti.startsWith(href)
}

// Venter noen på svar, går «Appen» rett til køen. Det er det eneste i
// adminbordet noen står og venter på.
function harKø(href: Adresse, ventende: number) {
  return href === '/appen' && ventende > 0
}

function tekstFor(href: Adresse) {
  return punkter.find((p) => p.href === href)?.tekst ?? href
}

function Køtall({ ventende }: { ventende: number }) {
  return (
    <span className="ml-1.5 inline-flex min-w-5 justify-center bg-hm-amber px-1.5 text-[11px] font-bold text-white">
      {ventende}
      <span className="sr-only"> venter</span>
    </span>
  )
}

export function Meny({ ventende }: { ventende: number }) {
  const sti = usePathname()

  return (
    <nav aria-label="Hovedmeny" className="flex gap-0 overflow-x-auto">
      {punkter.map(({ href, tekst }) => {
        const aktiv = erAktiv(href, sti)
        const kø = harKø(href, ventende)

        return (
          <Link
            key={href}
            href={kø ? '/appen?status=venter' : href}
            aria-current={aktiv ? 'page' : undefined}
            className={`hm-display border-b-4 px-4 py-3 text-sm whitespace-nowrap transition-colors ${
              aktiv
                ? 'border-hm-red text-[var(--blekk)]'
                : 'border-transparent text-[var(--blekk-svak)] hover:border-[var(--kant)] hover:text-[var(--blekk)]'
            }`}
          >
            {tekst}
            {kø && <Køtall ventende={ventende} />}
          </Link>
        )
      })}
    </nav>
  )
}

/* Telefonen: fire faner der tommelen når, resten bak «Mer». Rekkefølgen er
   etter hva man gjør fra telefonen – køen i Appen før registeret. */
const iBunnen = ['/', '/appen', '/brukere', '/systemer'] as const
const iMer = ['/logg', '/innstillinger'] as const

const BUNNFANE =
  'hm-display flex h-full w-full items-center justify-center border-t-4 text-xs transition-colors'

function bunnfarge(aktiv: boolean) {
  return aktiv ? 'border-hm-red text-[var(--blekk)]' : 'border-transparent text-[var(--blekk-svak)]'
}

function lukkPanel(panel: HTMLElement | null) {
  // matches(':popover-open') kaster der Popover API mangler.
  if (panel && typeof panel.hidePopover === 'function' && panel.matches(':popover-open')) {
    panel.hidePopover()
  }
}

export function Bunnmeny({
  ventende,
  navn,
  rolle,
}: {
  ventende: number
  navn: string
  rolle: string
}) {
  const sti = usePathname()
  const mer = useRef<HTMLDivElement>(null)

  // Også tilbakeknappen bytter side, og da skal panelet ikke bli stående.
  useEffect(() => {
    lukkPanel(mer.current)
  }, [sti])

  const merAktiv = iMer.some((href) => erAktiv(href, sti))

  return (
    <>
      {/* Plassholder i flyten, så det siste på siden ikke havner bak menyen.
          Ligger her og ikke på body: innloggingssiden har ingen meny. */}
      <div aria-hidden="true" className="h-[var(--bunnlinje)] md:hidden" />

      <nav
        aria-label="Hovedmeny"
        className="fixed inset-x-0 bottom-0 z-30 h-[var(--bunnlinje)] border-t-2 border-[var(--kant)] bg-[var(--flate-opp)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:hidden"
      >
        <ul className="grid h-full grid-cols-5">
          {iBunnen.map((href) => {
            const aktiv = erAktiv(href, sti)
            const kø = harKø(href, ventende)
            return (
              <li key={href}>
                <Link
                  href={kø ? '/appen?status=venter' : href}
                  aria-current={aktiv ? 'page' : undefined}
                  className={`${BUNNFANE} ${bunnfarge(aktiv)}`}
                >
                  {tekstFor(href)}
                  {kø && <Køtall ventende={ventende} />}
                </Link>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              popoverTarget="mer-meny"
              className={`${BUNNFANE} ${bunnfarge(merAktiv)}`}
            >
              Mer
            </button>
          </li>
        </ul>
      </nav>

      {/* Ingen visningsklasse (flex, block) på selve panelet: nettleseren
          skjuler det med display: none når det er lukket, og en slik klasse
          ville holdt det åpent. Uten Popover API står innholdet i stedet
          nederst på siden, og kan fortsatt nås. */}
      <div
        id="mer-meny"
        ref={mer}
        popover="auto"
        className="inset-x-0 top-auto bottom-[var(--bunnlinje)] m-0 w-auto border-0 border-t-2 border-[var(--kant-sterk)] bg-[var(--flate-opp)] p-0 pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] text-[var(--blekk)] shadow-[0_-8px_24px_rgb(0_0_0/0.25)] md:hidden"
      >
        <p className="border-b border-[var(--kant)] px-4 py-3 text-sm text-[var(--blekk-svak)]">
          Innlogget som <strong className="text-[var(--blekk)]">{navn}</strong> · {rolle}
        </p>
        <ul>
          {iMer.map((href) => {
            const aktiv = erAktiv(href, sti)
            return (
              <li key={href} className="border-b border-[var(--kant)]">
                <Link
                  href={href}
                  onClick={() => lukkPanel(mer.current)}
                  aria-current={aktiv ? 'page' : undefined}
                  className={`hm-display flex min-h-14 items-center border-l-4 px-4 text-base ${
                    aktiv ? 'border-hm-red' : 'border-transparent'
                  }`}
                >
                  {tekstFor(href)}
                </Link>
              </li>
            )
          })}
        </ul>
        <form action={loggUt} className="px-4 py-4">
          <button type="submit" className={`${KNAPP_SEKUNDÆR} w-full`}>
            Logg ut
          </button>
        </form>
      </div>
    </>
  )
}
```

- [ ] **Steg 4: `(panel)/layout.tsx`.** Importen blir `import { Bunnmeny, Meny } from './meny'`. Toppens første `div` får `py-3 md:pb-0` i stedet for `pt-3` (uten fanene under trengs luft nederst). Utloggingsskjemaet: `<form action={loggUt} className="hidden md:block">` med kommentaren `{/* På telefon ligger Logg ut under «Mer» i bunnmenyen. */}` over. Fanenes `div`: `className="mx-auto hidden max-w-7xl px-4 md:block"`. Etter `</footer>`:

```tsx
      <Bunnmeny ventende={ventende} navn={bruker.navn} rolle={bruker.rolle} />
```

- [ ] **Steg 5: Den klebrige boksen i Appen.** I `appen/brukerliste.tsx`: `<div className="sticky bottom-0 z-10 space-y-2">` → `<div className="sticky bottom-[var(--bunnlinje)] z-10 space-y-2">`.

- [ ] **Steg 6: Typesjekk og lint.** `npm run typecheck`, `npm run lint`. Forventet: ingen feil.

- [ ] **Steg 7: Prøv på telefon (375 px).** På `/`: bunnmenyen syns med Oversikt aktiv (rød strek øverst), toppen har logo og rolle, ingen faner og ingen Logg ut. Trykk på Appen, Brukere og Systemer i bunnmenyen; riktig fane tennes. Trykk «Mer»: panelet åpner over menyen med navn, Logg, Innstillinger og Logg ut. Trykk «Logg» (ikke Logg ut): siden byttes, panelet lukkes, «Mer» er aktiv. Åpne panelet igjen og trykk Escape (`computer` → `key` `Escape`): det lukkes. Rull til bunns på `/logg`: siste hendelse og bunnteksten ligger over menyen. Målescriptet på `/`: `små` tom, `rullere` tom.

- [ ] **Steg 8: Sjekk PC (1280 px).** `/` og `/appen`: toppen og fanene som på før-bildet; ingen bunnmeny.

- [ ] **Steg 9: Commit.**

```text
Mobil: bunnmeny med «Mer» i stedet for faner som ruller sidelengs

Under 768 px ligger Oversikt, Appen, Brukere og Systemer fast nederst,
og Logg, Innstillinger og Logg ut bak «Mer» (Popover API). Fanene fikk
ikke plass, og Logg og Innstillinger lå utenfor skjermen uten at noe
viste det. --bunnlinje holder siden og handlingslinja i Appen klar av
menyen, og viewportFit: 'cover' gir plass til streken nederst på iPhone.
PC er uendret.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Oppgave 3: Logg som liste på telefon

**Filer:**
- Endre: `src/app/(panel)/logg/page.tsx`

- [ ] **Steg 1: Mål før.** 375 px, `/logg`: `høyde` rundt 31 000, `rullere` med `div 340->792`.

- [ ] **Steg 2: Hjelpefunksjonen.** Bytt ut

```ts
/** Handlinger som endrer noe utenfor adminbordet får rødt merke. */
const alvorlig = ['bruker.', 'hemmelighet.']
```

med

```ts
/** Handlinger som endrer noe utenfor adminbordet får svart merke. */
const alvorlig = ['bruker.', 'hemmelighet.']

function merkeFor(handling: string): MerkeType {
  return alvorlig.some((p) => handling.startsWith(p)) ? 'svart' : 'nøytral'
}
```

(`type MerkeType` legges til importen fra `@/components/ui`), og i tabellen: `type={alvorlig.some((p) => h.handling.startsWith(p)) ? 'svart' : 'nøytral'}` → `type={merkeFor(h.handling)}`.

- [ ] **Steg 3: Tabellen bare fra `md`, lista under.** `<div className="overflow-x-auto">` rundt tabellen → `<div className="hidden overflow-x-auto md:block">`. Rett etter den `div`-en, inni `Kort`:

```tsx
          {/* Telefon: ett kort per hendelse. I tabellen ble detaljene brutt i
              en smal celle, så hver rad ble nesten 200 px høy og siden over
              30 000 px – og system og hvem som gjorde det sto utenfor
              skjermen. */}
          <ul className="md:hidden">
            {hendelser.map((h) => {
              const hvor = [
                h.systemId ? (systemNavn.get(h.systemId) ?? '(slettet)') : null,
                h.utfortAvEpost,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li
                  key={h.id}
                  className="space-y-1.5 border-b border-[var(--kant)] px-4 py-3 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="hm-tall text-sm text-[var(--blekk-svak)]">
                      {visDatoTid(h.tid)}
                    </span>
                    <Merke type={merkeFor(h.handling)}>{h.handling}</Merke>
                  </div>
                  {hvor && <p className="text-sm">{hvor}</p>}
                  {Object.keys(h.detaljer).length > 0 && (
                    <div>
                      <Kodebit>{JSON.stringify(h.detaljer)}</Kodebit>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
```

- [ ] **Steg 4: Typesjekk og lint.** Forventet: ingen feil.

- [ ] **Steg 5: Mål etter.** 375 px, `/logg`: `sidebredde === vindu`, `rullere` tom, `høyde` under 20 000. Skjermbilde av toppen.

- [ ] **Steg 6: Sjekk PC.** 1280 px, `/logg`: likt før-bildet.

- [ ] **Steg 7: Commit.**

```text
Mobil: loggen som kort under 768 px

Tabellen ga en side på 31 000 px på telefon, med system og hvem som
gjorde det utenfor skjermen. Kortene har tid og handling øverst, system
og hvem under og detaljene i full bredde. Tabellen er uendret fra 768 px.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Oppgave 4: Systemer som kort på telefon

**Filer:**
- Endre: `src/app/(panel)/systemer/page.tsx`

- [ ] **Steg 1: Mål før.** 375 px, `/systemer`: `rullere` med `div 340->712`.

- [ ] **Steg 2: Felles innhold.** Importer `type { System } from '@/lib/typer'`. Over `export default async function SystemerSide()`:

```tsx
const TOM = <span className="text-[var(--blekk-svak)]">–</span>

/* Innholdet i en rad, delt mellom tabellen på PC og kortene på telefon. */
function Supabaseref({ s }: { s: System }) {
  return s.supabaseProsjektRef ? <Kodebit>{s.supabaseProsjektRef}</Kodebit> : TOM
}

function Vercelprosjekt({ s }: { s: System }) {
  return s.vercelProsjektNavn || s.vercelProsjektId ? (
    <Kodebit>{s.vercelProsjektNavn ?? s.vercelProsjektId}</Kodebit>
  ) : (
    TOM
  )
}

function Repolenke({ s }: { s: System }) {
  return s.githubRepo ? (
    <a
      href={`https://github.com/${s.githubRepo}`}
      target="_blank"
      rel="noreferrer"
      className="hm-kode underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
    >
      {s.githubRepo}
    </a>
  ) : (
    TOM
  )
}

function Systemmerker({ s }: { s: System }) {
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      {!s.aktiv && <Merke>Skjult</Merke>}
      {s.aktiv && !s.overvakes && <Merke>Uten tilsyn</Merke>}
    </span>
  )
}
```

- [ ] **Steg 3: Handlingene én gang per system.** Rett etter `const systemer = await hentSystemer(true)`:

```tsx
  /* Måltilstanden bindes her, der vi vet hva raden står i nå – ikke som en
     veksling i nettleseren, som bommer hvis siden ble hentet før noen andre
     endret systemet. Ett element per system, vist både i tabellen og i
     kortet; bare én av dem syns om gangen. */
  const handlinger = new Map(
    systemer.map((s) => [
      s.id,
      meg.rolle === 'eier' ? (
        <RadHandlinger
          navn={s.navn}
          aktiv={s.aktiv}
          overvakes={s.overvakes}
          settAktiv={settSystemAktiv.bind(null, s.id, !s.aktiv)}
          settTilsyn={settOvervakes.bind(null, s.id, !s.overvakes)}
          slett={slettSystem.bind(null, s.id)}
        />
      ) : null,
    ]),
  )
```

- [ ] **Steg 4: Tabellen bruker det felles innholdet, og vises fra `md`.** `<div className="overflow-x-auto">` → `<div className="hidden overflow-x-auto md:block">`. Cellene for Supabase, Vercel og Repo blir `<td className="px-4 py-2.5"><Supabaseref s={s} /></td>`, `<Vercelprosjekt s={s} />` og `<Repolenke s={s} />`. Siste celle blir

```tsx
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col items-end gap-1.5">
                        <Systemmerker s={s} />
                        {handlinger.get(s.id)}
                      </div>
                    </td>
```

(Kommentaren om måltilstanden flytter opp til steg 3.)

- [ ] **Steg 5: Kortene under `md`.** Rett etter tabellens `div`, inni `Kort`:

```tsx
          {/* Telefon: ett kort per system. I tabellen ble prosjekt-ID-ene
              brutt over tre linjer, og repo og knappene lå utenfor
              skjermen. */}
          <ul className="md:hidden">
            {systemer.map((s) => (
              <li
                key={s.id}
                className="space-y-2 border-b border-[var(--kant)] px-4 py-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/systemer/${s.slug}`}
                    className="inline-flex items-center font-semibold hover:underline pointer-coarse:min-h-11"
                  >
                    {s.navn}
                  </Link>
                  <Systemmerker s={s} />
                </div>
                {s.beskrivelse && (
                  <p className="text-xs text-[var(--blekk-svak)]">{s.beskrivelse}</p>
                )}
                <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
                  <dt className="text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
                    Supabase
                  </dt>
                  <dd className="min-w-0 break-all">
                    <Supabaseref s={s} />
                  </dd>
                  <dt className="text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
                    Vercel
                  </dt>
                  <dd className="min-w-0 break-all">
                    <Vercelprosjekt s={s} />
                  </dd>
                  <dt className="text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
                    Repo
                  </dt>
                  <dd className="min-w-0 break-all">
                    <Repolenke s={s} />
                  </dd>
                </dl>
                {handlinger.get(s.id)}
              </li>
            ))}
          </ul>
```

- [ ] **Steg 6: Typesjekk og lint.** Forventet: ingen feil.

- [ ] **Steg 7: Mål etter.** 375 px, `/systemer`: `rullere` tom, `små` tom, `zoom` tom (skjemaet «Nytt system» nederst inkludert). Skjermbilde.

- [ ] **Steg 8: Sjekk PC.** 1280 px, `/systemer`: likt før-bildet.

- [ ] **Steg 9: Commit.**

```text
Mobil: systemregisteret som kort under 768 px

På telefon ble prosjekt-ID-ene brutt over tre linjer, og repo og
knappene lå utenfor skjermen. Kortene har navn og merker øverst, så
Supabase, Vercel og repo på hver sin linje og knappene under. Cellene
og handlingene står ett sted og brukes av begge visningene.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Oppgave 5: Brukere – liste per person under 1024 px

**Filer:**
- Opprett: `src/lib/personsok.ts`, `src/lib/personsok.test.mjs`, `src/app/(panel)/brukere/personsok.tsx`
- Endre: `src/app/(panel)/brukere/tilgangs-celle.tsx`, `src/app/(panel)/brukere/brukerliste.tsx`

**Grensesnitt:**
- Produserer: `passerSøk(epost: string, søk: string): boolean`; `Personsok({ personer: { epost: string; innhold: React.ReactNode }[] })`; `TilgangsMerket({ merke: Tilgangsmerke })`; `TilgangsCelle` får `visning?: 'celle' | 'rad'`.

- [ ] **Steg 1: Skriv testen som feiler.** `src/lib/personsok.test.mjs`:

```js
// E-postsøket i Brukere-lista på telefon. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passerSøk } from './personsok.ts'

test('tomt søk passer alle', () => {
  assert.equal(passerSøk('ola@haugemaskin.no', ''), true)
  assert.equal(passerSøk('ola@haugemaskin.no', '   '), true)
})

test('en del av adressen passer, uansett store og små bokstaver', () => {
  assert.equal(passerSøk('Ola.Nordmann@HaugeMaskin.no', 'nordmann@hauge'), true)
  assert.equal(passerSøk('ola@haugemaskin.no', 'OLA'), true)
})

// Telefontastaturet setter gjerne et mellomrom etter et ord valgt fra forslagene.
test('mellomrom foran og bak teller ikke', () => {
  assert.equal(passerSøk('kari@haugemaskin.no', ' kari '), true)
})

test('det som ikke står i adressen, passer ikke', () => {
  assert.equal(passerSøk('kari@haugemaskin.no', 'per'), false)
})
```

- [ ] **Steg 2: Kjør den.** `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/lib/personsok.test.mjs`. Forventet: FEIL, modulen `./personsok.ts` finnes ikke.

- [ ] **Steg 3: Skriv `src/lib/personsok.ts`.**

```ts
/**
 * Om en e-post passer søket i Brukere-lista på telefon.
 *
 * Store og små bokstaver teller ikke, og heller ikke mellomrom foran og
 * bak: telefontastaturet setter gjerne et mellomrom etter et ord valgt fra
 * forslagene, og da ville ingen passet. Tomt søk passer alle.
 */
export function passerSøk(epost: string, søk: string): boolean {
  const s = søk.trim().toLowerCase()
  return s === '' || epost.toLowerCase().includes(s)
}
```

- [ ] **Steg 4: Kjør testen igjen.** Samme kommando. Forventet: 4 av 4 passerer.

- [ ] **Steg 5: `brukere/personsok.tsx`.**

```tsx
'use client'

import { useState } from 'react'
import { FELT } from '@/components/ui'
import { passerSøk } from '@/lib/personsok'

/**
 * Søket over lista per person i Brukere på telefon.
 *
 * Personene kommer ferdig bygget fra serveren, med tilgangsskjemaene inni,
 * og denne komponenten eier bare søketeksten. De som ikke passer, skjules i
 * stedet for å fjernes: et tilgangsskjema man har åpnet, skal ikke lukkes og
 * miste det man skrev fordi man søkte etter noen andre.
 */
export function Personsok({
  personer,
}: {
  personer: { epost: string; innhold: React.ReactNode }[]
}) {
  const [søk, settSøk] = useState('')
  const antall = personer.filter((p) => passerSøk(p.epost, søk)).length

  return (
    <>
      <div className="space-y-2 border-b border-[var(--kant)] px-4 py-3">
        <input
          type="search"
          value={søk}
          onChange={(e) => settSøk(e.target.value)}
          placeholder="Søk på e-post"
          aria-label="Søk på e-post"
          className={FELT}
        />
        <p role="status" className="text-xs text-[var(--blekk-svak)]">
          Viser {antall} av {personer.length}
        </p>
      </div>
      <ul>
        {personer.map((p) => (
          <li
            key={p.epost}
            hidden={!passerSøk(p.epost, søk)}
            className="border-b border-[var(--kant)] last:border-b-0"
          >
            {p.innhold}
          </li>
        ))}
      </ul>
    </>
  )
}
```

- [ ] **Steg 6: `tilgangs-celle.tsx` – `TilgangsMerket` og `visning`.** Over `export function TilgangsCelle`:

```tsx
/** Merket i cellen, eller en strek når det ikke er noe å si. Delt med
    lesevisningen drift får, så de to viser det samme. */
export function TilgangsMerket({ merke }: { merke: Tilgangsmerke }) {
  return merke.tekst === '–' ? (
    <span className="text-[var(--blekk-svak)]">–</span>
  ) : (
    <Merke type={merke.merke}>{merke.tekst}</Merke>
  )
}
```

I parameterlista: `visning = 'celle',` først, og i typen:

```ts
  /** 'celle' i matrisen, 'rad' i lista per person på telefon. Logikken er
      den samme; bare formen på knappen og bredden på skjemaet skiller. */
  visning?: 'celle' | 'rad'
```

Lukket tilstand (`if (!åpen) { … }`) blir

```tsx
  if (!åpen) {
    if (visning === 'rad') {
      return (
        <button
          onClick={() => settÅpen(true)}
          className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2 text-left hover:bg-[var(--flate-2)]"
        >
          <span className="text-sm font-semibold">{systemNavn}</span>
          <span className="flex items-center gap-2">
            <TilgangsMerket merke={merke} />
            <span aria-hidden="true" className="text-[var(--blekk-svak)]">
              ›
            </span>
          </span>
        </button>
      )
    }

    return (
      <button
        onClick={() => settÅpen(true)}
        title={`${merke.forklaring} Trykk for å ${harTilgang ? 'endre eller fjerne' : 'gi'} tilgang.`}
        className="mx-auto block cursor-pointer rounded-none px-1 py-0.5 hover:bg-[var(--flate-2)] pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      >
        <TilgangsMerket merke={merke} />
      </button>
    )
  }
```

Den åpne boksen: `className="min-w-[13rem] space-y-2 border-2 border-hm-red bg-[var(--flate-opp)] p-2 text-left"` →

```tsx
    <div
      className={`${visning === 'rad' ? 'm-2' : 'min-w-[13rem]'} space-y-2 border-2 border-hm-red bg-[var(--flate-opp)] p-2 text-left`}
    >
```

- [ ] **Steg 7: `brukerliste.tsx` – importer og lesevisningen.** Importene får

```tsx
import {
  hentAlleBrukere,
  samlePåEpost,
  type Brukerliste as Systemliste,
  type SamletPerson,
} from '@/lib/brukere'
import { tilgangsmerke, type Tilgangsmerke } from '@/lib/tilgangsmerke'
import { TilgangsCelle, TilgangsMerket } from './tilgangs-celle'
import { Personsok } from './personsok'
```

(erstatter de gamle importene av de samme modulene). Over `export async function Brukerliste`:

```tsx
/** Det drift ser: merket, og på telefon forklaringen som tekst – der finnes
    ingen hover-tekst. */
function Tilgangsvisning({
  merke,
  systemNavn,
  visning,
}: {
  merke: Tilgangsmerke
  systemNavn: string
  visning: 'celle' | 'rad'
}) {
  if (visning === 'celle') {
    return (
      <span title={merke.forklaring}>
        <TilgangsMerket merke={merke} />
      </span>
    )
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{systemNavn}</span>
        <TilgangsMerket merke={merke} />
      </div>
      <p className="mt-1 text-xs text-[var(--blekk-svak)]">{merke.forklaring}</p>
    </div>
  )
}
```

- [ ] **Steg 8: `brukerliste.tsx` – `celle(…)`.** Rett etter `const annenKunde = …`:

```tsx
  /*
   * Én celle, bygget ett sted: matrisen og lista per person viser den samme.
   * To kopier av propsene til TilgangsCelle ville drevet fra hverandre første
   * gang den ene ble endret.
   */
  function celle(p: SamletPerson, l: Systemliste, visning: 'celle' | 'rad') {
    const rad = p.iSystem.get(l.system.slug)
    const merke = tilgangsmerke(rad, {
      systemNavn: l.system.navn,
      harOppsett: l.veier.length > 0,
    })

    // Bare eier kan endre tilgang. For drift er cellen en ren visning – ingen
    // knapp som later som.
    if (!erEier) {
      return <Tilgangsvisning merke={merke} systemNavn={l.system.navn} visning={visning} />
    }

    return (
      <TilgangsCelle
        visning={visning}
        epost={p.epost}
        navn={p.epost.split('@')[0]}
        systemNavn={l.system.navn}
        merke={merke}
        harTilgang={rad?.harTilgang === true}
        naavaerendeRolle={rad?.rolle ?? null}
        harKonto={rad?.harKonto ?? false}
        skrivbarVei={l.veier.find((v) => v.kanSkrive)?.etikett ?? null}
        hvorforLaast={
          l.veier.length === 0
            ? `Adminbordet vet ikke hvilken tabell som avgjør tilgang i ${l.system.navn}. Legg inn tilgangsoppsett for systemet først.`
            : (l.veier[0].notat ??
              `Ingen av tilgangsveiene i ${l.system.navn} er merket som skrivbar.`)
        }
        roller={rollerPerSystem.get(l.system.id) ?? []}
        krevArPassord={l.veier.find((v) => v.kanSkrive)?.brukerNokkel === 'auth_id'}
        gi={giTilgangTilSystem.bind(null, l.system.id)}
        taBort={taBortTilgangFraSystem.bind(null, l.system.id, p.epost)}
      />
    )
  }
```

- [ ] **Steg 9: `brukerliste.tsx` – matrisen fra `lg`, lista under.** Kommentaren over matrisekortet:

```tsx
      {/* ── Matrisen ──
          Personer nedover, systemer bortover. Dette er visningen som
          svarer på «hvem har tilgang til hva», og den som viser hvor
          mange passord den felles innloggingen faktisk vil erstatte.
          Den trenger rundt 150 px per system; under lg er lista per
          person svaret. */}
```

Tabellens `div` → `<div className="hidden overflow-x-auto lg:block">`. Overskriften «E-post» får `sticky left-0 z-10 bg-[var(--flate-opp)]` først i klassen; e-postcellen i hver rad blir

```tsx
                  {/* Står fast ved sidelengs rulling – også på PC, når
                      systemene blir flere enn skjermen rommer. */}
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[var(--flate-opp)] px-4 py-2 text-left font-semibold"
                  >
                    {p.epost}
                  </th>
                  {lest.map((l) => (
                    <td
                      key={l.system.id}
                      className={`px-2 py-2 text-center ${erEier ? 'align-top' : ''}`}
                    >
                      {celle(p, l, 'celle')}
                    </td>
                  ))}
```

(erstatter hele `{lest.map((l) => { … })}`-blokken med de to grenene). Rett etter tabellens `div`, inni samme `Kort`:

```tsx
        <div className="lg:hidden">
          <Personsok
            personer={personer.map((p) => ({
              epost: p.epost,
              innhold: (
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block font-semibold break-all">{p.epost}</span>
                      <span className="block text-xs text-[var(--blekk-svak)]">
                        Tilgang i {p.antallMedTilgang} av {lest.length} systemer
                        {p.sistInnlogget ? ` · sist inne ${visSiden(p.sistInnlogget, naa)}` : ''}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-lg text-[var(--blekk-svak)] transition-transform group-open:rotate-90"
                    >
                      ›
                    </span>
                  </summary>
                  <ul className="border-t border-[var(--kant)] bg-[var(--flate-2)]">
                    {lest.map((l) => (
                      <li
                        key={l.system.id}
                        className="border-b border-[var(--kant)] last:border-b-0"
                      >
                        {celle(p, l, 'rad')}
                      </li>
                    ))}
                  </ul>
                </details>
              ),
            }))}
          />
        </div>
```

- [ ] **Steg 10: Typesjekk, lint og test.** `npm run typecheck`, `npm run lint`, `npm test`. Forventet: ingen feil; alle tester passerer.

- [ ] **Steg 11: Prøv på telefon (375 px).** `/brukere`, vent til lista er lastet. Målescriptet: `rullere` tom, `små` tom. Skriv `tommy` i søket: «Viser 2 av 8» (eller det antallet som stemmer), bare treffene syns. Tøm søket. Åpne en person: systemene står med merke. Trykk på et system: tilgangsskjemaet åpner i full bredde med forklaringen. Trykk **Lukk** (ikke Gi tilgang eller Ta bort). Skjermbilde med en person åpen.

- [ ] **Steg 12: Sjekk 1024 og 1280 px.** 1024 × 800: matrisen syns, e-postkolonnen står fast når tabellen rulles sidelengs (`document.querySelector('main table').parentElement.scrollLeft = 400`, så skjermbilde). 1280 × 800: likt før-bildet.

- [ ] **Steg 13: Commit.** `git add` de fem filene.

```text
Mobil: Brukere som liste per person under 1024 px

Matrisen var 1186 px bred på en telefon, og bare én av åtte
systemkolonner syntes om gangen. Under 1024 px er det søk og én linje
per person; trykk for systemene, og på et system for det samme
tilgangsskjemaet som i matrisen. Drift får forklaringene som tekst,
siden hover-tekst ikke finnes på telefon. Matrisen fikk fast
e-postkolonne. Cellen bygges ett sted for begge visningene.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Oppgave 6: Handlingslinja i Appen på telefon

**Filer:**
- Endre: `src/app/(panel)/appen/handlingslinje.tsx`

- [ ] **Steg 1: Mål før.** 375 px, `/appen`: kryss av én person (bare et utvalg i nettleseren – ingenting lagres). Mål høyden på boksen: `document.querySelector('.sticky').getBoundingClientRect().height` (rundt 280). Ta skjermbilde. Fjern krysset.

- [ ] **Steg 2: Tilstand for «Flere valg».** Etter `const [bekreftStenging, settBekreftStenging] = useState(false)`:

```tsx
  const [flere, settFlere] = useState(false)

  // Under md står bare godkjenningen framme, resten bak «Flere valg». På
  // telefon tok linja ellers fem rader, rundt 40 % av skjermen, og dekket
  // lista man valgte fra.
  const ekstra = flere ? 'flex' : 'hidden md:flex'
```

- [ ] **Steg 3: Ny `return`.**

```tsx
  return (
    <div className="border-2 border-[var(--kant-sterk)] bg-[var(--flate-opp)] px-4 py-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* På telefon står antallet og «Fjern valget» på første linje. Fra md
            løser boksen seg opp (contents), og knappen går sist, som før. */}
        <div className="flex w-full items-center justify-between gap-3 md:contents">
          <strong className="text-sm">
            {valgte.length} valgt{skjulte > 0 ? ` (${skjulte} skjult av søket)` : ''}
          </strong>
          <button
            type="button"
            onClick={() => ferdig({})}
            className={`${KNAPP_LITEN} md:order-last`}
          >
            Fjern valget
          </button>
        </div>

        {/* Begge gruppevelgerne står utenfor skjemaene, og verdien reiser med i et
            skjult felt. React tilbakestiller et skjema etter hver handling, og en
            kontrollert select inni det faller da tilbake til første valg i DOM-en
            mens tilstanden husker gruppa – et nytt forsøk etter en feil ville
            sendt «ingen gruppe». Skjulte felt tegnes på nytt fra tilstanden. */}
        <div className="flex flex-wrap items-center gap-2">
          <form action={godkjenn}>
            <Idene valgte={valgte} />
            <input type="hidden" name="gruppe" value={gruppeVedGodkjenning} />
            <button type="submit" disabled={opptatt} className={KNAPP_PRIMÆR}>
              {godkjenner ? 'Godkjenner …' : 'Godkjenn'}
            </button>
          </form>
          <span className="text-sm">og legg i</span>
          <select
            value={gruppeVedGodkjenning}
            onChange={(e) => settGruppeVedGodkjenning(e.target.value)}
            aria-label="Gruppe ved godkjenning"
            className={VELGER}
          >
            <option value="">ingen gruppe</option>
            {grupper.map((g) => (
              <option key={g.id} value={g.id}>
                {g.navn}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => settFlere((f) => !f)}
          aria-expanded={flere}
          className={`${KNAPP_LITEN} md:hidden`}
        >
          {flere ? 'Færre valg' : 'Flere valg'}
        </button>

        {grupper.length > 0 && (
          <div className={`${ekstra} flex-wrap items-center gap-2`}>
            <select
              value={gruppe}
              onChange={(e) => settGruppe(e.target.value)}
              aria-label="Gruppe"
              className={VELGER}
            >
              {grupper.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.navn}
                </option>
              ))}
            </select>
            <form action={leggInn}>
              <Idene valgte={valgte} />
              <input type="hidden" name="gruppe" value={gruppe} />
              <button type="submit" disabled={opptatt} className={KNAPP_LITEN}>
                {leggerInn ? '…' : 'Legg i gruppe'}
              </button>
            </form>
            <form action={taUt}>
              <Idene valgte={valgte} />
              <input type="hidden" name="gruppe" value={gruppe} />
              <button type="submit" disabled={opptatt} className={KNAPP_LITEN}>
                {tarUt ? '…' : 'Ta ut av gruppe'}
              </button>
            </form>
          </div>
        )}

        <div className={`${ekstra} flex-wrap items-center gap-2`}>
          {bekreftStenging ? (
            <form action={steng} className="flex flex-wrap items-center gap-2">
              <Idene valgte={valgte} />
              <span className="text-sm">Stenge ute {valgte.length}?</span>
              <button type="submit" disabled={opptatt} className={KNAPP_FARLIG}>
                {stenger ? 'Stenger …' : 'Ja, steng ute'}
              </button>
              <button
                type="button"
                onClick={() => settBekreftStenging(false)}
                className={KNAPP_LITEN}
              >
                Avbryt
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => settBekreftStenging(true)}
              disabled={opptatt}
              className={KNAPP_FARLIG}
            >
              Steng ute
            </button>
          )}
        </div>
      </div>
    </div>
  )
```

- [ ] **Steg 4: Typesjekk og lint.** Forventet: ingen feil.

- [ ] **Steg 5: Prøv på telefon.** 375 px, `/appen`: kryss av én person. Boksen: «1 valgt» og Fjern valget øverst, Godkjenn med gruppevalg, «Flere valg». Høyden under 200 px. Trykk «Flere valg»: gruppehandlingene og Steng ute kommer fram; trykk «Færre valg». **Ikke** trykk Godkjenn, Legg i gruppe, Ta ut eller Steng ute. Boksen ligger over bunnmenyen. Trykk «Fjern valget» (bare nettleseren). Skjermbilde med utvalg.

- [ ] **Steg 6: Sjekk PC.** 1280 px, `/appen`: kryss av én person; linja ser ut som før-bildet (alt på én–to rader, Fjern valget sist, ingen «Flere valg»). Fjern krysset.

- [ ] **Steg 7: Commit.**

```text
Mobil: handlingslinja i Appen viser godkjenning først

På telefon tok linja for valgte fem rader og dekket lista. Under 768 px
står antall og «Fjern valget» øverst, så Godkjenn med gruppe, og resten
bak «Flere valg». Fra 768 px er linja som før.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Oppgave 7: Statuslinjene på Oversikt

**Filer:**
- Endre: `src/components/tilstand.tsx`

- [ ] **Steg 1: Ny `Kildelinje`.** Kommentaren over den: setningen «Teksten fra målingen står ved siden av merket, aldri i stedet for det: «Pauset» alene sier ikke om det er greit.» blir «Teksten fra målingen står ved siden av eller under merket, aldri i stedet for det: «Pauset» alene sier ikke om det er greit.» Over funksjonen:

```tsx
/** Meldinger lenger enn dette får egen linje. Ved siden av navnet og merket
    ble en lang feilmelding presset inn i en stripe noen få ord bred – på
    telefon, og i tre-kolonne-visningen på PC. Korte («Aktiv», «Klar») står
    best på linja. */
const LANG_MELDING = 24
```

Funksjonskroppen:

```tsx
  const egenLinje = melding !== null && melding.length > LANG_MELDING

  return (
    <div className="border-t border-[var(--kant)] px-4 py-2 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
          {kildeNavn[kilde]}
        </span>
        <span className="flex items-center gap-2 text-right">
          {melding && !egenLinje && (
            <span className="text-sm text-[var(--blekk-svak)]">{melding}</span>
          )}
          {fraLager && (
            <span
              className="text-xs text-[var(--blekk-svak)] italic"
              title={`Live-kallet feilet. Dette er siste lagrede måling, gjort ${visDatoTid(fraLager)}.`}
            >
              {visSiden(fraLager, naa)}
            </span>
          )}
          <TilstandsMerke tilstand={tilstand} />
        </span>
      </div>
      {egenLinje && (
        <p className="mt-1 text-sm break-words text-[var(--blekk-svak)]">{melding}</p>
      )}
    </div>
  )
```

- [ ] **Steg 2: Typesjekk og lint.** Forventet: ingen feil.

- [ ] **Steg 3: Prøv.** 375 px, `/`: Vercel-feilen (403) i kortene står under «UTRULLING»-linja i full bredde; «DATABASE Aktiv OK» står på én linje. 1280 px, `/`: korte meldinger som før; den lange feilen står under linja i stedet for som en smal stripe. Skjermbilder.

- [ ] **Steg 4: Commit.**

```text
Oversikt: lange meldinger i statuslinjene får egen linje

En lang feilmelding ble presset inn i en stripe noen få ord bred mellom
navnet og merket, på telefon og i tre-kolonne-visningen på PC. Over 24
tegn står den nå under linja i full bredde; korte meldinger står der de
sto.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Oppgave 8: HM-ikon og Hjem-skjerm

**Filer:**
- Opprett: `src/app/manifest.ts`, `src/app/icon.png`, `src/app/apple-icon.png`, `public/ikon-192.png`, `public/ikon-512.png`, `public/ikon-maskable-512.png`
- Endre: `src/app/layout.tsx`, `src/proxy.ts`

- [ ] **Steg 1: Lag ikonene (skriptet sjekkes ikke inn).** Skriv `lag-ikoner.mjs` i scratchpad-mappa:

```js
// Lager adminbordets ikoner fra public/hm-logo.png. Kjøres fra adminbord-mappa.
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/thoma/hauge-maskin-adminbord/package.json')
const sharp = require('sharp')
const BAKGRUNN = { r: 11, g: 11, b: 12, alpha: 1 } // #0b0b0c, som innloggingssiden
const LOGO = 'public/hm-logo.png'

async function ikon(fil, side, andel) {
  const bredde = Math.round(side * andel)
  const merke = await sharp(LOGO).resize({ width: bredde }).png().toBuffer()
  const { height } = await sharp(merke).metadata()
  await sharp({ create: { width: side, height: side, channels: 4, background: BAKGRUNN } })
    .composite([{ input: merke, left: Math.round((side - bredde) / 2), top: Math.round((side - height) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(fil)
  console.log(fil, side)
}

await ikon('src/app/icon.png', 64, 0.86)
await ikon('src/app/apple-icon.png', 180, 0.72)
await ikon('public/ikon-192.png', 192, 0.72)
await ikon('public/ikon-512.png', 512, 0.72)
// Maskable: logoens diagonal innenfor sirkelen på 80 % (0,6 × 512 = 307 px bred).
await ikon('public/ikon-maskable-512.png', 512, 0.6)
```

Kjør fra `hauge-maskin-adminbord`: `node <scratchpad>/lag-ikoner.mjs`. Forventet: fem linjer med filnavn. Se på `public/ikon-512.png` og `public/ikon-maskable-512.png` med Read: HM-logoen sentrert på svart.

- [ ] **Steg 2: `src/app/manifest.ts`.**

```ts
import type { MetadataRoute } from 'next'

/**
 * Gjør at «Legg til på Hjem-skjerm» gir HM-ikonet og åpner adminbordet i
 * fullskjerm. Ingen service worker: alt her er live, og en mellomlagret side
 * ville vist gammel status som om den var ny.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HM Adminbord',
    short_name: 'Adminbord',
    description: 'Driftsoversikt og brukerstyring for alle Hauge Maskin-systemer.',
    lang: 'nb',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0b0c',
    theme_color: '#0b0b0c',
    icons: [
      { src: '/ikon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/ikon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/ikon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

- [ ] **Steg 3: `src/app/layout.tsx` – `appleWebApp`.** I `metadata`, etter `robots`:

```ts
  // Hjem-skjermen på iPhone. Svart statuslinje – samme svart som
  // innloggingssiden og themeColor.
  appleWebApp: { capable: true, title: 'Adminbord', statusBarStyle: 'black' },
```

- [ ] **Steg 4: `src/proxy.ts` – matcheren.** Kommentaren: «Matcheren utelater innloggingssiden og cron-ruten:» → «Matcheren utelater innloggingssiden, cron-ruten og det telefonen henter til Hjem-skjermen (manifestet og ikonene):». Matcheren:

```ts
export const config = {
  matcher: [
    '/((?!logg-inn|api/status|_next/static|_next/image|manifest\\.webmanifest|icon|apple-icon|.*\\.png$).*)',
  ],
}
```

- [ ] **Steg 5: Typesjekk og lint.** Forventet: ingen feil.

- [ ] **Steg 6: Prøv.** Last `/` på nytt. I nettleseren: `[...document.querySelectorAll('link[rel=manifest], link[rel=icon], link[rel=apple-touch-icon]')].map(l => l.outerHTML)` – tre lenker. `await fetch('/manifest.webmanifest').then(r => r.json())` – navn, ikoner, `display: 'standalone'`. `await Promise.all(['/ikon-192.png','/ikon-512.png','/ikon-maskable-512.png'].map(u => fetch(u).then(r => u + ' ' + r.status)))` – alle 200. Følg `href` på apple-touch-icon-lenken med `fetch`: 200, `image/png`. `document.querySelector('meta[name=viewport]').content` inneholder `viewport-fit=cover`.

- [ ] **Steg 7: Commit.** `git add` de seks nye filene, `src/app/layout.tsx` og `src/proxy.ts`.

```text
Adminbordet kan legges på Hjem-skjermen med HM-ikon

Manifest med navn, fullskjerm og ikoner (192, 512 og maskable), og
apple-icon for iPhone, laget fra hm-logo.png på samme svart som
innloggingssiden. Proxy-matcheren slipper manifestet og ikonene forbi,
så de ikke koster et Supabase-kall. Ingen service worker: alt her er
live.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Oppgave 9: Gjennomgang, README og utrulling

**Filer:**
- Endre: `README.md` (og det gjennomgangen finner)

- [ ] **Steg 1: Mål alle sidene på telefon.** 375 px med berøring, målescriptet på `/`, `/systemer`, `/systemer/rorlager`, `/appen`, `/appen/person/a5a325a2-edfe-4be1-b6c9-a34963f0d902`, `/appen/grupper`, `/appen/sider`, `/brukere`, `/logg`, `/innstillinger`. Forventet: `sidebredde === vindu`, `rullere`, `små` og `zoom` tomme. Rest i `små` rettes på samme måte som i oppgave 1 (`pointer-coarse:min-h-11`, eller `LENKE_ALENE` for lenker som står alene) og føres opp i commit-meldingen.

- [ ] **Steg 2: Innloggingssiden.** Den sender innloggede videre til `/`, og eier skal ikke logges ut, så den måles ikke i nettleseren. Det eneste som når den, er `src/app/layout.tsx` og `globals.css`: sjekk at `git diff --stat e490fff -- src/app/logg-inn` er tom, og at `body` bare har fått `padding-left/right: env(safe-area-inset-*)` (0 på stående telefon). Feltene der er `FELT` med 16 px fra før.

- [ ] **Steg 3: PC-sammenligning.** 1280 × 800, de samme sidene: skjermbilder mot før-bildene fra oppgave 0. Forskjeller skal bare være statuslinjene med lange meldinger på Oversikt.

- [ ] **Steg 4: README.** Etter punktlista over fanene:

```markdown
Adminbordet virker også på telefon: menyen ligger nederst, brede tabeller
blir lister, og det kan legges på Hjem-skjermen med HM-ikonet.
```

- [ ] **Steg 5: Alt grønt.** I `hauge-maskin-adminbord`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Forventet: ingen feil; bygget lister `/manifest.webmanifest`, `/icon.png` og `/apple-icon.png` som statiske.

- [ ] **Steg 6: Commit README og eventuelle rettelser.**

```text
README: adminbordet på telefon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Steg 7: Push.** `git status` (bare egne filer), `git fetch origin`, `git rebase origin/main` hvis main har flyttet seg (kjør da typecheck og test på nytt), `git push origin main`.

- [ ] **Steg 8: Se at utrullingen er ute.** Produksjonsadressen står i registeret (`/systemer/adminbord`, «Åpne appen»). Når Vercel er ferdig: `fetch('<produksjonsadresse>/manifest.webmanifest')` gir manifestet (ikke 404).

- [ ] **Steg 9: Rydd.** Stopp dev-serveren (`preview_stop`), sett vinduet tilbake (`resize_window` `preset: 'desktop'`), og fjern oppføringen `adminbord-mobiltest` fra `hauge-maskin-mobil/.claude/launch.json` (fila er sporet i git – `git diff` der skal være tom etterpå).
