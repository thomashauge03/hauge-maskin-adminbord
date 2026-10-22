'use client'

import { useState } from 'react'
import { FELT, Kort, KortTittel, Merke } from '@/components/ui'
import { visSiden } from '@/lib/format'
import { passerSøk } from '@/lib/personsok'
import { PersonPanel } from './person-panel'
import type { CelleVisning, PersonVisning, SystemVisning } from './visning'

function Cellemerke({ celle }: { celle: CelleVisning | undefined }) {
  if (!celle || celle.merke.tekst === '–') {
    return <span className="text-[var(--blekk-svak)]">–</span>
  }
  return <Merke type={celle.merke.merke}>{celle.merke.tekst}</Merke>
}

/**
 * Hvem har tilgang hvor – og inngangen til å endre det.
 *
 * Cellene er bare merker. Et trykk på en rad, eller en celle, åpner
 * personpanelet; cellen utvider seg ikke lenger til et skjema inne i tabellen,
 * som skjøv alle kolonnene ut av stilling og gjorde matrisen uleselig mens man
 * jobbet i den.
 *
 * Søket gjelder både tabellen og lista på telefon, så de viser det samme.
 */
export function Tilgangsmatrise({
  personer,
  systemer,
  erEier,
  naa,
  lest,
}: {
  personer: PersonVisning[]
  systemer: SystemVisning[]
  erEier: boolean
  naa: number
  /** «5/6 system lest» – sier at en kolonne kan mangle. */
  lest: string
}) {
  const [søk, settSøk] = useState('')
  const [åpen, settÅpen] = useState<{ epost: string; system: string | null } | null>(null)

  const treff = personer.filter((p) => passerSøk(p.epost, søk))
  // Hentes fra lista ved hver tegning, så panelet viser det serveren nettopp
  // hentet etter en endring – ikke en kopi fra da det ble åpnet. Er personen
  // slettet fra alle systemene, står panelet likevel, så svaret «er slettet»
  // ikke forsvinner sammen med personen.
  const valgt = åpen
    ? (personer.find((p) => p.epost === åpen.epost) ?? {
        epost: åpen.epost,
        antallMedTilgang: 0,
        sistInnlogget: null,
        celler: {},
      })
    : undefined

  const handling = erEier ? 'Åpne for å endre' : 'Åpne for detaljer'

  return (
    <Kort>
      <KortTittel handling={<span className="text-xs text-[var(--blekk-svak)]">{lest}</span>}>
        Hvem har tilgang hvor
      </KortTittel>

      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--kant)] px-4 py-3">
        <input
          type="search"
          value={søk}
          onChange={(e) => settSøk(e.target.value)}
          placeholder="Søk på e-post"
          aria-label="Søk på e-post"
          className={`${FELT} max-w-sm py-2`}
        />
        <p role="status" className="text-xs text-[var(--blekk-svak)]">
          Viser {treff.length} av {personer.length}
          {erEier ? ' · trykk på en person for å endre rolle, fjerne tilgang eller slette' : ''}
        </p>
      </div>

      {treff.length === 0 && (
        <p className="px-4 py-6 text-sm text-[var(--blekk-svak)]">Ingen passer søket.</p>
      )}

      {/* ── PC: matrisen ── Den trenger rundt 150 px per system; under lg er
          lista per person svaret. */}
      {treff.length > 0 && (
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--kant)]">
                <th className="sticky left-0 z-10 bg-[var(--flate-opp)] px-4 py-2 text-left text-xs font-bold tracking-widest uppercase">
                  E-post
                </th>
                {systemer.map((s) => (
                  <th
                    key={s.id}
                    scope="col"
                    className="px-2 py-2 text-center text-xs font-bold tracking-widest uppercase"
                  >
                    {s.navn}
                  </th>
                ))}
                <th className="px-4 py-2 text-right text-xs font-bold tracking-widest uppercase">
                  Sist inne
                </th>
              </tr>
            </thead>
            <tbody>
              {treff.map((p) => (
                <tr
                  key={p.epost}
                  className="group border-b border-[var(--kant)] last:border-b-0 hover:bg-[var(--flate-2)]"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[var(--flate-opp)] p-0 text-left font-semibold group-hover:bg-[var(--flate-2)]"
                  >
                    <button
                      type="button"
                      onClick={() => settÅpen({ epost: p.epost, system: null })}
                      title={handling}
                      className="w-full cursor-pointer px-4 py-2 text-left underline-offset-2 hover:underline"
                    >
                      {p.epost}
                    </button>
                  </th>
                  {systemer.map((s) => (
                    <td key={s.id} className="p-0 text-center">
                      <button
                        type="button"
                        onClick={() => settÅpen({ epost: p.epost, system: s.id })}
                        title={`${p.celler[s.id]?.merke.forklaring ?? `Ingen konto og ingen tilgang i ${s.navn}.`} ${handling}.`}
                        className="w-full cursor-pointer px-2 py-2"
                      >
                        <Cellemerke celle={p.celler[s.id]} />
                      </button>
                    </td>
                  ))}
                  <td className="hm-tall px-4 py-2 text-right text-xs text-[var(--blekk-svak)]">
                    {visSiden(p.sistInnlogget, naa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Telefon og nettbrett: én rad per person ── */}
      <ul className="lg:hidden">
        {treff.map((p) => (
          <li key={p.epost} className="border-b border-[var(--kant)] last:border-b-0">
            <button
              type="button"
              onClick={() => settÅpen({ epost: p.epost, system: null })}
              className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--flate-2)]"
            >
              <span className="min-w-0">
                <span className="block font-semibold break-all">{p.epost}</span>
                <span className="block text-xs text-[var(--blekk-svak)]">
                  Tilgang i {p.antallMedTilgang} av {systemer.length} systemer
                  {p.sistInnlogget ? ` · sist inne ${visSiden(p.sistInnlogget, naa)}` : ''}
                </span>
              </span>
              <span aria-hidden="true" className="text-lg text-[var(--blekk-svak)]">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>

      {valgt && (
        <PersonPanel
          person={valgt}
          systemer={systemer}
          erEier={erEier}
          naa={naa}
          fokusSystem={åpen?.system ?? null}
          lukk={() => settÅpen(null)}
        />
      )}
    </Kort>
  )
}
