import { avklar } from '@/lib/smartdok-pdf/send-ordre'
import { sjekkAvklar } from '@/lib/smartdok-pdf/sending'
import { feil, krevSmartdokPdfTilgang } from '@/lib/smartdok-pdf/tilgang'
import 'server-only'

/* Kalles serverside av SmartDok til PDF med brukerens navet-token. */

// Oppslag på prosjekt og kundens ordrer (flere sider), og eventuelt merket i SmartDok.
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
  const inn = sjekkAvklar(kropp)
  if (typeof inn === 'string') return feil(inn, 400)

  const r = await avklar(inn.kode, inn.valg, bruker)
  return Response.json(r.kropp, { status: r.http, headers: { 'Cache-Control': 'private, no-store' } })
}
