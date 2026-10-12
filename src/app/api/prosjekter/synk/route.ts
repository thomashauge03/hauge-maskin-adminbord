import { env } from '@/lib/env'
import { synkProsjekter } from '@/lib/prosjekter/synk'

/* ═══════════════════════════════════════════════════════════
   Prosjektsynken, kalt av pg_cron i navet hvert kvarter.

   Ikke en Vercel-cron: Hobby-planen tillater én i døgnet, og den brukes av
   statusmålingen. Et prosjekt som opprettes i utleie skal ikke bruke et
   døgn på å nå lageret. pg_cron og pg_net er alt installert i navet.
   ═══════════════════════════════════════════════════════════ */

// Fem apper, hver med henting, innsetting og endringer. Godt under låsen.
export const maxDuration = 120

async function kjør(request: Request) {
  // Samme hemmelighet som statusmålingen. Mangler den, avvises alt.
  const oppgitt = request.headers.get('authorization')
  if (!env.CRON_SECRET || oppgitt !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ feil: 'Ikke autorisert' }, { status: 401 })
  }

  try {
    return Response.json(await synkProsjekter())
  } catch (e) {
    return Response.json({ feil: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export const GET = kjør
export const POST = kjør
