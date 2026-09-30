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
