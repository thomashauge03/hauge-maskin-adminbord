import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { hentBearer } from './bearer'
import 'server-only'

const IKKE_LAGRES = { 'Cache-Control': 'private, no-store' }

export function feil(melding: string, status: number) {
  return Response.json({ feil: melding }, { status, headers: IKKE_LAGRES })
}

/**
 * Appen SmartDok til PDF kaller serverside med brukerens navet-token. Tokenet
 * sjekkes mot Supabase, og tilgangen avgjøres av databasefunksjonen, som bruker
 * auth.uid(). Derfor en klient med brukerens token og ikke supabaseAdmin, som
 * ikke har noen bruker og ville svart nei til alle.
 */
export async function krevSmartdokPdfTilgang(
  request: Request,
): Promise<{ id: string; epost: string } | Response> {
  const token = hentBearer(request.headers.get('authorization'))
  if (!token) return feil('Du må være logget inn.', 401)

  const klient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: bruker, error } = await klient.auth.getUser(token)
  if (error || !bruker.user) return feil('Innloggingen er ugyldig eller utløpt.', 401)

  const { data: harTilgang, error: tilgangsfeil } = await klient.rpc('smartdok_pdf_har_tilgang')
  // Feil i oppslaget regnes som nei: å slippe inn ved tvil er den verste feilen.
  if (tilgangsfeil || harTilgang !== true) return feil('Du har ikke tilgang til SmartDok til PDF.', 403)

  return { id: bruker.user.id, epost: bruker.user.email ?? '' }
}
