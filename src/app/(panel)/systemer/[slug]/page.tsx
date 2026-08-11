import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { krevAdmin } from '@/lib/auth'
import { hentHemmeligheter, hentSystem } from '@/lib/data'
import {
  Kodebit,
  Kort,
  KortTittel,
  Merke,
  Seksjonstittel,
} from '@/components/ui'
import {
  endreSystem,
  hentNøklerAutomatisk,
  lagreHemmelighet,
  slettHemmelighet,
  slettSystem,
} from '../actions'
import { SystemSkjema } from '../system-skjema'
import { Databasedel, DatabaseSkjelett } from './database'
import { Utrullingsdel, UtrullingSkjelett } from './utrulling'
import { Hemmeligheter } from './hemmeligheter'
import { SlettSystem } from './slett'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const system = await hentSystem(slug)
  return { title: system?.navn ?? 'Ukjent system' }
}

export default async function SystemSide({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const meg = await krevAdmin()
  // params er en Promise i Next 16. Synkron lesing er fjernet, ikke bare
  // frarådet, så den må ventes på.
  const { slug } = await params

  const system = await hentSystem(slug)
  if (!system) notFound()

  const erEier = meg.rolle === 'eier'
  // Nøkler er eier-informasjon. En drift-bruker skal ikke se hvilke
  // nøkler som finnes heller – bare det er en opplysning om angrepsflaten.
  const hemmeligheter = erEier ? await hentHemmeligheter(system.id) : []

  return (
    <div className="space-y-7">
      <Seksjonstittel
        under={system.beskrivelse ?? undefined}
        handling={
          <div className="flex flex-wrap items-center gap-2">
            {system.produksjonsUrl && (
              <a
                href={system.produksjonsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline"
              >
                Åpne appen
              </a>
            )}
            {system.githubRepo && (
              <a
                href={`https://github.com/${system.githubRepo}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline"
              >
                GitHub
              </a>
            )}
            {system.supabaseProsjektRef && (
              <a
                href={`https://supabase.com/dashboard/project/${system.supabaseProsjektRef}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline"
              >
                Supabase
              </a>
            )}
          </div>
        }
      >
        {system.navn}
      </Seksjonstittel>

      <div className="flex flex-wrap items-center gap-2">
        {!system.aktiv && <Merke type="gul">Inaktiv</Merke>}
        {system.aktiv && !system.overvakes && <Merke>Uten tilsyn</Merke>}
        {system.supabaseProsjektRef && (
          <Kodebit>{system.supabaseProsjektRef}</Kodebit>
        )}
        {system.vercelProsjektNavn && (
          <Kodebit>{system.vercelProsjektNavn}</Kodebit>
        )}
      </div>

      {system.notat && (
        <Kort>
          <KortTittel>Notat</KortTittel>
          <p className="px-4 py-3 text-sm whitespace-pre-wrap">{system.notat}</p>
        </Kort>
      )}

      {/* ── Database ── */}
      <section className="space-y-3">
        <h2 className="hm-display text-xl">Database</h2>
        {system.supabaseProsjektRef ? (
          <Suspense fallback={<DatabaseSkjelett />}>
            <Databasedel prosjektRef={system.supabaseProsjektRef} />
          </Suspense>
        ) : (
          <p className="text-sm text-[var(--blekk-svak)]">
            Ingen Supabase-database registrert på dette systemet.
          </p>
        )}
      </section>

      {/* ── Utrulling ──
          Egen Suspense-grense fra databasen: de spør to ulike
          leverandører, og en treg Vercel skal ikke holde igjen
          databasetallene som alt er klare. */}
      <section className="space-y-3">
        <h2 className="hm-display text-xl">Utrulling</h2>
        {system.vercelProsjektId || system.vercelProsjektNavn ? (
          <Suspense fallback={<UtrullingSkjelett />}>
            <Utrullingsdel system={system} />
          </Suspense>
        ) : (
          <p className="text-sm text-[var(--blekk-svak)]">
            Ingen Vercel-prosjekt registrert på dette systemet.
          </p>
        )}
      </section>

      {/* ── Nøkler ── */}
      {erEier && (
        <section className="space-y-3">
          <h2 className="hm-display text-xl">Tilgang</h2>
          <Hemmeligheter
            hemmeligheter={hemmeligheter}
            harProsjektRef={Boolean(system.supabaseProsjektRef)}
            lagre={lagreHemmelighet.bind(null, system.id)}
            hentAutomatisk={
              system.supabaseProsjektRef
                ? hentNøklerAutomatisk.bind(
                    null,
                    system.id,
                    system.supabaseProsjektRef,
                  )
                : null
            }
            slett={async (hemmelighetId: string) => {
              'use server'
              await slettHemmelighet(hemmelighetId, system.id)
            }}
          />
        </section>
      )}

      {/* ── Rediger ── */}
      {erEier && (
        <section className="space-y-3">
          <h2 className="hm-display text-xl">Rediger</h2>
          <Kort>
            <div className="px-4 py-5">
              <SystemSkjema
                system={system}
                handling={endreSystem.bind(null, system.id)}
              />
            </div>
          </Kort>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Link href="/systemer" className="text-sm underline">
              Tilbake til registeret
            </Link>
            <SlettSystem
              navn={system.navn}
              slett={async () => {
                'use server'
                await slettSystem(system.id)
              }}
            />
          </div>
        </section>
      )}
    </div>
  )
}
