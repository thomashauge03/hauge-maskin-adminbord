'use client'

import { useActionState } from 'react'
import type { System } from '@/lib/typer'
import { opprettBrukerISystem, type BrukerTilstand } from './actions'
import { ETIKETT, FELT, KNAPP_PRIMÆR } from '@/components/ui'

const start: BrukerTilstand = {}

export function NyBruker({ systemer }: { systemer: System[] }) {
  const [tilstand, send, venter] = useActionState(opprettBrukerISystem, start)

  return (
    <form action={send} className="space-y-4 px-4 py-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={ETIKETT}>System</span>
          <select name="systemId" required className={FELT}>
            <option value="">Velg …</option>
            {systemer.map((s) => (
              <option key={s.id} value={s.id}>
                {s.navn}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={ETIKETT}>E-post</span>
          <input name="epost" type="email" required className={FELT} />
        </label>

        <label className="block">
          <span className={ETIKETT}>Midlertidig passord</span>
          {/* type=text med vilje: den som oppretter brukeren må lese
              passordet for å kunne formidle det videre. Skjult felt her
              ville betydd at det måtte skrives ned på en lapp først. */}
          <input
            name="passord"
            type="text"
            required
            minLength={8}
            autoComplete="off"
            className={FELT}
          />
        </label>
      </div>

      {tilstand.feil && (
        <p
          role="alert"
          className="border-l-4 border-hm-red bg-hm-red/10 p-3 text-sm font-semibold text-hm-red-ink"
        >
          {tilstand.feil}
        </p>
      )}
      {tilstand.ok && (
        <p
          role="status"
          className="border-l-4 border-hm-green bg-hm-green/10 p-3 text-sm"
        >
          {tilstand.ok}
        </p>
      )}

      <button type="submit" disabled={venter} className={KNAPP_PRIMÆR}>
        {venter ? 'Oppretter …' : 'Opprett bruker'}
      </button>
    </form>
  )
}
