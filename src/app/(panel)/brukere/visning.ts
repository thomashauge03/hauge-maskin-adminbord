import type { SystemRolle } from '@/lib/rollefunn'
import type { Tilgangsmerke } from '@/lib/tilgangsmerke'

/* Det matrisen og personpanelet får fra serveren. Bare rene data: panelet er
   én klientkomponent for alle systemene, så handlingene kan ikke bindes per
   celle slik de ble før. */

export type SystemVisning = {
  id: string
  navn: string
  /** Etiketten på veien adminbordet skriver i, eller null når ingen finnes. */
  skrivbarVei: string | null
  /** Hvorfor tilgang ikke kan endres herfra, når skrivbarVei er null. */
  hvorforLaast: string
  roller: SystemRolle[]
  /** Auth-nøklede systemer må ha kontoen før raden, og da trengs et passord. */
  krevArPassord: boolean
}

export type CelleVisning = {
  merke: Tilgangsmerke
  /** Har en rad i veien adminbordet skriver i. Merket over sier om personen
      har tilgang i det hele tatt. */
  harTilgang: boolean
  /** Tilgang gjennom veier som ikke styres herfra, som lagerets admin. */
  andreVeier: string[]
  /** Raden står, men aktiv-kolonnen er slått av (utleie). */
  deaktivert: boolean
  rolle: string | null
  harKonto: boolean
  authId: string | null
  kontoSperret: boolean
  /**
   * Kontoen hører til en annen kunde i en delt base og har ingen tilgang hos
   * oss. Da er verken sperring, sletting eller ny tilgang vår å gjøre.
   */
  annenKundesKonto: boolean
  sistInnlogget: string | null
}

export type PersonVisning = {
  epost: string
  antallMedTilgang: number
  sistInnlogget: string | null
  /** System-id → cellen. Mangler når personen ikke finnes i systemet. */
  celler: Record<string, CelleVisning>
}
