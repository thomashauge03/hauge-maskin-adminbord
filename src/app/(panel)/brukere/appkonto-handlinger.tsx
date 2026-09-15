'use client'

import { useActionState, useState } from 'react'
import { KNAPP_FARLIG, KNAPP_LITEN, KNAPP_PRIMÆR } from '@/components/ui'
import type { AppkontoStatus } from '@/lib/appbrukarar'
import type { BrukerTilstand } from './actions'
import { settAppstatus, slettForeldreløs } from './appkonto-actions'

const start: BrukerTilstand = {}

function Melding({ tilstand }: { tilstand: BrukerTilstand }) {
  if (tilstand.feil) return <span className="text-xs text-hm-red-ink">{tilstand.feil}</span>
  if (tilstand.ok) return <span className="text-xs text-[var(--blekk-svak)]">{tilstand.ok}</span>
  return null
}

/**
 * Knappene for én appkonto.
 *
 * Hvilke som vises følger av statusen, ikke av et valg – man skal ikke
 * kunne godkjenne en som allerede er godkjent, og en avvist skal alltid ha
 * en vei tilbake. Uten den veien er et feiltrykk permanent, og personen
 * blir usynlig fordi køen bare viser dem som venter.
 */
export function AppkontoHandlinger({
  personId,
  epost,
  navBrukerId,
  status,
}: {
  personId: string
  epost: string
  navBrukerId: string
  status: AppkontoStatus
}) {
  const felles = { personId, epost, navBrukerId }

  const [godkjennTilstand, godkjenn, godkjenner] = useActionState(
    settAppstatus.bind(null, { ...felles, nyStatus: 'godkjent' }),
    start,
  )
  const [avvisTilstand, avvis, avviser] = useActionState(
    settAppstatus.bind(null, { ...felles, nyStatus: 'sperra' }),
    start,
  )

  const tilstand =
    avvisTilstand.feil || avvisTilstand.ok ? avvisTilstand : godkjennTilstand

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Melding tilstand={tilstand} />

      {status !== 'godkjent' && (
        <form action={godkjenn}>
          <button type="submit" disabled={godkjenner} className={KNAPP_PRIMÆR}>
            {godkjenner ? 'Slipper inn …' : status === 'sperra' ? 'Slipp inn igjen' : 'Godkjenn'}
          </button>
        </form>
      )}

      {status !== 'sperra' && (
        <form action={avvis}>
          <button type="submit" disabled={avviser} className={KNAPP_FARLIG}>
            {avviser ? 'Stenger …' : status === 'venter' ? 'Avvis' : 'Steng ute'}
          </button>
        </form>
      )}
    </div>
  )
}

/**
 * Sletting av en registrering som aldri ble til en person.
 *
 * Bak en bekreftelse fordi den fjerner en innlogging for godt. Teksten sier
 * hva som faktisk skjer – at adressen blir ledig igjen – for det er grunnen
 * til å gjøre det, ikke en bivirkning.
 */
export function ForeldreløsHandling({
  navBrukerId,
  epost,
}: {
  navBrukerId: string
  epost: string
}) {
  const [bekreft, settBekreft] = useState(false)
  const [tilstand, send, sletter] = useActionState(
    slettForeldreløs.bind(null, { navBrukerId, epost }),
    start,
  )

  if (!bekreft) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Melding tilstand={tilstand} />
        <button onClick={() => settBekreft(true)} className={KNAPP_LITEN}>
          Fjern
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs">
        Fjerne innloggingen til <strong>{epost}</strong>? Adressen blir ledig, og
        personen kan registrere seg på nytt.
      </span>
      <form action={send}>
        <button type="submit" disabled={sletter} className={KNAPP_FARLIG}>
          {sletter ? 'Fjerner …' : 'Ja, fjern'}
        </button>
      </form>
      <button onClick={() => settBekreft(false)} className={KNAPP_LITEN}>
        Avbryt
      </button>
    </div>
  )
}
