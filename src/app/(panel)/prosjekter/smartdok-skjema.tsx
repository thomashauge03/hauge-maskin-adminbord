'use client'

import { useActionState, useState } from 'react'
import { ETIKETT, FELT_KODE, KNAPP_FARLIG, KNAPP_LITEN, KNAPP_SEKUNDÆR } from '@/components/ui'
import { fjernSmartdokNøkkel, lagreSmartdokNøkkel, type Nøkkelsvar } from './actions'

const start: Nøkkelsvar = {}

/**
 * Legg inn, bytt eller fjern SmartDok-nøkkelen. Skjult til man ber om det,
 * som tokenskjemaene på innstillingssiden.
 */
export function SmartdokSkjema({ harNøkkel, iDag }: { harNøkkel: boolean; iDag: string }) {
  const [åpen, settÅpen] = useState(false)
  const [svar, send, venter] = useActionState(lagreSmartdokNøkkel, start)

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
        <span className={ETIKETT}>API-nøkkel fra SmartDok</span>
        {/* new-password av samme grunn som på innstillingssiden: Chrome overser
            off og ville fylt inn den lagrede innloggingen. */}
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
          Firmainnstillinger → API-administrasjon → Ny API-nøkkel. Kryss bare av for Prosjekter.
          Nøkkelen prøves mot SmartDok før den lagres.
        </span>
      </label>

      <label className="block sm:max-w-xs">
        <span className={ETIKETT}>Laget den</span>
        <input name="opprettet" type="date" max={iDag} defaultValue={iDag} required className={FELT_KODE} />
        <span className="mt-1 block text-xs text-[var(--blekk-svak)]">
          Nøkkelen varer ett år fra denne datoen og fornyes automatisk underveis.
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
          {venter ? 'Prøver og henter …' : 'Prøv og lagre'}
        </button>
        <button type="button" onClick={() => settÅpen(false)} className={KNAPP_LITEN}>
          Avbryt
        </button>
        {harNøkkel && (
          <button type="submit" formAction={fjernSmartdokNøkkel} formNoValidate className={KNAPP_FARLIG}>
            Fjern nøkkelen
          </button>
        )}
      </div>
    </form>
  )
}
