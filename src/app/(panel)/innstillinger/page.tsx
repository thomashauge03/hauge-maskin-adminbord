import { Suspense } from 'react'
import type { Metadata } from 'next'
import { krevAdmin } from '@/lib/auth'
import { hentKontoar, hentTokenKart, tokenFor, type Konto } from '@/lib/kontoar'
import { hentSupabaseProsjekter } from '@/lib/plattform/supabase-api'
import { hentVercelProsjekter, vercelKlar } from '@/lib/plattform/vercel'
import { hentSystemer } from '@/lib/data'
import {
  Kodebit,
  Kort,
  KortTittel,
  Merke,
  Seksjonstittel,
  TomTilstand,
} from '@/components/ui'
import { visDatoTid } from '@/lib/format'
import { byttKontoToken, fjernKontoToken } from './actions'
import { TokenSkjema } from './token-skjema'
import { Feildetalj } from '@/components/tilstand'

/**
 * Hvor ofte tokenene skal byttes.
 *
 * Eierens egen rutine, ikke et krav fra Supabase. Star her fordi et tall
 * som bare finnes i noens hode ikke er en rutine.
 */
const ROTASJON_DAGER = 30

export const metadata: Metadata = { title: 'Innstillinger' }

/**
 * Innstillingssiden viser om integrasjonene virker, og lar eieren bytte
 * Supabase-tokenene.
 *
 * Den var først bevisst LESBAR og ikke redigerbar, med argumentet at et
 * skjema her ville gi adminbordet makt til å endre nøkkelen til alle
 * prosjektene fra en nettleser, uten utrulling. Det argumentet var riktig
 * da tokenene lå i miljøvariabler. Nå ligger de kryptert i databasen og
 * kan altså alt endres uten utrulling – skjemaet gir ingen ny makt, det
 * gjør bare rotasjonen praktisk.
 *
 * Og rotasjonen er poenget: et personal access token kan ikke avgrenses,
 * og skal byttes hver 30. dag. Et token som er en jobb å bytte blir ikke
 * byttet, så en rotasjon som faktisk skjer er bedre sikkerhet enn en side
 * som er trygg å se på.
 *
 * Grensen står fortsatt et sted: KRYPTONOKKEL og Vercel-tokenet er
 * miljøvariabler og kan IKKE endres herfra. De byttes så sjelden at
 * gevinsten er null, og KRYPTONOKKEL er dessuten det ene som gjør en
 * databasedump verdiløs.
 */
