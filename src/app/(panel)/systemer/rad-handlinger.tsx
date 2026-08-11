'use client'

import { useState } from 'react'
import { KNAPP_FARLIG, KNAPP_LITEN } from '@/components/ui'

/**
 * Skjul, vis, tilsyn av/på og slett – per rad i registeret.
 *
 * Rekkefølgen er med vilje: skjul først, slett bakerst og bak en
 * bekreftelse. Skjuling er nesten alltid det man vil, og den er
 * reversibel; sletting tar med seg prosjektref, nøkler, notater og
 * statushistorikk.
 */
export function RadHandlinger({
  navn,
  aktiv,
  overvakes,
  settAktiv,
  settTilsyn,
  slett,
}: {
  navn: string
  aktiv: boolean
  overvakes: boolean
  settAktiv: (aktiv: boolean) => Promise<void>
  settTilsyn: (overvakes: boolean) => Promise<void>
  slett: () => Promise<void>
}) {
  const [bekreft, settBekreft] = useState(false)

  if (bekreft) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs">
          Slette <strong>{navn}</strong> for godt?
        </span>
        <form action={slett}>
          <button type="submit" className={KNAPP_FARLIG}>
            Ja, slett
          </button>
        </form>
        <button onClick={() => settBekreft(false)} className={KNAPP_LITEN}>
          Avbryt
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <form action={() => settAktiv(!aktiv)}>
        <button type="submit" className={KNAPP_LITEN}>
          {aktiv ? 'Skjul' : 'Vis'}
        </button>
      </form>

      {/* Tilsyn er meningsløst på et skjult system – det vises ikke noe
          sted som kan lyse rødt. */}
      {aktiv && (
        <form action={() => settTilsyn(!overvakes)}>
          <button type="submit" className={KNAPP_LITEN}>
            {overvakes ? 'Tilsyn av' : 'Tilsyn på'}
          </button>
        </form>
      )}

      <button
        onClick={() => settBekreft(true)}
        className={KNAPP_LITEN}
        title="Sletter registeroppføringen. Databasen og Vercel-prosjektet blir stående."
      >
        Slett
      </button>
    </div>
  )
}
