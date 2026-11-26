import { logg } from '@/lib/data'
import { tolkProdukter } from '@/lib/smartdok-pdf/ordre'
import { feil, krevSmartdokPdfTilgang } from '@/lib/smartdok-pdf/tilgang'
import { apneTripletex } from '@/lib/smartdok-pdf/tripletex'
import { hentAlleSider } from '@/lib/smartdok-pdf/tripletex-sider'
import 'server-only'

/* Kalles serverside av SmartDok til PDF med brukerens navet-token. */

export const maxDuration = 60

export async function GET(request: Request) {
  const bruker = await krevSmartdokPdfTilgang(request)
  if (bruker instanceof Response) return bruker

  let produkter
  try {
    const okt = await apneTripletex()
    const svar = await hentAlleSider(okt, '/product?fields=id,number,name,isInactive,priceExcludingVatCurrency')
    if ('status' in svar) return feil(`Tripletex svarte ${svar.status}.`, 502)
    produkter = tolkProdukter(svar.json)
  } catch (e) {
    return feil(e instanceof Error ? e.message : 'Kunne ikke hente produkter fra Tripletex.', 502)
  }

  await logg('smartdok_pdf.produkter_hentet', {
    utfortAv: bruker.id,
    utfortAvEpost: bruker.epost,
    detaljer: { antall: produkter.length },
  })

  return Response.json({ produkter }, { headers: { 'Cache-Control': 'private, no-store' } })
}
