import type { Metadata } from 'next'
import Link from 'next/link'
import { krevAdmin } from '@/lib/auth'
import { hentGrupper } from '@/lib/grupper'
import { hentSiderFraFila, type Side } from '@/lib/sidetilgang'
import { Kort, KortTittel } from '@/components/ui'
import { GruppeDetalj, NyGruppe } from '../gruppe-handlinger'

export const metadata: Metadata = { title: 'Grupper' }

export default async function GrupperSide() {
  const meg = await krevAdmin()
  const erEier = meg.rolle === 'eier'
  const grupper = await hentGrupper()

  // Uten sidelista kan ikke sidene velges, men gruppene skal fortsatt vises.
  let sider: Side[] = []
  let sidefeil: string | null = null
  try {
    sider = await hentSiderFraFila()
  } catch (e) {
    sidefeil = e instanceof Error ? e.message : 'Ukjent feil'
  }

  // Sider merket for PC vises aldri på telefonen. Å gi dem i en gruppe gjør
  // ingenting, så de står ikke i valget.
  const telefonsider = sider.filter((s) => !s.barePC)
  const navnPå = new Map(sider.map((s) => [s.id, s.navn]))

  return (
    <Kort>
      <KortTittel
        handling={
          <span className="text-xs text-[var(--blekk-svak)]">
            {grupper.length} {grupper.length === 1 ? 'gruppe' : 'grupper'}
          </span>
        }
      >
        Grupper
      </KortTittel>

      <p className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
        En gruppe samler sidene en type ansatt eller kunde trenger. Ingen ser noe i appen før de
        er i en gruppe. Legg folk i grupper under Brukere – der kan du velge mange om gangen.
      </p>

      {sidefeil && (
        <p className="px-4 pt-3 text-sm text-hm-red-ink">
          Fikk ikke hentet sidelista, så sidene kan ikke velges nå: {sidefeil}
        </p>
      )}

      {erEier && <NyGruppe />}

      {grupper.length === 0 ? (
        <p className="px-4 pb-5 text-sm text-[var(--blekk-svak)]">Ingen grupper ennå.</p>
      ) : (
        <ul>
          {grupper.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <strong>{g.navn}</strong>
                  <Link href={`/appen?gruppe=${g.id}`} className="text-xs underline">
                    Se medlemmer ({g.antallPersoner})
                  </Link>
                </div>
                {g.beskrivelse && (
                  <div className="text-sm text-[var(--blekk-svak)]">{g.beskrivelse}</div>
                )}
                <div className="text-xs text-[var(--blekk-svak)]">
                  Gir:{' '}
                  {g.sider.length > 0
                    ? g.sider.map((id) => navnPå.get(id) ?? id).join(', ')
                    : 'ingen sider ennå'}
                </div>
              </div>
              {erEier && !sidefeil && (
                <GruppeDetalj
                  gruppe={{ id: g.id, navn: g.navn, antallPersoner: g.antallPersoner }}
                  sider={telefonsider.map((s) => ({
                    id: s.id,
                    navn: s.navn,
                    gruppe: s.gruppe,
                    gir: g.sider.includes(s.id),
                  }))}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Kort>
  )
}
