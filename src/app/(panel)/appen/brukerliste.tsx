'use client'

import Link from 'next/link'
import { startTransition, useCallback, useMemo, useOptimistic, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FELT, Feilstripe, KNAPP_LITEN, Kort, KortTittel, Merke } from '@/components/ui'
import {
  lagSøk,
  lesValg,
  skrivValg,
  tellStatus,
  type Appbruker,
  type AppStatus,
  type Filtervalg,
} from '@/lib/appsok'
import { Handlingslinje } from './handlingslinje'
import type { Tilstand } from './tilstand'

const STATUS: Record<AppStatus, { type: 'gul' | 'grønn' | 'rød'; ord: string }> = {
  venter: { type: 'gul', ord: 'Venter' },
  godkjent: { type: 'grønn', ord: 'Slipper inn' },
  sperra: { type: 'rød', ord: 'Stengt ute' },
}

/* Oslo-tid på begge sider. Uten den skriver serveren (UTC) og nettleseren
   hver sin dato for den som registrerte seg like før midnatt, og React
   klager på at teksten ikke stemmer. */
const dato = new Intl.DateTimeFormat('nb-NO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Oslo',
})

const VELGER = 'border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-2 py-1.5 text-sm'

/**
 * Alle som har registrert seg i appen, med søk og filter.
 *
 * Søket skjer her i nettleseren, over en slank rad per person – se
 * lib/appsok.ts for hvorfor. Filteret står i adressen, så tilbake-knappen
 * virker og menyen kan lenke rett til køen.
 */
