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
  // pg_cron bruker sin egen nøkkel, CRON_SECRET virker for hånd. Mangler
  // begge, avvises alt.
  const oppgitt = request.headers.get('authorization')
  const godtatt = [env.PROSJEKT_SYNK_NOKKEL, env.CRON_SECRET].filter(Boolean).map((n) => `Bearer ${n}`)
  if (!oppgitt || !godtatt.includes(oppgitt)) {
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
