'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FELT, KNAPP_LITEN, Kort, KortTittel, Merke } from '@/components/ui'
import {
  lagSøk,
  lesValg,
  skrivValg,
  tellStatus,
  type Appbruker,
  type AppStatus,
  type Filtervalg,
} from '@/lib/appsok'

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
}: {
  brukere: Appbruker[]
  grupper: { id: string; navn: string }[]
}) {
  const params = useSearchParams()
  const søkestreng = params.toString()
  const gruppenavn = useMemo(() => new Map(grupper.map((g) => [g.id, g.navn])), [grupper])
  const kjente = useMemo(() => new Set(grupper.map((g) => g.id)), [grupper])

  const [valg, settValgTilstand] = useState<Filtervalg>(() => lesValg(params, kjente))
  const [sistSett, settSistSett] = useState(søkestreng)

  /* Adressen er endret utenfra – tallet i menyen, eller «Se medlemmer» fra
     Grupper. Da gjelder det lenka sier, ikke det som stod i feltene. */
  if (søkestreng !== sistSett) {
    settSistSett(søkestreng)
    settValgTilstand(lesValg(params, kjente))
  }

  const søk = useMemo(() => lagSøk(brukere, gruppenavn), [brukere, gruppenavn])
  const treff = useMemo(() => søk(valg), [søk, valg])
  const antall = useMemo(() => tellStatus(brukere), [brukere])

  function settValg(endring: Partial<Filtervalg>) {
    const nye = { ...valg, ...endring }
    const streng = skrivValg(nye)
    settValgTilstand(nye)
    settSistSett(streng.replace(/^\?/, ''))
    // Next.js fanger replaceState, så useSearchParams følger med – uten en
    // rundtur til serveren per tastetrykk.
    window.history.replaceState(null, '', `${window.location.pathname}${streng}`)
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
    </div>
  )
}
