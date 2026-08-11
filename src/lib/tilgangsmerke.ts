import type { MerkeType } from '@/components/ui'
import type { TilgangsRad } from '@/lib/typer'

/* ═══════════════════════════════════════════════════════════
   Hva én celle i tilgangsmatrisen skal si.

   Egen fil fordi den samme avgjørelsen tas på to steder: den redigerbare
   cellen eieren ser, og den rene visningen drift får. Da de var to uavhengige
   uttrykk, viste de allerede litt ulike ting – og en matrise der to rader
   betyr forskjellige ting er verre enn en som er konsekvent gal.

   FARGE ER ALDRI ALENE. Hvert merke har tekst, og teksten sier hva som er
   sant. Det er ikke bare universell utforming: hele feilen denne siden hadde
   var at ett grønt merke betydde to forskjellige ting.
   ═══════════════════════════════════════════════════════════ */

export type Tilgangsmerke = {
  merke: MerkeType
  /** Det korte som står i cellen. Skal kunne leses i en 7-kolonners tabell. */
  tekst: string
  /** Hele setningen, som tittel på cellen og i lesevisningen. */
  forklaring: string
}

/**
 * `rad` er undefined når personen ikke finnes i systemet i det hele tatt –
 * verken som konto eller som tilgangsrad.
 *
 * `harOppsett` sier om adminbordet VET hvor systemet lagrer tilgang. Uten det
 * kan vi bare rapportere kontoen, og det skal stå at det er alt vi vet.
 */
export function tilgangsmerke(
  rad: TilgangsRad | undefined,
  { systemNavn, harOppsett }: { systemNavn: string; harOppsett: boolean },
): Tilgangsmerke {
  if (!rad) {
    return {
      merke: 'nøytral',
      tekst: '–',
      forklaring: `Ingen konto og ingen tilgang i ${systemNavn}.`,
    }
  }

  // ── Vet ikke ──
  // Systemet mangler tilgangsoppsett. Å vise «ingen tilgang» her ville vært en
  // påstand vi ikke kan stå for; å vise «ja» var nettopp den gamle feilen.
  if (rad.harTilgang === null || !harOppsett) {
    return {
      merke: 'nøytral',
      tekst: 'konto',
      forklaring: `Har konto i ${systemNavn}, men adminbordet vet ikke hvor det systemet lagrer tilgang – så om kontoen gir tilgang er uvisst. Legg inn tilgangsoppsett for systemet.`,
    }
  }

  // ── Ingen tilgang ──
  if (!rad.harTilgang) {
    if (!rad.harKonto) {
      return {
        merke: 'nøytral',
        tekst: '–',
        forklaring: `Ingen tilgang i ${systemNavn}.`,
      }
    }

    /*
     * En annen kundes bruker er IKKE «kun konto».
     *
     * Sto som «kun konto … ser altså ingenting» først, og det er usant i et
     * flerkundesystem: personen ser en hel del, bare ikke våre data. Skillet
     * er ikke akademisk – «kun konto» leses som noe å rydde, og systemkortet
     * tilbød «Slett» på en innlogging som tilhører en annen bedrift i en delt
     * auth.users.
     */
    if (rad.annenKunde > 0) {
      return {
        merke: 'nøytral',
        tekst: 'annen kunde',
        forklaring: `Har konto i ${systemNavn} og hører til en annen kunde i den delte basen (${rad.annenKunde} rad${rad.annenKunde > 1 ? 'er' : ''}). Ingen tilgang til Hauge Maskin-dataene, og ingenting å rydde – dette er ikke vår bruker. Å gi tilgang her ville låst personen ut av hele appen, fordi appen slår opp medlemskapet med .single().`,
      }
    }

    return {
      merke: 'nøytral',
      tekst: 'kun konto',
      forklaring: `Kan logge inn i ${systemNavn}, men har ingen tilgangsrad – får ikke se noe. Dette sto tidligere som «ja».`,
    }
  }

  /*
   * Har tilgang. Rekkefølgen under er en prioritering: det som HINDRER
   * innlogging nevnes før det som bare er en advarsel, og det som gir makt
   * utover systemet nevnes før den vanlige tilstanden.
   */
  const veiTekst = rad.veier
    .map((v) => (v.rolle ? `${v.etikett}: ${v.rolle}` : v.etikett))
    .join('. ')
  const kort = rad.rolle ?? rad.veier[0]?.etikett ?? 'tilgang'
  // Flere veier er verdt et eget merke: to kilder til makt er ikke det samme
  // som én, og sammendraget viser bare den første rollen.
  const suffiks = rad.veier.length > 1 ? ` +${rad.veier.length - 1}` : ''

  if (rad.tilgangAktiv === false) {
    return {
      merke: 'gul',
      tekst: `${kort} · av`,
      forklaring: `${veiTekst}. Deaktivert i systemets egen tabell – raden står igjen, så historikken peker fortsatt riktig.`,
    }
  }

  if (rad.kontoAktiv === false) {
    return {
      merke: 'rød',
      tekst: `${kort} · sperret`,
      forklaring: `${veiTekst}. Kontoen er sperret i Supabase og kommer ikke inn, men tilgangen ligger klar hvis sperren fjernes.`,
    }
  }

  if (!rad.harKonto) {
    return {
      merke: 'gul',
      tekst: `${kort} · ingen konto`,
      forklaring: `${veiTekst}. Personen har ikke registrert seg ennå – tilgangen virker fra første innlogging.`,
    }
  }

  return {
    merke: 'grønn',
    tekst: `${kort}${suffiks}`,
    forklaring: `${veiTekst}.`,
  }
}
