'use server'

import { revalidatePath } from 'next/cache'
import { krevEier } from '@/lib/auth'
import { hentTokenKart, tokenFor } from '@/lib/kontoar'
import {
  hentAktivitet,
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
 * ÆRLIGHET OM VIRKNINGEN: Supabase dokumenterer ikke presist hva som
 * teller som «aktivitet» for pause-timeren. Derfor leser denne funksjonen
 * trafikktelleren FØR og ETTER, og rapporterer hva den så. Den sier aldri
 * «ferdig» uten å ha sjekket – en knapp som later som er verre enn ingen
 * knapp, fordi man da tror problemet er løst.
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

  // ── 1. Trafikktelleren før ──
  const før = await hentAktivitet(token, ref)
  const førTall = før.ok
    ? (før.data.perDøgn.at(-1)?.forespørsler ?? 0)
    : null
  linjer.push(
    før.ok
      ? `Før: siste døgn med trafikk hadde ${førTall} forespørsler${
          før.data.dagerSiden !== null ? `, for ${før.data.dagerSiden} døgn siden` : ''
        }`
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
   * Analysedataene ligger etter, ofte et par minutter. Vi leser likevel
   * med en gang og sier hva vi ser – framfor å hevde at det virket.
   * Gikk telleren opp, er det bevist. Gikk den ikke opp, er det uavklart,
   * og da skal det stå uavklart.
   */
  const etter = await hentAktivitet(token, ref)
  const etterTall = etter.ok
    ? (etter.data.perDøgn.at(-1)?.forespørsler ?? 0)
    : null

  linjer.push(
    etter.ok
      ? `Etter: siste døgn har ${etterTall} forespørsler`
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
      : `Databasen svarte HTTP 200, så den er i live. Men trafikktelleren har ikke gått opp ennå – analysedataene ligger typisk et par minutter etter, så det er ikke et tegn på at det ikke virket. Last siden om litt for å se om tallet flytter seg.`,
  }
}
