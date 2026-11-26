import { logg } from '@/lib/data'
import { lesFraSmartdok } from '@/lib/prosjekter/smartdok'
import { feil, krevSmartdokPdfTilgang } from '@/lib/smartdok-pdf/tilgang'
import { tolkMaskinliste } from '@/lib/smartdok-pdf/tolk-timer'
import 'server-only'

/* Kalles serverside av SmartDok til PDF med brukerens navet-token. */

export async function GET(request: Request) {
  const bruker = await krevSmartdokPdfTilgang(request)
  if (bruker instanceof Response) return bruker

  let maskiner
  try {
    const [rader] = await lesFraSmartdok(['/Machines?all=true'])
    maskiner = tolkMaskinliste(rader)
  } catch (e) {
    return feil(e instanceof Error ? e.message : 'Kunne ikke hente maskiner fra SmartDok.', 502)
  }

  await logg('smartdok_pdf.maskiner_hentet', {
    utfortAv: bruker.id,
    utfortAvEpost: bruker.epost,
    detaljer: { antall: maskiner.length },
  })

  return Response.json({ maskiner }, { headers: { 'Cache-Control': 'private, no-store' } })
}
