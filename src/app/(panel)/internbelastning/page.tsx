import Link from 'next/link'
import type { Metadata } from 'next'
import { krevEier } from '@/lib/auth'
import { Feilstripe, KNAPP_LITEN, Kort, KortTittel, Merke, Seksjonstittel, Tallkort } from '@/components/ui'
import { isoDato, visDato } from '@/lib/format'
import { hentMåned, type Månedsvisning } from '@/lib/internbelastning/kilder'
import { OBJEKTPROSJEKT, type Stoppord } from '@/lib/internbelastning/beregning'
import { fjernUnntak } from './actions'
import { UnntakKnapp } from './unntak-knapp'

export const metadata: Metadata = { title: 'Internbelastning' }

/**
 * Steg 1 av internbelastningen: regner og viser én måned. Ingenting sendes
 * til Tripletex herfra. Se docs/superpowers/specs/2026-11-02-internbelastning-design.md.
 *
 * krevEier og ikke krevAdmin: siden bruker SmartDok- og Tripletex-nøklene ved
 * hver visning, og listen «belastes ikke» avgjør hva som føres i regnskapet.
 */

const STOPPTEKST: Record<Stoppord, string> = {
  mangler_sats: 'Mangler internkostnad i SmartDok',
  ukjent_maskin: 'Maskinen finnes ikke i SmartDoks maskinregister',
  uten_prosjekt: 'Ført uten prosjekt',
  mangler_prosjekt: 'Prosjektet finnes ikke i Tripletex',
  objektprosjekt: `Ført på ${OBJEKTPROSJEKT}, som aldri belastes`,
}

const kroner = (øre: number) =>
  `${(øre / 100).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`
const timer = (t: number) => t.toLocaleString('nb-NO', { maximumFractionDigits: 2 })

