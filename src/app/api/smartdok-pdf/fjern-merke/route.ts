import { fjernMerke } from '@/lib/smartdok-pdf/send-ordre'
import { sjekkKode } from '@/lib/smartdok-pdf/sending'
import { feil, krevSmartdokPdfTilgang } from '@/lib/smartdok-pdf/tilgang'
import 'server-only'

/* Kalles serverside av SmartDok til PDF med brukerens navet-token. Endrer ingenting i Tripletex. */

export const maxDuration = 60

export async function POST(request: Request) {
  const bruker = await krevSmartdokPdfTilgang(request)
  if (bruker instanceof Response) return bruker

  let kropp: unknown
  try {
    kropp = await request.json()
  } catch {
    return feil('Ugyldig forespørsel.', 400)
  }
  const kode = sjekkKode(kropp)
  if (!kode) return feil('Ugyldig sendingskode.', 400)

  const r = await fjernMerke(kode, bruker)
  return Response.json(r.kropp, { status: r.http, headers: { 'Cache-Control': 'private, no-store' } })
}
