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
