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
  iDag,
  bytt,
  fjern,
}: {
  epost: string
  harToken: boolean
  /**
   * Dagens dato som ÅÅÅÅ-MM-DD, sendt inn fra serveren.
   *
   * `new Date()` i en komponent er en lintfeil under react-hooks/purity, og
   * med god grunn: en komponent som leser klokka gir ulikt resultat på server
   * og klient. Derfor følger datoen med dataene.
   */
  iDag: string
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

      {/* ── Utløpet ──
          Management-API-et oppgir det ikke noe sted, og sbp_-tokenet er opakt
          – så dette er det eneste stedet datoen kan komme fra. Uten den faller
          nedtellingen tilbake på «sist prøvd + 30», som flytter seg hver gang
          tokenet testes og derfor kan si «22 dager igjen» om et token som
          utløper i morgen.

          To felt framfor én utløpsdato, fordi det er slik datoen er kjent:
          «laget den 12., varer 30 dager». Med bare et utløpsfelt måtte man
          regne selv, og en regnefeil her er en dag alt står stille. */}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className={ETIKETT}>Laget den</span>
          <input
            name="tokenOpprettet"
            type="date"
            max={iDag}
            defaultValue={iDag}
            className={FELT_KODE}
          />
          <span className="mt-1 block text-xs text-[var(--blekk-svak)]">
            Datoen du laget tokenet hos Supabase – ikke i dag, hvis det er
            eldre.
          </span>
        </label>
        <label className="block">
          <span className={ETIKETT}>Gyldig i (dager)</span>
          <input
            name="tokenGyldigDager"
            type="number"
            min={1}
            max={3650}
            defaultValue={30}
            className={FELT_KODE}
          />
          <span className="mt-1 block text-xs text-[var(--blekk-svak)]">
            Tøm feltet hvis tokenet ikke har utløpsdato.
          </span>
        </label>
      </div>

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
