/* ═══════════════════════════════════════════════════════════
   Når et Supabase-token utløper, og når det bør byttes.

   TO FORSKJELLIGE TING, og fila het før bare «rotasjon» fordi bare det ene
   fantes:

     UTLØP    en dato satt hos Supabase. Passerer den, slutter tokenet å
              virke – uansett hva vi mener om saken.
     RUTINE   eierens egen 30-dagers vane. Bryter man den, skjer ingenting
              teknisk; man har bare et gammelt token.

   Utløpet vinner alltid når det er kjent. Rutinen er det vi faller tilbake
   på, og da SKAL det stå at det er et anslag – ellers ser «om 12 dager» ut
   som en dato noen har lovet oss.

   Hvorfor forskjellen er dyr: et utløpt token stopper status, brukerlister,
   tilgangsskriving OG livstegnet. Uten livstegn pauses prosjektene noen døgn
   senere. Det er den mest kostbare feilen adminbordet kan ha, og den kommer
   uten forvarsel hvis nedtellingen måler feil ting.

   Egen fil fordi både innstillingssiden, forsiden og server-handlingen som
   bytter token trenger den. Duplisert ville de før eller senere vært uenige
   om når et token forfaller.
   ═══════════════════════════════════════════════════════════ */

/**
 * Eierens egen rutine, ikke et krav fra Supabase.
 *
 * Brukes bare når det ikke finnes en registrert utløpsdato. Står her fordi et
 * tall som bare finnes i noens hode ikke er en rutine.
 */
export const ROTASJON_DAGER = 30

/**
 * Hvor mange dager før forfall det begynner å minne om seg.
 *
 * Fem, fordi et varsel som kommer på forfallsdagen ikke er en påminnelse – det
 * er en beskjed om at du er sent ute. Fem dager er nok til å rekke det en gang
 * man er innom likevel.
 */
export const VARSLE_DAGER_FOR_FORFALL = 5

/**
 * 'utlopt' er ikke det samme som 'forfalt'.
 *
 * 'forfalt' betyr at rutinen er brutt: tokenet virker, men er gammelt.
 * 'utlopt' betyr at det har sluttet å virke. Å vise samme merke for begge var
 * det gamle oppsettet, og da kunne man ikke se forskjell på «bør byttes» og
 * «alt står stille nå».
 */
export type Rotasjon = 'mangler' | 'ok' | 'snart' | 'forfalt' | 'utlopt'

export type Tokenstatus = {
  status: Rotasjon
  /** Dager til utløp. Negativt betyr at det er passert. Null når uvisst. */
  dagerIgjen: number | null
  /** Datoen vi teller mot. Null når vi ikke har noen. */
  utloper: Date | null
  /**
   * Er datoen REGISTRERT, eller anslått fra rutinen?
   *
   * Vises alltid. Et anslag som ser ut som en dato er verre enn ingen dato:
   * det gir en trygghet ingen har lovet.
   */
  erRegistrert: boolean
}

const DØGN = 24 * 60 * 60 * 1000

/**
 * Hvor et token står – utløp først, rutine som reserve.
 *
 * `utloperDato` er `token_utloper` fra databasen: en dato, ikke et tidspunkt.
 * Den tolkes som slutten av dagen, fordi et token som utløper «12. september»
 * virker gjennom den 12. – å telle den som passert ved midnatt ville vist
 * «utløpt» et døgn for tidlig.
 */
export function tokenstatus(
  {
    utloperDato,
    sistByttet,
    harToken,
  }: {
    utloperDato: string | null
    sistByttet: string | null
    harToken: boolean
  },
  naa: number,
): Tokenstatus {
  if (!harToken) {
    return { status: 'mangler', dagerIgjen: null, utloper: null, erRegistrert: false }
  }

  if (utloperDato) {
    // Slutten av utløpsdagen: tokenet virker gjennom hele den datoen.
    const slutt = new Date(`${utloperDato}T23:59:59Z`)
    const dager = Math.floor((slutt.getTime() - naa) / DØGN)
    return {
      status: dager < 0 ? 'utlopt' : dager <= VARSLE_DAGER_FOR_FORFALL ? 'snart' : 'ok',
      dagerIgjen: dager,
      utloper: slutt,
      erRegistrert: true,
    }
  }

  /*
   * Ingen registrert dato. Da faller vi tilbake på rutinen, målt fra sist
   * tokenet ble rørt – som er et dårlig mål, siden det flytter seg hver gang
   * tokenet testes. Derfor `erRegistrert: false`, og derfor sier visningen at
   * dette er et anslag.
   */
  if (!sistByttet) {
    return { status: 'mangler', dagerIgjen: null, utloper: null, erRegistrert: false }
  }

  const anslag = new Date(new Date(sistByttet).getTime() + ROTASJON_DAGER * DØGN)
  const dager = Math.floor((anslag.getTime() - naa) / DØGN)
  return {
    status: dager <= 0 ? 'forfalt' : dager <= VARSLE_DAGER_FOR_FORFALL ? 'snart' : 'ok',
    dagerIgjen: dager,
    utloper: anslag,
    erRegistrert: false,
  }
}

/** Kort tekst til et merke. Delt, slik at kortet og påminnelsen sier det samme. */
export function rotasjonsord(t: Tokenstatus): string {
  switch (t.status) {
    case 'mangler':
      return 'ingen token'
    case 'utlopt':
      return `utløpt for ${Math.abs(t.dagerIgjen ?? 0)} d`
    case 'snart':
      return `${t.dagerIgjen} d igjen`
    case 'forfalt':
      return 'bør byttes'
    case 'ok':
      return t.erRegistrert ? `${t.dagerIgjen} d igjen` : 'ok'
  }
}
