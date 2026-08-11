'use client'

import { useActionState, useState } from 'react'
import { KNAPP_FARLIG, KNAPP_LITEN } from '@/components/ui'
import type { SystemTilstand } from './actions'

const start: SystemTilstand = {}

type Handling = (
  forrige: SystemTilstand,
  formData: FormData,
) => Promise<SystemTilstand>

/**
 * Skjul, vis, tilsyn av/på og slett – per rad i registeret.
 *
 * Rekkefølgen er med vilje: skjul først, slett bakerst og bak en bekreftelse.
 * Skjuling er nesten alltid det man vil, og den er reversibel; sletting tar med
 * seg prosjektref, nøkler, notater og statushistorikk.
 *
 * Alle tre rapporterer utfallet. De gjorde det ikke før, og siden handlingene
 * går gjennom RLS var et avvist update helt stille: knappen så ut som den
 * virket, loggen sa «system.skjult», og systemet sto der det sto.
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
  settAktiv: Handling
  settTilsyn: Handling
  slett: Handling
}) {
  const [bekreft, settBekreft] = useState(false)
  const [aktivTilstand, sendAktiv, endrerAktiv] = useActionState(settAktiv, start)
  const [tilsynTilstand, sendTilsyn, endrerTilsyn] = useActionState(
    settTilsyn,
    start,
  )
  const [slettTilstand, sendSlett, sletter] = useActionState(slett, start)

  // Siste handling som sa noe eier meldingsfeltet. Raden er én linje, og tre
  // meldinger ved siden av hverandre er ingen melding.
  const tilstand =
    slettTilstand.feil || slettTilstand.ok
      ? slettTilstand
      : tilsynTilstand.feil || tilsynTilstand.ok
        ? tilsynTilstand
        : aktivTilstand

  if (bekreft) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs">
          Slette <strong>{navn}</strong> for godt?
        </span>
        <form action={sendSlett}>
          <button type="submit" disabled={sletter} className={KNAPP_FARLIG}>
            {sletter ? 'Sletter …' : 'Ja, slett'}
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
      {tilstand.feil && (
        <span role="alert" className="text-xs font-semibold text-hm-red-ink">
          {tilstand.feil}
        </span>
      )}
      {tilstand.ok && (
        <span role="status" className="text-xs text-[var(--blekk-svak)]">
          {tilstand.ok}
        </span>
      )}

      {/* Måltilstanden bindes på serveren, der vi vet hva raden står i nå. */}
      <form action={sendAktiv}>
        <button type="submit" disabled={endrerAktiv} className={KNAPP_LITEN}>
          {endrerAktiv ? '…' : aktiv ? 'Skjul' : 'Vis'}
        </button>
      </form>

      {/* Tilsyn er meningsløst på et skjult system – det vises ikke noe
          sted som kan lyse rødt. */}
      {aktiv && (
        <form action={sendTilsyn}>
          <button type="submit" disabled={endrerTilsyn} className={KNAPP_LITEN}>
            {endrerTilsyn ? '…' : overvakes ? 'Tilsyn av' : 'Tilsyn på'}
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
