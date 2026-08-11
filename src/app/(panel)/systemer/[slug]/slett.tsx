'use client'

import { useActionState, useState } from 'react'
import { KNAPP_FARLIG, KNAPP_LITEN } from '@/components/ui'
import type { SystemTilstand } from '../actions'

/**
 * Sletting i to trinn.
 *
 * Ikke `confirm()`: den blokkerer hele nettleseren og ser ut som en
 * feilmelding. To klikk med navnet skrevet ut i klartekst gjør det
 * tydelig hva som forsvinner – og det er registeroppføringen, ikke
 * databasen.
 */
export function SlettSystem({
  navn,
  slett,
}: {
  navn: string
  slett: (
    forrige: SystemTilstand,
    formData: FormData,
  ) => Promise<SystemTilstand>
}) {
  const [åpen, settÅpen] = useState(false)
  /*
   * Utfallet må vises. Handlingen går gjennom RLS, og et avvist delete var
   * stille: loggen sa «system.slettet», brukeren ble sendt til /systemer, og
   * systemet sto der. Det ser ut som en visningsfeil og er det motsatte.
   */
  const [tilstand, send, sletter] = useActionState(slett, {} as SystemTilstand)

  if (!åpen) {
    return (
      <button onClick={() => settÅpen(true)} className={KNAPP_LITEN}>
        Slett fra registeret
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm">
        Fjerne <strong>{navn}</strong> fra registeret? Databasen og
        Vercel-prosjektet blir stående.
      </p>
      <form action={send}>
        <button type="submit" disabled={sletter} className={KNAPP_FARLIG}>
          {sletter ? 'Fjerner …' : 'Ja, fjern'}
        </button>
      </form>
      <button onClick={() => settÅpen(false)} className={KNAPP_LITEN}>
        Avbryt
      </button>
      {tilstand.feil && (
        <p role="alert" className="text-sm font-semibold text-hm-red-ink">
          {tilstand.feil}
        </p>
      )}
    </div>
  )
}
