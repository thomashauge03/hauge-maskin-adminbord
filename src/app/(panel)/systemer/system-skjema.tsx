'use client'

import { useActionState } from 'react'
import type { System } from '@/lib/typer'
import type { SystemTilstand } from './actions'
import { ETIKETT, FELT, FELT_KODE, KNAPP_PRIMÆR } from '@/components/ui'

const start: SystemTilstand = {}

/**
 * Samme skjema for nytt og eksisterende system.
 *
 * `handling` sendes inn ferdig bundet fra serveren, slik at det bare er
 * denne komponenten som må vite hvordan feltene ser ut. Var det to
 * skjemaer, ville et nytt felt måttet legges inn på to steder – og det
 * ene ville blitt glemt.
 */
export function SystemSkjema({
  handling,
  system,
  knappetekst = 'Lagre',
}: {
  handling: (
    forrige: SystemTilstand,
    formData: FormData,
  ) => Promise<SystemTilstand>
  system?: System
  knappetekst?: string
}) {
  const [tilstand, send, venter] = useActionState(handling, start)

  return (
    <form action={send} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={ETIKETT}>Navn</span>
          <input
            name="navn"
            defaultValue={system?.navn}
            required
            minLength={2}
            className={FELT}
          />
        </label>

        <label className="block">
          <span className={ETIKETT}>Kortnavn (i adressen)</span>
          <input
            name="slug"
            defaultValue={system?.slug}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="rorlager"
            className={FELT_KODE}
          />
          <span className="mt-1 block text-xs text-[var(--blekk-svak)]">
            Små bokstaver, tall og bindestrek. Endres den, endres lenken.
          </span>
        </label>
      </div>

      <label className="block">
        <span className={ETIKETT}>Beskrivelse</span>
        <input
          name="beskrivelse"
          defaultValue={system?.beskrivelse ?? ''}
          placeholder="Hva systemet gjør, i én setning"
          className={FELT}
        />
      </label>

      <fieldset className="border-2 border-[var(--kant)] px-4 pt-3 pb-4">
        <legend className="hm-display px-2 text-sm">Supabase</legend>
        <label className="block">
          <span className={ETIKETT}>Prosjektreferanse</span>
          <input
            name="supabaseProsjektRef"
            defaultValue={system?.supabaseProsjektRef ?? ''}
            placeholder="erpcayowvmdcsbpdilak"
            className={FELT_KODE}
          />
          {/* URL-en utledes av referansen og lagres automatisk – to felt
              som må stemme med hverandre er to felt som før eller siden
              ikke gjør det. */}
          <span className="mt-1 block text-xs text-[var(--blekk-svak)]">
            De 20 tegnene i prosjekt-URL-en. La stå tom om systemet ikke har
            database.
          </span>
        </label>

        <label className="mt-4 block">
          <span className={ETIKETT}>Skjema</span>
          <input
            name="dbSkjema"
            defaultValue={system?.dbSkjema ?? 'public'}
            placeholder="public"
            className={FELT_KODE}
          />
          <span className="mt-1 block text-xs text-[var(--blekk-svak)]">
            Postgres-skjemaet systemets egne tabeller ligger i. La stå tom for{' '}
            <code>public</code>. Settes bare når systemet deler database med et
            annet – da er det dette som avgjør hvilke tabeller som vises her.
          </span>
        </label>
      </fieldset>

      <fieldset className="border-2 border-[var(--kant)] px-4 pt-3 pb-4">
        <legend className="hm-display px-2 text-sm">Vercel</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={ETIKETT}>Prosjekt-ID</span>
            <input
              name="vercelProsjektId"
              defaultValue={system?.vercelProsjektId ?? ''}
              placeholder="prj_…"
              className={FELT_KODE}
            />
          </label>
          <label className="block">
            <span className={ETIKETT}>Prosjektnavn</span>
            <input
              name="vercelProsjektNavn"
              defaultValue={system?.vercelProsjektNavn ?? ''}
              placeholder="utleie-hauge-maskin"
              className={FELT_KODE}
            />
            <span className="mt-1 block text-xs text-[var(--blekk-svak)]">
              Holder med én av dem. Navnet brukes når ID-en mangler.
            </span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={ETIKETT}>GitHub-repo</span>
          <input
            name="githubRepo"
            defaultValue={system?.githubRepo ?? ''}
            placeholder="thomashauge03/rorlager"
            className={FELT_KODE}
          />
        </label>
        <label className="block">
          <span className={ETIKETT}>Produksjonsadresse</span>
          <input
            name="produksjonsUrl"
            type="url"
            defaultValue={system?.produksjonsUrl ?? ''}
            placeholder="https://…"
            className={FELT}
          />
        </label>
      </div>

      <label className="block">
        <span className={ETIKETT}>Notat</span>
        <textarea
          name="notat"
          defaultValue={system?.notat ?? ''}
          rows={3}
          placeholder="Det du kommer til å ha glemt om et halvt år"
          className={FELT}
        />
      </label>

      <div className="flex flex-wrap items-end gap-6">
        <label className="block w-28">
          <span className={ETIKETT}>Sortering</span>
          <input
            name="sortering"
            type="number"
            min={0}
            max={9999}
            defaultValue={system?.sortering ?? 100}
            className={`${FELT} hm-tall`}
          />
        </label>

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            name="aktiv"
            value="på"
            defaultChecked={system?.aktiv ?? true}
            className="size-5 accent-hm-red"
          />
          <span className="text-sm font-semibold">Aktiv</span>
        </label>

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            name="overvakes"
            value="på"
            defaultChecked={system?.overvakes ?? true}
            className="size-5 accent-hm-red"
          />
          <span className="text-sm font-semibold">Overvåkes</span>
          <span className="text-xs text-[var(--blekk-svak)]">
            (av: vises, men lyser ikke rødt)
          </span>
        </label>
      </div>

      {tilstand.feil && (
        <p
          role="alert"
          className="border-l-4 border-hm-red bg-hm-red/10 p-3 text-sm font-semibold text-hm-red-ink"
        >
          {tilstand.feil}
        </p>
      )}
      {tilstand.ok && (
        <p
          role="status"
          className="border-l-4 border-hm-green bg-hm-green/10 p-3 text-sm font-semibold"
        >
          {tilstand.ok}
        </p>
      )}

      <button type="submit" disabled={venter} className={KNAPP_PRIMÆR}>
        {venter ? 'Lagrer …' : knappetekst}
      </button>
    </form>
  )
}
