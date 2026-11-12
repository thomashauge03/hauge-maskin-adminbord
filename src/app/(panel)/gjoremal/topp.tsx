'use client'

import { useEffect, useRef, useState } from 'react'
import { KNAPP_PRIMÆR, Snurr } from '@/components/ui'
import type { Gjøremålsfelter, Systemvalg } from '@/lib/gjoremal'
import { KONTROLL, SATT, USATT, Valglinje, type Valg } from './valg'

// Bitene er tellbare, en prosent er det ikke: hver avhuking fyller én konkret
// bit. Over 24 blir bitene hårtynne på telefon, og da er en hel stolpe ærligere.
const MAKS_BITER = 24

/**
 * `forfalt` er de åpne med frist før i dag. De får sperrebåndet fra
 * feilkortene i stolpen, rett etter de gjorte, så det som haster står der
 * øyet allerede er.
 *
 * `systemNavn` er filteret tallet gjelder. Uten det hopper «2 av 8» til
 * «1 av 2» ved et trykk på et filter, og det ser ut som noe forsvant.
 */
export function Fremdrift({
  gjort,
  av,
  ventende,
  forfalt = 0,
  systemNavn = null,
}: {
  gjort: number
  av: number
  ventende: boolean
  forfalt?: number
  systemNavn?: string | null
}) {
  const alt = av > 0 && gjort === av
  const tekst = `${gjort} av ${av} gjort${forfalt > 0 ? `, ${forfalt} forfalt` : ''}`
  const navn = systemNavn ? `Fremdrift for ${systemNavn}` : 'Fremdrift'

  return (
    // Ikke section med eget navn: da leste skjermleseren navnet to ganger, først
    // for seksjonen og så for stolpen. Stolpen bærer både navn og verdi.
    <div>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {av === 0 ? (
            <p className="hm-display hm-tall text-6xl leading-none text-[var(--blekk-svak)] sm:text-7xl">0</p>
          ) : (
            <p className="hm-display hm-tall text-6xl leading-none sm:text-7xl">
              <span className={alt ? 'text-hm-red' : undefined}>{gjort}</span>
              <span className="text-[var(--blekk-svak)]"> av {av}</span>
            </p>
          )}
          {/* Hver del i sitt eget spann med skilletegnet foran: på smal
              skjerm brytes «·» da sammen med ordet sitt, i stedet for å bli
              hengende alene på slutten av en linje. */}
          <p className="mt-2 flex flex-wrap gap-x-2 text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
            <span>{av === 0 ? 'Ingenting på lista ennå' : alt ? 'Alt er gjort' : 'Gjort'}</span>
            {systemNavn && <span className="text-[var(--blekk)] before:mr-2 before:text-[var(--blekk-svak)] before:content-['·']">{systemNavn}</span>}
            {av > 0 && forfalt > 0 && (
              <span className="text-hm-red before:mr-2 before:text-[var(--blekk-svak)] before:content-['·']">
                {forfalt} forfalt
              </span>
            )}
          </p>
        </div>
        {/* Fast plass, så etiketten aldri byttes ut og tallet ikke hopper. De
            fleste lagringene er ferdige før 400 ms; forsinkelsen gjør at
            indikatoren bare dukker opp når det faktisk tar tid, i stedet for
            å blinke ved hvert trykk. */}
        <p
          aria-live="polite"
          className="flex min-w-20 items-center justify-end gap-2 self-end text-xs text-[var(--blekk-svak)]"
        >
          {ventende && (
            <span className="flex animate-[hm-inn_200ms_400ms_both] items-center gap-2">
              <Snurr /> Lagrer
            </span>
          )}
        </p>
      </div>

      {av === 0 ? (
        <div aria-hidden="true" className="mt-4 h-3 bg-[var(--kant)]" />
      ) : av <= MAKS_BITER ? (
        <div
          role="progressbar"
          aria-label={navn}
          aria-valuemin={0}
          aria-valuemax={av}
          aria-valuenow={gjort}
          aria-valuetext={tekst}
          className="mt-4 flex h-3 gap-[3px]"
        >
          {Array.from({ length: av }, (_, i) => (
            <span
              key={i}
              className={`flex-1 transition-colors duration-200 ${
                i < gjort ? 'bg-hm-red' : i < gjort + forfalt ? 'hm-varselstriper' : 'bg-[var(--kant)]'
              }`}
            />
          ))}
        </div>
      ) : (
        <div
          role="progressbar"
          aria-label={navn}
          aria-valuemin={0}
          aria-valuemax={av}
          aria-valuenow={gjort}
          aria-valuetext={tekst}
          className="mt-4 flex h-3 bg-[var(--kant)]"
        >
          <div
            className="h-full bg-hm-red transition-[width] duration-500 ease-out"
            style={{ width: `${(gjort / av) * 100}%` }}
          />
          {forfalt > 0 && (
            <div
              className="hm-varselstriper h-full transition-[width] duration-500 ease-out"
              style={{ width: `${(forfalt / av) * 100}%` }}
            />
          )}
        </div>
      )}
    </div>
  )
}

// Egen klasserekke i stedet for disabled:-varianter på KNAPP_PRIMÆR: skyggen
// i hm-kant-skygge-sm står utenfor lagene og lar seg ikke overstyre derfra,
// og to disabled:-klasser for samme egenskap har ingen sikker rekkefølge. En
// halvgjennomsiktig rød knapp ser grumsete rosa ut; tom knapp skal være stille.
const KNAPP_TOM =
  'inline-flex min-h-[2.75rem] cursor-not-allowed items-center justify-center gap-2 border-2 border-[var(--kant)] bg-transparent px-5 text-sm font-bold tracking-wide text-[var(--blekk-svak)] uppercase'

