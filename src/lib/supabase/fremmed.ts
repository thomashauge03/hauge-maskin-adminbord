import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { dekrypter } from '@/lib/krypto'
import { hentTokenKart, tokenFor } from '@/lib/kontoar'
import { hentProsjektNøkler } from '@/lib/plattform/supabase-api'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Klient mot et ANNET systems Supabase-prosjekt.

   Brukes til det Management-API-et ikke kan gjøre: opprette brukere,
   sette passord, deaktivere kontoer. Lesing – som å liste brukere – går via
   Management-API-et i stedet, fordi det ikke krever at vi har nøkkelen i det
   hele tatt.

   TO VEIER TIL NØKKELEN, og rekkefølgen er lagret først.

   1. Lagret kryptert i `hemmeligheter`. Virker uten et management-token, og
      er den eneste veien for prosjekter kontoene våre ikke ser.
   2. Hentet fra Management-API-et med kontoens token, `?reveal=true`.

   Vei 2 kom til fordi vei 1 alene ikke holdt: `hemmeligheter` var TOM, og
   dermed feilet alt som krever service role – opprette bruker, sette passord,
   sperre konto – med «Ingen service role-nøkkel lagret». Å gi tilgang til en
   e-postnøklet app skrev raden og stoppet der, så personen fikk tilgang uten
   konto og kunne ikke logge inn.

   Vei 2 er dessuten den tryggere av de to: ingenting lagres, og en rotert
   nøkkel virker umiddelbart uten at noe må legges inn på nytt.

   Nøkkelen mellomlagres ikke i en modulvariabel: en langlevende prosess på
   Vercel ville da holdt sju produksjonsnøkler i minnet mellom forespørsler,
   uten at noen ba om det.
   ═══════════════════════════════════════════════════════════ */

export type FremmedKlient =
  | { ok: true; klient: SupabaseClient; url: string }
  | { ok: false; grunn: string }

/**
 * Lager en service role-klient mot et annet prosjekt.
 *
 * Returnerer en grunn i stedet for å kaste, fordi den vanligste
 * «feilen» ikke er en feil: systemet har rett og slett ikke fått lagret
 * nøkkel ennå, og da skal grensesnittet si det og tilby å hente den.
 */
export async function lagFremmedKlient(
  systemId: string,
): Promise<FremmedKlient> {
  const { data: system } = await supabaseAdmin
    .from('systemer')
    .select('navn, supabase_url, supabase_prosjekt_ref, konto_id')
    .eq('id', systemId)
    .single()

  if (!system?.supabase_url) {
    return { ok: false, grunn: 'Systemet har ingen Supabase-database registrert.' }
  }

  const url = system.supabase_url as string
  const lag = (nøkkel: string): FremmedKlient => ({
    ok: true,
    url,
    klient: createClient(url, nøkkel, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  })

  // ── Vei 1: lagret kryptert ──
  const { data: hemmelighet } = await supabaseAdmin
    .from('hemmeligheter')
    .select('verdi_kryptert')
    .eq('system_id', systemId)
    .eq('slag', 'service_role')
    .eq('navn', '')
    .single()

  if (hemmelighet) {
    try {
      return lag(dekrypter(hemmelighet.verdi_kryptert as string))
    } catch {
      /*
       * Nesten alltid fordi KRYPTONOKKEL er byttet.
       *
       * Faller VIDERE til vei 2 framfor å gi opp: en nøkkel vi ikke kan
       * dekryptere er like ubrukelig som ingen nøkkel, og hvis kontoens token
       * kan hente en fersk, er det bedre enn en feilmelding. Grunnen tas med
       * hvis også vei 2 feiler, slik at årsaken ikke går tapt.
       */
    }
  }

  // ── Vei 2: hentet fra Management-API-et ──
  const ref = system.supabase_prosjekt_ref as string | null
  if (!ref) {
    return {
      ok: false,
      grunn:
        'Ingen service role-nøkkel lagret, og systemet mangler prosjektreferanse – så den kan ikke hentes automatisk heller.',
    }
  }

  const token = tokenFor(await hentTokenKart(), system.konto_id as string | null)
  if (!token) {
    return {
      ok: false,
      grunn: `Ingen service role-nøkkel lagret, og ingen Supabase-token for kontoen som eier prosjektet – så den kan ikke hentes automatisk. Legg inn tokenet på /innstillinger, eller nøkkelen på systemsiden.`,
    }
  }

  const svar = await hentProsjektNøkler(token, ref)
  if (!svar.ok) {
    return {
      ok: false,
      grunn: `Ingen service role-nøkkel lagret, og den kunne ikke hentes: ${svar.feil.melding}`,
    }
  }

  const funnet = svar.data.find((n) => n.navn === 'service_role')?.verdi
  if (!funnet) {
    return {
      ok: false,
      grunn:
        'Prosjektet oppgir ingen service_role-nøkkel. Nyere prosjekter bruker «secret»-nøkler i stedet – da må den legges inn manuelt på systemsiden.',
    }
  }

  return lag(funnet)
}
