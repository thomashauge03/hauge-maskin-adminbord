import { revalidatePath } from 'next/cache'

/** Svaret fra en handling: en melding til den som trykket, en feil, eller begge. */
export type Tilstand = { feil?: string; ok?: string }

/**
 * Bygger adminbordet på nytt etter en endring.
 *
 * Hele panelet, ikke bare /appen: tallet på «Appen» i menyen står i
 * layouten over, og det skal ikke vise tre som venter etter at du har
 * godkjent dem.
 */
export function oppdaterAppen(): void {
  revalidatePath('/', 'layout')
}
