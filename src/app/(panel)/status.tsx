import Link from 'next/link'
import { hentOversikt } from '@/lib/helse'
import type { System } from '@/lib/typer'
import { Feilstripe, Kodebit, Kort, KortTittel, Merke, Tallkort } from '@/components/ui'
import { Kildelinje, TilstandsMerke } from '@/components/tilstand'
import { førsteLinje, visSiden } from '@/lib/format'

/**
 * Statusdelen av oversikten. Egen komponent fordi den er den eneste
 * trege delen av siden: to eksterne API-kall. Ligger den i en egen
 * Suspense-grense, kommer tittel og meny med én gang og status strømmer
 * inn etterpå – i stedet for at hele siden står tom i to sekunder.
 */
export async function Statusdel({ systemer }: { systemer: System[] }) {
  const oversikt = await hentOversikt(systemer)

  // Tidspunktet kommer med målingen, ikke fra klokka her. Se
  // kommentaren på Oversikt.hentetMs for hvorfor.
  const naa = oversikt.hentetMs

  const antall = {
    nede: oversikt.systemer.filter((s) => s.samletTilstand === 'nede').length,
    advarsel: oversikt.systemer.filter((s) => s.samletTilstand === 'advarsel')
      .length,
    ok: oversikt.systemer.filter((s) => s.samletTilstand === 'ok').length,
    uvisst: oversikt.systemer.filter((s) => s.samletTilstand === 'ukjent').length,
  }

  /*
   * Sorterer verst først. Oversikten skal svare på «er noe galt» før den
   * svarer på «hva har jeg» – står de i registerrekkefølge, må man lese
   * alle tolv kortene for å finne det ene røde.
   */
  const rekkefølge = { nede: 0, advarsel: 1, ukjent: 2, ok: 3 } as const
  const sortert = [...oversikt.systemer].sort(
    (a, b) =>
      rekkefølge[a.samletTilstand] - rekkefølge[b.samletTilstand] ||
      a.system.sortering - b.system.sortering,
  )

  return (
    <div className="space-y-6">
      {(oversikt.supabaseFeil || oversikt.vercelFeil) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {oversikt.supabaseFeil && (
            <Feilstripe tittel="Supabase-integrasjonen svarer ikke">
              {oversikt.supabaseFeil}{' '}
              <Link href="/innstillinger" className="underline">
                Sjekk oppsettet
              </Link>
              .
            </Feilstripe>
          )}
          {oversikt.vercelFeil && (
            <Feilstripe tittel="Vercel-integrasjonen svarer ikke">
              {oversikt.vercelFeil}{' '}
              <Link href="/innstillinger" className="underline">
                Sjekk oppsettet
              </Link>
              .
            </Feilstripe>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tallkort merkelapp="Nede" verdi={antall.nede} />
        <Tallkort merkelapp="Se på" verdi={antall.advarsel} />
        <Tallkort merkelapp="OK" verdi={antall.ok} />
        <Tallkort merkelapp="Uvisst" verdi={antall.uvisst} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortert.map(({ system, maalinger, samletTilstand }) => (
          <Kort key={system.id} className="hm-inn">
            <KortTittel handling={<TilstandsMerke tilstand={samletTilstand} />}>
              <Link href={`/systemer/${system.slug}`} className="hover:underline">
                {system.navn}
              </Link>
            </KortTittel>

            {maalinger.length === 0 ? (
              <p className="px-4 py-4 text-sm text-[var(--blekk-svak)]">
                Ingen kilder registrert. Legg inn Supabase- eller
                Vercel-prosjekt for å få status.
              </p>
            ) : (
              <div>
                {maalinger.map((m) => (
                  <Kildelinje
                    key={m.kilde}
                    kilde={m.kilde}
                    tilstand={m.tilstand}
                    melding={m.melding}
                  />
                ))}
              </div>
            )}

            {/* Siste utrulling nederst: det er det som endrer seg
                oftest, og det første man vil vite når noe plutselig
                oppfører seg annerledes. */}
            {maalinger
              .filter((m) => m.kilde === 'vercel' && m.detaljer.opprettet)
              .map((m) => (
                <p
                  key="deploy"
                  className="border-t border-[var(--kant)] bg-[var(--flate-2)] px-4 py-2 text-xs text-[var(--blekk-svak)]"
                >
                  {visSiden(String(m.detaljer.opprettet), naa)}
                  {m.detaljer.commitMelding
                    ? ` · ${førsteLinje(String(m.detaljer.commitMelding), 40)}`
                    : ''}
                </p>
              ))}
          </Kort>
        ))}
      </div>

      {(oversikt.ukobledeSupabase.length > 0 ||
        oversikt.ukobledeVercel.length > 0) && (
        <Kort>
          <KortTittel>Finnes ute, står ikke i registeret</KortTittel>
          <div className="space-y-4 px-4 py-4">
            {/* Dette er halve grunnen til at adminbordet finnes: å se
                hva som ligger og koster penger uten at noen husker det. */}
            {oversikt.ukobledeSupabase.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
                  Supabase-prosjekter
                </p>
                <ul className="space-y-1.5">
                  {oversikt.ukobledeSupabase.map((p) => (
                    <li key={p.ref} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{p.navn}</span>
                      <Kodebit>{p.ref}</Kodebit>
                      <Merke>{p.region}</Merke>
                      <Merke
                        type={p.status === 'ACTIVE_HEALTHY' ? 'grønn' : 'gul'}
                      >
                        {p.status}
                      </Merke>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {oversikt.ukobledeVercel.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
                  Vercel-prosjekter
                </p>
                <ul className="space-y-1.5">
                  {oversikt.ukobledeVercel.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{p.navn}</span>
                      {p.rammeverk && <Merke>{p.rammeverk}</Merke>}
                      {p.githubRepo && <Kodebit>{p.githubRepo}</Kodebit>}
                      {p.produksjon && (
                        <span className="text-xs text-[var(--blekk-svak)]">
                          {visSiden(p.produksjon.opprettet, naa)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-sm text-[var(--blekk-svak)]">
              Legg dem inn under{' '}
              <Link href="/systemer" className="underline">
                Systemer
              </Link>{' '}
              om de skal overvåkes.
            </p>
          </div>
        </Kort>
      )}
    </div>
  )
}

/** Plassholder mens de to API-kallene går. Samme form som kortene, så
    layouten ikke hopper når innholdet kommer. */
export function StatusSkjelett({ antall }: { antall: number }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-4 py-3"
          >
            <div className="hm-skjelett h-3 w-16" />
            <div className="hm-skjelett mt-2 h-8 w-10" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: Math.max(antall, 3) }, (_, i) => (
          <div
            key={i}
            className="border-2 border-[var(--kant)] bg-[var(--flate-opp)]"
          >
            <div className="border-b-2 border-[var(--kant)] px-4 py-3">
              <div className="hm-skjelett h-4 w-32" />
            </div>
            <div className="space-y-2 px-4 py-3">
              <div className="hm-skjelett h-3 w-full" />
              <div className="hm-skjelett h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
