'use client'

import { useActionState, useState } from 'react'
import { FELT, KNAPP_FARLIG, KNAPP_LITEN, KNAPP_SEKUNDÆR, Merke } from '@/components/ui'
import type { BrukerTilstand } from './actions'
import {
  lagGruppe,
  slettGruppe,
  settGruppeSide,
  settPersonGruppe,
} from './gruppe-actions'

const start: BrukerTilstand = {}

function Melding({ tilstand }: { tilstand: BrukerTilstand }) {
  if (tilstand.feil) return <span className="text-xs text-hm-red-ink">{tilstand.feil}</span>
  if (tilstand.ok) return <span className="text-xs text-[var(--blekk-svak)]">{tilstand.ok}</span>
  return null
}

export function NyGruppe() {
  const [åpen, settÅpen] = useState(false)
  const [tilstand, send, lagrer] = useActionState(lagGruppe, start)

  if (!åpen) {
    return (
      <div className="px-4 py-3">
        <button onClick={() => settÅpen(true)} className={KNAPP_SEKUNDÆR}>
          Ny gruppe
        </button>{' '}
        <Melding tilstand={tilstand} />
      </div>
    )
  }

  return (
    <form action={send} className="space-y-2 border-b-2 border-[var(--kant)] px-4 py-4">
      <input name="navn" required placeholder="Navn, for eksempel Sjåfør" className={FELT} />
      <input name="beskrivelse" placeholder="Kort forklaring (valgfritt)" className={FELT} />
      <Melding tilstand={tilstand} />
      <div className="flex gap-2">
        <button type="submit" disabled={lagrer} className={KNAPP_SEKUNDÆR}>
          {lagrer ? 'Lager …' : 'Lag gruppe'}
        </button>
        <button type="button" onClick={() => settÅpen(false)} className={KNAPP_LITEN}>
          Avbryt
        </button>
      </div>
    </form>
  )
}

function GruppeSideKryss({
  gruppe,
  side,
  gir,
}: {
  gruppe: { id: string; navn: string }
  side: { id: string; navn: string; gruppe: string; standard: boolean }
  gir: boolean
}) {
  const [tilstand, send, endrer] = useActionState(
    settGruppeSide.bind(null, {
      gruppeId: gruppe.id,
      gruppeNavn: gruppe.navn,
      sideId: side.id,
      sideNavn: side.navn,
      gi: !gir,
    }),
    start,
  )

  return (
    <li className="flex items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-2 last:border-b-0">
      <div className="min-w-0">
        <span className={gir ? '' : 'text-[var(--blekk-svak)]'}>{side.navn}</span>
        {/* En standardside får alle uansett. Å legge den i en gruppe gjør
            ingenting i dag, men står klart om siden senere blir utvalgt. */}
        {side.standard && (
          <span className="ml-2">
            <Merke type="nøytral">Alle har den</Merke>
          </span>
        )}
        {tilstand.feil && <div className="text-xs text-hm-red-ink">{tilstand.feil}</div>}
      </div>
      <form action={send}>
        <button type="submit" disabled={endrer} className={KNAPP_LITEN}>
          {endrer ? '…' : gir ? 'Ta ut' : 'Legg til'}
        </button>
      </form>
    </li>
  )
}

/** Sidene én gruppe gir, og sletting av gruppa. */
export function GruppeDetalj({
  gruppe,
  sider,
}: {
  gruppe: { id: string; navn: string; antallPersoner: number }
  sider: { id: string; navn: string; gruppe: string; standard: boolean; gir: boolean }[]
}) {
  const [modus, settModus] = useState<'lukket' | 'sider' | 'slett'>('lukket')
  const [slettTilstand, sendSlett, sletter] = useActionState(
    slettGruppe.bind(null, { gruppeId: gruppe.id, navn: gruppe.navn }),
    start,
  )

  if (modus === 'slett') {
    return (
      <div className="mt-3 w-full space-y-2">
        <p className="text-sm">
          Slette <strong>{gruppe.navn}</strong>?{' '}
          {gruppe.antallPersoner > 0 && (
            <>
              {gruppe.antallPersoner}{' '}
              {gruppe.antallPersoner === 1 ? 'person' : 'personer'} mister sidene
              gruppa ga dem. Skal noen beholde en side likevel, må de få den
              særskilt først.
            </>
          )}
        </p>
        <Melding tilstand={slettTilstand} />
        <div className="flex gap-2">
          <form action={sendSlett}>
            <button type="submit" disabled={sletter} className={KNAPP_FARLIG}>
              {sletter ? 'Sletter …' : 'Ja, slett'}
            </button>
          </form>
          <button onClick={() => settModus('lukket')} className={KNAPP_LITEN}>
            Avbryt
          </button>
        </div>
      </div>
    )
  }

  if (modus === 'sider') {
    return (
      <div className="mt-3 w-full border-2 border-[var(--kant)]">
        <div className="flex items-center justify-between border-b-2 border-[var(--kant)] px-4 py-2">
          <strong className="text-sm">Hva {gruppe.navn} gir</strong>
          <button onClick={() => settModus('lukket')} className={KNAPP_LITEN}>
            Lukk
          </button>
        </div>
        <ul>
          {sider.map((s) => (
            <GruppeSideKryss key={s.id} gruppe={gruppe} side={s} gir={s.gir} />
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Melding tilstand={slettTilstand} />
      <button onClick={() => settModus('sider')} className={KNAPP_LITEN}>
        Sider: {sider.filter((s) => s.gir).length}
      </button>
      <button onClick={() => settModus('slett')} className={KNAPP_LITEN}>
        Slett
      </button>
    </div>
  )
}

function PersonGruppeKnapp({
  person,
  gruppe,
  inne,
}: {
  person: { id: string; navn: string }
  gruppe: { id: string; navn: string }
  inne: boolean
}) {
  const [tilstand, send, endrer] = useActionState(
    settPersonGruppe.bind(null, {
      personId: person.id,
      personNavn: person.navn,
      gruppeId: gruppe.id,
      gruppeNavn: gruppe.navn,
      inn: !inne,
    }),
    start,
  )

  return (
    <form action={send} className="inline">
      <button
        type="submit"
        disabled={endrer}
        title={tilstand.feil ?? undefined}
        className={inne ? KNAPP_SEKUNDÆR : KNAPP_LITEN}
      >
        {endrer ? '…' : gruppe.navn}
        {inne ? ' ✓' : ''}
      </button>
    </form>
  )
}

/** Gruppene én person er i. Knappene er på og av, ikke en liste med kryss. */
export function PersonGrupper({
  person,
  grupper,
  mine,
}: {
  person: { id: string; navn: string }
  grupper: { id: string; navn: string }[]
  mine: string[]
}) {
  if (grupper.length === 0) return null
  const inne = new Set(mine)

  return (
    <div className="mt-2 flex w-full flex-wrap items-center gap-2">
      <span className="text-xs text-[var(--blekk-svak)]">Grupper:</span>
      {grupper.map((g) => (
        <PersonGruppeKnapp key={g.id} person={person} gruppe={g} inne={inne.has(g.id)} />
      ))}
    </div>
  )
}
