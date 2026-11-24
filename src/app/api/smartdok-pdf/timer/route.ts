import { logg } from '@/lib/data'
import { lesFraSmartdok } from '@/lib/prosjekter/smartdok'
import { feil, krevSmartdokPdfTilgang } from '@/lib/smartdok-pdf/tilgang'
import { delPeriode, sjekkPeriode, tolkMaskiner, tolkNavn, tolkTimer } from '@/lib/smartdok-pdf/tolk-timer'
import 'server-only'

/* Kalles serverside av SmartDok til PDF med brukerens navet-token. */

// Opptil fire perioder à 15 s, pluss brukere og maskiner, kalt etter hverandre.
export const maxDuration = 120

export async function GET(request: Request) {
  const bruker = await krevSmartdokPdfTilgang(request)
  if (bruker instanceof Response) return bruker

  const sok = new URL(request.url).searchParams
  const prosjekt = (sok.get('prosjekt') ?? '').trim()
  const fra = sok.get('fra') ?? ''
  const til = sok.get('til') ?? ''
  if (!prosjekt) return feil('Velg et prosjekt.', 400)
  const periodefeil = sjekkPeriode(fra, til)
  if (periodefeil) return feil(periodefeil, 400)

  const biter = delPeriode(fra, til)
  const stier = [
    '/Users?all=true',
    '/Machines?all=true',
    ...biter.map(
      (b) =>
        `/WorkHours?fromDate=${b.fra}&toDate=${b.til}T23:59:59&onlyAttested=false&includeExported=true&includeMachineHours=true`,
    ),
  ]

  let timer
  try {
    const [brukere, maskiner, ...rader] = await lesFraSmartdok(stier)
    const navn = tolkNavn(brukere)
    const maskinnavn = tolkMaskiner(maskiner)
    // Ingen delvise data: feiler én bit, feiler hele svaret.
    timer = rader.flatMap((r) => tolkTimer(r, prosjekt, navn, maskinnavn))
  } catch (e) {
    const melding = e instanceof Error ? e.message : 'Kunne ikke hente timer fra SmartDok.'
    // Bare prosjekt og periode og vår egen feilmelding; aldri timer eller token.
    await logg('smartdok_pdf.timer_feilet', {
      utfortAv: bruker.id,
      utfortAvEpost: bruker.epost,
      detaljer: { prosjekt, fra, til, feil: melding },
    })
    return feil(melding, 502)
  }

  await logg('smartdok_pdf.timer_hentet', {
    utfortAv: bruker.id,
    utfortAvEpost: bruker.epost,
    detaljer: { prosjekt, fra, til, antall: timer.length },
  })

  return Response.json({ timer }, { headers: { 'Cache-Control': 'private, no-store' } })
}
