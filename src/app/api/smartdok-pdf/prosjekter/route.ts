import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import { alleRader } from '@/lib/supabase/alle-rader'
import { feil, krevSmartdokPdfTilgang } from '@/lib/smartdok-pdf/tilgang'
import 'server-only'

/* Kalles serverside av SmartDok til PDF med brukerens navet-token. */

export async function GET(request: Request) {
  const bruker = await krevSmartdokPdfTilgang(request)
  if (bruker instanceof Response) return bruker

  // Over 1000 prosjekter kappes ellers stille av PostgREST; nummer er unikt, så sorteringen er stabil.
  // Bare aktive: et prosjekt som er deaktivert eller ferdigmeldt i SmartDok skal ikke kunne velges (Thomas).
  let data
  try {
    data = await alleRader<{ nummer: unknown; navn: unknown; kunde: unknown; aktiv: unknown }>('prosjektene', (fra, til) =>
      supabaseAdmin
        .from('prosjekter')
        .select('nummer, navn, kunde, aktiv')
        .eq('aktiv', true)
        .order('nummer')
        .range(fra, til),
    )
  } catch {
    return feil('Kunne ikke hente prosjektene.', 500)
  }

  const prosjekter = data
    .map((r) => ({
      nummer: String(r.nummer),
      navn: String(r.navn),
      kunde: (r.kunde as string | null) ?? null,
      aktiv: r.aktiv === true,
    }))
    // Høyeste nummer først. Numerisk, så 900 kommer før 99.
    .sort((a, b) => b.nummer.localeCompare(a.nummer, 'nb', { numeric: true }))

  await logg('smartdok_pdf.prosjekter_hentet', {
    utfortAv: bruker.id,
    utfortAvEpost: bruker.epost,
    detaljer: { antall: prosjekter.length },
  })

  return Response.json({ prosjekter }, { headers: { 'Cache-Control': 'private, no-store' } })
}