function flytt(måned: string, steg: number) {
  const [år, mnd] = måned.split('-').map(Number)
  const d = new Date(Date.UTC(år, mnd - 1 + steg, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function månedsnavn(måned: string) {
  const [år, mnd] = måned.split('-').map(Number)
  return new Date(Date.UTC(år, mnd - 1, 15)).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const TH = 'px-4 py-2 text-xs font-bold tracking-widest uppercase'
const TD = 'px-4 py-2'
const TALL = 'hm-tall px-4 py-2 text-right whitespace-nowrap'

export default async function InternbelastningSide({
  searchParams,
}: {
  searchParams: Promise<{ mnd?: string }>
}) {
  await krevEier()
  const { mnd } = await searchParams
  const iDag = isoDato(Date.now())
  // Forrige hele måned som standard: den inneværende er ikke ferdig ført.
  const standard = flytt(iDag.slice(0, 7), -1)
  const måned = mnd && /^\d{4}-(0[1-9]|1[0-2])$/.test(mnd) ? mnd : standard

  let visning: Månedsvisning | null = null
  let feil: string | null = null
  try {
    visning = await hentMåned(måned)
  } catch (e) {
    feil = e instanceof Error ? e.message : String(e)
  }

  return (
    <div className="space-y-7">
      <Seksjonstittel
        under={`Maskintimer fra SmartDok × internkostnad per maskin, per prosjekt. Det som belastes prosjektene, godskrives ${OBJEKTPROSJEKT}. Bare visning: ingenting sendes til Tripletex herfra ennå.`}
        handling={
          <nav aria-label="Måned" className="flex items-center gap-2">
            <Link href={`/internbelastning?mnd=${flytt(måned, -1)}`} className={KNAPP_LITEN}>
              ← {månedsnavn(flytt(måned, -1))}
            </Link>
            {måned < standard && (
              <Link href={`/internbelastning?mnd=${flytt(måned, 1)}`} className={KNAPP_LITEN}>
                {månedsnavn(flytt(måned, 1))} →
              </Link>
            )}
          </nav>
        }
      >
        Internbelastning {månedsnavn(måned)}
      </Seksjonstittel>

      {feil && <Feilstripe tittel="Kunne ikke regne måneden">{feil}</Feilstripe>}
      {visning && <Måned visning={visning} />}
    </div>
  )
}

function Måned({ visning }: { visning: Månedsvisning }) {
  const { beregning: b, førStart, startdato, unntak, tripletexFeil } = visning
  const interne = b.perProsjekt.filter((p) => p.internt)
  const eksterne = b.perProsjekt.filter((p) => !p.internt)

  return (
    <>
      {førStart && (
        <p className="border-l-4 border-[var(--kant)] p-3 text-sm text-[var(--blekk-svak)]">
          Måneden ligger før startdatoen {visDato(startdato)}. Den vises for å sjekke tallene, men sendes aldri.
        </p>
      )}
      {tripletexFeil && (
        <Feilstripe tittel="Prosjektene er ikke sjekket mot Tripletex">
          {tripletexFeil} Beløpene er regnet likevel, men et prosjekt som mangler i Tripletex vil ikke bli fanget opp.
        </Feilstripe>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tallkort merkelapp="Belastes" verdi={kroner(b.totalØre)} under={`godskrives ${OBJEKTPROSJEKT}`} />
        <Tallkort merkelapp="Maskintimer" verdi={timer(b.timer)} under="attestert og belastet" />
        <Tallkort merkelapp="Prosjekter" verdi={b.perProsjekt.length} under={`${interne.length} interne`} />
        <Tallkort
          merkelapp="Stopp"
          verdi={b.stopp.length}
          under={b.stopp.length ? `${timer(b.stopp.reduce((s, x) => s + x.timer, 0))} timer står` : 'alt kan føres'}
        />
      </div>

      {b.stopp.length > 0 && (
        <Kort>
          <div className="hm-varselstriper h-1.5" aria-hidden="true" />
          <KortTittel>Stopper kjøringen</KortTittel>
          <p className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
            Disse timene er ikke med i beløpet. Rett i SmartDok, eller sett maskinen på listen «belastes ikke» hvis den
            ikke skal belastes, og last siden på nytt.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-[var(--kant)] text-left">
                  <th className={TH}>Hva</th>
                  <th className={TH}>Maskin</th>
                  <th className={TH}>Prosjekt</th>
                  <th className={`${TH} text-right`}>Timer</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {b.stopp.map((s) => (
                  <tr key={`${s.ord}-${s.maskinId}-${s.prosjektnummer}`} className="border-b border-[var(--kant)] last:border-b-0">
                    <td className={TD}>
                      <Merke type="rød">{s.ord}</Merke> <span className="ml-1">{STOPPTEKST[s.ord]}</span>
                    </td>
                    <td className={TD}>{s.maskinnavn ?? `id ${s.maskinId}`}</td>
                    <td className={TD}>{s.ord === 'mangler_sats' || s.ord === 'ukjent_maskin' ? 'flere' : (s.prosjektnummer ?? '–')}</td>
                    <td className={TALL}>{timer(s.timer)}</td>
                    <td className={TD}>
                      {s.ord === 'mangler_sats' && s.maskinId !== null && (
                        <UnntakKnapp maskinId={s.maskinId} navn={s.maskinnavn ?? `Maskin ${s.maskinId}`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Kort>
      )}

      <Prosjekttabell tittel="Eksterne prosjekter" rader={eksterne} />
      {interne.length > 0 && <Prosjekttabell tittel="Interne prosjekter (går inn i administrasjonspotten)" rader={interne} />}

      <Kort>
        <KortTittel>Per maskin</KortTittel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--kant)] text-left">
                <th className={TH}>Maskin</th>
                <th className={`${TH} text-right`}>Timer</th>
                <th className={`${TH} text-right`}>Sats</th>
                <th className={`${TH} text-right`}>Belastes</th>
              </tr>
            </thead>
            <tbody>
              {b.perMaskin.map((m) => (
                <tr key={m.maskinId} className="border-b border-[var(--kant)] last:border-b-0">
                  <td className={TD}>{m.navn}</td>
                  <td className={TALL}>{timer(m.timer)}</td>
                  <td className={TALL}>{kroner(m.sats * 100)}</td>
                  <td className={TALL}>{kroner(m.øre)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Kort>

      {b.unntatt.length > 0 && (
        <Kort>
          <KortTittel>Ikke belastet denne måneden</KortTittel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {b.unntatt.map((u) => (
                  <tr key={u.maskinId} className="border-b border-[var(--kant)] last:border-b-0">
                    <td className={TD}>{u.navn}</td>
                    <td className={`${TD} text-[var(--blekk-svak)]`}>{u.grunn}</td>
                    <td className={TALL}>{timer(u.timer)} t</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Kort>
      )}

      {b.uattestert.antall > 0 && (
        <p className="text-sm text-[var(--blekk-svak)]">
          {b.uattestert.antall} maskinføringer ({timer(b.uattestert.timer)} timer) er ikke attestert ennå. De er ikke
          med, og tas med når de er attestert.
        </p>
      )}

      <Kort>
        <KortTittel>Listen «belastes ikke»</KortTittel>
        <ul>
          {unntak.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-2 text-sm last:border-b-0">
              <span>
                <span className="font-semibold">{u.navn}</span>{' '}
                <span className="text-[var(--blekk-svak)]">
                  {u.grunn} · {u.lagtInnAv ?? 'ukjent'}, {visDato(u.opprettet)}
                </span>
              </span>
              <form action={fjernUnntak}>
                <input type="hidden" name="id" value={u.id} />
                <button type="submit" className={KNAPP_LITEN}>
                  Ta av listen
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Kort>
    </>
  )
}

function Prosjekttabell({
  tittel,
  rader,
}: {
  tittel: string
  rader: Månedsvisning['beregning']['perProsjekt']
}) {
  const sum = rader.reduce((s, p) => s + p.øre, 0)
  return (
    <Kort>
      <KortTittel handling={<span className="hm-tall text-sm font-bold">{kroner(sum)}</span>}>{tittel}</KortTittel>
      {rader.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">Ingen maskintimer å belaste.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--kant)] text-left">
                <th className={TH}>Prosjekt</th>
                <th className={`${TH} text-right`}>Timer</th>
                <th className={`${TH} text-right`}>Belastes</th>
              </tr>
            </thead>
            <tbody>
              {rader.map((p) => (
                <tr key={p.nummer} className="border-b border-[var(--kant)] last:border-b-0">
                  <td className={TD}>
                    {p.navn.startsWith(p.nummer) ? p.navn : `${p.nummer} ${p.navn}`}
                  </td>
                  <td className={TALL}>{timer(p.timer)}</td>
                  <td className={TALL}>{kroner(p.øre)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Kort>
  )
}
