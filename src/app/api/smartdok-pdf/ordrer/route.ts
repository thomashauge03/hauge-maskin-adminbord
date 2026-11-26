import { logg } from '@/lib/data'
import { tolkApneOrdrer, tolkProsjekt } from '@/lib/smartdok-pdf/ordre'
import { feil, krevSmartdokPdfTilgang } from '@/lib/smartdok-pdf/tilgang'
import { apneTripletex } from '@/lib/smartdok-pdf/tripletex'
import { hentAlleSider } from '@/lib/smartdok-pdf/tripletex-sider'
import 'server-only'

/* Kalles serverside av SmartDok til PDF med brukerens navet-token. */

export const maxDuration = 60

export async function GET(request: Request) {
  const bruker = await krevSmartdokPdfTilgang(request)
  if (bruker instanceof Response) return bruker

  const nummer = (new URL(request.url).searchParams.get('prosjekt') ?? '').trim()
  if (!nummer) return feil('Velg et prosjekt.', 400)

  let prosjekt
  let ordrer
  try {
    const okt = await apneTripletex()

    const p = await okt.hent(`/project?number=${encodeURIComponent(nummer)}&fields=id,number,customer(id)&from=0&count=1000`)
    if (p.status < 200 || p.status >= 300) return feil(`Tripletex svarte ${p.status}.`, 502)
    const funnet = tolkProsjekt(p.json, nummer)
    if (funnet === 'ingen') return feil(`Fant ikke prosjekt ${nummer} i Tripletex.`, 409)
    if (funnet === 'flere') return feil(`Flere prosjekter med nummer ${nummer} i Tripletex.`, 409)
    prosjekt = funnet

    // GET /order har ingen prosjektfilter og krever datoperiode: hent kundens åpne ordrer og filtrer på prosjekt-id.
    const imorgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const svar = await hentAlleSider(
      okt,
      `/order?customerId=${prosjekt.kundeId}&isClosed=false&orderDateFrom=2000-01-01&orderDateTo=${imorgen}` +
        '&fields=id,number,orderDate,isClosed,project(id),orderLines(count,description,product(name))',
    )
    if ('status' in svar) return feil(`Tripletex svarte ${svar.status}.`, 502)
    ordrer = tolkApneOrdrer(svar.json, prosjekt.id)
  } catch (e) {
    return feil(e instanceof Error ? e.message : 'Kunne ikke hente ordrer fra Tripletex.', 502)
  }

  await logg('smartdok_pdf.ordrer_hentet', {
    utfortAv: bruker.id,
    utfortAvEpost: bruker.epost,
    detaljer: { prosjekt: nummer, antallOrdrer: ordrer.length },
  })

  return Response.json({ prosjekt, ordrer }, { headers: { 'Cache-Control': 'private, no-store' } })
}
