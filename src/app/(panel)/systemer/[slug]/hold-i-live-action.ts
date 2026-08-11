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
 * timesbøtta til utleie-prosjektet noen minutter etter et klikk. Kallet
 * registreres altså som trafikk.
 *
 * HVA SOM ER BEVISET, OG HVA SOM IKKE ER DET. Beviset er HTTP 200: da har
 * databasen svart på en forespørsel til dataplanet, og det er det som
 * nullstiller pause-klokka. Trafikktelleren er bare en ETTERPÅ-bekreftelse.
 *
 * Jeg forsøkte først å bevise det ved å lese telleren før og etter i samme
 * forespørsel. Det kan ikke virke: de to lesningene skjer ett sekund fra
 * hverandre, mens analysedataene henger noen minutter etter – så tallet er
 * per definisjon uendret, og meldingen måtte hedge om noe som hadde virket.
 * Instrumentet var feil, ikke mekanismen.
 *
 * Nå gjør den ett kall og sier hva som skjedde. Telleren vises som
 * kontekst, med tidsstempelet på bøtta, slik at man selv ser at den
 * gjelder en tidligere time.
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

  // ── 1. Anon-nøkkelen ──
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

  // ── 2. Selve livstegnet ──
  const start = Date.now()
  let status: number
  let svartid = 0
  try {
    const r = await fetch(`https://${ref}.supabase.co/auth/v1/health`, {
      headers: { apikey: anon },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    status = r.status
    svartid = Date.now() - start
    const kropp = await r.text().catch(() => '')
    linjer.push(
      `GET /auth/v1/health → HTTP ${status} på ${svartid} ms${
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

  /*
   * Telleren leses som KONTEKST, ikke som bevis.
   *
   * Bøtta som kommer tilbake gjelder en tidligere time – analysedataene
   * henger noen minutter etter – så tidsstempelet vises alltid sammen med
   * tallet. Uten det ser tallet ut som «nå», og da lurer det.
   */
  const teller = await hentTimesaktivitet(token, ref)
  linjer.push(
    teller.ok
      ? `Supabase har registrert ${teller.data.forespørsler} forespørsler i timen ${teller.data.time ?? '(ingen bøtte ennå)'} – analysedata henger noen minutter, så dette er ikke kallet over`
      : `Kunne ikke lese trafikktelleren (${teller.feil.melding})`,
  )

  revalidatePath('/')
  revalidatePath('/systemer')

  return {
    logg: linjer,
    ok: `Databasen svarte HTTP 200 på ${svartid} ms. Livstegnet kom fram, og pause-klokka er nullstilt.`,
  }
}
