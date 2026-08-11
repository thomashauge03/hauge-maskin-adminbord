import { hentUtrullingsdetalj } from '@/lib/systemdetalj'
import type { System } from '@/lib/typer'
import { Kodebit, Kort, KortTittel, Merke } from '@/components/ui'
import { førsteLinje, visDatoTid } from '@/lib/format'
import type { DeployTilstand } from '@/lib/plattform/vercel'

/** Samme fargevalg som på oversikten, men her vises Vercels eget ord. */
const deployFarge: Record<DeployTilstand, 'grønn' | 'gul' | 'rød'> = {
  READY: 'grønn',
  BUILDING: 'gul',
  QUEUED: 'gul',
  INITIALIZING: 'gul',
  CANCELED: 'gul',
  ERROR: 'rød',
  BLOCKED: 'rød',
  DELETED: 'rød',
}

export async function Utrullingsdel({ system }: { system: System }) {
  const d = await hentUtrullingsdetalj(system)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Kort className="lg:col-span-2">
        <KortTittel>Siste utrullinger</KortTittel>
        {d.deployerFeil ? (
          <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
            {d.deployerFeil}
          </p>
        ) : (d.deployer ?? []).length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
            Ingen produksjonsutrullinger funnet.
          </p>
        ) : (
          <ul>
            {(d.deployer ?? []).map((dep) => (
              <li
                key={dep.id}
                className="border-t border-[var(--kant)] px-4 py-2.5 first:border-t-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {førsteLinje(dep.commitMelding, 52)}
                  </span>
                  <Merke type={deployFarge[dep.tilstand]}>{dep.tilstand}</Merke>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-[var(--blekk-svak)]">
                  <span>{visDatoTid(dep.opprettet)}</span>
                  {dep.commitGren && <Kodebit>{dep.commitGren}</Kodebit>}
                  {dep.commitSha && (
                    <Kodebit>{dep.commitSha.slice(0, 7)}</Kodebit>
                  )}
                  {dep.url && (
                    // Vercel sender vertsnavnet uten skjema, så https://
                    // må settes på – ellers blir lenken relativ.
                    <a
                      href={`https://${dep.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      åpne
                    </a>
                  )}
                </div>
                {dep.feilmelding && (
                  <p className="mt-1 text-xs text-hm-red-ink">{dep.feilmelding}</p>
                )}
                {dep.aliasFeil && (
                  <p className="mt-1 text-xs text-hm-red-ink">
                    Domenet ble ikke tildelt: {dep.aliasFeil}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Kort>

      <Kort>
        <KortTittel>Domener</KortTittel>
        {d.domenerFeil ? (
          <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
            {d.domenerFeil}
          </p>
        ) : (d.domener ?? []).length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
            Ingen egne produksjonsdomener. Bruker Vercels egen adresse.
          </p>
        ) : (
          <ul>
            {(d.domener ?? []).map((dom) => (
              <li
                key={dom.navn}
                className="flex items-center justify-between gap-2 border-t border-[var(--kant)] px-4 py-2 first:border-t-0"
              >
                <a
                  href={`https://${dom.navn}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hm-kode underline"
                >
                  {dom.navn}
                </a>
                <Merke type={dom.bekreftet ? 'grønn' : 'gul'}>
                  {dom.bekreftet ? 'bekreftet' : 'venter'}
                </Merke>
              </li>
            ))}
          </ul>
        )}
      </Kort>
    </div>
  )
}

export function UtrullingSkjelett() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="border-2 border-[var(--kant)] bg-[var(--flate-opp)] lg:col-span-2">
        <div className="border-b-2 border-[var(--kant)] px-4 py-3">
          <div className="hm-skjelett h-4 w-36" />
        </div>
        <div className="space-y-3 px-4 py-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="hm-skjelett h-3.5 w-3/4" />
              <div className="hm-skjelett h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div className="border-2 border-[var(--kant)] bg-[var(--flate-opp)]">
        <div className="border-b-2 border-[var(--kant)] px-4 py-3">
          <div className="hm-skjelett h-4 w-20" />
        </div>
        <div className="space-y-2 px-4 py-3">
          <div className="hm-skjelett h-3 w-full" />
          <div className="hm-skjelett h-3 w-2/3" />
        </div>
      </div>
    </div>
  )
}
