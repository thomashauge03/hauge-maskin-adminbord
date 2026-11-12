'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { isoDato, leggTilDager, visFrist } from '@/lib/format'
import type { Systemvalg } from '@/lib/gjoremal'

export type Valg = { systemId: string | null; frist: string | null; viktig: boolean }

// Ingen egen fokuskant: den globale 3px-outlinen er fokusmarkøren for alle
// knapper i adminbordet. En rød kant i tillegg ga to rammer rundt samme felt.
export const KONTROLL = 'min-h-9 border-2 bg-[var(--flate)] px-2 text-sm transition-colors pointer-coarse:min-h-11'

// «Satt» vises med kant og vekt, ikke bare farge: da ser man at systemet ble
// stående etter forrige Legg til, også i gråtoner og med fargesvakt syn.
export const SATT = 'border-[var(--blekk-svak)] text-[var(--blekk)] font-semibold hover:border-[var(--blekk)]'
export const USATT = 'border-[var(--kant)] text-[var(--blekk-svak)] font-normal hover:border-[var(--kant-sterk)]'

const PIL = (
  <svg
    viewBox="0 0 16 16"
    aria-hidden="true"
    className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M3 6l5 5 5-5" />
  </svg>
)

function storForbokstav(tekst: string) {
  return tekst.charAt(0).toUpperCase() + tekst.slice(1)
}

/** Hurtigvalgene for frist. Et rått datofelt krever fem trykk for «i morgen»; de fleste frister er en av disse. */
function hurtigfrister(idag: string): { tekst: string; dato: string; visDag: boolean }[] {
  const ukedag = (new Date(`${idag}T00:00:00Z`).getUTCDay() + 6) % 7
  const valg = [
    { tekst: 'I dag', dato: idag, visDag: false },
    { tekst: 'I morgen', dato: leggTilDager(idag, 1), visDag: false },
  ]
  // Torsdag til søndag er «fredag» enten i morgen eller forbi, og søndag er
  // «mandag» det samme som i morgen. To knapper for samme dag er bare støy.
  // Datoen står etter ukedagen fordi «Mandag» alene ikke sier om det er
  // førstkommende eller neste uke.
  if (4 - ukedag >= 2) valg.push({ tekst: 'Fredag', dato: leggTilDager(idag, 4 - ukedag), visDag: true })
  if (7 - ukedag >= 2) valg.push({ tekst: 'Mandag', dato: leggTilDager(idag, 7 - ukedag), visDag: true })
  return valg
}

/**
 * System, frist og viktig – felles for nytt gjøremål og redigering, så de
 * ser like ut og ikke driver fra hverandre.
 *
 * Alle er valgfrie og står som små kontroller ved siden av hverandre, ikke
 * som et skjema med etiketter over: det skal fortsatt gå an å skrive inn
 * noe og trykke Enter uten å se på dem.
 *
 * På telefon får systemvelgeren hele første rad. Delte den rad med frist og
 * viktig, krympet den til bare pila så snart en frist var satt, og man så
 * ikke hvilket system som var valgt.
 *
 * Fristraden ligger under kontrollraden og ikke inni den, så `ekstra` (Notat
 * i NyLinje) står stille til høyre når raden åpnes.
 *
 * `idag` bør komme fra serveren. Uten den regnes datoen ut i nettleseren
 * ved første tegning; den vises bare etter at noen har valgt en frist, så
 * det gir ikke ulik tekst ved hydrering.
 */
