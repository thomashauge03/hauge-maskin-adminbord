'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { krevInnlogget } from '@/lib/auth'
import { lagServerKlient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type ByttPassordTilstand = { feil?: string }

const skjema = z
  .object({
    // Adminbordet holder nøklene til alt annet. 12 tegn er derfor
    // minimum her, mot 8 i de andre appene.
    passord: z.string().min(12, 'Passordet må være minst 12 tegn'),
    gjenta: z.string(),
  })
  .refine((v) => v.passord === v.gjenta, {
    message: 'Passordene er ikke like',
    path: ['gjenta'],
  })

export async function byttPassord(
  _forrige: ByttPassordTilstand,
  formData: FormData,
): Promise<ByttPassordTilstand> {
  // krevInnlogget, ikke krevAdmin: krevAdmin ville sendt brukeren
  // tilbake hit i en evig omdirigering.
  const bruker = await krevInnlogget()

  const felter = skjema.safeParse({
    passord: formData.get('passord'),
    gjenta: formData.get('gjenta'),
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const supabase = await lagServerKlient()
  const { error } = await supabase.auth.updateUser({
    password: felter.data.passord,
  })
  if (error) return { feil: `Kunne ikke endre passord: ${error.message}` }

  /*
   * Flagget må fjernes med service role.
   *
   * Policyen på admin_brukere lar bare eier oppdatere rader, og en
   * drift-bruker som nettopp har byttet passord ville derfor blitt
   * stående med flagget satt – og sendt hit igjen ved neste sidelast.
   */
  const { data: nullstilt, error: flaggFeil } = await supabaseAdmin
    .from('admin_brukere')
    .update({ ma_bytte_passord: false })
    .eq('id', bruker.id)
    .select('id')

  /*
   * Utfallet MÅ sjekkes, og det er ikke pedanteri.
   *
   * Feiler denne, er passordet byttet men flagget står. Da sender redirect('/')
   * brukeren til krevAdmin, som sender hen tilbake hit, som bytter passordet
   * igjen … en evig løkke uten en eneste melding om hva som er galt. Resultatet
   * ble kastet her før.
   */
  if (flaggFeil || !nullstilt || nullstilt.length === 0) {
    return {
      feil: `Passordet er endret, men flagget «må bytte passord» kunne ikke fjernes${flaggFeil ? `: ${flaggFeil.message}` : ' – ingen rad ble oppdatert, så kontoen mangler kanskje en rad i admin_brukere'}. Logg inn med det nye passordet; blir du sendt hit igjen, må flagget fjernes i databasen.`,
    }
  }

  redirect('/')
}
