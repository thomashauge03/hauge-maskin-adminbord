'use client'

import { useActionState, useState } from 'react'
import { FELT, KNAPP_LITEN, KNAPP_SEKUNDÆR } from '@/components/ui'
import { leggTilUnntak, type Unntakssvar } from './actions'

const start: Unntakssvar = {}

/** «Belastes ikke» på en maskin som stopper kjøringen. Krever en grunn, så listen kan leses om et år. */
export function UnntakKnapp({ maskinId, navn }: { maskinId: number; navn: string }) {
  const [åpen, settÅpen] = useState(false)
  const [svar, send, venter] = useActionState(leggTilUnntak, start)

  if (svar.ok) return <span className="text-xs font-semibold">{svar.ok}</span>
  if (!åpen) {
    return (
      <button type="button" onClick={() => settÅpen(true)} className={KNAPP_LITEN}>
        Belastes ikke
      </button>
    )
  }

  return (
    <form action={send} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="maskinId" value={maskinId} />
      <input type="hidden" name="navn" value={navn} />
      <input name="grunn" required minLength={3} placeholder="Hvorfor?" autoFocus className={`${FELT} min-w-48`} />
      <button type="submit" disabled={venter} className={KNAPP_SEKUNDÆR}>
        {venter ? 'Lagrer …' : 'Lagre'}
      </button>
      <button type="button" onClick={() => settÅpen(false)} className={KNAPP_LITEN}>
        Avbryt
      </button>
      {svar.feil && (
        <span role="alert" className="text-xs font-semibold text-hm-red-ink">
          {svar.feil}
        </span>
      )}
    </form>
  )
}
