import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { krevAdmin } from '@/lib/auth'
import { hentAppperson, hentHistorikk, type Hendelse } from '@/lib/appbrukarar'
import { hentGrupper } from '@/lib/grupper'
import { hentSiderFraFila, type Side } from '@/lib/sidetilgang'
import { grunnFor, siderFraGrupper } from '@/lib/sideregel'
import { Kort, KortTittel, LENKE_ALENE, Merke } from '@/components/ui'
import { visDatoTid } from '@/lib/format'
import { AppkontoHandlinger } from '../../person-handlinger'
import { PersonGrupper } from '../../gruppe-handlinger'
import { Sidevalg } from './sidevalg'
import { SlettFraAppen } from './slett'

export const metadata: Metadata = { title: 'Person' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const STATUS = {
  venter: { type: 'gul', ord: 'Venter' },
  godkjent: { type: 'grønn', ord: 'Slipper inn' },
  sperra: { type: 'rød', ord: 'Stengt ute' },
} as const

const HANDLING: Record<string, string> = {
  'appkonto.godkjent': 'Godkjent',
  'appkonto.sperra': 'Stengt ute',
  'appkonto.venter': 'Satt på vent',
  'appkonto.slettet': 'Slettet fra appen',
  'appkonto.slettet_delvis': 'Sletting stoppet halvveis',
  'gruppe.person_inn': 'Lagt i gruppe',
  'gruppe.person_ut': 'Tatt ut av gruppe',
  'side.gitt': 'Fikk side',
  'side.fratatt': 'Mistet side',
}

function beskriv(h: Hendelse): string {
  const hva = HANDLING[h.handling] ?? h.handling
  const d = h.detaljer
  const hvilken = typeof d.gruppe === 'string' ? d.gruppe : typeof d.side === 'string' ? d.side : null
  return hvilken ? `${hva}: ${hvilken}` : hva
}

export default async function PersonSide({ params }: { params: Promise<{ id: string }> }) {
  const meg = await krevAdmin()
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const [funnet, grupper, historikk] = await Promise.all([
    hentAppperson(id),
    hentGrupper(),
    hentHistorikk(id),
  ])
  if (!funnet) notFound()
  const { person, unntak } = funnet

  // Sidelista kommer fra GitHub. Er den nede, skal resten av siden –
  // status, grupper og sletting – fortsatt virke.
  let sider: Side[] = []
  let sidefeil: string | null = null
  try {
    sider = await hentSiderFraFila()
  } catch (e) {
    sidefeil = e instanceof Error ? e.message : 'Ukjent feil'
  }

  const erEier = meg.rolle === 'eier'
  const fraGrupper = siderFraGrupper(person.grupper, grupper)
  // Ikonene sendes ikke til nettleseren. De er en halv megabyte til sammen.
  const rader = sider.map((s) => ({
    id: s.id,
    navn: s.navn,
    gruppe: s.gruppe,
    barePC: s.barePC,
    grunn: grunnFor(s.id, unntak, fraGrupper),
  }))
  const antallSett = rader.filter((r) => r.grunn.ser && !r.barePC).length
  const sideord = antallSett === 1 ? 'side' : 'sider'
  // Den som venter eller er stengt ute ser ingenting nå, så tallet sier hva de
  // får – ikke hva de ser. Uten sidelista er det ingen tall å vise: 0 ville
  // sett ut som et svar.
  const antallTekst =
    person.status === 'godkjent'
      ? `Ser ${antallSett} ${sideord}`
      : `Får ${antallSett} ${sideord} når de er godkjent`
  const mineGrupper = grupper.filter((g) => person.grupper.includes(g.id))

  return (
    <div className="space-y-6">
      <Link href="/appen" className={LENKE_ALENE}>
        ← Alle brukere
      </Link>

      <Kort>
        <KortTittel handling={<Merke type={STATUS[person.status].type}>{STATUS[person.status].ord}</Merke>}>
          {person.navn}
        </KortTittel>
        <dl className="grid gap-x-6 gap-y-2 px-4 py-4 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-[var(--blekk-svak)]">E-post</dt>
          <dd>{person.epost}</dd>
          <dt className="text-[var(--blekk-svak)]">Telefon</dt>
          <dd>{person.telefon ?? '–'}</dd>
          <dt className="text-[var(--blekk-svak)]">Registrert</dt>
          <dd>{visDatoTid(person.registrert)}</dd>
          <dt className="text-[var(--blekk-svak)]">Godkjent</dt>
          <dd>
            {person.godkjentTid
              ? `${visDatoTid(person.godkjentTid)}${person.godkjentAv ? ` av ${person.godkjentAv}` : ''}`
              : '–'}
          </dd>
          <dt className="text-[var(--blekk-svak)]">Andre systemer</dt>
          <dd>
            {person.kjentFraFør
              ? 'Har tilgang andre steder'
              : 'Finnes ikke i noen av de andre systemene'}
          </dd>
        </dl>
        {erEier && (
          <div className="border-t-2 border-[var(--kant)] px-4 py-3">
            <AppkontoHandlinger
              personId={person.id}
              epost={person.epost}
              navBrukerId={person.navBrukerId}
              status={person.status}
            />
          </div>
        )}
      </Kort>

      <Kort>
        <KortTittel>Grupper</KortTittel>
        {grupper.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[var(--blekk-svak)]">
            Ingen grupper ennå. Lag dem under{' '}
            <Link href="/appen/grupper" className="underline">
              Grupper
            </Link>
            .
          </p>
        ) : erEier ? (
          <div className="px-4 pb-4">
            <PersonGrupper
              person={{ id: person.id, navn: person.navn }}
              grupper={grupper.map((g) => ({ id: g.id, navn: g.navn }))}
              mine={person.grupper}
            />
          </div>
        ) : (
          <p className="px-4 py-4 text-sm">
            {mineGrupper.length > 0 ? mineGrupper.map((g) => g.navn).join(', ') : 'Ikke i noen gruppe.'}
          </p>
        )}
      </Kort>

      <Kort>
        <KortTittel
          handling={
            sidefeil ? undefined : (
              <span className="text-xs text-[var(--blekk-svak)]">{antallTekst}</span>
            )
          }
        >
          Hva {person.navn} ser i appen
        </KortTittel>
        {person.status !== 'godkjent' && (
          <p className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
            {person.navn} ser ingenting før de er godkjent. Lista viser hva de får da, så gruppene
            kan settes opp før godkjenningen.
          </p>
        )}
        {sidefeil ? (
          <p className="px-4 py-4 text-sm text-hm-red-ink">Fikk ikke hentet sidelista: {sidefeil}</p>
        ) : (
          <Sidevalg person={{ id: person.id, navn: person.navn }} sider={rader} erEier={erEier} />
        )}
      </Kort>

      <Kort>
        <KortTittel>Historikk</KortTittel>
        {historikk.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[var(--blekk-svak)]">Ingenting registrert ennå.</p>
        ) : (
          <ul>
            {historikk.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap gap-x-4 border-b border-[var(--kant)] px-4 py-2 text-sm last:border-b-0"
              >
                <span className="hm-tall whitespace-nowrap text-[var(--blekk-svak)]">
                  {visDatoTid(h.tid)}
                </span>
                <span>{beskriv(h)}</span>
                <span className="text-[var(--blekk-svak)]">{h.av ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Kort>

      {erEier && (
        <SlettFraAppen personId={person.id} navn={person.navn} iAndreSystemer={person.kjentFraFør} />
      )}
    </div>
  )
}
