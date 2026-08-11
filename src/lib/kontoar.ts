import { cache } from 'react'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { dekrypter, forkort } from '@/lib/krypto'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Supabase-kontoene, og hvilket token som gjelder for hvert system.

   Systemene er fordelt på fire ulike Supabase-innlogginger. Et personal
   access token rekker bare prosjekter i organisasjoner den kontoen er
   med i, så ETT token kan ikke se alt. Tokenet hører til kontoen.

   Rekkefølgen for et gitt system:
     1. Kontoens eget token, kryptert i supabase_kontoar
     2. SUPABASE_MANAGEMENT_TOKEN fra miljøet
     3. ingenting – systemet vises som uvisst, med grunnen

   Steg 2 finnes for at adminbordet skal virke første gang det startes,
   før noen kontoer er lagt inn. Uten den fallbacken måtte databasen
   fylles før noe som helst kunne vises, inkludert siden som forklarer
   hva som mangler.
   ═══════════════════════════════════════════════════════════ */

export type Konto = {
  id: string
  epost: string
  beskrivelse: string | null
  harToken: boolean
  hint: string | null
  sistBekreftet: string | null
  antallProsjekter: number | null
}

/**
 * Kontoene, uten tokenverdiene.
 *
 * Trygg å bruke i visninger: `harToken` og `hint` sier om et token
 * finnes og hvilket det er, uten å gi det ut.
 */
/**
 * `hentetMs` følger med fordi visningen trenger et tidspunkt å regne
 * tokenets alder fra, og en komponent som leser klokka under rendring
 * ikke er ren. Tidspunktet er en egenskap ved hentingen, ikke ved
 * visningen – så det hører her.
 */
export async function hentKontoar(): Promise<{
  kontoar: Konto[]
  hentetMs: number
}> {
  const { data } = await supabaseAdmin
    .from('supabase_kontoar')
    .select(
      'id, epost, beskrivelse, token_kryptert, hint, sist_bekreftet, antall_prosjekter',
    )
    .order('epost')

  return {
    hentetMs: Date.now(),
    kontoar: (data ?? []).map((r) => ({
      id: r.id as string,
      epost: r.epost as string,
      beskrivelse: r.beskrivelse as string | null,
      harToken: Boolean(r.token_kryptert),
      hint: r.hint as string | null,
      sistBekreftet: r.sist_bekreftet as string | null,
      antallProsjekter: r.antall_prosjekter as number | null,
    })),
  }
}

/**
 * Tokenene i klartekst, per konto-id, pluss miljøvariabelen under
 * nøkkelen `null` for systemer uten konto.
 *
 * Pakket i `cache()` fordi oversikten spør for hvert system i samme
 * forespørsel. Uten den ville tolv systemer gitt tolv oppslag og tolv
 * dekrypteringer av de samme fire tokenene.
 *
 * `cache()` er per forespørsel, ikke et varig hurtiglager. Det er
 * poenget: et token som fjernes skal være borte ved neste sidelast.
 */
export const hentTokenKart = cache(
  async (): Promise<Map<string | null, string>> => {
    return (await hentKontoOppslag()).tokens
  },
)

/**
 * Kontoene, tokenene OG e-postene i ETT databasekall.
 *
 * Oversikten trenger alle tre. Var de tre funksjoner med hver sin
 * spørring, ble det tre nettverksrunder på rad før det første
 * plattformkallet i det hele tatt startet – og på en side som alt har sju
 * slike bølger, er hver runde man kan fjerne merkbar.
 */
export const hentKontoOppslag = cache(
  async (): Promise<{
    tokens: Map<string | null, string>
    epostFor: Map<string, string>
  }> => {
    const kart = new Map<string | null, string>()
    const epostFor = new Map<string, string>()

    if (env.SUPABASE_MANAGEMENT_TOKEN) {
      kart.set(null, env.SUPABASE_MANAGEMENT_TOKEN)
    }

    const { data } = await supabaseAdmin
      .from('supabase_kontoar')
      .select('id, epost, token_kryptert')

    for (const rad of data ?? []) {
      epostFor.set(rad.id as string, rad.epost as string)
      if (!rad.token_kryptert) continue
      try {
        kart.set(rad.id as string, dekrypter(rad.token_kryptert as string))
      } catch {
        // Nesten alltid at KRYPTONOKKEL er byttet. Hopper over denne
        // kontoen framfor å ta ned hele oversikten – systemene under
        // den vises da som uvisst, som er sant.
        console.error(
          `Kunne ikke dekryptere token for konto ${rad.epost}. Er KRYPTONOKKEL byttet?`,
        )
      }
    }

    return { tokens: kart, epostFor }
  },
)

/**
 * Tokenet som gjelder for et system, eller null.
 *
 * `kontoId` er systemets `konto_id`. Er den null, eller mangler kontoen
 * et token, faller den tilbake på miljøvariabelen.
 */
export function tokenFor(
  kart: Map<string | null, string>,
  kontoId: string | null,
): string | null {
  if (kontoId && kart.has(kontoId)) return kart.get(kontoId)!
  return kart.get(null) ?? null
}

/** Lagrer et token for en konto, kryptert. Kallstedet må ha kalt krevEier(). */
export async function lagreKontoToken(
  kontoId: string,
  token: string,
): Promise<{ feil?: string }> {
  const { krypter } = await import('@/lib/krypto')

  const { error } = await supabaseAdmin
    .from('supabase_kontoar')
    .update({ token_kryptert: krypter(token), hint: forkort(token) })
    .eq('id', kontoId)

  return error ? { feil: error.message } : {}
}

/**
 * Skriver ned at et token virket, og hvor mange prosjekter det så.
 *
 * Finnes for at et utløpt token skal kunne oppdages før noen lurer på
 * hvorfor statusen forsvant. Ser tokenet plutselig færre prosjekter enn
 * sist, er det verdt å se på.
 */
export async function merkKontoBekreftet(
  kontoId: string,
  antallProsjekter: number,
): Promise<void> {
  await supabaseAdmin
    .from('supabase_kontoar')
    .update({
      sist_bekreftet: new Date().toISOString(),
      antall_prosjekter: antallProsjekter,
    })
    .eq('id', kontoId)
}
