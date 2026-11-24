import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import { feil, krevSmartdokPdfTilgang } from '@/lib/smartdok-pdf/tilgang'
import 'server-only'

/* Kalles serverside av SmartDok til PDF med brukerens navet-token. */

export async function GET(request: Request) {
  const bruker = await krevSmartdokPdfTilgang(request)
  if (bruker instanceof Response) return bruker

  const { data, error } = await supabaseAdmin
    .from('prosjekter')
    .select('nummer, navn, kunde, aktiv')
  if (error) return feil('Kunne ikke hente prosjektene.', 500)

  const prosjekter = (data ?? [])
    .map((r) => ({
      nummer: String(r.nummer),
      navn: String(r.navn),
      kunde: (r.kunde as string | null) ?? null,
      aktiv: r.aktiv === true,
    }))
    // Aktive først, så høyeste nummer først. Numerisk, så 900 kommer før 99.
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || b.nummer.localeCompare(a.nummer, 'nb', { numeric: true }))

  await logg('smartdok_pdf.prosjekter_hentet', {
    utfortAv: bruker.id,
    utfortAvEpost: bruker.epost,
    detaljer: { antall: prosjekter.length },
  })

  return Response.json({ prosjekter }, { headers: { 'Cache-Control': 'private, no-store' } })
}