export function Brukerliste({
  brukere,
  grupper,
  erEier,
}: {
  brukere: Appbruker[]
  grupper: { id: string; navn: string }[]
  erEier: boolean
}) {
  const params = useSearchParams()
  const gruppenavn = useMemo(() => new Map(grupper.map((g) => [g.id, g.navn])), [grupper])
  const kjente = useMemo(() => new Set(grupper.map((g) => g.id)), [grupper])

  /* Adressen er eneste kilde, så en lenke utenfra – tallet i menyen, «Se
     medlemmer» fra Grupper, tilbake-knappen – alltid gjelder. useOptimistic
     viser det brukeren nettopp valgte til routeren har fått med seg adressen.
     En egen kopi i useState ligger ett steg foran useSearchParams (routeren
     oppdaterer seg i en overgang), og hver tast ble da rullet tilbake og satt
     inn igjen, med markøren på slutten av feltet. */
  const fraAdressen = useMemo(() => lesValg(params, kjente), [params, kjente])
  const [valg, settOptimistiskValg] = useOptimistic(
    fraAdressen,
    (_gammelt, nytt: Filtervalg) => nytt,
  )

  const søk = useMemo(() => lagSøk(brukere, gruppenavn), [brukere, gruppenavn])
  const treff = useMemo(() => søk(valg), [søk, valg])
  const antall = useMemo(() => tellStatus(brukere), [brukere])

  const [valgte, settValgte] = useState<Set<string>>(() => new Set())
  const [melding, settMelding] = useState<Tilstand | null>(null)

  // Valgte som ikke finnes lenger – slettet i mellomtiden – skal ikke telle.
  const finnes = useMemo(() => new Set(brukere.map((b) => b.id)), [brukere])
  const synlige = useMemo(() => new Set(treff.map((b) => b.id)), [treff])
  const valgteNå = useMemo(() => [...valgte].filter((id) => finnes.has(id)), [valgte, finnes])
  const skjulte = valgteNå.filter((id) => !synlige.has(id)).length
  const alleTreffValgt = treff.length > 0 && treff.every((b) => valgte.has(b.id))

  /* Utvalget tømmes bare når alt gikk. Feilet noen, står de fortsatt valgt,
     så du kan prøve igjen uten å lete dem fram. */
  const ferdig = useCallback((svar: Tilstand) => {
    settMelding(svar.ok || svar.feil ? svar : null)
    if (!svar.feil) settValgte(new Set())
  }, [])

  function veksle(id: string) {
    settValgte((før) => {
      const ny = new Set(før)
      if (ny.has(id)) ny.delete(id)
      else ny.add(id)
      return ny
    })
  }

  function veksleAlleTreff() {
    settValgte((før) => {
      const ny = new Set(før)
      for (const b of treff) {
        if (alleTreffValgt) ny.delete(b.id)
        else ny.add(b.id)
      }
      return ny
    })
  }

  function settValg(endring: Partial<Filtervalg>) {
    const nye = { ...valg, ...endring }
    startTransition(() => {
      settOptimistiskValg(nye)
      // Next.js fanger replaceState, så useSearchParams følger med – uten en
      // rundtur til serveren per tastetrykk.
      window.history.replaceState(null, '', `${window.location.pathname}${skrivValg(nye)}`)
    })
  }

  return (
    <div className="space-y-4">
      <Kort>
        <div className="space-y-3 px-4 py-4">
          <input
            type="search"
            value={valg.q}
            onChange={(e) => settValg({ q: e.target.value })}
            placeholder="Søk på navn, e-post, telefon eller gruppe"
            aria-label="Søk blant brukerne"
            className={FELT}
          />
          <div className="flex flex-wrap items-center gap-2">
            {(['alle', 'venter', 'godkjent', 'sperra'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={valg.status === s}
                onClick={() => settValg({ status: s })}
                className={`${KNAPP_LITEN} ${valg.status === s ? 'border-[var(--kant-sterk)] bg-[var(--flate-2)]' : ''}`}
              >
                {s === 'alle' ? `Alle (${brukere.length})` : `${STATUS[s].ord} (${antall[s]})`}
              </button>
            ))}
            <select
              value={valg.gruppe}
              onChange={(e) => settValg({ gruppe: e.target.value })}
              aria-label="Gruppe"
              className={VELGER}
            >
              <option value="alle">Alle grupper</option>
              <option value="uten">Uten gruppe</option>
              {grupper.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.navn}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={valg.ukjent}
                onChange={(e) => settValg({ ukjent: e.target.checked })}
              />
              Bare ukjente
            </label>
            <select
              value={valg.sortering}
              onChange={(e) => settValg({ sortering: e.target.value === 'navn' ? 'navn' : 'nyeste' })}
              aria-label="Sortering"
              className={VELGER}
            >
              <option value="nyeste">Nyeste først</option>
              <option value="navn">Navn A–Å</option>
            </select>
          </div>
        </div>
      </Kort>

      <Kort>
        <KortTittel
          handling={
            <span className="text-xs text-[var(--blekk-svak)]">
              Viser {treff.length} av {brukere.length}
            </span>
          }
        >
          Brukere
        </KortTittel>

        {melding?.ok && (
          <p className="border-b border-[var(--kant)] px-4 py-2 text-sm">{melding.ok}</p>
        )}
        {melding?.feil && (
          <div className="px-4 py-3">
            <Feilstripe tittel="Ikke alt gikk">{melding.feil}</Feilstripe>
          </div>
        )}

        {erEier && treff.length > 0 && (
          <label className="flex items-center gap-2 border-b border-[var(--kant)] px-4 py-2 text-sm">
            <input type="checkbox" checked={alleTreffValgt} onChange={veksleAlleTreff} />
            {alleTreffValgt ? 'Fjern valget av treffene' : `Velg alle ${treff.length} treff`}
          </label>
        )}

        {treff.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--blekk-svak)]">
            {brukere.length === 0
              ? 'Ingen har registrert seg ennå. Nye som registrerer seg i mobilappen dukker opp her.'
              : 'Ingen passer søket.'}
          </p>
        ) : (
          <ul>
            {treff.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 border-b border-[var(--kant)] px-4 py-3 last:border-b-0"
              >
                {erEier && (
                  <input
                    type="checkbox"
                    checked={valgte.has(b.id)}
                    onChange={() => veksle(b.id)}
                    aria-label={`Velg ${b.navn}`}
                    className="h-4 w-4 flex-none"
                  />
                )}
                <Link href={`/appen/person/${b.id}`} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate">{b.navn}</strong>
                    <Merke type={STATUS[b.status].type}>{STATUS[b.status].ord}</Merke>
                    {grupper
                      .filter((g) => b.grupper.includes(g.id))
                      .map((g) => (
                        <Merke key={g.id}>{g.navn}</Merke>
                      ))}
                    {/* «Ukjent» bare i køen: der er det en advarsel før du
                        slipper noen inn. På godkjente kunder, som sjelden
                        finnes i de andre systemene, ville det vært støy. */}
                    {b.kjentFraFør ? (
                      <Merke>Har tilgang andre steder</Merke>
                    ) : (
                      b.status === 'venter' && <Merke type="svart">Ukjent</Merke>
                    )}
                    {b.unntak > 0 && <Merke type="gul">{b.unntak} unntak</Merke>}
                  </div>
                  <div className="text-sm text-[var(--blekk-svak)]">
                    {b.epost}
                    {b.telefon ? ` · ${b.telefon}` : ''} · registrert{' '}
                    {dato.format(new Date(b.registrert))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Kort>

      {erEier && valgteNå.length > 0 && (
        <Handlingslinje valgte={valgteNå} skjulte={skjulte} grupper={grupper} ferdig={ferdig} />
      )}
    </div>
  )
}
