'use client'

import { useActionState, useState } from 'react'
import { ETIKETT, FELT_KODE, KNAPP_FARLIG, KNAPP_LITEN, KNAPP_SEKUNDÆR } from '@/components/ui'
import { fjernTripletexNøkkel, lagreTripletexNøkkel, type Tripletexsvar } from './tripletex-actions'

const start: Tripletexsvar = {}

/** Legg inn, bytt eller fjern Tripletex-nøkkelen. Skjult til man ber om det, som SmartDok-skjemaet. */
export function TripletexSkjema({ harNøkkel }: { harNøkkel: boolean }) {
  const [åpen, settÅpen] = useState(false)
  const [svar, send, venter] = useActionState(lagreTripletexNøkkel, start)

  if (!åpen) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => settÅpen(true)} className={KNAPP_LITEN}>
          {harNøkkel ? 'Bytt nøkkel' : 'Legg inn nøkkel'}
        </button>
        {svar.ok && <span className="text-xs font-semibold">{svar.ok}</span>}
      </div>
    )
  }

  return (
    <form action={send} className="space-y-2 border-t-2 border-[var(--kant)] pt-3">
      <label className="block">
        <span className={ETIKETT}>API-nøkkel fra Tripletex</span>
        {/* new-password: Chrome overser off og ville fylt inn den lagrede innloggingen. */}
        <input
          name="nokkel"
          type="password"
          autoComplete="new-password"
          required
          minLength={16}
          autoFocus
          className={FELT_KODE}
        />
        <span className="mt-1 block text-xs text-[var(--blekk-svak)]">
          Egen nøkkel for adminbordet, ikke den grusappen bruker. Den prøves mot Tripletex før den lagres, og
          ingenting skrives i regnskapet.
        </span>
      </label>

      {svar.feil && (
        <p role="alert" className="text-sm font-semibold text-hm-red-ink">
          {svar.feil}
        </p>
      )}
      {svar.ok && (
        <p role="status" className="text-sm font-semibold">
          {svar.ok}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={venter} className={KNAPP_SEKUNDÆR}>
          {venter ? 'Prøver …' : 'Prøv og lagre'}
        </button>
        <button type="button" onClick={() => settÅpen(false)} className={KNAPP_LITEN}>
          Avbryt
        </button>
        {harNøkkel && (
          <button type="submit" formAction={fjernTripletexNøkkel} formNoValidate className={KNAPP_FARLIG}>
            Fjern nøkkelen
          </button>
        )}
      </div>
    </form>
  )
}
