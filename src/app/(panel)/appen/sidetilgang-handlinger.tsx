'use client'

import { useActionState } from 'react'
import { KNAPP_LITEN } from '@/components/ui'
import { ryddForeldreløs } from './sidetilgang-actions'
import type { Tilstand } from './tilstand'

const start: Tilstand = {}

/** Rader som peker på en side som ikke finnes i sider.json lenger. */
export function ForeldreløsSide({ sideId }: { sideId: string }) {
  const [tilstand, send, rydder] = useActionState(ryddForeldreløs.bind(null, { sideId }), start)

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