export default async function InnstillingerSide() {
  await krevAdmin()

  const [{ kontoar, hentetMs: naa }, systemer] = await Promise.all([
    hentKontoar(),
    hentSystemer(true),
  ])
  const vercel = vercelKlar()

  // Hvor mange systemer henger på hver konto. Et token uten systemer er
  // like uinteressant som et system uten token.
  const antallPerKonto = new Map<string | null, number>()
  for (const s of systemer) {
    if (!s.supabaseProsjektRef) continue
    const k = s.kontoId ?? null
    antallPerKonto.set(k, (antallPerKonto.get(k) ?? 0) + 1)
  }

  const utenKonto = antallPerKonto.get(null) ?? 0


  return (
    <div className="space-y-7">
      <Seksjonstittel under="Systemene ligger under flere Supabase-innlogginger. Et token ser bare prosjekter i organisasjoner den kontoen er med i, så det trengs ett per konto.">
        Innstillinger
      </Seksjonstittel>

      {/* ── Supabase-kontoene ── */}
      <section className="space-y-3">
        <h2 className="hm-display text-xl">Supabase-kontoer</h2>

        {kontoar.length === 0 ? (
          <TomTilstand tittel="Ingen kontoer registrert">
            Kjør migrasjon <Kodebit>0004_supabase_kontoar.sql</Kodebit> og legg
            inn kontoene. Til da faller alle systemene tilbake på{' '}
            <Kodebit>SUPABASE_MANAGEMENT_TOKEN</Kodebit>, som bare rekker
            prosjekter i den ene kontoen den tilhører.
          </TomTilstand>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {kontoar.map((k) => (
              <KontoKort
                key={k.id}
                konto={k}
                antallSystemer={antallPerKonto.get(k.id) ?? 0}
                naa={naa}
              />
            ))}
          </div>
        )}

        {utenKonto > 0 && (
          <p className="text-sm text-[var(--blekk-svak)]">
            {utenKonto} system med database mangler konto, og bruker{' '}
            <Kodebit>SUPABASE_MANAGEMENT_TOKEN</Kodebit>. Rekker den ikke fram,
            vises de som uvisst.
          </p>
        )}
      </section>

      {/* ── Vercel ── */}
      <section className="space-y-3">
        <h2 className="hm-display text-xl">Vercel</h2>
        <Kort>
          <KortTittel
            handling={
              <Merke type={vercel.klar ? 'grønn' : 'rød'}>
                {vercel.klar ? 'satt' : 'mangler'}
              </Merke>
            }
          >
            Utrullingsstatus
          </KortTittel>
          <div className="space-y-3 px-4 py-4 text-sm">
            <p>
              <Kodebit>HM_VERCEL_TOKEN</Kodebit> og{' '}
              <Kodebit>HM_VERCEL_TEAM_ID</Kodebit>
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
            {/* HM_-prefikset er ikke en smakssak: hele VERCEL_*-navnerommet
                er systemeid, og Vercel avviser egne variabler der. */}
            <p className="text-xs text-[var(--blekk-svak)]">
              Token lages på{' '}
              <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                vercel.com/account/tokens
              </a>
              . Navnene må ha <Kodebit>HM_</Kodebit>-prefiks – Vercel avviser
              egne variabler som begynner med <Kodebit>VERCEL_</Kodebit>.
            </p>
          </div>
        </Kort>
      </section>

      {/* ── Krypteringsnøkkel ── */}
      <Kort>
        <KortTittel>Krypteringsnøkkel</KortTittel>
        <div className="space-y-2 px-4 py-4 text-sm">
          <p>
            <Kodebit>KRYPTONOKKEL</Kodebit> – 32 byte base64. Krypterer både
            kontotokenene og de andre systemenes service role-nøkler.
          </p>
          {/* Selve nøkkelen vises aldri, ikke engang forkortet: den er
              det ene som gjør en databasedump verdiløs. */}
          <p className="text-[var(--blekk-svak)]">
            Appen starter ikke uten den, så at du ser denne siden betyr at den
            er satt og har riktig lengde.
          </p>
          <p className="text-xs text-[var(--blekk-svak)]">
            Den må være IDENTISK lokalt og i drift – begge snakker med samme
            database, og to ulike nøkler gjør alt kryptert på det ene stedet
            uleselig på det andre. Byttes den, må alle tokens og nøkler legges
            inn på nytt.
          </p>
        </div>
      </Kort>
    </div>
  )
}

/**
 * Ett kort per Supabase-konto, som prøver tokenet ved å faktisk bruke det.
 *
 * Antall prosjekter tokenet ser er det tallet som avslører feil oppsett:
 * ser det færre enn systemene som er registrert på kontoen, ligger noen
 * av dem et annet sted.
 */
