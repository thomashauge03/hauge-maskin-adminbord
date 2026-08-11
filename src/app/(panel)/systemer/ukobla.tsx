import { hentUkobledeProsjekter } from '@/lib/helse'
import type { System } from '@/lib/typer'
import { Kodebit, Kort, KortTittel, Merke } from '@/components/ui'

/**
 * Prosjekter som finnes hos Supabase eller Vercel, men ikke i registeret.
 *
 * Bor her og ikke på forsiden. Forsiden skal svare på «er noe galt med
 * det jeg driver»; dette er en oppryddingsjobb, og den hører der man
 * rydder. Egen Suspense-grense, siden den koster fem API-kall.
 *
 * Sammenligningen går mot ALLE systemer, også skjulte og utgåtte – et
 * prosjekt som er registrert på et skjult system er ikke ukjent, og skal
 * ikke dukke opp her og be om oppmerksomhet på nytt.
 */
export async function Ukobla({ systemer }: { systemer: System[] }) {
  const u = await hentUkobledeProsjekter(systemer)

  if (u.supabase.length === 0 && u.vercel.length === 0) {
    return (
      <Kort>
        <KortTittel>Finnes ute, står ikke i registeret</KortTittel>
        <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
          Ingenting. Alt tokenene ser er registrert.
        </p>
      </Kort>
    )
  }

  return (
    <Kort>
      <KortTittel
        handling={
          <Merke type="gul">
            {u.supabase.length + u.vercel.length} uregistrert
          </Merke>
        }
      >
        Finnes ute, står ikke i registeret
      </KortTittel>
      <div className="space-y-4 px-4 py-4">
        {u.supabase.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
              Supabase-prosjekter
            </p>
            <ul className="space-y-1.5">
              {u.supabase.map((p) => (
                <li
                  key={p.ref}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="font-semibold">{p.navn}</span>
                  <Kodebit>{p.ref}</Kodebit>
                  <Merke type={p.status === 'ACTIVE_HEALTHY' ? 'grønn' : 'gul'}>
                    {p.status}
                  </Merke>
                  <span className="hm-kode text-xs text-[var(--blekk-svak)]">
                    {p.organisasjonSlug}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {u.vercel.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
              Vercel-prosjekter
            </p>
            <ul className="space-y-1.5">
              {u.vercel.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="font-semibold">{p.navn}</span>
                  {p.rammeverk && <Merke>{p.rammeverk}</Merke>}
                  {p.githubRepo && <Kodebit>{p.githubRepo}</Kodebit>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* En ACTIVE_HEALTHY database ingen husker teller mot grensen på to
            aktive prosjekter per gratiskonto. Det er den konkrete kostnaden
            av å la dem ligge. */}
        <p className="text-sm text-[var(--blekk-svak)]">
          Legg dem inn nedenfor om de skal overvåkes – eller rydd dem bort.
          Et aktivt prosjekt teller mot grensen på to per gratiskonto, selv
          om ingen bruker det.
        </p>
      </div>
    </Kort>
  )
}

export function UkoblaSkjelett() {
  return (
    <div className="border-2 border-[var(--kant)] bg-[var(--flate-opp)]">
      <div className="border-b-2 border-[var(--kant)] px-4 py-3">
        <div className="hm-skjelett h-4 w-56" />
      </div>
      <div className="space-y-2 px-4 py-4">
        <div className="hm-skjelett h-3 w-full" />
        <div className="hm-skjelett h-3 w-3/4" />
      </div>
    </div>
  )
}
