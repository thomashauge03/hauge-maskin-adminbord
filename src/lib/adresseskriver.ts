/*
 * Skriver filteret i lista over appbrukere til adressen – men ikke for hvert
 * tastetrykk.
 *
 * Safari kaster SecurityError etter 100 history-kall på 30 sekunder, og
 * Next.js gjør ett kall til for hvert av våre: det oppdaterer ruteren før
 * nettleserkallet, og skriver så sin egen tilstand i en effekt. Med ett
 * skriv per tastetrykk holdt det med 50 tastetrykk, og kallet som kastet,
 * lå i effekten til Next – da faller hele panelet. En try/catch rundt vårt
 * eget kall ville ikke hjulpet.
 *
 * Første endring skrives med en gang. Det som kommer innen et sekund etter,
 * samles, og det siste skrives når sekundet er gått. Løftet fra skriv() får
 * svar først når adressen er skrevet: brukerlista venter på det i overgangen
 * sin, så useOptimistic viser valget helt til ruteren har fått det med seg.
 *
 * Ingen import, med vilje: testene kjører fila direkte i Node.
 */

export type Adresseskriver = {
  /** Skriver nå, eller når sekundet er gått. Løftet får svar når adressen er skrevet. */
  skriv(adresse: string): Promise<void>
  /** Skriver det som venter, med en gang – før en lenke tar oss videre. */
  nå(): void
  /** Ingenting skal skrives lenger, men det som venter, får svar. */
  slipp(): void
}

export function lagAdresseskriver(
  skriv: (adresse: string) => void,
  mellomromMs = 1000,
): Adresseskriver {
  let pause: ReturnType<typeof setTimeout> | null = null
  let neste: string | null = null
  let venter: (() => void)[] = []

  function svarVentende() {
    const ferdige = venter
    venter = []
    for (const ferdig of ferdige) ferdig()
  }

  function skrivNå(adresse: string) {
    try {
      skriv(adresse)
    } catch {
      // Grensa er nådd likevel. Adressen tar igjen ved neste skriv, og
      // tastingen skal ikke stoppe av det.
    }
    pause = setTimeout(etterPausen, mellomromMs)
  }

  function etterPausen() {
    pause = null
    if (neste === null) return
    const adresse = neste
    neste = null
    skrivNå(adresse)
    svarVentende()
  }

  return {
    skriv(adresse) {
      if (pause === null) {
        skrivNå(adresse)
        return Promise.resolve()
      }
      neste = adresse
      return new Promise((ferdig) => venter.push(ferdig))
    },
    nå() {
      if (neste === null) return
      if (pause !== null) clearTimeout(pause)
      etterPausen()
    },
    slipp() {
      if (pause !== null) clearTimeout(pause)
      pause = null
      neste = null
      svarVentende()
    },
  }
}
