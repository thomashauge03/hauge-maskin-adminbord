'use server'

import { revalidatePath } from 'next/cache'
import { krevEier } from '@/lib/auth'
import { hentTokenKart, tokenFor } from '@/lib/kontoar'
import { hentAktivBudsjett, startProsjekt } from '@/lib/plattform/supabase-api'
import { sendLivstegn } from '@/lib/livstegn'
import { logg } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type LiveTilstand = {
  feil?: string
  ok?: string
  /** Hva vi faktisk observerte, linje for linje. Vises alltid. */
  logg?: string[]
}

/* ═══════════════════════════════════════════════════════════
   HVORFOR DENNE BLE SKREVET OM.

   Første versjon sendte `GET /auth/v1/health` med anon-nøkkelen, og meldte
   «pause-klokka er nullstilt» på HTTP 200. Den påstanden var feil, og målt
   mot virkeligheten:

     utleie   klikk 2026-08-26 kl 13:01, HTTP 200, loggført
              trafikkbøtta for 2026-08-26: auth=1 rest=0
              status i dag: INACTIVE

   Helsekallet er GoTrue som svarer «jeg lever». Det rører ALDRI databasen, og
   Supabase pauset prosjektet likevel. Mønsteret er entydig på tvers av alle
   åtte prosjekt: hvert prosjekt som har holdt seg oppe har `rest > 0`, hvert
   prosjekt som ble pauset hadde bare `auth`.

   Nå gjøres to kall som begge treffer Postgres:

     1. `select 1` gjennom Management-API-ets lesespørring. Åpner en ekte
        forbindelse til basen og kjører SQL. Beviser at databasen svarer.
     2. Et anon-kall mot PostgREST med `limit=0`. Går gjennom Kong til
        PostgREST til Postgres, og er den trafikken som teller som `rest`.

   Nummer 2 er den som antas å nullstille pause-klokka, fordi det er den
   trafikktypen de levende prosjektene har. Det er en SLUTNING fra observasjon,
   ikke noe Supabase dokumenterer – og meldingen sier det, framfor å love noe
   jeg ikke kan stå for. Det var nettopp den overtroen som gjorde at forrige
   versjon så ut til å virke i to uker.

   `limit=0` framfor `limit=1`: spørringen kjøres, men ingen rader krysser
   nettet. Vi vil ha et databasetreff, ikke data.
   ═══════════════════════════════════════════════════════════ */

/**
 * Sender et livstegn til databasen for å nullstille pause-klokka.
 *
 * Et gratisprosjekt uten trafikk i sju døgn blir pauset, og da er appen nede.
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
    .select('navn, supabase_prosjekt_ref, konto_id, livstegn_tabell')
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
      feil: 'Mangler Supabase-token for kontoen som eier prosjektet. Uten det kan vi verken spørre databasen eller hente anon-nøkkelen.',
    }
  }

  // Selve livstegnet ligger i src/lib/livstegn.ts, delt med cron-en. To
  // kopier ville før eller senere blitt to ulike definisjoner av «i live».
  const tegn = await sendLivstegn(
    token,
    ref,
    (system?.livstegn_tabell as string | null) ?? null,
  )
  linjer.push(...tegn.linjer)

  if (!tegn.basenSvarte) {
    return {
      logg: linjer,
      feil: tegn.serPausetUt
        ? 'Databasen tar ikke imot forbindelser. Det er mønsteret for et PAUSET prosjekt – et livstegn hjelper ikke da, prosjektet må startes igjen.'
        : 'Databasen svarte ikke på «select 1». Se loggen under.',
    }
  }
  if (!tegn.restNåddeFram) {
    return {
      logg: linjer,
      feil: 'Databasen er oppe, men rest-kallet nådde ikke fram – og det er den trafikktypen som ser ut til å holde prosjektet i live. Livstegnet er halvveis.',
    }
  }

  /*
   * ── 4. Budsjettet ──
   *
   * Et livstegn kan ikke hjelpe en konto som er full. Har kontoen alt to
   * aktive prosjekt, MÅ et tredje stå pauset – og uten dette tallet ser det ut
   * som en feil i adminbordet framfor en grense hos Supabase.
   */
  const budsjett = await hentAktivBudsjett(token)
  if (budsjett.ok) {
    const { aktive, grense, totalt } = budsjett.data
    linjer.push(
      `Kontoen har ${aktive} av ${grense} aktive prosjekt (${totalt} i alt)${
        aktive >= grense && totalt > grense
          ? ' – FULL. Et pauset prosjekt på denne kontoen kan ikke startes før et annet pauses.'
          : ''
      }`,
    )
  }

  await logg('system.holdt_i_live', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
    // Loggen bærer HVA som gikk gjennom, ikke bare at knappen ble trykt. Det
    // var nettopp en logg full av «status: 200» som gjorde at feilen sto i to
    // uker: hvert klikk var loggført som en suksess, og prosjektet ble pauset.
    detaljer: {
      ref,
      basenSvarte: tegn.basenSvarte,
      restNåddeFram: tegn.restNåddeFram,
    },
  })

  revalidatePath('/')
  revalidatePath('/systemer')

  return {
    logg: linjer,
    ok: `Databasen svarte på «select 1», og et rest-kall gikk gjennom til Postgres. Det er den trafikktypen prosjektene som holder seg oppe har – men at det nullstiller pause-klokka er sluttet fra observasjon, ikke dokumentert av Supabase. Sjekk «sist trafikk» på oversikten i morgen; står den fortsatt på i dag, virket det.`,
  }
}

