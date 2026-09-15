'use client'

import { useActionState, useState } from 'react'
import { KNAPP_LITEN, Merke } from '@/components/ui'
import type { BrukerTilstand } from './actions'
import { settSideTilgang, settStandard, ryddForeldreløs } from './sidetilgang-actions'

const start: BrukerTilstand = {}

/** Bryteren som bestemmer om alle får en side, eller bare de utvalgte. */
export function StandardBryter({
  sideId,
  navn,
  standard,
}: {
  sideId: string
  navn: string
  standard: boolean
}) {
  const [tilstand, send, endrer] = useActionState(
    settStandard.bind(null, { sideId, navn, standard: !standard }),
    start,
  )

  return (
    <div className="flex items-center justify-end gap-2">
      {tilstand.feil && <span className="text-xs text-hm-red-ink">{tilstand.feil}</span>}
      <form action={send}>
        <button type="submit" disabled={endrer} className={KNAPP_LITEN}>
          {endrer ? 'Endrer …' : standard ? 'Alle ser den' : 'Bare utvalgte'}
        </button>
      </form>
    </div>
  )
}

/**
 * Én side for én person.
 *
 * Merkelappen sier om valget avviker fra standarden. Uten den ville et kryss
 * sett likt ut enten det var satt med vilje eller bare fulgte standarden - og
 * da vet man ikke hva som skjer med personen den dagen standarden endres.
 */
function SideKryss({
  person,
  side,
  ser,
  standard,
  avviker,
}: {
  person: { id: string; navn: string }
  side: { id: string; navn: string; gruppe: string; barePC: boolean }
  ser: boolean
  standard: boolean
  avviker: boolean
}) {
  const [tilstand, send, endrer] = useActionState(
    settSideTilgang.bind(null, {
      personId: person.id,
      personNavn: person.navn,
      sideId: side.id,
      sideNavn: side.navn,
      ser: !ser,
      standard,
    }),
    start,
  )

  return (
    <li className="flex items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-2 last:border-b-0">
      <div className="min-w-0">
        <span className={ser ? '' : 'text-[var(--blekk-svak)] line-through'}>{side.navn}</span>
        <span className="ml-2 text-xs text-[var(--blekk-svak)]">{side.gruppe}</span>
        {avviker && (
          <span className="ml-2">
            <Merke type="gul">{ser ? 'Gitt særskilt' : 'Fratatt'}</Merke>
          </span>
        )}
        {/* Sider merket for PC vises aldri på telefonen, uansett hva som krysses av her. */}
        {side.barePC && (
          <span className="ml-2">
            <Merke type="nøytral">Bare PC</Merke>
          </span>
        )}
        {tilstand.feil && (
          <div className="text-xs text-hm-red-ink">{tilstand.feil}</div>
        )}
      </div>
      <form action={send}>
        <button type="submit" disabled={endrer || side.barePC} className={KNAPP_LITEN}>
          {endrer ? '…' : ser ? 'Ta bort' : 'Gi'}
        </button>
      </form>
    </li>
  )
}

/** Sidene til én person, skjult til man ber om dem. */
export function PersonSider({
  person,
  sider,
}: {
  person: { id: string; navn: string }
  sider: {
    id: string
    navn: string
    gruppe: string
    barePC: boolean
    standard: boolean
    ser: boolean
    avviker: boolean
  }[]
}) {
  const [åpen, settÅpen] = useState(false)
  const avvik = sider.filter((s) => s.avviker).length
  const synlege = sider.filter((s) => s.ser && !s.barePC).length

  if (!åpen) {
    return (
      <button onClick={() => settÅpen(true)} className={KNAPP_LITEN}>
        Sider: {synlege}
        {avvik > 0 ? ` · ${avvik} avvik` : ''}
      </button>
    )
  }

  return (
    <div className="mt-3 w-full border-2 border-[var(--kant)]">
      <div className="flex items-center justify-between border-b-2 border-[var(--kant)] px-4 py-2">
        <strong className="text-sm">Hva {person.navn} ser i appen</strong>
        <button onClick={() => settÅpen(false)} className={KNAPP_LITEN}>
          Lukk
        </button>
      </div>
      <ul>
        {sider.map((s) => (
          <SideKryss
            key={s.id}
            person={person}
            side={s}
            ser={s.ser}
            standard={s.standard}
            avviker={s.avviker}
          />
        ))}
      </ul>
    </div>
  )
}

/** Rader som peker på en side som ikke finnes i sider.json lenger. */
export function ForeldreløsSide({ sideId }: { sideId: string }) {
  const [tilstand, send, rydder] = useActionState(
    ryddForeldreløs.bind(null, { sideId }),
    start,
  )

  return (
    <li className="flex items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-2 last:border-b-0">
      <span className="hm-kode text-sm">{sideId}</span>
      <div className="flex items-center gap-2">
        {tilstand.feil && <span className="text-xs text-hm-red-ink">{tilstand.feil}</span>}
        <form action={send}>
          <button type="submit" disabled={rydder} className={KNAPP_LITEN}>
            {rydder ? 'Rydder …' : 'Rydd bort'}
          </button>
        </form>
      </div>
    </li>
  )
}
