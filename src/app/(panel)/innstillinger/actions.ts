'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { forkort, krypter } from '@/lib/krypto'
import { hentSupabaseProsjekter } from '@/lib/plattform/supabase-api'
import { logg } from '@/lib/data'
import { ROTASJON_DAGER } from '@/lib/rotasjon'

export type TokenTilstand = { feil?: string; ok?: string }

const skjema = z.object({
  kontoId: z.string().uuid(),
  token: z
    .string()
    .trim()
    .min(20, 'Tokenet ser for kort ut')
    .startsWith('sbp_', 'Et Supabase personal access token begynner med sbp_'),
})

/**
 * Bytter tokenet for en Supabase-konto.
 *
 * Dette er en RUTINE, ikke et unntak: et personal access token kan ikke
 * avgrenses, og eieren roterer dem hver 30. dag. Da må rotasjonen være
 * enkel – et token som er en jobb å bytte blir ikke byttet.
 *
 * Jeg mente først at innstillingssiden skulle være lesbar og ikke
 * redigerbar, med argumentet at et skjema her ville gi adminbordet makt
 * til å endre nøkkelen til alle prosjektene fra en nettleser. Det
 * argumentet gjaldt da tokenene lå i MILJØVARIABLER. Nå ligger de
 * kryptert i databasen, og kan altså alt endres uten utrulling – så
 * skjemaet gir ingen ny makt. Det gjør bare rotasjonen praktisk, og en
 * rotasjon som faktisk skjer er bedre sikkerhet enn en side som er trygg
 * å se på.
 *
 * Tokenet PRØVES før det lagres. Et token som ikke virker skal ikke inn i
 * databasen og se ut som om det gjør det – da ville statusen forsvinne
 * uten at noe forklarte hvorfor.
 */
export async function byttKontoToken(
  kontoId: string,
  _forrige: TokenTilstand,
  formData: FormData,
): Promise<TokenTilstand> {
  const meg = await krevEier()

  const felter = skjema.safeParse({
    kontoId,
    token: formData.get('token'),
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const { data: konto } = await supabaseAdmin
    .from('supabase_kontoar')
    .select('epost')
    .eq('id', kontoId)
    .single()

  if (!konto) return { feil: 'Fant ikke kontoen.' }

  // ── Prøv det først ──
  const prøve = await hentSupabaseProsjekter(felter.data.token)
  if (!prøve.ok) {
    return {
      feil: `Tokenet ble avvist av Supabase (${prøve.feil.melding}) – ikke lagret. Er det laget mens du var logget inn som ${konto.epost}?`,
    }
  }

  const { error } = await supabaseAdmin
    .from('supabase_kontoar')
    .update({
      token_kryptert: krypter(felter.data.token),
      hint: forkort(felter.data.token),
      sist_bekreftet: new Date().toISOString(),
      antall_prosjekter: prøve.data.length,
    })
    .eq('id', kontoId)

  if (error) return { feil: `Kunne ikke lagre: ${error.message}` }

  await logg('konto.token_byttet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    // Hintet, aldri tokenet. Nok til å se HVILKET token som ble satt,
    // for lite til å bruke det.
    detaljer: {
      konto: konto.epost,
      hint: forkort(felter.data.token),
      serProsjekter: prøve.data.length,
    },
  })

  revalidatePath('/innstillinger')
  revalidatePath('/')
  revalidatePath('/brukere')

  /*
   * Neste forfall står i kvitteringen.
   *
   * Rotasjonen er en 30-dagers rutine, og det øyeblikket man nettopp har
   * byttet er det eneste man med sikkerhet vet neste dato. Å si den her
   * gjør at den kan skrives i kalenderen med en gang, framfor at man må
   * tilbake til siden for å finne ut når.
   */
  const neste = new Date(Date.now() + ROTASJON_DAGER * 24 * 60 * 60 * 1000)

  return {
    ok:
      `Tokenet er byttet og virker – ser ${prøve.data.length} prosjekter. ` +
      `Neste bytte innen ${neste.toLocaleDateString('nb-NO')}. ` +
      `Husk å slette det gamle i Supabase-konsollet.`,
  }
}

/**
 * Fjerner tokenet for en konto.
 *
 * Finnes fordi det andre halve av en rotasjon er å bli kvitt det gamle.
 * Systemene under kontoen viser da «uvisst» med grunnen, som er sant –
 * framfor å vise gammel status som om den var fersk.
 */
export async function fjernKontoToken(kontoId: string) {
  const meg = await krevEier()

  const { data: konto } = await supabaseAdmin
    .from('supabase_kontoar')
    .select('epost')
    .eq('id', kontoId)
    .single()

  await supabaseAdmin
    .from('supabase_kontoar')
    .update({
      token_kryptert: null,
      hint: null,
      sist_bekreftet: null,
      antall_prosjekter: null,
    })
    .eq('id', kontoId)

  await logg('konto.token_fjernet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { konto: konto?.epost ?? null },
  })

  revalidatePath('/innstillinger')
  revalidatePath('/')
}
