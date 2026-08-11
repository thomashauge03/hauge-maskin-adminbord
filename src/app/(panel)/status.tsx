import Link from 'next/link'
import { hentOversikt, VARSLE_DAGER_FOR_PAUSE } from '@/lib/helse'
import { hentReserveMaalinger } from '@/lib/data'
import type { System } from '@/lib/typer'
import { Feilstripe, Kort, KortTittel, Tallkort } from '@/components/ui'
import { Kildelinje, TilstandsMerke } from '@/components/tilstand'
import { førsteLinje, visSiden } from '@/lib/format'
import type { Sortering } from './sortering'

/**
 * Statusdelen av oversikten. Egen komponent fordi den er den eneste
 * trege delen av siden: to eksterne API-kall. Ligger den i en egen
 * Suspense-grense, kommer tittel og meny med én gang og status strømmer
 * inn etterpå – i stedet for at hele siden står tom i to sekunder.
 */
export async function Statusdel({
  systemer,
  sortering = 'verst',
}: {
  systemer: System[]
  sortering?: Sortering
}) {
  const reserve = await hentReserveMaalinger()
  const oversikt = await hentOversikt(systemer, reserve)

  // Tidspunktet kommer med målingen, ikke fra klokka her. Se
  // kommentaren på Oversikt.hentetMs for hvorfor.
  const naa = oversikt.hentetMs

  const antall = {
    nede: oversikt.systemer.filter((s) => s.samletTilstand === 'nede').length,
    advarsel: oversikt.systemer.filter((s) => s.samletTilstand === 'advarsel')
      .length,
    ok: oversikt.systemer.filter((s) => s.samletTilstand === 'ok').length,
    uvisst: oversikt.systemer.filter((s) => s.samletTilstand === 'ukjent').length,
  }

  /*
   * To sorteringer, fordi det er to ulike spørsmål.
   *
   * `verst`: er noe galt. Står kortene i registerrekkefølge, må man lese
   * alle tolv for å finne det ene røde.
   *
   * `aktivitet`: hva er på vei til å pauses. Da vil man ha den som har
   * ligget stille lengst øverst – og det er en helt annen rekkefølge enn
   * «mest ødelagt».
   */
  const rekkefølge = { nede: 0, advarsel: 1, ukjent: 2, ok: 3 } as const
  const sortert = [...oversikt.systemer].sort((a, b) => {
    if (sortering === 'aktivitet') {
      /*
       * Systemer vi ikke VET aktiviteten for havner nederst, ikke øverst.
       * `null` betyr «ingen måling», og å sortere ukjent som «uendelig
       * lenge siden» ville satt dem foran de som faktisk er i faresonen –
       * altså skjult nettopp det sorteringen er til for.
       */
      const av = a.aktivitet?.dagerSiden
      const bv = b.aktivitet?.dagerSiden
      if (av == null && bv == null) return a.system.sortering - b.system.sortering
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av || a.system.sortering - b.system.sortering
    }

    return (
      rekkefølge[a.samletTilstand] - rekkefølge[b.samletTilstand] ||
      a.system.sortering - b.system.sortering
    )
  })

  return (
    <div className="space-y-6">
      {(oversikt.supabaseFeil || oversikt.vercelFeil) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {oversikt.supabaseFeil && (
            <Feilstripe tittel="Supabase-integrasjonen svarer ikke">
              {oversikt.supabaseFeil}{' '}
              <Link href="/innstillinger" className="underline">
                Sjekk oppsettet
              </Link>
              .
            </Feilstripe>
          )}
          {oversikt.vercelFeil && (
            <Feilstripe tittel="Vercel-integrasjonen svarer ikke">
              {oversikt.vercelFeil}{' '}
              <Link href="/innstillinger" className="underline">
                Sjekk oppsettet
              </Link>
              .
            </Feilstripe>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tallkort merkelapp="Nede" verdi={antall.nede} />
        <Tallkort merkelapp="Se på" verdi={antall.advarsel} />
        <Tallkort merkelapp="OK" verdi={antall.ok} />
        <Tallkort merkelapp="Uvisst" verdi={antall.uvisst} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortert.map(
          ({ system, maalinger, samletTilstand, kontoEpost, aktivitet }) => (
          <Kort key={system.id} className="hm-inn">
            <KortTittel handling={<TilstandsMerke tilstand={samletTilstand} />}>
              <Link href={`/systemer/${system.slug}`} className="hover:underline">
                {system.navn}
              </Link>
            </KortTittel>

            {/* Hvilken Supabase-innlogging prosjektet ligger under. Med
                fire kontoer er dette svaret på «hvor logger jeg inn for å
                gjøre noe med dette», og å slå det opp hver gang er nettopp
                det adminbordet skal fjerne. */}
            {kontoEpost && (
              <p className="hm-kode border-b border-[var(--kant)] px-4 py-1.5 text-[11px] text-[var(--blekk-svak)]">
                {kontoEpost}
              </p>
            )}

            {maalinger.length === 0 ? (
              <p className="px-4 py-4 text-sm text-[var(--blekk-svak)]">
                Ingen kilder registrert. Legg inn Supabase- eller
                Vercel-prosjekt for å få status.
              </p>
            ) : (
              <div>
                {maalinger.map((m) => (
                  <Kildelinje
                    key={m.kilde}
                    kilde={m.kilde}
                    tilstand={m.tilstand}
                    melding={m.melding}
                    fraLager={m.fraLager}
                    naa={naa}
                  />
                ))}
              </div>
            )}

            {/* Pause-nedtellingen. En pauset gratisdatabase betyr at
                appen er nede, og statusen sier ACTIVE_HEALTHY helt til
                det skjer – uten dette tallet finnes det ingen forvarsel. */}
            {aktivitet?.dagerTilPause !== null &&
              aktivitet?.dagerTilPause !== undefined && (
                <p
                  className={`border-t border-[var(--kant)] px-4 py-2 text-xs ${
                    aktivitet.dagerTilPause <= VARSLE_DAGER_FOR_PAUSE
                      ? 'bg-hm-amber/15 font-semibold text-hm-amber'
                      : 'bg-[var(--flate-2)] text-[var(--blekk-svak)]'
                  }`}
                >
                  {aktivitet.dagerTilPause <= 0
                    ? `Ingen trafikk på ${aktivitet.dagerSiden} døgn – pausegrensen er passert`
                    : `Sist trafikk ${
                        aktivitet.dagerSiden === 0
                          ? 'i dag'
                          : `for ${aktivitet.dagerSiden} døgn siden`
                      } · pauses om ${aktivitet.dagerTilPause} døgn uten bruk`}
                </p>
              )}

            {/* Siste utrulling nederst: det er det som endrer seg
                oftest, og det første man vil vite når noe plutselig
                oppfører seg annerledes. */}
            {maalinger
              .filter((m) => m.kilde === 'vercel' && m.detaljer.opprettet)
              .map((m) => (
                <p
                  key="deploy"
                  className="border-t border-[var(--kant)] bg-[var(--flate-2)] px-4 py-2 text-xs text-[var(--blekk-svak)]"
                >
                  {visSiden(String(m.detaljer.opprettet), naa)}
                  {m.detaljer.commitMelding
                    ? ` · ${førsteLinje(String(m.detaljer.commitMelding), 40)}`
                    : ''}
                </p>
              ))}
          </Kort>
          ),
        )}
      </div>

    </div>
  )
}

/** Plassholder mens de to API-kallene går. Samme form som kortene, så
    layouten ikke hopper når innholdet kommer. */
export function StatusSkjelett({ antall }: { antall: number }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-4 py-3"
          >
            <div className="hm-skjelett h-3 w-16" />
            <div className="hm-skjelett mt-2 h-8 w-10" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: Math.max(antall, 3) }, (_, i) => (
          <div
            key={i}
            className="border-2 border-[var(--kant)] bg-[var(--flate-opp)]"
          >
            <div className="border-b-2 border-[var(--kant)] px-4 py-3">
              <div className="hm-skjelett h-4 w-32" />
            </div>
            <div className="space-y-2 px-4 py-3">
              <div className="hm-skjelett h-3 w-full" />
              <div className="hm-skjelett h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
