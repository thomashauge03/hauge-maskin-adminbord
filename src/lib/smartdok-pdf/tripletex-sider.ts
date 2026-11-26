import type { Tripletexøkt } from '@/lib/smartdok-pdf/tripletex'
import 'server-only'

const SIDE = 1000
const MAKS_SIDER = 50

/** Henter alle sider fra en Tripletex-liste og slår dem sammen til én `values`-liste. Kaster ved ikke-2xx. */
export async function hentAlleSider(
  okt: Tripletexøkt,
  sti: string,
): Promise<{ json: { values: unknown[] } } | { status: number }> {
  const verdier: unknown[] = []
  for (let side = 0; side < MAKS_SIDER; side++) {
    const svar = await okt.hent(`${sti}${sti.includes('?') ? '&' : '?'}from=${side * SIDE}&count=${SIDE}`)
    if (svar.status < 200 || svar.status >= 300) return { status: svar.status }
    const v = (svar.json as { values?: unknown } | null)?.values
    if (!Array.isArray(v)) throw new Error('Uventet svar fra Tripletex: listen mangler values.')
    verdier.push(...v)
    if (v.length < SIDE) return { json: { values: verdier } }
  }
  throw new Error('Tripletex-listen er for lang.')
}
