'use client'

import type { Systemvalg } from '@/lib/gjoremal'

export type Valg = { systemId: string | null; frist: string | null; viktig: boolean }

const KONTROLL =
  'min-h-9 border-2 border-[var(--kant)] bg-[var(--flate)] px-2 text-sm text-[var(--blekk)] transition-colors hover:border-[var(--kant-sterk)] focus-visible:border-hm-red pointer-coarse:min-h-11'

/**
 * System, frist og viktig – felles for nytt gjøremål og redigering, så de
 * ser like ut og ikke driver fra hverandre.
 *
 * Alle er valgfrie og står som små kontroller ved siden av hverandre, ikke
 * som et skjema med etiketter over: det skal fortsatt gå an å skrive inn
 * noe og trykke Enter uten å se på dem.
 */
export function Valglinje({
  systemer,
  valg,
  onEndre,
}: {
  systemer: Systemvalg[]
  valg: Valg
  onEndre: (valg: Valg) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={valg.systemId ?? ''}
        onChange={(e) => onEndre({ ...valg, systemId: e.target.value || null })}
        aria-label="System"
        className={`${KONTROLL} max-w-[14rem] ${valg.systemId ? '' : 'text-[var(--blekk-svak)]'}`}
      >
        <option value="">Uten system</option>
        {systemer.map((s) => (
          <option key={s.id} value={s.id}>
            {s.navn}
          </option>
        ))}
      </select>

      <span className="flex items-center">
        <input
          type="date"
          value={valg.frist ?? ''}
          onChange={(e) => onEndre({ ...valg, frist: e.target.value || null })}
          aria-label="Frist"
          // Uten dette tegner Chrome kalenderikonet svart på mørk flate.
          style={{ colorScheme: 'light dark' }}
          className={`${KONTROLL} ${valg.frist ? '' : 'text-[var(--blekk-svak)]'}`}
        />
        {valg.frist && (
          <button
            type="button"
            onClick={() => onEndre({ ...valg, frist: null })}
            aria-label="Fjern frist"
            title="Fjern frist"
            className="-ml-0.5 flex min-h-9 items-center border-2 border-l-0 border-[var(--kant)] px-2 text-[var(--blekk-svak)] hover:text-[var(--blekk)] pointer-coarse:min-h-11"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />
            </svg>
          </button>
        )}
      </span>

      <button
        type="button"
        aria-pressed={valg.viktig}
        onClick={() => onEndre({ ...valg, viktig: !valg.viktig })}
        className={`${KONTROLL} flex items-center gap-1.5 font-semibold ${
          valg.viktig ? 'border-hm-red! bg-hm-red text-white' : 'text-[var(--blekk-svak)]'
        }`}
      >
        <span aria-hidden="true" className="hm-display text-base leading-none">
          !
        </span>
        Viktig
      </button>
    </div>
  )
}
