import type { Metadata } from 'next'
import { krevAdmin } from '@/lib/auth'
import { hentHendelser, hentSystemer } from '@/lib/data'
import {
  Kodebit,
  Kort,
  KortTittel,
  Merke,
  Seksjonstittel,
  TomTilstand,
} from '@/components/ui'
import { visDatoTid } from '@/lib/format'

export const metadata: Metadata = { title: 'Logg' }

/** Handlinger som endrer noe utenfor adminbordet får rødt merke. */
const alvorlig = ['bruker.', 'hemmelighet.']

export default async function LoggSide() {
  await krevAdmin()

  const [hendelser, systemer] = await Promise.all([
    hentHendelser(200),
    hentSystemer(true),
  ])

  const systemNavn = new Map(systemer.map((s) => [s.id, s.navn]))

  return (
    <div className="space-y-7">
      <Seksjonstittel under="Hva som er gjort fra adminbordet. Kan ikke redigeres eller slettes – en logg den loggede kan endre er ingen logg.">
        Logg
      </Seksjonstittel>

      {hendelser.length === 0 ? (
        <TomTilstand tittel="Ingen hendelser ennå">
          Loggen fylles etter hvert som systemer legges inn, nøkler lagres og
          brukere opprettes.
        </TomTilstand>
      ) : (
        <Kort>
          <KortTittel>{hendelser.length} siste hendelser</KortTittel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-[var(--kant)] text-left">
                  <th className="px-4 py-2 text-xs font-bold tracking-widest uppercase">
                    Når
                  </th>
                  <th className="px-4 py-2 text-xs font-bold tracking-widest uppercase">
                    Handling
                  </th>
                  <th className="px-4 py-2 text-xs font-bold tracking-widest uppercase">
                    System
                  </th>
                  <th className="px-4 py-2 text-xs font-bold tracking-widest uppercase">
                    Av
                  </th>
                  <th className="px-4 py-2 text-xs font-bold tracking-widest uppercase">
                    Detaljer
                  </th>
                </tr>
              </thead>
              <tbody>
                {hendelser.map((h) => (
                  <tr
                    key={h.id}
                    className="border-b border-[var(--kant)] last:border-b-0"
                  >
                    <td className="hm-tall px-4 py-2 whitespace-nowrap text-[var(--blekk-svak)]">
                      {visDatoTid(h.tid)}
                    </td>
                    <td className="px-4 py-2">
                      <Merke
                        type={
                          alvorlig.some((p) => h.handling.startsWith(p))
                            ? 'svart'
                            : 'nøytral'
                        }
                      >
                        {h.handling}
                      </Merke>
                    </td>
                    <td className="px-4 py-2">
                      {h.systemId
                        ? (systemNavn.get(h.systemId) ?? '(slettet)')
                        : '–'}
                    </td>
                    <td className="px-4 py-2 text-[var(--blekk-svak)]">
                      {h.utfortAvEpost ?? '–'}
                    </td>
                    <td className="px-4 py-2">
                      {Object.keys(h.detaljer).length > 0 ? (
                        <Kodebit>{JSON.stringify(h.detaljer)}</Kodebit>
                      ) : (
                        <span className="text-[var(--blekk-svak)]">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Kort>
      )}
    </div>
  )
}
