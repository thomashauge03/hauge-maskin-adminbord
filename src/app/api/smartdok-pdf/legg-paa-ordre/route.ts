import { sendOrdre } from '@/lib/smartdok-pdf/send-ordre'
import { sjekkSending } from '@/lib/smartdok-pdf/sending'
import { feil, krevSmartdokPdfTilgang } from '@/lib/smartdok-pdf/tilgang'
import 'server-only'

/* Kalles serverside av SmartDok til PDF med brukerens navet-token. Skriver i Tripletex og SmartDok. */

// Prosjekt, ordre, én pris per produkt, linjer, vedlegg og merke, kalt etter hverandre.
export const maxDuration = 120

export async function POST(request: Request) {
  const bruker = await krevSmartdokPdfTilgang(request)
  if (bruker instanceof Response) return bruker

  let kropp: unknown
  try {
    kropp = await request.json()
  } catch {
    return feil('Ugyldig forespørsel.', 400)
  }
  const inn = sjekkSending(kropp)
  if (typeof inn === 'string') return feil(inn, 400)

  const r = await sendOrdre(inn, bruker)
  return Response.json(r.kropp, { status: r.http, headers: { 'Cache-Control': 'private, no-store' } })
}
