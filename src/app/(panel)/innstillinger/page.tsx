import { Suspense } from 'react'
import type { Metadata } from 'next'
import { krevAdmin } from '@/lib/auth'
import { hentSupabaseProsjekter, supabaseApiKlar } from '@/lib/plattform/supabase-api'
import { hentVercelProsjekter, vercelKlar } from '@/lib/plattform/vercel'
import {
  Kodebit,
  Kort,
  KortTittel,
  Merke,
  Seksjonstittel,
} from '@/components/ui'

export const metadata: Metadata = { title: 'Innstillinger' }

/**
 * Innstillingssiden er lesbar, ikke redigerbar.
 *
 * Tokens settes som miljøvariabler på Vercel, ikke i grensesnittet. Et
 * skjema her ville betydd at adminbordet kunne endre nøkkelen som gir
 * adgang til alle prosjektene – fra en nettleser, uten utrulling. Det er
 * for stor makt for et skjema. Siden viser i stedet HVA som mangler og
 * hvor det settes.
 */
export default async function InnstillingerSide() {
  await krevAdmin()

  const supabase = supabaseApiKlar()
  const vercel = vercelKlar()

  return (
    <div className="space-y-7">
      <Seksjonstittel under="Tokens settes som miljøvariabler på Vercel og i .env.local lokalt – ikke her. Denne siden viser om de virker.">
        Innstillinger
      </Seksjonstittel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Kort>
          <KortTittel
            handling={
              <Merke type={supabase.klar ? 'grønn' : 'rød'}>
                {supabase.klar ? 'satt' : 'mangler'}
              </Merke>
            }
          >
            Supabase Management
          </KortTittel>
          <div className="space-y-3 px-4 py-4 text-sm">
            <p>
              <Kodebit>SUPABASE_MANAGEMENT_TOKEN</Kodebit>
            </p>
            {supabase.klar ? (
              <Suspense
                fallback={
                  <p className="text-[var(--blekk-svak)]">Prøver tokenet …</p>
                }
              >
                <SupabaseProve />
              </Suspense>
            ) : (
              <p className="text-[var(--blekk-svak)]">{supabase.grunn}</p>
            )}
            <p className="text-xs text-[var(--blekk-svak)]">
              Uten dette virker ikke databasestatus, brukerlisten eller
              automatisk henting av nøkler. Lages på{' '}
              <a
                href="https://supabase.com/dashboard/account/tokens"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                supabase.com/dashboard/account/tokens
              </a>
              .
            </p>
          </div>
        </Kort>

        <Kort>
          <KortTittel
            handling={
              <Merke type={vercel.klar ? 'grønn' : 'rød'}>
                {vercel.klar ? 'satt' : 'mangler'}
              </Merke>
            }
          >
            Vercel
          </KortTittel>
          <div className="space-y-3 px-4 py-4 text-sm">
            <p>
              <Kodebit>VERCEL_TOKEN</Kodebit> og <Kodebit>VERCEL_TEAM_ID</Kodebit>
            </p>
            {vercel.klar ? (
              <Suspense
                fallback={
                  <p className="text-[var(--blekk-svak)]">Prøver tokenet …</p>
                }
              >
                <VercelProve />
              </Suspense>
            ) : (
              <p className="text-[var(--blekk-svak)]">{vercel.grunn}</p>
            )}
            <p className="text-xs text-[var(--blekk-svak)]">
              Uten dette vises ingen utrullingsstatus. Token lages på{' '}
              <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                vercel.com/account/tokens
              </a>
              . Team-ID-en står i teaminnstillingene.
            </p>
          </div>
        </Kort>
      </div>

      <Kort>
        <KortTittel>Krypteringsnøkkel</KortTittel>
        <div className="space-y-2 px-4 py-4 text-sm">
          <p>
            <Kodebit>KRYPTONOKKEL</Kodebit> – 32 byte base64. Krypterer de
            andre systemenes service role-nøkler før de lagres.
          </p>
          {/* Selve nøkkelen vises aldri, ikke engang forkortet: den er
              det ene som gjør en databasedump verdiløs. */}
          <p className="text-[var(--blekk-svak)]">
            Appen starter ikke uten den, så at du ser denne siden betyr at den
            er satt og har riktig lengde.
          </p>
          <p className="text-xs text-[var(--blekk-svak)]">
            Byttes den, blir alle lagrede nøkler uleselige og må hentes på nytt.
            Lag en ny med <Kodebit>openssl rand -base64 32</Kodebit>.
          </p>
        </div>
      </Kort>
    </div>
  )
}

/** Bekrefter at tokenet virker ved å faktisk bruke det. */
async function SupabaseProve() {
  const svar = await hentSupabaseProsjekter()

  if (!svar.ok) {
    return (
      <p className="font-semibold text-hm-red-ink">{svar.feil.melding}</p>
    )
  }

  return (
    <p>
      Ser <strong>{svar.data.length}</strong> prosjekter ({svar.svartidMs} ms).
    </p>
  )
}

async function VercelProve() {
  const svar = await hentVercelProsjekter()

  if (!svar.ok) {
    return (
      <p className="font-semibold text-hm-red-ink">{svar.feil.melding}</p>
    )
  }

  return (
    <p>
      Ser <strong>{svar.data.length}</strong> prosjekter ({svar.svartidMs} ms).
    </p>
  )
}
