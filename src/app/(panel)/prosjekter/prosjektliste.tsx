'use client'

import { useActionState, useDeferredValue, useState, useTransition } from 'react'
import { ETIKETT, FELT, FELT_KODE, KNAPP_LITEN, KNAPP_PRIMÆR, Merke } from '@/components/ui'
import { lagreProsjekt, synkNå, type Svar } from './actions'

export type Rad = {
  id: string
  nummer: string
  navn: string
  kunde: string | null
  adresse: string | null
  aktiv: boolean
  kilde: string
}

const KILDE: Record<string, string> = {
  smartdok: 'SmartDok',
  adminbord: 'Adminbord',
  tilbudssystem: 'Tilbud',
  lagersystem: 'Lager',
  rorlager: 'Rørlager',
  utleie: 'Utleie',
  varslingskontroll: 'Varsling',
}

function Melding({ svar }: { svar: Svar }) {
  if (svar.feil)
    return (
      <p role="alert" className="text-sm font-semibold text-hm-red-ink">
        {svar.feil}
      </p>
    )
  if (svar.ok)
    return (
      <p role="status" className="text-sm font-semibold">
        {svar.ok}
      </p>
    )
  return null
}

export function ProsjektSkjema({ prosjekt, ferdig }: { prosjekt?: Rad; ferdig?: () => void }) {
  const [svar, send, venter] = useActionState(async (forrige: Svar, data: FormData) => {
    const s = await lagreProsjekt(forrige, data)
    if (s.ok && ferdig) ferdig()
    return s
  }, {})

  return (
    <form action={send} className="grid gap-3 sm:grid-cols-2">
      {prosjekt && <input type="hidden" name="id" value={prosjekt.id} />}
      <label className="block">
        <span className={ETIKETT}>Prosjektnummer</span>
        <input
          name="nummer"
          required
          defaultValue={prosjekt?.nummer}
          readOnly={!!prosjekt}
          inputMode="numeric"
          autoComplete="off"
          className={FELT_KODE}
          aria-describedby={prosjekt ? undefined : 'nummer-hjelp'}
        />
        {!prosjekt && (
          <span id="nummer-hjelp" className="mt-1 block text-xs text-[var(--blekk-svak)]">
            Samme nummer som i SmartDok. Kan ikke endres etterpå.
          </span>
        )}
      </label>
      <label className="block">
        <span className={ETIKETT}>Navn</span>
        <input name="navn" required maxLength={200} defaultValue={prosjekt?.navn} autoComplete="off" className={FELT} />
      </label>
      <label className="block">
        <span className={ETIKETT}>Kunde</span>
        <input name="kunde" defaultValue={prosjekt?.kunde ?? ''} autoComplete="off" className={FELT} />
      </label>
      <label className="block">
        <span className={ETIKETT}>Adresse</span>
        <input name="adresse" defaultValue={prosjekt?.adresse ?? ''} autoComplete="off" className={FELT} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="aktiv" defaultChecked={prosjekt?.aktiv ?? true} className="size-5" />
        Aktivt prosjekt
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={venter} className={KNAPP_PRIMÆR}>
          {venter ? 'Lagrer og synker …' : prosjekt ? 'Lagre' : 'Opprett'}
        </button>
        {ferdig && (
          <button type="button" onClick={ferdig} className={KNAPP_LITEN}>
            Avbryt
          </button>
        )}
        <Melding svar={svar} />
      </div>
    </form>
  )
}

export function SynkKnapp() {
  const [svar, settSvar] = useState<Svar>({})
  const [venter, start] = useTransition()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={venter}
        onClick={() => start(async () => settSvar(await synkNå()))}
        className={KNAPP_LITEN}
      >
        {venter ? 'Synker …' : 'Synk nå'}
      </button>
      <Melding svar={svar} />
    </div>
  )
}

export function Prosjektliste({ rader }: { rader: Rad[] }) {
  const [søk, settSøk] = useState('')
  const [visInaktive, settVisInaktive] = useState(false)
  const [åpen, settÅpen] = useState<string | null>(null)
  const utsatt = useDeferredValue(søk)

  const ord = utsatt.toLocaleLowerCase('nb').split(/\s+/).filter(Boolean)
  const synlige = rader.filter((r) => {
    if (!visInaktive && !r.aktiv) return false
    const tekst = `${r.nummer} ${r.navn} ${r.kunde ?? ''} ${r.adresse ?? ''}`.toLocaleLowerCase('nb')
    return ord.every((o) => tekst.includes(o))
  })

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border-b-2 border-[var(--kant)] p-4">
        <label className="block min-w-60 flex-1">
          <span className={ETIKETT}>Søk</span>
          <input
            type="search"
            value={søk}
            onChange={(e) => settSøk(e.target.value)}
            placeholder="Nummer, navn eller kunde"
            className={FELT}
          />
        </label>
        <label className="flex items-center gap-2 pb-3 text-sm">
          <input type="checkbox" checked={visInaktive} onChange={(e) => settVisInaktive(e.target.checked)} className="size-5" />
          Vis avsluttede
        </label>
      </div>

      <p className="px-4 pt-3 text-xs text-[var(--blekk-svak)]" aria-live="polite">
        Viser {synlige.length} av {rader.length}
      </p>

      <ul>
        {synlige.slice(0, 300).map((r) => (
          <li key={r.id} className="border-b border-[var(--kant)] px-4 py-2.5">
            {åpen === r.id ? (
              <ProsjektSkjema prosjekt={r} ferdig={() => settÅpen(null)} />
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="hm-kode w-20 shrink-0 text-sm">{r.nummer}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{r.navn}</span>
                  {r.kunde && <span className="text-sm text-[var(--blekk-svak)]"> · {r.kunde}</span>}
                </span>
                {!r.aktiv && <Merke>Avsluttet</Merke>}
                <Merke>{KILDE[r.kilde] ?? r.kilde}</Merke>
                <button type="button" onClick={() => settÅpen(r.id)} className={KNAPP_LITEN}>
                  Endre<span className="sr-only"> {r.navn}</span>
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {synlige.length > 300 && (
        <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
          Viser de første 300. Søk for å finne resten.
        </p>
      )}
    </div>
  )
}
