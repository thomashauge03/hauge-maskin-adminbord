/**
 * Om en e-post passer søket i Brukere-lista på telefon.
 *
 * Store og små bokstaver teller ikke, og heller ikke mellomrom foran og
 * bak: telefontastaturet setter gjerne et mellomrom etter et ord valgt fra
 * forslagene, og da ville ingen passet. Tomt søk passer alle.
 */
export function passerSøk(epost: string, søk: string): boolean {
  const s = søk.trim().toLowerCase()
  return s === '' || epost.toLowerCase().includes(s)
}