// Skjemaets røde kant bærer fokusen. Uten dette får feltet også den globale
// 3px-outlinen innenfor kanten, altså to rammer. Den globale regelen står
// utenfor lagene og slår vanlige Tailwind-klasser, derfor !important.
const FELT_INNI = 'focus-visible:outline-none!'

const INGEN_VALG: Valg = { systemId: null, frist: null, viktig: false }

export function NyLinje({
  systemer,
  onLeggTil,
  idag,
}: {
  systemer: Systemvalg[]
  onLeggTil: (felter: Gjøremålsfelter) => void
  idag?: string
}) {
  const [tittel, settTittel] = useState('')
  const [notat, settNotat] = useState('')
  const [visNotat, settVisNotat] = useState(false)
  const [valg, settValg] = useState<Valg>(INGEN_VALG)
  const felt = useRef<HTMLInputElement>(null)
  const tom = !tittel.trim()
  const harValg = valg.systemId !== null || valg.frist !== null || valg.viktig

  // Bare med mus: på telefon ville tastaturet sprettet opp og dekket lista.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) felt.current?.focus()
  }, [])

  function send() {
    const t = tittel.trim()
    if (!t) return
    onLeggTil({ tittel: t, notat: notat.trim() || null, ...valg })
    settTittel('')
    settNotat('')
    settVisNotat(false)
    // Systemet blir stående: legger man inn flere ting på rad, gjelder de
    // som regel samme system. Frist og viktig gjelder bare det ene.
    settValg((v) => ({ ...INGEN_VALG, systemId: v.systemId }))
    felt.current?.focus()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      // Samme røde venstrekant som flisa får, så man ser resultatet før man
      // trykker Legg til. Polstringen krymper like mye som kanten vokser, ellers
      // hopper «+» og teksten til siden.
      className={`border-2 border-[var(--kant)] bg-[var(--flate-opp)] transition-colors focus-within:border-hm-red ${
        valg.viktig ? 'border-l-[6px] border-l-hm-red' : ''
      }`}
    >
      <div className={`flex items-center gap-3 pr-2 ${valg.viktig ? 'pl-3' : 'pl-4'}`}>
        <span aria-hidden="true" className="hm-display text-2xl leading-none text-hm-red">
          +
        </span>
        <input
          ref={felt}
          value={tittel}
          onChange={(e) => settTittel(e.target.value)}
          maxLength={300}
          autoComplete="off"
          enterKeyHint="done"
          aria-label="Nytt gjøremål"
          placeholder="Hva må gjøres?"
          className={`${FELT_INNI} min-w-0 flex-1 bg-transparent py-4 text-base text-[var(--blekk)] outline-none placeholder:text-[var(--blekk-svak)] sm:text-lg`}
        />
        <button type="submit" disabled={tom} className={`${tom ? KNAPP_TOM : KNAPP_PRIMÆR} shrink-0 max-sm:px-3`}>
          Legg til
        </button>
      </div>

      {/* Telefon: først når det er noe å legge til. Linja koster ca. 60 px og
          ville ellers dyttet første flis under bretten. */}
      <div
        // pl-2 når Viktig er på: den røde 6 px-kanten tar 4 px mer enn den
        // vanlige, og uten dette hopper knappen man nettopp trykket under pekeren.
        className={`border-t-2 border-[var(--kant)] py-2.5 pr-3 ${valg.viktig ? 'pl-2' : 'pl-3'} sm:flex ${
          !tom || visNotat || harValg ? 'flex' : 'hidden'
        }`}
      >
        <Valglinje
          systemer={systemer}
          valg={valg}
          onEndre={settValg}
          idag={idag}
          // Inni Valglinje og ikke ved siden av: på telefon står Notat da i
          // samme rad som Frist og Viktig i stedet for alene på en egen linje.
          ekstra={
            // Navnet er bare «Notat»: aria-expanded sier om det er åpent, og
            // «pluss notat» opplest er støy.
            <button
              type="button"
              onClick={() => settVisNotat((v) => !v)}
              aria-expanded={visNotat}
              aria-label="Notat"
              className={`${KONTROLL} ${visNotat ? SATT : USATT} flex items-center justify-center gap-1 pointer-coarse:min-w-11`}
            >
              <span aria-hidden="true" className="max-sm:hidden">
                {visNotat ? '−' : '+'}
              </span>
              <span className="max-sm:sr-only">Notat</span>
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="size-4 sm:hidden"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path d="M3 4h10M3 8h10M3 12h6" />
              </svg>
            </button>
          }
        />
      </div>

      {visNotat && (
        <textarea
          value={notat}
          onChange={(e) => settNotat(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              send()
            }
          }}
          rows={3}
          maxLength={4000}
          aria-label="Notat"
          placeholder="Notat (Ctrl + Enter legger til)"
          className={`${FELT_INNI} block w-full resize-y border-t-2 border-[var(--kant)] bg-transparent pr-4 ${valg.viktig ? 'pl-3' : 'pl-4'} py-3 text-sm text-[var(--blekk)] outline-none placeholder:text-[var(--blekk-svak)]`}
        />
      )}
    </form>
  )
}
