import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import 'server-only'

/**
 * Klient med service role-nøkkel mot adminbordets EGEN database.
 * Omgår all radsikkerhet.
 *
 * Brukes til det den innloggede brukeren ikke kan gjøre selv: lese
 * krypterte hemmeligheter, opprette auth-brukere, og skrive
 * statusmålinger fra cron-ruten der ingen er innlogget.
 *
 * Hvert kallsted må selv ha verifisert tilgang først – vanligvis med
 * `krevAdmin()`. Ligger nøkkelen i hendene på en rute som ikke sjekker,
 * er radsikkerheten i praksis avslått.
 *
 * `server-only` gjør at bygget feiler hvis fila importeres fra en
 * klientkomponent, i stedet for at nøkkelen stille havner i nettleseren.
 */
export const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)
