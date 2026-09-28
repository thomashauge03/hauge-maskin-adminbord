/**
 * Nøkkelknappen i mobilappen, som felt i sider.json.
 *
 * Mangler feltet, er knappen på – nye systemer skal få den uten at noen gjør
 * noe. Derfor skriver vi bare `nokkel: false`, og fjerner feltet igjen når den
 * slås på, så fila bare har det der det betyr noe.
 *
 * Ren funksjon uten importer, så Node kan teste den direkte
 * (nokkel-felt.test.mjs).
 */
export function medNokkel<T extends Record<string, unknown>>(side: T, paa: boolean): T {
  const resten: Record<string, unknown> = { ...side }
  delete resten.nokkel
  return (paa ? resten : { ...resten, nokkel: false }) as T
}
