'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Feilstripe, KNAPP_LITEN } from '@/components/ui'
import { isoDato, leggTilDager } from '@/lib/format'
import type { Gjøremål, Gjøremålsfelter, Systemvalg } from '@/lib/gjoremal'
import { Rad } from './rad'
import { Fremdrift, NyLinje } from './topp'
import {
  endreGjøremål,
  gjenopprettGjøremål,
  leggTilGjøremål,
  settGjort,
  slettGjøremål,
  type Svar,
} from './actions'

/** Så lenge «Angre» står framme etter en sletting. */
const ANGREFRIST_MS = 6000
/** Så lenge et avhuket gjøremål blir stående blant de åpne, så streken rekker å synes. */
const BLI_STÅENDE_MS = 1200

const nyestFørst = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)

type Gruppe = { nøkkel: string; tittel: string; varsel?: boolean; gjøremål: Gjøremål[] }

/**
 * Åpne gjøremål delt etter frist. Innen hver gruppe står viktige først, så
 * tidligste frist, så nyeste. Tomme grupper vises ikke: fem overskrifter
 * over to gjøremål ville vært mer struktur enn innhold.
 */
function grupperEtterFrist(åpne: Gjøremål[], idag: string): Gruppe[] {
  const søndag = leggTilDager(idag, 6 - ((new Date(`${idag}T00:00:00Z`).getUTCDay() + 6) % 7))
  const grupper: Gruppe[] = [
    { nøkkel: 'forfalt', tittel: 'Forfalt', varsel: true, gjøremål: [] },
    { nøkkel: 'idag', tittel: 'I dag', gjøremål: [] },
    { nøkkel: 'uka', tittel: 'Resten av uka', gjøremål: [] },
    { nøkkel: 'senere', tittel: 'Senere', gjøremål: [] },
    { nøkkel: 'uten', tittel: 'Uten frist', gjøremål: [] },
  ]
  const [forfalt, iDag, uka, senere, uten] = grupper
  for (const g of åpne) {
    if (!g.frist) uten.gjøremål.push(g)
    else if (g.frist < idag) forfalt.gjøremål.push(g)
    else if (g.frist === idag) iDag.gjøremål.push(g)
    else if (g.frist <= søndag) uka.gjøremål.push(g)
    else senere.gjøremål.push(g)
  }
  for (const gr of grupper) {
    gr.gjøremål.sort(
      (a, b) =>
        Number(b.viktig) - Number(a.viktig) ||
        (a.frist ?? '').localeCompare(b.frist ?? '') ||
        nyestFørst(a.opprettet, b.opprettet),
    )
  }
  return grupper.filter((gr) => gr.gjøremål.length > 0)
}

/** Varselet forsvinner, og fokus må et sted før det skjer, ellers havner det på toppen av siden. */
function fokusUtAvVarselet(varsel: HTMLElement | null, nyLinje: HTMLElement | null) {
  if (!varsel?.contains(document.activeElement)) return
  // Bare med mus: på telefon ville tastaturet sprettet opp av seg selv.
  if (window.matchMedia('(pointer: fine)').matches) nyLinje?.querySelector('input')?.focus()
}