export function Valglinje({
  systemer,
  valg,
  onEndre,
  idag,
  ekstra,
}: {
  systemer: Systemvalg[]
  valg: Valg
  onEndre: (valg: Valg) => void
  idag?: string
  ekstra?: ReactNode
}) {
  const [lokalIdag] = useState(() => isoDato(Date.now()))
  const dag = idag ?? lokalIdag
  const [åpen, settÅpen] = useState(false)
  const fristKnapp = useRef<HTMLButtonElement>(null)
  const fristRad = useRef<HTMLDivElement>(null)
  // lukk() flytter fokus til Frist-knappen før raden forsvinner, og det gir en
  // blur på datofeltet. Uten flagget ville Esc lagret datoen den skulle
  // avbryte, og Enter ville lagret den to ganger.
  const hoppOverBlur = useRef(false)
  const radId = `fristvalg-${useId()}`

  function lukk() {
    hoppOverBlur.current = true
    settÅpen(false)
    // Knappen som ble trykket forsvinner med raden; uten dette faller fokus
    // til toppen av siden.
    fristKnapp.current?.focus()
  }

  function velgFrist(frist: string) {
    onEndre({ ...valg, frist })
    lukk()
  }

  // Mens året tastes, er verdien gyldig allerede ved første siffer (år 0002),
  // og dagen er gyldig ved første siffer («2» blir 02.). Derfor tas datoen
  // først i bruk når feltet forlates eller Enter trykkes, ikke ved endring.
  function godDato(v: string) {
    return v !== '' && v >= dag && v !== valg.frist
  }

  const tekst = valg.frist ? storForbokstav(visFrist(valg.frist, dag)) : null

  return (
    <div className="w-full">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-wrap sm:items-center">
        <span className="relative col-span-full min-w-0 sm:col-span-1">
          <select
            value={valg.systemId ?? ''}
            onChange={(e) => onEndre({ ...valg, systemId: e.target.value || null })}
            aria-label="System"
            // Egen pil fordi den innebygde tegnes ulikt i hver nettleser og
            // bryter med de rette kantene.
            className={`${KONTROLL} ${valg.systemId ? SATT : USATT} w-full appearance-none truncate pr-8 sm:w-auto sm:max-w-[16rem]`}
          >
            <option value="">Uten system</option>
            {systemer.map((s) => (
              <option key={s.id} value={s.id}>
                {s.navn}
              </option>
            ))}
          </select>
          {PIL}
        </span>

        <span className="flex min-w-0">
          <button
            ref={fristKnapp}
            type="button"
            onClick={() => {
              hoppOverBlur.current = false
              settÅpen((v) => !v)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && åpen) {
                // Ellers avbryter Esc hele redigeringen i stedet for å lukke raden.
                e.stopPropagation()
                settÅpen(false)
              }
            }}
            aria-expanded={åpen}
            aria-controls={radId}
            className={`${KONTROLL} ${valg.frist ? SATT : USATT} relative flex min-w-0 flex-1 items-center pr-7 whitespace-nowrap sm:flex-none`}
          >
            {tekst ? (
              <>
                {/* Synlig «Frist» på PC og alltid i navnet: uten det hører en
                    skjermleser bare «Tir. 15. des.» og ikke hva datoen er. På
                    telefon trengs plassen til selve datoen. */}
                <span className="shrink-0 font-normal text-[var(--blekk-svak)] max-sm:sr-only">Frist&nbsp;·&nbsp;</span>
                <span className="truncate">{tekst}</span>
              </>
            ) : (
              <span className="truncate">Frist</span>
            )}
            {PIL}
          </button>
          {valg.frist && (
            <button
              type="button"
              onClick={() => onEndre({ ...valg, frist: null })}
              aria-label="Fjern frist"
              title="Fjern frist"
              className="flex min-h-9 shrink-0 items-center justify-center border-2 border-l-0 border-[var(--blekk-svak)] px-2 text-[var(--blekk-svak)] hover:text-[var(--blekk)] pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />
              </svg>
            </button>
          )}
        </span>

        {/* Telefon: Viktig og ekstra deler én rutenettcelle, så Frist får hele
            restbredden. Fra sm av løses spannet opp og alt står i flex-raden. */}
        <span className="flex gap-2 sm:contents">
          <button
            type="button"
            aria-pressed={valg.viktig}
            onClick={() => onEndre({ ...valg, viktig: !valg.viktig })}
            // Rolig i stedet for fylt rød: Legg til skal være den eneste fylte
            // røde boksen i skjemaet. Selve forhåndsvisningen av viktig er
            // den røde venstrekanten på skjemaet i NyLinje.
            className={`${KONTROLL} flex items-center gap-1.5 ${
              valg.viktig ? 'border-hm-red! bg-transparent! font-semibold text-[var(--blekk)]' : USATT
            }`}
          >
            {/* Tom rute mot fylt rute, som avhukingsruta på flisa. Begge har
                kant, så de er like store og «Viktig» står stille ved trykk. */}
            {valg.viktig ? (
              <span
                aria-hidden="true"
                className="hm-display inline-flex size-4 items-center justify-center border-2 border-hm-red bg-hm-red text-[11px] leading-none text-white"
              >
                !
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="hm-display inline-flex size-4 items-center justify-center border-2 border-[var(--kant-sterk)] text-[11px] leading-none text-[var(--blekk-svak)]"
              >
                !
              </span>
            )}
            Viktig
          </button>
          {ekstra && <span className="sm:ml-auto">{ekstra}</span>}
        </span>
      </div>

      {åpen && (
        <div
          ref={fristRad}
          id={radId}
          role="group"
          aria-label="Velg frist"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              lukk()
            }
          }}
          className="mt-2 flex flex-wrap gap-y-2"
        >
          {hurtigfrister(dag).map((h) => (
            <button
              key={h.tekst}
              type="button"
              aria-pressed={valg.frist === h.dato}
              onClick={() => velgFrist(h.dato)}
              // Én sammenhengende stripe: kantene legges oppå hverandre, og
              // den valgte løftes så hele kanten dens synes.
              className={`${KONTROLL} ${valg.frist === h.dato ? `${SATT} z-10` : USATT} relative -ml-0.5 first:ml-0 focus-visible:z-20`}
            >
              {h.tekst}
              {/* Ekte mellomrom og ikke ml-1: ellers leser skjermleseren «Mandag16.». */}
              {h.visDag && (
                <>
                  {' '}
                  <span className="hm-tall font-normal text-[var(--blekk-svak)]">{Number(h.dato.slice(8))}.</span>
                </>
              )}
            </button>
          ))}
          <input
            type="date"
            // Ukontrollert: et kontrollert datofelt settes tilbake mellom
            // hvert siffer man taster, og da går det ikke an å skrive et år.
            defaultValue={valg.frist ?? ''}
            min={dag}
            onBlur={(e) => {
              if (hoppOverBlur.current) {
                hoppOverBlur.current = false
                return
              }
              // Et hurtigvalg trykket rett etter datofeltet skal vinne; lukket
              // raden seg her, ville knappen forsvunnet før trykket nådde den.
              if (e.relatedTarget instanceof Node && fristRad.current?.contains(e.relatedTarget)) return
              const v = e.currentTarget.value
              if (!godDato(v)) return
              onEndre({ ...valg, frist: v })
              settÅpen(false)
              // Bare når fokus ikke gikk et annet sted: å hente det tilbake
              // ville kapret Tab og trykket som førte brukeren videre.
              if (!e.relatedTarget) fristKnapp.current?.focus()
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              // Ellers sendes skjemaet med fristen som sto før.
              e.preventDefault()
              const v = e.currentTarget.value
              if (godDato(v)) velgFrist(v)
            }}
            aria-label="Annen dato"
            // Uten dette tegner Chrome kalenderikonet svart på mørk flate.
            style={{ colorScheme: 'light dark' }}
            // Telefon: hele andre rad med vilje. Med -ml-0.5 stakk det 2 px ut
            // forbi hurtigvalgene, og alene på linja så det tilfeldig plassert ut.
            className={`${KONTROLL} ${USATT} relative -ml-0.5 focus-visible:z-20 max-sm:ml-0 max-sm:basis-full`}
          />
        </div>
      )}
    </div>
  )
}