/**
 * Starter et pauset prosjekt igjen.
 *
 * Egen handling framfor en del av livstegnet: et livstegn til en pauset base
 * gjør ingenting, og å starte et prosjekt tar minutter og koster en plass i
 * kontoens budsjett. Det skal være et valg, ikke en bieffekt.
 */
export async function startProsjektIgjen(
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
  if (!ref) return { feil: 'Systemet har ingen Supabase-database registrert.' }

  const token = tokenFor(
    await hentTokenKart(),
    (system?.konto_id as string | null) ?? null,
  )
  if (!token) {
    return { feil: 'Mangler Supabase-token for kontoen som eier prosjektet.' }
  }

  /*
   * Budsjettet sjekkes FØR forsøket.
   *
   * Er kontoen full, feiler restaureringen med en melding fra Supabase som
   * ikke sier hvorfor. Å si det på forhånd sparer en feilsøking av noe som
   * ikke er en feil.
   */
  const budsjett = await hentAktivBudsjett(token)
  if (budsjett.ok) {
    const { aktive, grense } = budsjett.data
    linjer.push(`Kontoen har ${aktive} av ${grense} aktive prosjekt`)
    if (aktive >= grense) {
      return {
        logg: linjer,
        feil: `Kontoen har alt ${aktive} aktive prosjekt, som er grensen på gratisplanen. Et prosjekt må pauses før dette kan startes – eller kontoen må oppgraderes. Dette er en grense hos Supabase, ikke en feil.`,
      }
    }
  }

  const svar = await startProsjekt(token, ref)
  if (!svar.ok) {
    linjer.push(`POST /restore → ${svar.feil.melding}`)
    await logg('system.start_feilet', {
      utfortAv: meg.id,
      utfortAvEpost: meg.epost,
      systemId,
      detaljer: { ref, feil: svar.feil.melding },
    })
    return { logg: linjer, feil: `Kunne ikke starte prosjektet: ${svar.feil.melding}` }
  }

  linjer.push(`POST /restore → satt i gang på ${svar.svartidMs} ms`)

  await logg('system.startet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
    detaljer: { ref },
  })

  revalidatePath('/')
  revalidatePath('/systemer')

  return {
    logg: linjer,
    // Supabase svarer 200 når restaureringen er SATT I GANG, ikke når basen er
    // oppe. Uten denne setningen ser det ut som knappen ikke virket.
    ok: `Prosjektet startes nå. Det tar noen minutter, og statusen står som pauset til den er ferdig – last siden på nytt om litt. Husk at klokka begynner å gå igjen: uten trafikk i sju døgn pauses den på nytt.`,
  }
}
