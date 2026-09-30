'use client'

import { useActionState } from 'react'
import { KNAPP_LITEN, Merke } from '@/components/ui'
import type { Grunn } from '@/lib/sideregel'
import { settSideUnntak } from '../../sidetilgang-actions'
import type { Tilstand } from '../../tilstand'

export type SidevalgRad = {
  id: string
  navn: string
  gruppe: string
  barePC: boolean
  grunn: Grunn
}

const start: Tilstand = {}

function Grunntekst({ grunn }: { grunn: Grunn }) {
  if (grunn.hvorfor === 'gitt') return <Merke type="gul">Gitt særskilt</Merke>
  if (grunn.hvorfor === 'tatt') return <Merke type="gul">Tatt bort særskilt</Merke>
  if (grunn.hvorfor === 'gruppe') {
    return <span className="text-xs text-[var(--blekk-svak)]">fra {grunn.grupper.join(', ')}</span>
  }
  return <span className="text-xs text-[var(--blekk-svak)]">ser ikke</span>
}

function Rad({
  person,
  side,
  erEier,
}: {
  person: { id: string; navn: string }
  side: SidevalgRad
  erEier: boolean
}) {
  const [tilstand, send, endrer] = useActionState(
    settSideUnntak.bind(null, {
      personId: person.id,
      personNavn: person.navn,
      sideId: side.id,
      sideNavn: side.navn,
      ser: !side.grunn.ser,
    }),
    start,
  )

  return (
    <li className="flex items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-2 last:border-b-0">
      <div className="min-w-0">
        <span className={side.grunn.ser && !side.barePC ? '' : 'text-[var(--blekk-svak)] line-through'}>
          {side.navn}
        </span>
        <span className="ml-2 text-xs text-[var(--blekk-svak)]">{side.gruppe}</span>
        <span className="ml-2">
          <Grunntekst grunn={side.grunn} />
        </span>
        {/* Sider merket for PC vises aldri på telefonen, uansett hva som gis her. */}
        {side.barePC && (
          <span className="ml-2">
            <Merke>Bare PC</Merke>
          </span>
        )}
        {tilstand.feil && <div className="text-xs text-hm-red-ink">{tilstand.feil}</div>}
      </div>
      {erEier && (
        <form action={send}>
          <button type="submit" disabled={endrer || side.barePC} className={KNAPP_LITEN}>
            {endrer ? '…' : side.grunn.ser ? 'Ta bort' : 'Gi'}
          </button>
        </form>
      )}
    </li>
  )
}

/** Hva én person ser i appen, og hvorfor. */
export function Sidevalg({
  person,
  sider,
  erEier,
}: {
  person: { id: string; navn: string }
  sider: SidevalgRad[]
  erEier: boolean
}) {
  if (sider.length === 0) {
    return <p className="px-4 py-4 text-sm text-[var(--blekk-svak)]">Ingen sider i sider.json.</p>
  }

  return (
    <ul>
      {sider.map((s) => (
        <Rad key={s.id} person={person} side={s} erEier={erEier} />
      ))}
    </ul>
  )
}
