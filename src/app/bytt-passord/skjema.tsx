'use client'

import { useActionState } from 'react'
import { byttPassord, type ByttPassordTilstand } from './actions'
import { ETIKETT, FELT, KNAPP_PRIMÆR } from '@/components/ui'

const start: ByttPassordTilstand = {}

export function ByttPassordSkjema() {
  const [tilstand, handling, venter] = useActionState(byttPassord, start)

  return (
    <form action={handling} className="space-y-4">
      <label className="block">
        <span className={ETIKETT}>Nytt passord</span>
        <input
          name="passord"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          autoFocus
          className={FELT}
        />
      </label>

      <label className="block">
        <span className={ETIKETT}>Gjenta passord</span>
        <input
          name="gjenta"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className={FELT}
        />
      </label>

      {tilstand.feil && (
        <p
          role="alert"
          className="border-l-4 border-hm-red bg-hm-red/10 p-3 text-sm font-semibold text-hm-red-ink"
        >
          {tilstand.feil}
        </p>
      )}

      <button type="submit" disabled={venter} className={`${KNAPP_PRIMÆR} w-full`}>
        {venter ? 'Lagrer …' : 'Lagre passord'}
      </button>
    </form>
  )
}
