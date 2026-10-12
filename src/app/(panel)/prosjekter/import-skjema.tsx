'use client'

import { useState, useTransition } from 'react'
import { delCsv, tolkEksport, type Tolkning } from '@/lib/prosjekter/tolk-eksport'
import { ETIKETT, KNAPP_PRIMÆR, Merke } from '@/components/ui'
import { importerProsjekter, type Svar } from './actions'

/**
 * Fila leses i nettleseren og bare prosjektene sendes. Da forlater ikke en
 * eksport med timer, lønn eller annet som tilfeldigvis står i samme ark,
 * maskinen til den som laster opp.
 */
export function ImportSkjema() {
  const [tolkning, settTolkning] = useState<Tolkning | null>(null)
  const [filnavn, settFilnavn] = useState('')
  const [svar, settSvar] = useState<Svar | null>(null)
  const [venter, start] = useTransition()

  async function velgFil(fil: File | undefined) {
    settSvar(null)
    settTolkning(null)
    if (!fil) return
    settFilnavn(fil.name)
    try {
      const rader = /\.csv$/i.test(fil.name)
        ? delCsv(await fil.text())
        : await (await import('read-excel-file/browser')).readSheet(fil)
      settTolkning(tolkEksport(rader as unknown[][]))
    } catch (e) {
      settTolkning({ ok: false, feil: `Kunne ikke lese fila: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  function importer() {
    if (!tolkning?.ok) return
    start(async () => settSvar(await importerProsjekter(tolkning.prosjekter)))
  }

  return (
    <div className="space-y-4 p-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--blekk-svak)]">
        <li>Åpne Prosjekter i SmartDok og vis alle, også avsluttede.</li>
        <li>Eksporter til Excel.</li>
        <li>Velg fila her. Ingenting lagres før du trykker Importer.</li>
      </ol>

      <label className="block">
        <span className={ETIKETT}>Eksport fra SmartDok (.xlsx eller .csv)</span>
        <input
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => velgFil(e.target.files?.[0])}
          className="block w-full text-sm file:mr-3 file:border-2 file:border-[var(--kant)] file:bg-[var(--flate-opp)] file:px-3 file:py-2 file:text-sm file:font-semibold"
        />
      </label>

      {tolkning && !tolkning.ok && (
        <p role="alert" className="text-sm font-semibold text-hm-red-ink">
          {tolkning.feil}
        </p>
      )}

      {tolkning?.ok && (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{tolkning.prosjekter.length}</strong> prosjekter i {filnavn}
            {tolkning.prosjekter.length > 0 &&
              `, ${tolkning.prosjekter.filter((p) => p.aktiv).length} aktive`}
            .
            {tolkning.hoppetOver > 0 && ` ${tolkning.hoppetOver} rader uten nummer eller navn hoppes over.`}
            {tolkning.dubletter > 0 && ` ${tolkning.dubletter} nummer stod flere ganger, den siste brukes.`}
          </p>
          <p className="flex flex-wrap gap-1.5 text-xs">
            {Object.entries(tolkning.kolonner).map(([felt, kolonne]) => (
              <Merke key={felt}>
                {felt}: {kolonne}
              </Merke>
            ))}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className={ETIKETT}>
                <tr>
                  <th className="py-1 pr-3">Nr</th>
                  <th className="py-1 pr-3">Navn</th>
                  <th className="py-1 pr-3">Kunde</th>
                  <th className="py-1">Aktiv</th>
                </tr>
              </thead>
              <tbody>
                {tolkning.prosjekter.slice(0, 5).map((p) => (
                  <tr key={p.nummer} className="border-t border-[var(--kant)]">
                    <td className="hm-kode py-1 pr-3">{p.nummer}</td>
                    <td className="py-1 pr-3">{p.navn}</td>
                    <td className="py-1 pr-3">{p.kunde ?? ''}</td>
                    <td className="py-1">{p.aktiv ? 'Ja' : 'Nei'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={importer}
            disabled={venter || tolkning.prosjekter.length === 0}
            className={KNAPP_PRIMÆR}
          >
            {venter ? 'Importerer og synker …' : `Importer ${tolkning.prosjekter.length} prosjekter`}
          </button>
        </div>
      )}

      {svar?.feil && (
        <p role="alert" className="text-sm font-semibold text-hm-red-ink">
          {svar.feil}
        </p>
      )}
      {svar?.ok && (
        <p role="status" className="text-sm font-semibold">
          {svar.ok}
        </p>
      )}
    </div>
  )
}
