import { hentAlleBrukere, samlePåEpost } from '@/lib/brukere'
import type { System } from '@/lib/typer'
import { Feilstripe, Kort, KortTittel, Merke, Tallkort } from '@/components/ui'
import { visSiden } from '@/lib/format'
import { settSperret } from './actions'
import { BrukerHandlinger } from './bruker-handlinger'

/**
 * Brukerne i alle systemene. Egen komponent bak en Suspense-grense
 * fordi den spør én database per system – den trege delen av siden.
 */
export async function Brukerliste({
  systemer,
  erEier,
}: {
  systemer: System[]
  erEier: boolean
}) {
  const { lister, hentetMs: naa } = await hentAlleBrukere(systemer)
  const personer = samlePåEpost(lister)

  const feilende = lister.filter((l) => l.feil)
  const medDatabase = lister.filter((l) => l.brukere)

  return (
    <div className="space-y-6">
      {feilende.length > 0 && (
        <Feilstripe tittel={`Kunne ikke lese brukere fra ${feilende.length} system`}>
          <ul className="space-y-0.5">
            {feilende.map((l) => (
              <li key={l.system.id}>
                <strong>{l.system.navn}:</strong> {l.feil}
              </li>
            ))}
          </ul>
        </Feilstripe>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tallkort merkelapp="Personer" verdi={personer.length} under="unike e-poster" />
        <Tallkort
          merkelapp="Kontoer"
          verdi={medDatabase.reduce((s, l) => s + (l.brukere?.length ?? 0), 0)}
          under="til sammen i alle systemer"
        />
        <Tallkort
          merkelapp="I flere systemer"
          verdi={personer.filter((p) => p.iSystem.size > 1).length}
          under="har flere passord i dag"
        />
        <Tallkort
          merkelapp="Systemer lest"
          verdi={`${medDatabase.length}/${lister.length}`}
        />
      </div>

      {/* ── Matrisen ──
          Personer nedover, systemer bortover. Dette er visningen som
          svarer på «hvem har tilgang til hva», og den som viser hvor
          mange passord den felles innloggingen faktisk vil erstatte. */}
      <Kort>
        <KortTittel>Hvem har tilgang hvor</KortTittel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--kant)]">
                <th className="px-4 py-2 text-left text-xs font-bold tracking-widest uppercase">
                  E-post
                </th>
                {medDatabase.map((l) => (
                  <th
                    key={l.system.id}
                    className="px-2 py-2 text-center text-xs font-bold tracking-widest uppercase"
                  >
                    {l.system.navn}
                  </th>
                ))}
                <th className="px-4 py-2 text-right text-xs font-bold tracking-widest uppercase">
                  Sist inne
                </th>
              </tr>
            </thead>
            <tbody>
              {personer.map((p) => (
                <tr
                  key={p.epost}
                  className="border-b border-[var(--kant)] last:border-b-0"
                >
                  <td className="px-4 py-2 font-semibold">{p.epost}</td>
                  {medDatabase.map((l) => {
                    const bruker = p.iSystem.get(l.system.slug)
                    return (
                      <td key={l.system.id} className="px-2 py-2 text-center">
                        {!bruker ? (
                          <span className="text-[var(--blekk-svak)]">–</span>
                        ) : bruker.aktivISystem === false ? (
                          <Merke type="rød">sperret</Merke>
                        ) : (
                          <Merke type="grønn">ja</Merke>
                        )}
                      </td>
                    )
                  })}
                  <td className="hm-tall px-4 py-2 text-right text-xs text-[var(--blekk-svak)]">
                    {visSiden(p.sistInnlogget, naa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Kort>

      {/* ── Per system, med handlinger ── */}
      {erEier &&
        medDatabase.map((l) => (
          <Kort key={l.system.id}>
            <KortTittel
              handling={
                <span className="text-xs text-[var(--blekk-svak)]">
                  {l.brukere?.length ?? 0} kontoer
                </span>
              }
            >
              {l.system.navn}
            </KortTittel>

            {(l.brukere ?? []).length === 0 ? (
              <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
                Ingen brukere i dette systemet.
              </p>
            ) : (
              <ul>
                {(l.brukere ?? []).map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--kant)] px-4 py-2 first:border-t-0"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">
                        {b.epost ?? '(uten e-post)'}
                      </span>
                      {b.aktivISystem === false && (
                        <Merke type="rød">sperret</Merke>
                      )}
                      {!b.epostBekreftet && <Merke type="gul">ubekreftet</Merke>}
                      <span className="text-xs text-[var(--blekk-svak)]">
                        sist inne {visSiden(b.sistInnlogget, naa)}
                      </span>
                    </span>

                    <BrukerHandlinger
                      systemId={l.system.id}
                      brukerId={b.id}
                      epost={b.epost ?? b.id}
                      sperret={b.aktivISystem === false}
                      settSperret={async (sperret: boolean) => {
                        'use server'
                        await settSperret(l.system.id, b.id, sperret)
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Kort>
        ))}
    </div>
  )
}

export function BrukerlisteSkjelett() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-4 py-3"
          >
            <div className="hm-skjelett h-3 w-20" />
            <div className="hm-skjelett mt-2 h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="border-2 border-[var(--kant)] bg-[var(--flate-opp)]">
        <div className="border-b-2 border-[var(--kant)] px-4 py-3">
          <div className="hm-skjelett h-4 w-44" />
        </div>
        <div className="space-y-2 px-4 py-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="hm-skjelett h-3.5 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
