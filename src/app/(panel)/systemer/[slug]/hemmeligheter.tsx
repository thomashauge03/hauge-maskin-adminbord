'use client'

import { useActionState } from 'react'
import type { Hemmelighet } from '@/lib/typer'
import type { SystemTilstand } from '../actions'
import {
  ETIKETT,
  FELT,
  FELT_KODE,
  KNAPP_FARLIG,
  KNAPP_LITEN,
  KNAPP_SEKUNDÆR,
  Kodebit,
  Kort,
  KortTittel,
  Merke,
} from '@/components/ui'
import { visDatoTid } from '@/lib/format'

const start: SystemTilstand = {}

type Handling = (
  forrige: SystemTilstand,
  formData: FormData,
) => Promise<SystemTilstand>

/**
 * Én lagret nøkkel, med slett-knappen.
 *
 * Egen komponent bare for at hver rad kan ha sin egen ventetilstand og sitt
 * eget feilfelt. Alternativet – useActionState inne i en map – er en hook i en
 * løkke, og det er ikke lov. Uten den var slettingen et rent `form action` som
 * forkastet utfallet: en nøkkel som ikke ble slettet så helt lik ut som en som
 * ble det.
 */
function NøkkelRad({
  hemmelighet: h,
  slett,
}: {
  hemmelighet: Hemmelighet
  slett: (hemmelighetId: string) => Promise<SystemTilstand>
}) {
  const [tilstand, send, sletter] = useActionState(() => slett(h.id), start)

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0">
      <span className="flex flex-wrap items-center gap-2">
        <Merke type={h.slag === 'service_role' ? 'svart' : 'nøytral'}>
          {h.slag === 'annet' ? h.navn || 'annet' : h.slag}
        </Merke>
        <Kodebit>{h.hint}</Kodebit>
        <span className="text-xs text-[var(--blekk-svak)]">
          lagret {visDatoTid(h.endret)}
        </span>
        {tilstand.feil && (
          <span role="alert" className="text-xs font-semibold text-hm-red-ink">
            {tilstand.feil}
          </span>
        )}
      </span>
      <form action={send}>
        <button type="submit" disabled={sletter} className={KNAPP_FARLIG}>
          {sletter ? 'Sletter …' : 'Slett'}
        </button>
      </form>
    </li>
  )
}

/**
 * Nøkler for et system.
 *
 * Verdiene vises aldri igjen etter at de er lagret – bare et hint på
 * seks pluss fire tegn. Skulle man trenge selve nøkkelen, hentes den fra
 * Supabase-konsollet; adminbordet er ikke en passordbok man leser fra.
 */
export function Hemmeligheter({
  hemmeligheter,
  lagre,
  hentAutomatisk,
  slett,
  harProsjektRef,
}: {
  hemmeligheter: Hemmelighet[]
  lagre: Handling
  hentAutomatisk: Handling | null
  slett: (hemmelighetId: string) => Promise<SystemTilstand>
  harProsjektRef: boolean
}) {
  const [tilstand, send, venter] = useActionState(lagre, start)

  return (
    <Kort>
      <KortTittel
        handling={
          hentAutomatisk && harProsjektRef ? (
            <HentAutomatiskKnapp handling={hentAutomatisk} />
          ) : undefined
        }
      >
        Nøkler
      </KortTittel>

      <div className="space-y-5 px-4 py-4">
        {hemmeligheter.length === 0 ? (
          <p className="text-sm text-[var(--blekk-svak)]">
            Ingen nøkler lagret. Med et Supabase-token kan de hentes automatisk
            – da slipper de å gå via utklippstavla.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--kant)]">
            {hemmeligheter.map((h) => (
              <NøkkelRad key={h.id} hemmelighet={h} slett={slett} />
            ))}
          </ul>
        )}

        <form action={send} className="space-y-3 border-t-2 border-[var(--kant)] pt-4">
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <label className="block">
              <span className={ETIKETT}>Slag</span>
              <select name="slag" className={FELT} defaultValue="service_role">
                <option value="service_role">service_role</option>
                <option value="anon">anon</option>
                <option value="annet">annet</option>
              </select>
            </label>
            <label className="block">
              <span className={ETIKETT}>Navn (bare når slag er «annet»)</span>
              <input name="navn" placeholder="resend_api_key" className={FELT_KODE} />
            </label>
          </div>

          <label className="block">
            <span className={ETIKETT}>Verdi</span>
            {/* type=password så den ikke står lesbar på skjermen mens
                den limes inn. autoComplete av, ellers tilbyr nettleseren
                å lagre en produksjonsnøkkel i passordbehandleren. */}
            <input
              name="verdi"
              type="password"
              autoComplete="off"
              required
              minLength={10}
              className={FELT_KODE}
            />
            <span className="mt-1 block text-xs text-[var(--blekk-svak)]">
              Krypteres med AES-256-GCM før lagring. Vises aldri igjen etterpå.
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

          <button type="submit" disabled={venter} className={KNAPP_SEKUNDÆR}>
            {venter ? 'Lagrer …' : 'Lagre nøkkel'}
          </button>
        </form>
      </div>
    </Kort>
  )
}

function HentAutomatiskKnapp({ handling }: { handling: Handling }) {
  const [tilstand, send, venter] = useActionState(handling, start)

  return (
    <form action={send} className="flex items-center gap-2">
      {tilstand.feil && (
        <span className="text-xs text-hm-red-ink">{tilstand.feil}</span>
      )}
      {tilstand.ok && (
        <span className="text-xs text-[var(--blekk-svak)]">{tilstand.ok}</span>
      )}
      <button type="submit" disabled={venter} className={KNAPP_LITEN}>
        {venter ? 'Henter …' : 'Hent fra Supabase'}
      </button>
    </form>
  )
}
