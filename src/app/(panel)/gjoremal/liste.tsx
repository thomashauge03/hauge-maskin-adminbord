'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Feilstripe, KNAPP_LITEN } from '@/components/ui'
import { isoDato } from '@/lib/format'
import type { Gjøremål, Gjøremålsfelter, Systemvalg } from '@/lib/gjoremal'
import { Rad, søndagI } from './rad'
import { Fremdrift, NyLinje } from './topp'
import {
  endreGjøremål,
  gjenopprettGjøremål,
  leggTilGjøremål,
  settGjort,
  settOppfølging,
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
  const søndag = søndagI(idag)
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
  const [bareOppfølging, settBareOppfølging] = useState(false)
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
      oppfølgingSiden: null,
      opprettet: new Date().toISOString(),
    }
    settListe((l) => [g, ...l])
    // Ellers ville det nye gjøremålet forsvunnet rett inn bak filteret.
    if (filter !== null && filter !== (felter.systemId ?? '')) settFilter(null)
    lagre(() => leggTilGjøremål({ id: g.id, ...felter }))
  }

  // Hvem som skal ha fokus etter at en rad er tegnet på nytt. Her og ikke i
  // raden: ny frist eller avhuking flytter raden til en annen liste, og da
  // monteres den på nytt og glemmer alt. Hentes av refene i raden og ikke av
  // en effekt her, fordi Avbryt og Esc bare tegner raden på nytt, ikke lista.
  const fokusEtter = useRef<{ id: string; mål: 'hak' | 'blyant' } | null>(null)
  const radLukket = (id: string) => {
    fokusEtter.current = { id, mål: 'blyant' }
  }
  const skalFåFokus = (id: string, mål: 'hak' | 'blyant') => {
    if (fokusEtter.current?.id !== id || fokusEtter.current.mål !== mål) return false
    fokusEtter.current = null
    return true
  }

  const åpneSeksjon = useRef<HTMLElement>(null)
  const flyttTimere = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const timere = flyttTimere.current
    return () => timere.forEach(clearTimeout)
  }, [])

  function hukAv(g: Gjøremål, tastatur = false) {
    // Flisa som glir opp under en mus som står stille, skal ikke arve
    // forhåndsvisningen fra den som nettopp ble trykket.
    document.querySelectorAll('[data-mus]').forEach((el) => delete (el as HTMLElement).dataset.mus)
    const gjort = g.gjort === null
    // Raden hopper opp til flisene og monteres på nytt der. Bare med
    // tastatur: med mus ville focus() rullet siden etter den.
    if (!gjort && tastatur) fokusEtter.current = { id: g.id, mål: 'hak' }
    settListe((l) => l.map((x) => (x.id === g.id ? { ...x, gjort: gjort ? new Date().toISOString() : null } : x)))
    // Huk av, fjern og huk av igjen innen fristen: uten dette kjørte den første
    // timeren og flyttet flisa ned midt i animasjonen fra det andre trykket.
    clearTimeout(flyttTimere.current.get(g.id))
    flyttTimere.current.delete(g.id)
    if (gjort) {
      settNyligGjort((s) => new Set(s).add(g.id))
      flyttTimere.current.set(g.id, setTimeout(() => {
        flyttTimere.current.delete(g.id)
        // Neste flis og ikke den gjorte raden: den som rydder lista med
        // mellomrom vil videre nedover, ikke ned i historikken. Velges før
        // flisa forsvinner, ellers faller fokus til toppen av siden. Bare
        // hvis ruta fortsatt har fokus og fortsatt er huket av, så fokus
        // ikke kapres fra en som har tabbet videre eller angret i mellomtida.
        const her = document.querySelector(`[data-hak="${g.id}"]`)
        if (tastatur && her && document.activeElement === her && her.getAttribute('aria-checked') === 'true') {
          const ruter = [
            ...(åpneSeksjon.current?.querySelectorAll<HTMLElement>('[data-hak]:not([aria-checked="true"])') ?? []),
          ]
          const neste =
            ruter.find((r) => her.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) ?? ruter.at(-1)
          if (neste) neste.focus()
          else nyLinje.current?.querySelector('input')?.focus()
        }
        flyttNed(g.id)
      }, BLI_STÅENDE_MS))
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

  function følgOpp(g: Gjøremål) {
    const på = g.oppfølgingSiden === null
    settListe((l) =>
      l.map((x) => (x.id === g.id ? { ...x, oppfølgingSiden: på ? new Date().toISOString() : null } : x)),
    )
    lagre(() => settOppfølging(g.id, på))
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

  // Filterknapper bare for systemer som har noe åpent, i registerets
  // rekkefølge. En knapp per system i registeret ville vært tolv knapper
  // over en liste med tre ting, og en knapp for bare gjorte viste «0».
  // Det aktive filteret blir stående, ellers forsvant fanen under fingeren
  // når det siste i den ble huket av.
  const venter = (g: Gjøremål) => g.gjort === null || nyligGjort.has(g.id)
  const iBruk = new Set([
    ...liste.filter(venter).map((g) => g.systemId ?? ''),
    ...(filter !== null ? [filter] : []),
  ])
  const filterValg = [
    ...systemer.filter((s) => iBruk.has(s.id)),
    ...(iBruk.has('') ? [{ id: '', navn: 'Uten system' }] : []),
  ]
  const aktivtFilter = filter !== null && filterValg.some((s) => s.id === filter) ? filter : null
  const forSystem = aktivtFilter === null ? liste : liste.filter((g) => (g.systemId ?? '') === aktivtFilter)
  // Fanen kommer bare når noe åpent følges opp, og blir stående mens den er
  // valgt, av samme grunn som systemfanene.
  const antallOppfølging = forSystem.filter((g) => venter(g) && g.oppfølgingSiden !== null).length
  const visOppfølgingFane = bareOppfølging || liste.some((g) => venter(g) && g.oppfølgingSiden !== null)
  const visFilter = filterValg.some((s) => s.id !== '') || visOppfølgingFane
  const synlig = bareOppfølging ? forSystem.filter((g) => g.oppfølgingSiden !== null) : forSystem
  // Nylig avhukede telles med til de flytter seg, så tallet stemmer med
  // flisene som faktisk står der.
  const antallÅpneFor = (systemId: string | null) =>
    liste.filter((g) => venter(g) && (systemId === null || (g.systemId ?? '') === systemId)).length

  // Masken viser at det er mer å sveipe til, men bare når det er det: ellers
  // ville siste fane alltid sett halvt borte ut.
  const fanerad = useRef<HTMLDivElement>(null)
  const [flyterOver, settFlyterOver] = useState(false)
  const fanenøkkel = filterValg.map((s) => s.id).join('|')
  useEffect(() => {
    const rad = fanerad.current
    if (!rad) return
    const mål = () => settFlyterOver(rad.scrollWidth > rad.clientWidth + 1)
    mål()
    // Raden selv endrer ikke bredde når en fane kommer til, så fanene
    // observeres også.
    const observatør = new ResizeObserver(mål)
    observatør.observe(rad)
    for (const barn of rad.children) observatør.observe(barn)
    return () => observatør.disconnect()
  }, [visFilter, fanenøkkel])

  const åpne = synlig.filter((g) => g.gjort === null || nyligGjort.has(g.id))
  const grupper = grupperEtterFrist(åpne, idag)
  const gjort = synlig
    .filter((g) => g.gjort !== null && !nyligGjort.has(g.id))
    .sort((a, b) => nyestFørst(a.gjort!, b.gjort!))
  const gjortUka = gjort.filter((g) => isoDato(Date.parse(g.gjort!)) >= mandag)
  const gjortEldre = gjort.slice(gjortUka.length)

  const filterNavn = aktivtFilter === null ? null : (filterValg.find((s) => s.id === aktivtFilter)?.navn ?? null)

  const antallÅpne = synlig.filter((g) => g.gjort === null).length
  const antallGjortUka = synlig.filter((g) => g.gjort !== null && isoDato(Date.parse(g.gjort)) >= mandag).length
  const antallForfalt = synlig.filter((g) => g.gjort === null && g.frist !== null && g.frist < idag).length
  const radProps = {
    idag,
    systemer,
    visSystem: aktivtFilter === null,
    onHukAv: hukAv,
    onEndre: endre,
    onSlett: slett,
    onFølgOpp: følgOpp,
    onLukk: radLukket,
    skalFåFokus,
  }

  return (
    <div className="space-y-6">
      <Fremdrift
        gjort={antallGjortUka}
        av={antallÅpne + antallGjortUka}
        ventende={ventende > 0}
        forfalt={antallForfalt}
        systemNavn={filterNavn}
      />

      <div ref={nyLinje}>
        <NyLinje systemer={systemer} onLeggTil={leggTil} idag={idag} />
      </div>

      {visFilter && (
        // Én rad som sveipes sidelengs, også på PC. Brutt over flere linjer
        // tok knappene halve skjermhøyden på telefon, og på PC svevde den
        // røde understreken på en andrelinje i stedet for på grunnlinja.
        // Grunnlinja er en innvendig skygge og ikke border-b: overflow-x-auto
        // klipper ved kanten av polstringen, og ville kuttet den røde
        // understreken der den skal ligge oppå linja.
        <div
          ref={fanerad}
          role="group"
          aria-label="Vis gjøremål for"
          className={`flex gap-0 overflow-x-auto shadow-[inset_0_-2px_0_var(--kant)] [scrollbar-width:none] max-sm:-mx-4 max-sm:px-4 [&>*]:shrink-0 ${
            flyterOver ? '[mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]' : ''
          }`}
        >
          <Filterknapp aktiv={aktivtFilter === null} antall={antallÅpneFor(null)} onClick={() => settFilter(null)}>
            Alle
          </Filterknapp>
          {visOppfølgingFane && (
            // Egen bryter og ikke en fane til i systemrekka: den kombineres
            // med systemfilteret («under oppfølging i Rørlager»), mens
            // systemfanene utelukker hverandre. Rett etter Alle og ikke
            // sist: med mange systemer havnet den utenfor skjermkanten.
            <span className="flex items-center">
              <Filterknapp
                aktiv={bareOppfølging}
                antall={antallOppfølging}
                onClick={() => settBareOppfølging((v) => !v)}
              >
                Under oppfølging
              </Filterknapp>
              <span aria-hidden="true" className="mx-1 h-5 w-0.5 bg-[var(--kant)]" />
            </span>
          )}
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

      <section ref={åpneSeksjon} aria-label="Åpne gjøremål">
        {aktivtFilter !== null && åpne.length === 0 && gjort.length === 0 ? (
          // Fanen står igjen etter at det siste i den er slettet. «Skriv det
          // første gjøremålet» ville sagt at lista er tom, mens «Alle» viser
          // at den ikke er det.
          <div className="border-2 border-dashed border-[var(--kant)] px-4 py-8 text-center">
            <p className="text-sm text-[var(--blekk-svak)]">
              Ingenting åpent for <span className="font-semibold text-[var(--blekk)]">{filterNavn}</span>.
            </p>
            <button type="button" onClick={() => settFilter(null)} className={`${KNAPP_LITEN} mt-3`}>
              Vis alle
            </button>
          </div>
        ) : åpne.length === 0 && gjort.length > 0 ? (
          <div className="py-4">
            <span aria-hidden="true" className="hm-skrastrek" />
            <p className="hm-display mt-3 text-2xl">
              Alt gjort{filterNavn !== null && <> for {filterNavn}</>}
            </p>
            <p className="mt-1 text-sm text-[var(--blekk-svak)]">Skriv det neste i feltet over.</p>
          </div>
        ) : åpne.length === 0 ? (
          <p className="border-2 border-dashed border-[var(--kant)] px-4 py-8 text-center text-sm text-[var(--blekk-svak)]">
            Skriv det første gjøremålet i feltet over og trykk Enter.
          </p>
        ) : (
          <div className="space-y-7">
            {grupper.map((gr) => (
              <div key={gr.nøkkel} className="space-y-3">
                {/* Overskrift bare når det er noe å skille: med alt i «Uten
                    frist» er den bare en ekstra linje. */}
                {(grupper.length > 1 || gr.nøkkel !== 'uten') && (
                  <h2 className="hm-display flex items-center gap-3 text-[13px] tracking-[0.12em]">
                    <span className={gr.varsel ? 'text-hm-red' : undefined}>{gr.tittel}</span>
                    {/* Avstanden er bare gap, og en skjermleser leste «I dag1». */}
                    <span className="sr-only">, </span>
                    {/* Teller flisene som står der, også de som nettopp er
                        huket av, ellers sto det «0» over en synlig flis. */}
                    <span className="hm-tall font-sans text-xs font-semibold text-[var(--blekk-svak)]">
                      {gr.gjøremål.length}
                    </span>
                    {/* Forfalt får sperrebåndet fra stolpen og flisene, så de
                        tre ses som samme ting. */}
                    <span
                      aria-hidden="true"
                      className={`flex-1 ${gr.varsel ? 'hm-varselstriper h-1' : 'h-0.5 bg-[var(--kant)]'}`}
                    />
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
        <section aria-labelledby="gjort-tittel" className="space-y-3 pt-2">
          <h2 id="gjort-tittel" className="hm-display flex items-center gap-3 text-sm tracking-wider">
            <span>Gjort denne uka</span>
            <span className="sr-only">, </span>
            <span className="hm-tall font-sans text-xs font-semibold text-[var(--blekk-svak)]">{gjortUka.length}</span>
            {/* Stiplet som radene under: historikk, ikke noe som venter. */}
            <span aria-hidden="true" className="h-0 flex-1 border-t-2 border-dashed border-[var(--kant)]" />
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
      // Fane og ikke fylt boks: den fylte «Alle» var det sterkeste på siden,
      // sterkere enn flisene. Understreken er en form, så aktiv fane ses
      // også uten å skille rødt fra grått.
      // Fokusringen innenfor kanten: fanene står i en rad som ruller, og den
      // klipper alt som stikker ut, så en ring utenpå ville ikke synes.
      className={`relative flex min-h-10 items-center gap-1.5 px-3 text-xs font-bold tracking-wider whitespace-nowrap uppercase transition-colors focus-visible:outline-offset-[-3px] pointer-coarse:min-h-11 ${
        aktiv
          ? "text-[var(--blekk)] after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:bg-hm-red after:content-['']"
          : 'text-[var(--blekk-svak)] hover:text-[var(--blekk)]'
      }`}
    >
      {children}
      {/* Avstanden er bare gap, og navnet ble lest «Alle3». */}
      <span className="sr-only">, </span>
      <span className="hm-tall font-semibold opacity-70">
        {antall}
        <span className="sr-only"> åpne</span>
      </span>
    </button>
  )
}
