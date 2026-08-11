'use client'

import { useActionState, useState } from 'react'
import type { CelleTilstand } from './tilgang-actions'
import type { SystemRolle } from '@/lib/tilgang'
import type { Tilgangsmerke } from '@/lib/tilgangsmerke'
import { FELT, KNAPP_FARLIG, KNAPP_LITEN, Merke } from '@/components/ui'

const start: CelleTilstand = {}

type Handling = (
  forrige: CelleTilstand,
  formData: FormData,
) => Promise<CelleTilstand>

/**
 * Én celle i matrisen: har personen tilgang til dette systemet, og med
 * hvilken rolle.
 *
 * Cellen er en knapp som utvider seg. Alternativet – en egen side per
 * person, eller et skjema over tabellen – ville betydd at man mister
 * oversikten i det øyeblikket man skal endre noe. Poenget med matrisen er
 * at man ser helheten mens man jobber i den.
 *
 * Merket kommer FERDIG fra serveren, via src/lib/tilgangsmerke.ts. Cellen
 * bestemmer det ikke selv, fordi lesevisningen drift får må vise nøyaktig det
 * samme – og da de to bestemte hver for seg, viste de ikke det samme.
 */
export function TilgangsCelle({
  epost,
  navn,
  systemNavn,
  merke,
  harTilgang,
  naavaerendeRolle,
  harKonto,
  skrivbarVei,
  hvorforLaast,
  roller,
  krevArPassord,
  gi,
  taBort,
}: {
  epost: string
  navn: string
  systemNavn: string
  merke: Tilgangsmerke
  harTilgang: boolean
  /** Rollen personen har nå, slik nedtrekkslisten kan starte på den framfor
      på standardrollen – ellers ser «Endre rolle» ut som en tilbakestilling. */
  naavaerendeRolle: string | null
  harKonto: boolean
  /**
   * Etiketten på veien adminbordet får skrive i, eller null.
   *
   * Null betyr at cellen ikke kan skrive noe i det hele tatt – enten fordi
   * systemet mangler oppsett, eller fordi alle veiene er lesbare bare. Da skal
   * det stå HVORFOR, framfor at en knapp feiler etter at man har trykket.
   */
  skrivbarVei: string | null
  /** Begrunnelsen, når skrivbarVei er null. */
  hvorforLaast: string
  roller: SystemRolle[]
  /**
   * Systemer nøklet på auth-id krever at brukeren finnes der først, og da
   * må vi kunne opprette den – altså trengs et midlertidig passord. De
   * e-postnøklede appene trenger det ikke.
   */
  krevArPassord: boolean
  gi: Handling
  taBort: Handling
}) {
  const [åpen, settÅpen] = useState(false)
  const [gittTilstand, sendGi, girTilgang] = useActionState(gi, start)
  const [fjernTilstand, sendFjern, fjerner] = useActionState(taBort, start)

  /*
   * Den sist utførte handlingen eier meldingsfeltet.
   *
   * To meldinger samtidig ville vært verre enn én: cellen er smal, og «ok»
   * fra å gi tilgang stående ved siden av «feil» fra å ta den bort er
   * uleselig. useActionState nullstiller ikke den andre tilstanden, så
   * fjerning vinner når den har sagt noe – det er den ferskeste handlingen
   * hvis man i det hele tatt trykket på den.
   */
  const tilstand =
    fjernTilstand.feil || fjernTilstand.ok ? fjernTilstand : gittTilstand

  if (!åpen) {
    return (
      <button
        onClick={() => settÅpen(true)}
        title={`${merke.forklaring} Trykk for å ${harTilgang ? 'endre eller fjerne' : 'gi'} tilgang.`}
        className="mx-auto block cursor-pointer rounded-none px-1 py-0.5 hover:bg-[var(--flate-2)]"
      >
        {merke.tekst === '–' ? (
          <span className="text-[var(--blekk-svak)]">–</span>
        ) : (
          <Merke type={merke.merke}>{merke.tekst}</Merke>
        )}
      </button>
    )
  }

  // Rollen personen har nå, ellers systemets standard. Rekkefølgen er ikke
  // vilkårlig: å åpne «Endre rolle» på standardrollen ser ut som et forslag
  // om å endre den, og det er lett å bekrefte i vane.
  const standard =
    (naavaerendeRolle && roller.some((r) => r.verdi === naavaerendeRolle)
      ? naavaerendeRolle
      : roller.find((r) => r.erStandard)?.verdi) ?? roller[0]?.verdi

  return (
    <div className="min-w-[13rem] space-y-2 border-2 border-hm-red bg-[var(--flate-opp)] p-2 text-left">
      <p className="text-xs font-bold">{systemNavn}</p>
      <p className="hm-kode text-[11px] text-[var(--blekk-svak)]">{epost}</p>

      {/* Tilstanden står i den åpne cellen også. Uten den må man lukke for å
          se hva som gjelder, og da er man tilbake til å gjette. */}
      <p className="text-[11px] text-[var(--blekk-svak)]">{merke.forklaring}</p>

      {!skrivbarVei ? (
        <p className="border-2 border-[var(--kant)] p-1.5 text-[11px]">
          Tilgang kan ikke gis eller tas bort herfra. {hvorforLaast}
        </p>
      ) : (
        <>
          {/* Hvilken vei som skrives. I tilbudssystemet finnes en vei til –
              plattform-admin – og den skal det ikke se ut som denne knappen
              gir. */}
          <p className="text-[11px] font-semibold">Skriver i: {skrivbarVei}</p>

          <form action={sendGi} className="space-y-1.5">
            <input type="hidden" name="epost" value={epost} />
            <input type="hidden" name="navn" value={navn} />

            {roller.length > 0 && (
              <select
                name="rolle"
                defaultValue={standard}
                className={`${FELT} py-1 text-sm`}
                aria-label={`Rolle i ${systemNavn}`}
              >
                {roller.map((r) => (
                  <option key={r.verdi} value={r.verdi}>
                    {r.etikett}
                  </option>
                ))}
              </select>
            )}

            {krevArPassord && !harKonto && (
              <input
                name="midlertidigPassord"
                type="text"
                autoComplete="off"
                placeholder="midlertidig passord"
                className={`${FELT} py-1 text-sm`}
                aria-label="Midlertidig passord"
              />
            )}

            <button
              type="submit"
              disabled={girTilgang}
              className={`${KNAPP_LITEN} w-full`}
            >
              {girTilgang ? 'Skriver …' : harTilgang ? 'Endre rolle' : 'Gi tilgang'}
            </button>
          </form>

          {harTilgang && (
            <form action={sendFjern}>
              <button
                type="submit"
                disabled={fjerner}
                className={`${KNAPP_FARLIG} w-full`}
              >
                {fjerner ? 'Fjerner …' : 'Ta bort tilgang'}
              </button>
            </form>
          )}
        </>
      )}

      {tilstand.feil && (
        <p role="alert" className="text-[11px] font-semibold text-hm-red-ink">
          {tilstand.feil}
        </p>
      )}
      {tilstand.ok && (
        <p role="status" className="text-[11px] font-semibold">
          {tilstand.ok}
        </p>
      )}

      <button onClick={() => settÅpen(false)} className={`${KNAPP_LITEN} w-full`}>
        Lukk
      </button>
    </div>
  )
}
