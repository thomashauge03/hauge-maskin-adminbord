import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'

/**
 * Klient for adminbordets egen database, med den innloggede brukerens
 * sesjon. Bruker anon-nøkkelen, slik at radsikkerheten i databasen
 * gjelder – også for oss.
 */
export async function lagServerKlient() {
  const cookieStore = await cookies()

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Kalles fra en Server Component, der cookies ikke kan settes.
            // proxy.ts oppdaterer sesjonen, så dette er trygt å ignorere.
          }
        },
      },
    },
  )
}
