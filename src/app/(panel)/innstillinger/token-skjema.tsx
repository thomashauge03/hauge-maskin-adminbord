'use client'

import { useActionState, useState } from 'react'
import type { TokenTilstand } from './actions'
import {
  ETIKETT,
  FELT_KODE,
  KNAPP_FARLIG,
  KNAPP_LITEN,
  KNAPP_SEKUNDÆR,
} from '@/components/ui'

const start: TokenTilstand = {}

type Handling = (
  forrige: TokenTilstand,
  formData: FormData,
) => Promise<TokenTilstand>

/**
 * Bytt eller fjern tokenet for én konto.
 *
 * Skjemaet er skjult til man ber om det. Fire kontokort med åpne
 * tokenfelt ville gjort det lett å lime inn i feil kort – og et token i
 * feil konto feiler ikke, det bare ser ut som om kontoen ikke ser
 * prosjektene sine.
 */
export function TokenSkjema({
  epost,
  harToken,
  bytt,
  fjern,
}: {
  epost: string
  harToken: boolean
  bytt: Handling
  fjern: () => Promise<void>
}) {
  const [åpen, settÅpen] = useState(false)
  const [tilstand, send, venter] = useActionState(bytt, start)

  if (!åpen) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => settÅpen(true)} className={KNAPP_LITEN}>
          {harToken ? 'Bytt token' : 'Legg inn token'}
        </button>
        {harToken && (
          <form action={fjern}>
            <button type="submit" className={KNAPP_LITEN}>
              Fjern
            </button>
          </form>
        )}
        {tilstand.ok && (
          <span className="text-xs font-semibold">{tilstand.ok}</span>
        )}
      </div>
    )
  }

  return (
    <form action={send} className="space-y-2 border-t-2 border-[var(--kant)] pt-3">
      <label className="block">
        <span className={ETIKETT}>Nytt token for {epost}</span>
        {/* type=password sa det ikke star lesbart mens det limes inn.
            autoComplete av, ellers tilbyr nettleseren a lagre et
            produksjonstoken i passordbehandleren. */}
        <input
          name="token"
          type="password"
          autoComplete="off"
          required
          minLength={20}
          placeholder="sbp_…"
          autoFocus
          className={FELT_KODE}
        />
        <span className="mt-1 block text-xs text-[var(--blekk-svak)]">
          Lages på supabase.com/dashboard/account/tokens mens du er logget inn
          som <strong>{epost}</strong>. Tokenet prøves før det lagres.
        </span>
      </label>

      {tilstand.feil && (
        <p role="alert" className="text-sm font-semibold text-hm-red-ink">
          {tilstand.feil}
        </p>
      )}
      {tilstand.ok && (
        <p role="status" className="text-sm font-semibold">
          {tilstand.ok}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={venter} className={KNAPP_SEKUNDÆR}>
          {venter ? 'Prøver …' : 'Prøv og lagre'}
        </button>
        <button
          type="button"
          onClick={() => settÅpen(false)}
          className={KNAPP_LITEN}
        >
          Avbryt
        </button>
        {harToken && (
          <form action={fjern}>
            <button type="submit" className={KNAPP_FARLIG}>
              Fjern tokenet
            </button>
          </form>
        )}
      </div>
    </form>
  )
}
