/* ═══════════════════════════════════════════════════════════
   Rotasjonsrutinen for Supabase-tokenene.

   Egen fil fordi både innstillingssiden og server-handlingen som bytter
   token trenger den. Sto tallet på ett av stedene og ble importert fra det
   andre, ville en side importert fra en `use server`-fil eller omvendt –
   og duplisert ville de to før eller siden vært uenige om når et token
   forfaller.
   ═══════════════════════════════════════════════════════════ */

/**
 * Hvor ofte tokenene skal byttes.
 *
 * Eierens egen rutine, ikke et krav fra Supabase. Står her fordi et tall
 * som bare finnes i noens hode ikke er en rutine.
 */
export const ROTASJON_DAGER = 30

/**
 * Hvor mange dager før forfall det begynner å minne om seg.
 *
 * Fem, fordi et varsel som kommer på forfallsdagen ikke er en påminnelse –
 * det er en beskjed om at du er sent ute. Fem dager er nok til å rekke det
 * en gang man er innom likevel.
 */
export const VARSLE_DAGER_FOR_FORFALL = 5

export type Rotasjon = 'mangler' | 'ok' | 'snart' | 'forfalt'

/**
 * Hvor et token står i rotasjonssyklusen.
 *
 * Én funksjon framfor tre steder som regner det samme: merket på kortet,
 * linja under, og påminnelsen øverst. Regnet de hver for seg, ville de før
 * eller senere vært uenige – og da er det umulig å vite hvilken som har
 * rett.
 */
export function rotasjonsstatus(
  sistByttet: string | null,
  naa: number,
): Rotasjon {
  if (!sistByttet) return 'mangler'
  const dager = Math.floor(
    (naa - new Date(sistByttet).getTime()) / (24 * 60 * 60 * 1000),
  )
  const igjen = ROTASJON_DAGER - dager
  if (igjen <= 0) return 'forfalt'
  if (igjen <= VARSLE_DAGER_FOR_FORFALL) return 'snart'
  return 'ok'
}

/** Når tokenet forfaller, gitt når det sist ble byttet. */
export function forfaller(sistByttet: string): Date {
  return new Date(
    new Date(sistByttet).getTime() + ROTASJON_DAGER * 24 * 60 * 60 * 1000,
  )
}
