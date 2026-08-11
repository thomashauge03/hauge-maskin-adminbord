'use client'

import { useState } from 'react'
import { KNAPP_FARLIG, KNAPP_LITEN } from '@/components/ui'

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
  slett: () => Promise<void>
}) {
  const [åpen, settÅpen] = useState(false)

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
      <form action={slett}>
        <button type="submit" className={KNAPP_FARLIG}>
          Ja, fjern
        </button>
      </form>
      <button onClick={() => settÅpen(false)} className={KNAPP_LITEN}>
        Avbryt
      </button>
    </div>
  )
}
