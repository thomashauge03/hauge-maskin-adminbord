'use client'

import { useActionState, useState } from 'react'
import { KNAPP_FARLIG, KNAPP_LITEN, Kort, KortTittel } from '@/components/ui'
import { slettFraAppen } from '../../person-actions'
import type { Tilstand } from '../../tilstand'

const start: Tilstand = {}

/** Bak en bekreftelse som sier hva som faktisk skjer. */
export function SlettFraAppen({
  personId,
  navn,
  iAndreSystemer,
}: {
  personId: string
  navn: string
  iAndreSystemer: boolean
}) {
  const [bekreft, settBekreft] = useState(false)
  const [tilstand, send, sletter] = useActionState(slettFraAppen.bind(null, { personId }), start)

  return (
    <Kort>
      <KortTittel>Slett fra appen</KortTittel>
      <div className="space-y-3 px-4 py-4 text-sm">
        <p>
          Fjerner innloggingen til {navn} i appen, og gruppene og unntakene.{' '}
          {iAndreSystemer
            ? 'Personen finnes i andre systemer, så navnet blir stående i kontooversikten under Brukere.'
            : 'Personen finnes ikke i andre systemer, og blir borte helt.'}{' '}
          {navn} kan registrere seg på nytt, og havner da i køen som ny.
        </p>
        {tilstand.feil && <p className="text-hm-red-ink">{tilstand.feil}</p>}
        {bekreft ? (
          <div className="flex flex-wrap gap-2">
            <form action={send}>
              <button type="submit" disabled={sletter} className={KNAPP_FARLIG}>
                {sletter ? 'Sletter …' : `Ja, slett ${navn}`}
              </button>
            </form>
            <button type="button" onClick={() => settBekreft(false)} className={KNAPP_LITEN}>
              Avbryt
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => settBekreft(true)} className={KNAPP_FARLIG}>
            Slett fra appen
          </button>
        )}
      </div>
    </Kort>
  )
}
