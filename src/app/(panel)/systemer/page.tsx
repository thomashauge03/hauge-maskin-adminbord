import type { Metadata } from 'next'
import Link from 'next/link'
import { krevAdmin } from '@/lib/auth'
import { hentSystemer } from '@/lib/data'
import {
  Kodebit,
  Kort,
  KortTittel,
  Merke,
  Seksjonstittel,
  TomTilstand,
} from '@/components/ui'
import {
  opprettSystem,
  settOvervakes,
  settSystemAktiv,
  slettSystem,
} from './actions'
import { SystemSkjema } from './system-skjema'
import { RadHandlinger } from './rad-handlinger'

export const metadata: Metadata = { title: 'Systemer' }

export default async function SystemerSide() {
  const meg = await krevAdmin()
  // Med inaktive: dette er registeret, ikke oversikten. Skal man skru et
  // system tilbake på, må man kunne se at det finnes.
  const systemer = await hentSystemer(true)

  return (
    <div className="space-y-7">
      <Seksjonstittel under="Registeret over hvor hvert system har databasen sin, Vercel-prosjektet sitt og koden sin.">
        Systemer
      </Seksjonstittel>

      {systemer.length === 0 ? (
        <TomTilstand tittel="Registeret er tomt">
          Kjør migrasjonene i <Kodebit>supabase/migrations</Kodebit> for å legge
          inn systemene som alt finnes, eller legg til det første manuelt
          nedenfor.
        </TomTilstand>
      ) : (
        <Kort>
          <KortTittel>{systemer.length} systemer</KortTittel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-[var(--kant)] text-left">
                  <th className="px-4 py-2 text-xs font-bold tracking-widest uppercase">
                    Navn
                  </th>
                  <th className="px-4 py-2 text-xs font-bold tracking-widest uppercase">
                    Supabase
                  </th>
                  <th className="px-4 py-2 text-xs font-bold tracking-widest uppercase">
                    Vercel
                  </th>
                  <th className="px-4 py-2 text-xs font-bold tracking-widest uppercase">
                    Repo
                  </th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {systemer.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-[var(--kant)] last:border-b-0"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/systemer/${s.slug}`}
                        className="font-semibold hover:underline"
                      >
                        {s.navn}
                      </Link>
                      {s.beskrivelse && (
                        <p className="max-w-xs text-xs text-[var(--blekk-svak)]">
                          {s.beskrivelse}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.supabaseProsjektRef ? (
                        <Kodebit>{s.supabaseProsjektRef}</Kodebit>
                      ) : (
                        <span className="text-[var(--blekk-svak)]">–</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.vercelProsjektNavn || s.vercelProsjektId ? (
                        <Kodebit>
                          {s.vercelProsjektNavn ?? s.vercelProsjektId}
                        </Kodebit>
                      ) : (
                        <span className="text-[var(--blekk-svak)]">–</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.githubRepo ? (
                        <a
                          href={`https://github.com/${s.githubRepo}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hm-kode underline"
                        >
                          {s.githubRepo}
                        </a>
                      ) : (
                        <span className="text-[var(--blekk-svak)]">–</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="flex flex-wrap justify-end gap-1.5">
                          {!s.aktiv && <Merke>Skjult</Merke>}
                          {s.aktiv && !s.overvakes && <Merke>Uten tilsyn</Merke>}
                        </span>
                        {meg.rolle === 'eier' && (
                          <RadHandlinger
                            navn={s.navn}
                            aktiv={s.aktiv}
                            overvakes={s.overvakes}
                            settAktiv={async (aktiv: boolean) => {
                              'use server'
                              await settSystemAktiv(s.id, aktiv)
                            }}
                            settTilsyn={async (overvakes: boolean) => {
                              'use server'
                              await settOvervakes(s.id, overvakes)
                            }}
                            slett={async () => {
                              'use server'
                              await slettSystem(s.id)
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Kort>
      )}

      {meg.rolle === 'eier' ? (
        <Kort>
          <KortTittel>Nytt system</KortTittel>
          <div className="px-4 py-5">
            <SystemSkjema handling={opprettSystem} knappetekst="Opprett system" />
          </div>
        </Kort>
      ) : (
        <p className="text-sm text-[var(--blekk-svak)]">
          Bare en eier kan endre registeret.
        </p>
      )}
    </div>
  )
}