export function Gjøremålsliste({
  start,
  systemer,
  gjortAvkortet,
  idag,
  mandag,
}: {
  start: Gjøremål[]
  systemer: Systemvalg[]
  gjortAvkortet: boolean
  idag: string
  mandag: string
}) {
  // null = alle systemer, '' = gjøremål uten system.
  const [filter, settFilter] = useState<string | null>(null)
  const router = useRouter()
  const [liste, settListe] = useState(start)
  // Ny liste fra serveren (etter en feil, eller en ny sidelast) erstatter
  // den lokale. Gjort under rendring, ikke i en effekt, så den gamle aldri
  // vises ett bilde for lenge.
  const [forrigeStart, settForrigeStart] = useState(start)
  if (start !== forrigeStart) {
    settForrigeStart(start)
    settListe(start)
  }

  // Uten dette ville et avhuket gjøremål forsvunnet fra lista i samme
  // øyeblikk som man trykket, og man ville ikke sett om det var riktig rad.
  const [nyligGjort, settNyligGjort] = useState<ReadonlySet<string>>(new Set())
  const [visEldre, settVisEldre] = useState(false)
  const [slettet, settSlettet] = useState<Gjøremål | null>(null)
  const [feil, settFeil] = useState<string | null>(null)
  const [ventende, settVentende] = useState(0)

  function lagre(handling: () => Promise<Svar>) {
    settVentende((n) => n + 1)
    handling()
      .catch((e: unknown) => ({ feil: e instanceof Error ? e.message : 'Fikk ikke kontakt med serveren' }))
      .then((svar) => {
        if (svar.feil) {
          settFeil(svar.feil)
          // Serveren har fasiten. Uten dette ville skjermen vist noe som
          // ikke er lagret, og det oppdages først neste gang siden lastes.
          router.refresh()
        }
      })
      .finally(() => settVentende((n) => n - 1))
  }

  // Knappen som ble trykket (Slett) forsvinner med raden. Uten dette faller
  // fokus til toppen av siden, og den som bruker tastatur må lete seg tilbake.
  const varsel = useRef<HTMLDivElement>(null)
  const angreKnapp = useRef<HTMLButtonElement>(null)
  const nyLinje = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!slettet) return
    angreKnapp.current?.focus()
    const t = setTimeout(() => {
      fokusUtAvVarselet(varsel.current, nyLinje.current)
      settSlettet(null)
    }, ANGREFRIST_MS)
    return () => clearTimeout(t)
  }, [slettet])

  // Id-er som nettopp har flyttet seg fra flisene og ned til de gjorte. State
  // og ikke en ref som leses under rendring: begge settes i samme oppdatering,
  // så raden har `nylig` allerede første gang den tegnes, og animasjonen
  // starter der den skal.
  const [nettoppFlyttet, settNettoppFlyttet] = useState<ReadonlySet<string>>(new Set())

  function utenNylig(id: string) {
    settNyligGjort((s) => {
      if (!s.has(id)) return s
      const ny = new Set(s)
      ny.delete(id)
      return ny
    })
  }

  function flyttNed(id: string) {
    utenNylig(id)
    settNettoppFlyttet((s) => new Set(s).add(id))
  }

  function leggTil(felter: Gjøremålsfelter) {
    const g: Gjøremål = {
      ...felter,
      // Id fra nettleseren, så raden kan endres og hukes av før serveren
      // har svart på at den finnes.
      id: crypto.randomUUID(),
      gjort: null,
      opprettet: new Date().toISOString(),
    }
    settListe((l) => [g, ...l])
    // Ellers ville det nye gjøremålet forsvunnet rett inn bak filteret.
    if (filter !== null && filter !== (felter.systemId ?? '')) settFilter(null)
    lagre(() => leggTilGjøremål({ id: g.id, ...felter }))
  }

  function hukAv(g: Gjøremål) {
    const gjort = g.gjort === null
    settListe((l) => l.map((x) => (x.id === g.id ? { ...x, gjort: gjort ? new Date().toISOString() : null } : x)))
    if (gjort) {
      settNyligGjort((s) => new Set(s).add(g.id))
      setTimeout(() => flyttNed(g.id), BLI_STÅENDE_MS)
    } else {
      utenNylig(g.id)
    }
    lagre(() => settGjort(g.id, gjort))
  }

  function endre(g: Gjøremål, f: Gjøremålsfelter) {
    if (
      f.tittel === g.tittel &&
      f.notat === g.notat &&
      f.frist === g.frist &&
      f.viktig === g.viktig &&
      f.systemId === g.systemId
    )
      return
    settListe((l) => l.map((x) => (x.id === g.id ? { ...x, ...f } : x)))
    lagre(() => endreGjøremål({ id: g.id, ...f }))
  }

  function slett(g: Gjøremål) {
    settListe((l) => l.filter((x) => x.id !== g.id))
    settSlettet(g)
    lagre(() => slettGjøremål(g.id))
  }

  function angre() {
    if (!slettet) return
    const g = slettet
    settListe((l) => [g, ...l])
    fokusUtAvVarselet(varsel.current, nyLinje.current)
    settSlettet(null)
    lagre(() => gjenopprettGjøremål(g))
  }

  // Filterknapper bare for systemer som faktisk har gjøremål, i registerets
  // rekkefølge. En knapp per system i registeret ville vært tolv knapper
  // over en liste med tre ting.
  const iBruk = new Set(liste.map((g) => g.systemId ?? ''))
  const filterValg = [
    ...systemer.filter((s) => iBruk.has(s.id)),
    ...(iBruk.has('') ? [{ id: '', navn: 'Uten system' }] : []),
  ]
  const visFilter = filterValg.some((s) => s.id !== '')
  const aktivtFilter = filter !== null && iBruk.has(filter) ? filter : null
  const synlig = aktivtFilter === null ? liste : liste.filter((g) => (g.systemId ?? '') === aktivtFilter)
  const antallÅpneFor = (systemId: string | null) =>
    liste.filter((g) => g.gjort === null && (systemId === null || (g.systemId ?? '') === systemId)).length

  const åpne = synlig.filter((g) => g.gjort === null || nyligGjort.has(g.id))
  const grupper = grupperEtterFrist(åpne, idag)
  const gjort = synlig
    .filter((g) => g.gjort !== null && !nyligGjort.has(g.id))
    .sort((a, b) => nyestFørst(a.gjort!, b.gjort!))
  const gjortUka = gjort.filter((g) => isoDato(Date.parse(g.gjort!)) >= mandag)
  const gjortEldre = gjort.slice(gjortUka.length)

  const antallÅpne = synlig.filter((g) => g.gjort === null).length
  const antallGjortUka = synlig.filter((g) => g.gjort !== null && isoDato(Date.parse(g.gjort)) >= mandag).length
  const radProps = { idag, systemer, onHukAv: hukAv, onEndre: endre, onSlett: slett }

  return (
    <div className="space-y-6">
      <Fremdrift gjort={antallGjortUka} av={antallÅpne + antallGjortUka} ventende={ventende > 0} />

      <div ref={nyLinje}>
        <NyLinje systemer={systemer} onLeggTil={leggTil} />
      </div>

      {visFilter && (
        // Telefon: én rad som sveipes sidelengs. Brutt over flere linjer tok
        // knappene halve skjermhøyden før første gjøremål.
        <div
          role="group"
          aria-label="Vis gjøremål for"
          className="flex gap-2 max-sm:-mx-4 max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none] sm:flex-wrap [&>*]:shrink-0"
        >
          <Filterknapp aktiv={aktivtFilter === null} antall={antallÅpneFor(null)} onClick={() => settFilter(null)}>
            Alle
          </Filterknapp>
          {filterValg.map((s) => (
            <Filterknapp
              key={s.id || 'uten'}
              aktiv={aktivtFilter === s.id}
              antall={antallÅpneFor(s.id)}
              onClick={() => settFilter(s.id)}
            >
              {s.navn}
            </Filterknapp>
          ))}
        </div>
      )}

      {feil && (
        <div className="relative">
          <Feilstripe tittel="Endringen ble ikke lagret">
            {feil} Lista er hentet på nytt og viser det som faktisk er lagret.
          </Feilstripe>
          <button type="button" onClick={() => settFeil(null)} className={`${KNAPP_LITEN} absolute top-3 right-3`}>
            Lukk
          </button>
        </div>
      )}

      <section aria-label="Åpne gjøremål">
        {åpne.length === 0 && gjort.length > 0 ? (
          <div className="py-4">
            <span aria-hidden="true" className="hm-skrastrek" />
            <p className="hm-display mt-3 text-2xl">Alt gjort</p>
            <p className="mt-1 text-sm text-[var(--blekk-svak)]">Skriv det neste i feltet over.</p>
          </div>
        ) : åpne.length === 0 ? (
          <p className="border-2 border-dashed border-[var(--kant)] px-4 py-8 text-center text-sm text-[var(--blekk-svak)]">
            Skriv det første gjøremålet i feltet over og trykk Enter.
          </p>
        ) : (
          <div className="space-y-6">
            {grupper.map((gr) => (
              <div key={gr.nøkkel} className="space-y-3">
                {/* Overskrift bare når det er noe å skille: med alt i «Uten
                    frist» er den bare en ekstra linje. */}
                {(grupper.length > 1 || gr.nøkkel !== 'uten') && (
                  <h2
                    className={`hm-display flex items-baseline gap-2 text-base ${gr.varsel ? 'text-hm-red' : ''}`}
                  >
                    {gr.tittel}
                    <span className="hm-tall font-sans text-xs font-semibold text-[var(--blekk-svak)]">
                      {gr.gjøremål.filter((g) => g.gjort === null).length}
                    </span>
                  </h2>
                )}
                <ul className="space-y-3">
                  {gr.gjøremål.map((g) => (
                    <Rad key={g.id} gjøremål={g} flis {...radProps} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {gjort.length > 0 && (
        <section aria-labelledby="gjort-tittel" className="space-y-2 pt-2">
          <h2 id="gjort-tittel" className="hm-display flex items-baseline gap-2 text-base">
            Gjort denne uka
            <span className="hm-tall font-sans text-xs font-semibold text-[var(--blekk-svak)]">{gjortUka.length}</span>
          </h2>

          {gjortUka.length === 0 && (
            <p className="text-sm text-[var(--blekk-svak)]">Ingenting huket av siden mandag.</p>
          )}
          <ul className="space-y-2">
            {gjortUka.map((g) => (
              <Rad key={g.id} gjøremål={g} nylig={nettoppFlyttet.has(g.id)} {...radProps} />
            ))}
            {visEldre && gjortEldre.map((g) => <Rad key={g.id} gjøremål={g} {...radProps} />)}
          </ul>

          {gjortEldre.length > 0 && (
            <button
              type="button"
              onClick={() => settVisEldre((v) => !v)}
              aria-expanded={visEldre}
              className="text-sm text-[var(--blekk-svak)] underline underline-offset-4 hover:text-[var(--blekk)] pointer-coarse:min-h-11"
            >
              {visEldre
                ? 'Skjul eldre'
                : `Vis ${gjortEldre.length} eldre${gjortAvkortet ? ' (de 100 siste)' : ''}`}
            </button>
          )}
        </section>
      )}

      {slettet && (
        <div
          ref={varsel}
          role="status"
          className="hm-inn hm-kant-skygge fixed bottom-[calc(var(--bunnlinje)+1rem)] left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-4 border-2 border-[var(--blekk-svak)] bg-[var(--flate-opp)] px-4 py-3 text-sm text-[var(--blekk)]"
        >
          <span className="min-w-0 truncate">Slettet «{slettet.tittel}»</span>
          {/* Viktig-merket fordi KNAPP_LITEN har sin egen kantfarge, og
              rekkefølgen to like Tailwind-klasser vinner i er ikke å stole på. */}
          <button ref={angreKnapp} type="button" onClick={angre} className={`${KNAPP_LITEN} shrink-0 border-hm-red!`}>
            Angre
          </button>
        </div>
      )}
    </div>
  )
}

function Filterknapp({
  aktiv,
  antall,
  onClick,
  children,
}: {
  aktiv: boolean
  antall: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={aktiv}
      onClick={onClick}
      className={`flex min-h-9 items-center gap-2 border-2 px-3 text-sm font-semibold transition-colors pointer-coarse:min-h-11 ${
        aktiv
          ? 'border-[var(--blekk)] bg-[var(--blekk)] text-[var(--flate)]'
          : 'border-[var(--kant)] text-[var(--blekk-svak)] hover:border-[var(--kant-sterk)] hover:text-[var(--blekk)]'
      }`}
    >
      {children}
      <span className="hm-tall text-xs opacity-80">{antall}</span>
    </button>
  )
}
