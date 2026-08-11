'use client'

import { useActionState, useState } from 'react'
import {
  settPassordISystem,
  type BrukerTilstand,
} from './actions'
import { FELT_KODE, KNAPP_FARLIG, KNAPP_LITEN, KNAPP_SEKUNDÆR } from '@/components/ui'

const start: BrukerTilstand = {}

/**
 * Handlingene for én bruker i ett system.
 *
 * Skjemaet er skjult til man ber om det. Med tjue brukere ganger fem
 * systemer ville tjue passordfelt stått åpne samtidig, og da er det
 * bare et spørsmål om tid før noen skriver i feil rad.
 */
export function BrukerHandlinger({
  systemId,
  brukerId,
  epost,
  sperret,
  settSperret,
}: {
  systemId: string
  brukerId: string
  epost: string
  sperret: boolean
  settSperret: (sperret: boolean) => Promise<void>
}) {
  const [åpen, settÅpen] = useState(false)
  const [tilstand, send, venter] = useActionState(settPassordISystem, start)

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {tilstand.feil && (
        <span className="text-xs text-hm-red-ink">{tilstand.feil}</span>
      )}
      {tilstand.ok && (
        <span className="text-xs text-[var(--blekk-svak)]">{tilstand.ok}</span>
      )}

      {åpen ? (
        <form action={send} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="brukerId" value={brukerId} />
          <input
            name="passord"
            type="text"
            required
            minLength={8}
            autoComplete="off"
            placeholder={`nytt passord for ${epost}`}
            aria-label={`Nytt passord for ${epost}`}
            className={`${FELT_KODE} w-56 py-1.5`}
          />
          <button type="submit" disabled={venter} className={KNAPP_SEKUNDÆR}>
            {venter ? 'Setter …' : 'Sett'}
          </button>
          <button
            type="button"
            onClick={() => settÅpen(false)}
            className={KNAPP_LITEN}
          >
            Avbryt
          </button>
        </form>
      ) : (
        <button onClick={() => settÅpen(true)} className={KNAPP_LITEN}>
          Nytt passord
        </button>
      )}

      <form action={() => settSperret(!sperret)}>
        <button
          type="submit"
          className={sperret ? KNAPP_LITEN : KNAPP_FARLIG}
        >
          {sperret ? 'Åpne konto' : 'Sperr'}
        </button>
      </form>
    </div>
  )
}
