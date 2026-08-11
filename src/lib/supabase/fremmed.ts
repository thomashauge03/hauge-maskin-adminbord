import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { dekrypter } from '@/lib/krypto'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Klient mot et ANNET systems Supabase-prosjekt.

   Brukes til det Management-API-et ikke kan gjøre: opprette brukere,
   sette passord, deaktivere kontoer. Lesing – som å liste brukere –
   går via Management-API-et i stedet, fordi det ikke krever at vi har
   nøkkelen i det hele tatt.

   Nøkkelen hentes kryptert fra databasen og dekrypteres per kall. Den
   mellomlagres ikke i en modulvariabel: en langlevende prosess på
   Vercel ville da holdt sju produksjonsnøkler i minnet mellom
   forespørsler, uten at noen ba om det.
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
    .select('navn, supabase_url, supabase_prosjekt_ref')
    .eq('id', systemId)
    .single()

  if (!system?.supabase_url) {
    return { ok: false, grunn: 'Systemet har ingen Supabase-database registrert.' }
  }

  const { data: hemmelighet } = await supabaseAdmin
    .from('hemmeligheter')
    .select('verdi_kryptert')
    .eq('system_id', systemId)
    .eq('slag', 'service_role')
    .eq('navn', '')
    .single()

  if (!hemmelighet) {
    return {
      ok: false,
      grunn:
        'Ingen service role-nøkkel lagret for dette systemet. Hent den på systemsiden.',
    }
  }

  let nøkkel: string
  try {
    nøkkel = dekrypter(hemmelighet.verdi_kryptert as string)
  } catch {
    // Nesten alltid fordi KRYPTONOKKEL er byttet. Å si det rett ut
    // sparer en lang feilsøking i noe som ser ut som en API-feil.
    return {
      ok: false,
      grunn:
        'Nøkkelen kan ikke dekrypteres. Er KRYPTONOKKEL byttet? Da må nøklene legges inn på nytt.',
    }
  }

  return {
    ok: true,
    url: system.supabase_url as string,
    klient: createClient(system.supabase_url as string, nøkkel, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  }
}
