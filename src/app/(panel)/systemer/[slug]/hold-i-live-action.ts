'use server'

import { revalidatePath } from 'next/cache'
import { krevEier } from '@/lib/auth'
import { hentTokenKart, tokenFor } from '@/lib/kontoar'
import {
  hentTimesaktivitet,
  hentProsjektNøkler,
  finnAnon,
} from '@/lib/plattform/supabase-api'
import { logg } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type LiveTilstand = {
  feil?: string
  ok?: string
  /** Hva vi faktisk observerte, linje for linje. Vises alltid. */
  logg?: string[]
}

/**
 * Sender et harmløst kall til databasen for å nullstille pause-klokka.
 *
 * Et gratisprosjekt uten trafikk i sju døgn blir pauset, og da er appen
 * nede. Denne knappen gir prosjektet et livstegn uten å røre data.
 *
 * VALG AV KALL: `GET /auth/v1/health` med prosjektets anon-nøkkel.
 * Alternativene ble prøvd mot et levende prosjekt:
 *   GET /rest/v1/            → 401, krever service_role
 *   GET /rest/v1/ (publishable) → 401, krever secret key
 *   GET /auth/v1/health      → 200 ✓
 * Health-endepunktet leser ingen data og endrer ingenting, men er et ekte
 * kall til prosjektets auth-tjeneste – altså trafikk på dataplanet, ikke
 * på kontrollplanet slik et Management-API-kall er.
 *
 * VERIFISERT AT DET TELLER: health-kallet dukket opp som `auth=1` i
 * timesbøtta til utleie-prosjektet fem minutter etter et klikk. Supabase
 * dokumenterer ikke presist hva som teller som «aktivitet», så funksjonen
 * leser likevel telleren FØR og ETTER og rapporterer hva den så. Den sier
 * aldri «ferdig» uten å ha sjekket.
 *
 * OPPLØSNINGEN ER TIMER, IKKE DØGN. Første versjon leste døgnbøttene, og
 * de ruller opp seint – knappen fikk samme tall før og etter, og måtte si
 * «uvisst» om noe som faktisk hadde virket. Timesbøtta oppdateres innen
 * minutter. Til pause-nedtellingen er døgn fortsatt riktig: der spør vi
 * hvilket DØGN det sist var trafikk, ikke om det kom et kall nå.
 */
export async function holdILive(
  systemId: string,
  _forrige: LiveTilstand,
  _formData: FormData,
): Promise<LiveTilstand> {
  const meg = await krevEier()
  const linjer: string[] = []

  const { data: system } = await supabaseAdmin
    .from('systemer')
    .select('navn, supabase_prosjekt_ref, konto_id')
    .eq('id', systemId)
    .single()

  const ref = system?.supabase_prosjekt_ref as string | null
  if (!ref) {
    return { feil: 'Systemet har ingen Supabase-database registrert.' }
  }

  const token = tokenFor(
    await hentTokenKart(),
    (system?.konto_id as string | null) ?? null,
  )
  if (!token) {
    return {
      feil: 'Mangler Supabase-token for kontoen som eier prosjektet. Uten det kan vi ikke hente anon-nøkkelen.',
    }
  }

  // ── 1. Trafikktelleren før, i TIMESoppløsning ──
  const før = await hentTimesaktivitet(token, ref)
  const førTall = før.ok ? før.data.forespørsler : null
  linjer.push(
    før.ok
      ? `Før: ${førTall} forespørsler i timen ${før.data.time ?? '(ingen bøtte ennå)'}`
      : `Før: kunne ikke lese telleren (${før.feil.melding})`,
  )

  // ── 2. Anon-nøkkelen ──
  const nøkler = await hentProsjektNøkler(token, ref)
  if (!nøkler.ok) {
    return {
      feil: `Kunne ikke hente anon-nøkkelen: ${nøkler.feil.melding}`,
      logg: linjer,
    }
  }
  const anon = finnAnon(nøkler.data)
  if (!anon) {
    return {
      feil: 'Fant ingen lesbar anon-nøkkel på prosjektet. Er de gamle JWT-nøklene slått av?',
      logg: linjer,
    }
  }
  linjer.push(`Hentet anon-nøkkel (${nøkler.data.length} nøkler på prosjektet)`)

  // ── 3. Selve livstegnet ──
  const start = Date.now()
  let status: number
  try {
    const r = await fetch(`https://${ref}.supabase.co/auth/v1/health`, {
      headers: { apikey: anon },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    status = r.status
    const kropp = await r.text().catch(() => '')
    linjer.push(
      `GET /auth/v1/health → HTTP ${status} på ${Date.now() - start} ms${
        kropp ? ` · ${kropp.slice(0, 120)}` : ''
      }`,
    )
  } catch (e) {
    linjer.push(
      `GET /auth/v1/health feilet: ${e instanceof Error ? e.message : 'ukjent'}`,
    )
    return { feil: 'Livstegnet kom ikke fram.', logg: linjer }
  }

  if (status !== 200) {
    return {
      feil: `Databasen svarte HTTP ${status} på health-kallet. Er prosjektet alt pauset?`,
      logg: linjer,
    }
  }

  await logg('system.holdt_i_live', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
    detaljer: { ref, status },
  })

  // ── 4. Telleren etter ──
  /*
   * Analysedataene ligger noen minutter etter, selv i timesoppløsning. Vi
   * leser likevel med en gang og sier hva vi ser – framfor å hevde at det
   * virket. Gikk telleren opp, er det bevist her og nå. Gikk den ikke opp,
   * er det etter alt å dømme bare forsinkelsen, og da skal det stå slik.
   */
  const etter = await hentTimesaktivitet(token, ref)
  const etterTall = etter.ok ? etter.data.forespørsler : null

  linjer.push(
    etter.ok
      ? `Etter: ${etterTall} forespørsler i timen ${etter.data.time ?? '(ingen bøtte ennå)'}`
      : `Etter: kunne ikke lese telleren (${etter.feil.melding})`,
  )

  revalidatePath('/')
  revalidatePath(`/systemer`)

  const gikkOpp =
    førTall !== null && etterTall !== null && etterTall > førTall

  return {
    logg: linjer,
    ok: gikkOpp
      ? `Databasen svarte, og trafikktelleren gikk opp fra ${førTall} til ${etterTall}. Pause-klokka skal være nullstilt.`
      : `Databasen svarte HTTP 200, så livstegnet kom fram og pause-klokka skal være nullstilt. Trafikktelleren har ikke oppdatert seg ennå – analysedataene ligger noen minutter etter. Trykk igjen om et par minutter om du vil se tallet bekrefte det.`,
  }
}
