import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { krevAdmin } from '@/lib/auth'
import { hentSystemer } from '@/lib/data'
import type { System } from '@/lib/typer'
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
import { Ukobla, UkoblaSkjelett } from './ukobla'
import { RadHandlinger } from './rad-handlinger'

export const metadata: Metadata = { title: 'Systemer' }

const TOM = <span className="text-[var(--blekk-svak)]">–</span>

/* Innholdet i en rad, delt mellom tabellen på PC og kortene på telefon. */
function Supabaseref({ s }: { s: System }) {
  return s.supabaseProsjektRef ? <Kodebit>{s.supabaseProsjektRef}</Kodebit> : TOM
}

function Vercelprosjekt({ s }: { s: System }) {
  return s.vercelProsjektNavn || s.vercelProsjektId ? (
    <Kodebit>{s.vercelProsjektNavn ?? s.vercelProsjektId}</Kodebit>
  ) : (
    TOM
  )
}

function Repolenke({ s }: { s: System }) {
  return s.githubRepo ? (
    <a
      href={`https://github.com/${s.githubRepo}`}
      target="_blank"
      rel="noreferrer"
      className="hm-kode underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
    >
      {s.githubRepo}
    </a>
  ) : (
    TOM
  )
}

function Systemmerker({ s }: { s: System }) {
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      {!s.aktiv && <Merke>Skjult</Merke>}
      {s.aktiv && !s.overvakes && <Merke>Uten tilsyn</Merke>}
    </span>
  )
}

export default async function SystemerSide() {
  const meg = await krevAdmin()
  // Med inaktive: dette er registeret, ikke oversikten. Skal man skru et
  // system tilbake på, må man kunne se at det finnes.
  const systemer = await hentSystemer(true)

  /* Måltilstanden bindes her, der vi vet hva raden står i nå – ikke som en
     veksling i nettleseren, som bommer hvis siden ble hentet før noen andre
     endret systemet. Ett element per system, vist både i tabellen og i
     kortet; bare én av dem syns om gangen. */
  const handlinger = new Map(
    systemer.map((s) => [
      s.id,
      meg.rolle === 'eier' ? (
        <RadHandlinger
          navn={s.navn}
          aktiv={s.aktiv}
          overvakes={s.overvakes}
          settAktiv={settSystemAktiv.bind(null, s.id, !s.aktiv)}
          settTilsyn={settOvervakes.bind(null, s.id, !s.overvakes)}
          slett={slettSystem.bind(null, s.id)}
        />
      ) : null,
    ]),
  )

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
          <div className="hidden overflow-x-auto md:block">
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
                      <Supabaseref s={s} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Vercelprosjekt s={s} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Repolenke s={s} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col items-end gap-1.5">
                        <Systemmerker s={s} />
                        {handlinger.get(s.id)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Telefon: ett kort per system. I tabellen ble prosjekt-ID-ene
              brutt over tre linjer, og repo og knappene lå utenfor
              skjermen. */}
          <ul className="md:hidden">
            {systemer.map((s) => (
              <li
                key={s.id}
                className="space-y-2 border-b border-[var(--kant)] px-4 py-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/systemer/${s.slug}`}
                    className="inline-flex items-center font-semibold hover:underline pointer-coarse:min-h-11"
                  >
                    {s.navn}
                  </Link>
                  <Systemmerker s={s} />
                </div>
                {s.beskrivelse && (
                  <p className="text-xs text-[var(--blekk-svak)]">{s.beskrivelse}</p>
                )}
                <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
                  <dt className="text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
                    Supabase
                  </dt>
                  <dd className="min-w-0 break-all">
                    <Supabaseref s={s} />
                  </dd>
                  <dt className="text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
                    Vercel
                  </dt>
                  <dd className="min-w-0 break-all">
                    <Vercelprosjekt s={s} />
                  </dd>
                  <dt className="text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
                    Repo
                  </dt>
                  <dd className="min-w-0 break-all">
                    <Repolenke s={s} />
                  </dd>
                </dl>
                {handlinger.get(s.id)}
              </li>
            ))}
          </ul>
        </Kort>
      )}

      {/* Uregistrerte prosjekter hoerer her, ikke pa forsiden. Egen
          Suspense-grense fordi den koster fem API-kall. */}
      <Suspense fallback={<UkoblaSkjelett />}>
        <Ukobla systemer={systemer} />
      </Suspense>

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
