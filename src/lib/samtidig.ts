/**
 * Kjører `arbeid` for hvert element, høyst `n` om gangen, og gir svarene i
 * samme rekkefølge som lista.
 *
 * Godkjenning er ett eksternt kall per person. 200 etter hverandre tar et
 * halvt minutt; 200 på én gang kan treffe grensene hos Supabase.
 *
 * Ingen import, med vilje: testene kjører fila direkte i Node.
 */
export async function medHøyst<T, R>(
  n: number,
  liste: readonly T[],
  arbeid: (element: T, indeks: number) => Promise<R>,
): Promise<R[]> {
  const svar: R[] = new Array(liste.length)
  let neste = 0

  async function arbeider() {
    while (neste < liste.length) {
      const i = neste++
      svar[i] = await arbeid(liste[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, liste.length)) }, arbeider))
  return svar
}

/**
 * Deler lista i biter på høyst `størrelse`, i samme rekkefølge.
 *
 * Id-ene i et `in`-filter reiser i adressen, og 200 uuid-er blir rundt 8 KB.
 * Mange porter og mellomtjenere kapper adressen omtrent der, så en handling
 * på mange spør i biter i stedet for med hele lista.
 */
export function iBiter<T>(liste: readonly T[], størrelse: number): T[][] {
  // Null ville gitt en løkke som aldri kommer videre.
  const steg = Math.max(1, Math.floor(størrelse))
  const biter: T[][] = []
  for (let fra = 0; fra < liste.length; fra += steg) {
    biter.push(liste.slice(fra, fra + steg))
  }
  return biter
}

/**
 * Spør bit for bit, etter hverandre, og samler radene.
 *
 * Stopper ved første feil, men gir fra seg det som gikk gjennom før den:
 * `ferdige` er elementene i bitene som lyktes. En skriving som stopper midt i
 * har endret noe på ekte, og skjermen og loggen må få vite det.
 */
export async function perBit<T, R>(
  liste: readonly T[],
  størrelse: number,
  spør: (bit: T[]) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
): Promise<{ ferdige: T[]; rader: R[]; feil: string | null }> {
  const ferdige: T[] = []
  const rader: R[] = []
  for (const bit of iBiter(liste, størrelse)) {
    const { data, error } = await spør(bit)
    // Kallerne spør om `feil` er satt. En feil med tom melding skal ikke se ut
    // som at alt gikk bra.
    if (error) return { ferdige, rader, feil: error.message || 'ukjent feil' }
    ferdige.push(...bit)
    rader.push(...(data ?? []))
  }
  return { ferdige, rader, feil: null }
}
