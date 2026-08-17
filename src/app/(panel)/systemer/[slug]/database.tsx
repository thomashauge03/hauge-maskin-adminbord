import { hentDatabasedetalj } from '@/lib/systemdetalj'
import type { System } from '@/lib/typer'
import { Kort, KortTittel, Merke, Tallkort, type MerkeType } from '@/components/ui'
import type { TjenesteHelse } from '@/lib/plattform/supabase-api'
import { visBytes, visProsent } from '@/lib/format'

type TjenesteStatus = TjenesteHelse['status']

const tjenesteFarge: Record<TjenesteStatus, MerkeType> = {
  ACTIVE_HEALTHY: 'grønn',
  COMING_UP: 'gul',
  UNHEALTHY: 'rød',
}

const tjenesteOrd: Record<TjenesteStatus, string> = {
  ACTIVE_HEALTHY: 'oppe',
  COMING_UP: 'starter',
  UNHEALTHY: 'nede',
}

/**
 * Databasedelen av systemsiden. Egen komponent bak sin egen
 * Suspense-grense, slik at den kan strømme inn uavhengig av
 * utrullingsdelen – de spør to ulike leverandører, og den ene skal ikke
 * måtte vente på den andre.
 */
export async function Databasedel({ system }: { system: System }) {
  const d = await hentDatabasedetalj(system)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tallkort
          merkelapp="Brukere"
          verdi={d.brukere ?? '–'}
          under={
            d.brukereSiste30 !== null
              ? `${d.brukereSiste30} innlogget siste 30 dager`
              : undefined
          }
        />
        <Tallkort
          merkelapp="Databasestørrelse"
          verdi={visBytes(d.logiskStørrelse)}
          under="pg_database_size"
        />
        <Tallkort
          merkelapp="Disk brukt"
          verdi={d.disk ? visProsent(d.disk.andelBrukt) : '–'}
          under={
            d.disk
              ? `${visBytes(d.disk.brukteBytes)} av ${visBytes(d.disk.totaltBytes)}`
              : undefined
          }
        />
        <Tallkort
          merkelapp="Tabeller"
          verdi={d.tabeller?.length ?? '–'}
          under={`i ${system.dbSkjema}-skjemaet`}
        />
      </div>

      {/*
        Deler systemet database med et annet, er brukertallet og
        databasestørrelsen over felles for begge. Uten denne linja ser det ut
        som lagersystemet alene bruker 11 MB og har fire brukere – tall som i
        virkeligheten gjelder heimesida like mye.
      */}
      {system.dbSkjema !== 'public' && (
        <p className="text-sm text-[var(--blekk-svak)]">
          Deler database med et annet system. Tabellista gjelder{' '}
          {system.dbSkjema}-skjemaet, men brukere, størrelse og disk er felles
          for hele prosjektet.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Kort>
          <KortTittel>Tjenester</KortTittel>
          {d.tjenesterFeil ? (
            <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
              {d.tjenesterFeil}
            </p>
          ) : (d.tjenester ?? []).length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
              Ingen tjenester rapportert.
            </p>
          ) : (
            <ul>
              {(d.tjenester ?? []).map((t) => (
                <li
                  key={t.navn}
                  className="flex items-center justify-between gap-3 border-t border-[var(--kant)] px-4 py-2 first:border-t-0"
                >
                  <span className="hm-kode">{t.navn}</span>
                  <span className="flex items-center gap-2">
                    {t.feil && (
                      <span className="text-xs text-[var(--blekk-svak)]">
                        {t.feil}
                      </span>
                    )}
                    {/* Tre tilstander, ikke to. En tjeneste som starter
                        opp er ikke nede, og skal ikke se ut som det. */}
                    <Merke type={tjenesteFarge[t.status]}>
                      {tjenesteOrd[t.status]}
                    </Merke>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Kort>

        <Kort>
          <KortTittel>Største tabeller</KortTittel>
          {d.spørringFeil ? (
            <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
              {d.spørringFeil}
            </p>
          ) : (d.tabeller ?? []).length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
              Ingen tabeller i public-skjemaet.
            </p>
          ) : (
            <ul>
              {(d.tabeller ?? []).map((t) => (
                <li
                  key={t.tabell}
                  className="flex items-center justify-between gap-3 border-t border-[var(--kant)] px-4 py-1.5 first:border-t-0"
                >
                  <span className="hm-kode">{t.tabell}</span>
                  {/* «Anslag» står der fordi tallet kommer fra
                      Postgres sin statistikk, ikke fra count(*). Uten
                      merkelappen ville et avvik på ti rader sett ut som
                      en feil i adminbordet. */}
                  <span className="hm-tall text-sm text-[var(--blekk-svak)]">
                    ~{t.rader.toLocaleString('nb-NO')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Kort>
      </div>

      {d.diskFeil && (
        <p className="text-xs text-[var(--blekk-svak)]">Diskbruk: {d.diskFeil}</p>
      )}
    </div>
  )
}

export function DatabaseSkjelett() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-4 py-3"
          >
            <div className="hm-skjelett h-3 w-20" />
            <div className="hm-skjelett mt-2 h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div
            key={i}
            className="border-2 border-[var(--kant)] bg-[var(--flate-opp)]"
          >
            <div className="border-b-2 border-[var(--kant)] px-4 py-3">
              <div className="hm-skjelett h-4 w-24" />
            </div>
            <div className="space-y-2 px-4 py-3">
              <div className="hm-skjelett h-3 w-full" />
              <div className="hm-skjelett h-3 w-4/5" />
              <div className="hm-skjelett h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
