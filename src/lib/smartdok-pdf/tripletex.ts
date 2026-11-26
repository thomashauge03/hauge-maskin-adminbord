import { supabaseAdmin } from '@/lib/supabase/admin'
import { dekrypter } from '@/lib/krypto'
import { sesjonstoken } from '@/lib/tripletex/tilkobling'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Én Tripletex-økt til timer på ordre: nøkkelen dekrypteres, byttes mot et
   sesjonstoken (gyldig i fem minutter), og tokenet brukes på alle kall.

   Svarteksten fra Tripletex går aldri ut herfra, bare status og tolket
   JSON. Utviklervilkårene forbyr å lagre det de svarer, og feilmeldinger
   fra regnskaps-API-er gjentar ofte det vi sendte.
   ═══════════════════════════════════════════════════════════ */

const ADRESSE = 'https://tripletex.no/v2'
const TIDSAVBRUDD_MS = 20_000

export type Tripletexsvar = { status: number; json: unknown }

export type Tripletexøkt = {
  hent(sti: string): Promise<Tripletexsvar>
  send(sti: string, init: RequestInit): Promise<Tripletexsvar>
}

export async function apneTripletex(): Promise<Tripletexøkt> {
  const { data } = await supabaseAdmin
    .from('tripletex_tilkobling')
    .select('nokkel_kryptert')
    .eq('id', 1)
    .maybeSingle()
  if (!data?.nokkel_kryptert) throw new Error('Tripletex er ikke satt opp')

  let nøkkel: string
  try {
    nøkkel = dekrypter(data.nokkel_kryptert as string)
  } catch {
    throw new Error('Den lagrede Tripletex-nøkkelen kan ikke leses')
  }

  const token = await sesjonstoken(nøkkel)
  const autorisasjon = `Basic ${Buffer.from(`0:${token}`).toString('base64')}`

  async function send(sti: string, init: RequestInit): Promise<Tripletexsvar> {
    // Headers tar alle formene RequestInit godtar; å spre et Headers-objekt gir {} og mister alt.
    const hoder = new Headers(init.headers)
    if (!hoder.has('Accept')) hoder.set('Accept', 'application/json')
    hoder.set('Authorization', autorisasjon)
    let svar: Response
    try {
      svar = await fetch(`${ADRESSE}${sti}`, {
        ...init,
        headers: hoder,
        cache: 'no-store',
        signal: AbortSignal.timeout(TIDSAVBRUDD_MS),
      })
    } catch {
      // Feilen fra fetch siteres ikke: den kan inneholde det vi sendte.
      throw new Error('Fikk ikke kontakt med Tripletex.')
    }
    let json: unknown = null
    try {
      json = await svar.json()
    } catch {
      // Svar uten JSON er ubrukelig, og teksten skal uansett ikke videre.
    }
    return { status: svar.status, json }
  }

  return { hent: (sti) => send(sti, {}), send }
}
