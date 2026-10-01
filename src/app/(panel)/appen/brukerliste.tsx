'use client'

import Link from 'next/link'
import { startTransition, useCallback, useEffect, useMemo, useOptimistic, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FELT, Feilstripe, KNAPP_LITEN, Kort, KortTittel, Merke } from '@/components/ui'
import { lagAdresseskriver } from '@/lib/adresseskriver'
import { visDato } from '@/lib/format'
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

const VELGER = 'border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-2 py-1.5 text-sm'

/**
 * Svaret på en handling på mange, nederst i vinduet.
 *
 * Lista kan være to hundre rader lang. Går handlingen bra, tømmes utvalget og
 * handlingslinja forsvinner, så et svar øverst i kortet ville stått utenfor
 * synsfeltet akkurat når det skulle vært lest. Høyden er begrenset fordi en
 * feilliste med mange navn ellers kan dekke hele skjermen.
 */
function Svar({ svar, lukk }: { svar: Tilstand; lukk: () => void }) {
  return (
    <div className="flex items-start gap-3 border-2 border-[var(--kant-sterk)] bg-[var(--flate-opp)] px-4 py-3 shadow-lg">
      <div className="max-h-[35vh] min-w-0 flex-1 space-y-2 overflow-y-auto">
        {svar.ok && (
          <p role="status" className="text-sm">
            {svar.ok}
          </p>
        )}
        {svar.feil && (
          <div role="alert">
            <Feilstripe tittel="Ikke alt gikk">{svar.feil}</Feilstripe>
          </div>
        )}
      </div>
      <button type="button" onClick={lukk} className={`${KNAPP_LITEN} flex-none`}>
        Lukk
      </button>
    </div>
  )
}

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

  /* Adressen skrives høyst én gang i sekundet – se lib/adresseskriver.ts.

     Et skriv som venter, holder alle overganger tilbake, også navigasjonen
     når noen trykker på en lenke. Når det så kommer, legger Next.js lista
     over navigasjonen, og klikket blir borte. Derfor skrives det som venter,
     ved hvert klikk – fanget på vei ned, før React og lenken ser det.

     Går nettleseren tilbake mens et skriv venter, skal det ikke skrives: det
     ville lagt filteret over adressen vi kom tilbake til. */
  const [skriver] = useState(() =>
    lagAdresseskriver((adresse) => window.history.replaceState(null, '', adresse)),
  )
  useEffect(() => {
    window.addEventListener('click', skriver.nå, true)
    window.addEventListener('popstate', skriver.slipp)
    return () => {
      window.removeEventListener('click', skriver.nå, true)
      window.removeEventListener('popstate', skriver.slipp)
      skriver.slipp()
    }
  }, [skriver])

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
    // Overgangen varer til adressen er skrevet, så useOptimistic holder på
    // valget så lenge. Next.js fanger replaceState, så useSearchParams følger
    // med – uten en rundtur til serveren.
    startTransition(async () => {
      settOptimistiskValg(nye)
      await skriver.skriv(`${window.location.pathname}${skrivValg(nye)}`)
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
                    {b.telefon ? ` · ${b.telefon}` : ''} · registrert {visDato(b.registrert)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Kort>

      {/* Svaret og linja deler én klebrig boks. Hver for seg ville de begge festet
          seg til nederkanten og lagt seg oppå hverandre. */}
      {(melding || (erEier && valgteNå.length > 0)) && (
        <div className="sticky bottom-0 z-10 space-y-2">
          {melding && <Svar svar={melding} lukk={() => settMelding(null)} />}
          {erEier && valgteNå.length > 0 && (
            <Handlingslinje valgte={valgteNå} skjulte={skjulte} grupper={grupper} ferdig={ferdig} />
          )}
        </div>
      )}
    </div>
  )
}
