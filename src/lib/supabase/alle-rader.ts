/*
 * Henter alle radene, ikke bare de første tusen.
 *
 * PostgREST svarer med høyst 1000 rader om gangen (Supabase sin «Max rows»)
 * og sier ikke fra når det kapper. Uten dette ville lista over brukere
 * stille sluttet på 1000 – og tallene i den blitt feil lenge før det, fordi
 * unntak og gruppemedlemskap har flere rader enn det finnes personer.
 *
 * Spørringen MÅ sortere på en unik nøkkel. Ellers kan en rad komme med to
 * ganger, eller ikke i det hele tatt.
 *
 * Ingen import, med vilje: testene kjører fila direkte i Node.
 */

export const RADER_PER_SVAR = 1000

export async function alleRader<T>(
  hva: string,
  lag: (fra: number, til: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const ut: T[] = []
  for (let fra = 0; ; fra += RADER_PER_SVAR) {
    const { data, error } = await lag(fra, fra + RADER_PER_SVAR - 1)
    if (error) throw new Error(`Kunne ikke hente ${hva}: ${error.message}`)
    const side = data ?? []
    ut.push(...side)
    if (side.length < RADER_PER_SVAR) return ut
  }
}

/**
 * Alle sidene fra listUsers i Auth, som sier selv om det finnes en side til.
 *
 * Å stoppe ved en side med færre enn vi ba om holder ikke: Auth kan gi
 * færre per side enn det. Tallet i nextPage brukes ikke, bare at det er der:
 * supabase-js leser bare første siffer, så etter side 9 peker det på side 1
 * igjen, og løkka ville aldri kommet ut.
 */
export async function følgSidene<T>(
  hva: string,
  hent: (side: number) => PromiseLike<{
    data: { users: T[]; nextPage?: number | null }
    error: { message: string } | null
  }>,
): Promise<T[]> {
  const ut: T[] = []
  for (let side = 1; ; side++) {
    const { data, error } = await hent(side)
    if (error) throw new Error(`Kunne ikke hente ${hva}: ${error.message}`)
    ut.push(...data.users)
    if (!data.nextPage) return ut
  }
}