function KontoKort({
  konto,
  antallSystemer,
  naa,
}: {
  konto: Konto
  antallSystemer: number
  naa: number
}) {
  /*
   * Alder på tokenet, mot rutinen på 30 dager.
   *
   * `sist_bekreftet` settes hver gang et token legges inn eller byttes, så
   * den er i praksis «byttet»-datoen. Er den over 30 dager, sier kortet
   * det – en rotasjonsrutine man må huske selv er en rutine som glipper.
   */
  const dagerSidenBytte = konto.sistBekreftet
    ? Math.floor(
        (naa - new Date(konto.sistBekreftet).getTime()) / (24 * 60 * 60 * 1000),
      )
    : null
  const forfalt = dagerSidenBytte !== null && dagerSidenBytte >= ROTASJON_DAGER

  return (
    <Kort>
      <KortTittel
        handling={
          <Merke
            type={!konto.harToken ? 'gul' : forfalt ? 'rød' : 'grønn'}
          >
            {!konto.harToken
              ? 'mangler token'
              : forfalt
                ? 'bør byttes'
                : 'token satt'}
          </Merke>
        }
      >
        {konto.epost}
      </KortTittel>
      <div className="space-y-2 px-4 py-4 text-sm">
        {konto.beskrivelse && (
          <p className="text-[var(--blekk-svak)]">{konto.beskrivelse}</p>
        )}
        <p>{antallSystemer} system med database registrert på denne kontoen.</p>

        {konto.harToken ? (
          <>
            {konto.hint && (
              <p className="text-xs text-[var(--blekk-svak)]">
                Token: <Kodebit>{konto.hint}</Kodebit>
              </p>
            )}
            <Suspense
              fallback={
                <p className="text-[var(--blekk-svak)]">Prøver tokenet …</p>
              }
            >
              <KontoProve kontoId={konto.id} antallSystemer={antallSystemer} />
            </Suspense>
            {konto.sistBekreftet && (
              <p
                className={`text-xs ${forfalt ? 'font-semibold text-hm-red-ink' : 'text-[var(--blekk-svak)]'}`}
              >
                Byttet {visDatoTid(konto.sistBekreftet)}
                {dagerSidenBytte !== null &&
                  ` · for ${dagerSidenBytte} ${dagerSidenBytte === 1 ? 'dag' : 'dager'} siden`}
                {forfalt && ` – over ${ROTASJON_DAGER} dager, bør byttes`}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-[var(--blekk-svak)]">
            Lag et personal access token på{' '}
            <a
              href="https://supabase.com/dashboard/account/tokens"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              supabase.com/dashboard/account/tokens
            </a>{' '}
            mens du er logget inn som <strong>{konto.epost}</strong>. Uten det
            vises systemene under denne kontoen som uvisst.
          </p>
        )}

        <TokenSkjema
          epost={konto.epost}
          harToken={konto.harToken}
          bytt={byttKontoToken.bind(null, konto.id)}
          fjern={async () => {
            'use server'
            await fjernKontoToken(konto.id)
          }}
        />
      </div>
    </Kort>
  )
}

async function KontoProve({
  kontoId,
  antallSystemer,
}: {
  kontoId: string
  antallSystemer: number
}) {
  const token = tokenFor(await hentTokenKart(), kontoId)
  if (!token) {
    return <p className="text-[var(--blekk-svak)]">Ingen token å prøve.</p>
  }

  const svar = await hentSupabaseProsjekter(token)

  if (!svar.ok) return <Feildetalj feil={svar.feil} />

  // Ser tokenet færre prosjekter enn vi har registrert på kontoen, er
  // minst ett av dem registrert på feil konto. Det er verdt å si rett ut.
  const forFå = svar.data.length < antallSystemer

  return (
    <div className="space-y-1">
      <p>
        Ser <strong>{svar.data.length}</strong> prosjekter ({svar.svartidMs} ms
        {svar.gjenstaaende !== undefined && `, ${svar.gjenstaaende} kall igjen`}).
      </p>
      {forFå && (
        <p className="text-xs font-semibold text-hm-red-ink">
          Færre enn de {antallSystemer} som er registrert her. Minst ett system
          er koblet til feil konto.
        </p>
      )}
    </div>
  )
}

async function VercelProve() {
  const svar = await hentVercelProsjekter()

  if (!svar.ok) return <Feildetalj feil={svar.feil} />

  return (
    <p>
      Ser <strong>{svar.data.length}</strong> prosjekter ({svar.svartidMs} ms
      {svar.gjenstaaende !== undefined && `, ${svar.gjenstaaende} kall igjen`}).
    </p>
  )
}
