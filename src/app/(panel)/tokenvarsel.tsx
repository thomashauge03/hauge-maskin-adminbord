import Link from 'next/link'
import { hentKontoar } from '@/lib/kontoar'
import { rotasjonsord, tokenstatus } from '@/lib/rotasjon'
import { visDato } from '@/lib/format'

/* ═══════════════════════════════════════════════════════════
   Varsel om token som utløper, på FORSIDEN.

   Sto bare på innstillingssiden, og det var for langt unna. Et utløpt
   Supabase-token stopper alt for prosjektene under den kontoen:

     - status og nøkkeltall blir «uvisst»
     - brukerlister og tilgangsskriving feiler
     - LIVSTEGNET slutter å komme fram, og da pauses prosjektene etter sju døgn

   Det siste er det dyre. Et token som utløper på en fredag kan ta ned tre
   apper påfølgende uke, uten at noe annet enn en linje på en underside sa fra.

   Egen komponent bak sin egen Suspense-grense: den spør navet, ikke Supabase,
   så den er rask – og den skal ikke vente på tolv plattformkall.
   ═══════════════════════════════════════════════════════════ */

export async function Tokenvarsel() {
  const { kontoar, hentetMs } = await hentKontoar()

  const med = kontoar.map((k) => ({
    konto: k,
    t: tokenstatus(
      {
        utloperDato: k.tokenUtloper,
        sistByttet: k.sistBekreftet,
        harToken: k.harToken,
      },
      hentetMs,
    ),
  }))

  const utløpte = med.filter((x) => x.t.status === 'utlopt')
  const snarlige = med.filter((x) => x.t.status === 'snart')
  /*
   * Kontoer med token, men uten registrert utløpsdato.
   *
   * Nevnes fordi de er den STILLE risikoen: nedtellingen deres er et anslag
   * fra «sist prøvd + 30», og den flytter seg hver gang tokenet testes. Et
   * token som utløper i morgen kan derfor vise «22 dager igjen». Å ikke si
   * noe om dem ville vært å late som anslaget er en dato.
   */
  const utenDato = med.filter((x) => x.t.status !== 'mangler' && !x.t.erRegistrert)

  if (!utløpte.length && !snarlige.length && !utenDato.length) return null

  return (
    <div className="space-y-2">
      {utløpte.length > 0 && (
        <div className="border-2 border-hm-red bg-[var(--flate-opp)]">
          <div className="hm-varselstriper h-1.5" aria-hidden="true" />
          <div className="px-4 py-3 text-sm">
            <p className="font-bold text-hm-red-ink">
              {utløpte.length === 1 ? 'Et token er utløpt' : `${utløpte.length} tokens er utløpt`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {utløpte.map(({ konto, t }) => (
                <li key={konto.id}>
                  <strong>{konto.epost}</strong> – utløp{' '}
                  {t.utloper ? visDato(t.utloper.toISOString()) : 'ukjent dato'}, for{' '}
                  {Math.abs(t.dagerIgjen ?? 0)}{' '}
                  {Math.abs(t.dagerIgjen ?? 0) === 1 ? 'dag' : 'dager'} siden
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[var(--blekk-svak)]">
              Prosjektene under disse kontoene får ikke lenger livstegn, og
              pauses etter sju døgn uten trafikk. Status og brukerlister står
              også stille.{' '}
              <Link href="/innstillinger" className="underline">
                Bytt tokenet
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {snarlige.length > 0 && (
        <p className="border-l-4 border-hm-amber bg-hm-amber/10 p-3 text-sm font-semibold">
          {snarlige.length === 1 ? 'Et token utløper snart' : `${snarlige.length} tokens utløper snart`}
          :{' '}
          {snarlige
            .map(
              ({ konto, t }) =>
                `${konto.epost} (${rotasjonsord(t)}${t.erRegistrert ? '' : ', anslag'})`,
            )
            .join(', ')}
          .{' '}
          <Link href="/innstillinger" className="underline">
            Bytt dem nå
          </Link>
          .
        </p>
      )}

      {utenDato.length > 0 && (
        <p className="text-xs text-[var(--blekk-svak)]">
          {utenDato.length}{' '}
          {utenDato.length === 1 ? 'konto mangler' : 'kontoer mangler'}{' '}
          utløpsdato ({utenDato.map((x) => x.konto.epost).join(', ')}).
          Nedtellingen deres er et anslag fra «sist prøvd + 30 dager», som
          flytter seg hver gang tokenet testes – så et token som utløper i
          morgen kan vise god tid.{' '}
          <Link href="/innstillinger" className="underline">
            Fyll inn når de ble laget
          </Link>
          .
        </p>
      )}
    </div>
  )
}
