import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'

/**
 * Het `middleware.ts` fram til Next.js 16.
 *
 * Eneste oppgave er å friske opp Supabase-sesjonen slik at man ikke
 * blir kastet ut midt i en økt. Selve tilgangskontrollen ligger i
 * `krevAdmin()`, kalt fra hver side og hver server action –
 * Next-dokumentasjonen er tydelig på at proxy ikke skal være eneste
 * autorisasjonsmekanisme, blant annet fordi server actions kjører som
 * POST mot siden de brukes fra.
 *
 * Matcheren utelater innloggingssiden og cron-ruten: der finnes ingen
 * sesjon å friske opp, og et unødvendig nettverkskall til Supabase per
 * forespørsel gjør bare innlogging tregere.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/((?!logg-inn|api/status|_next/static|_next/image|.*\\.png$).*)'],
}
