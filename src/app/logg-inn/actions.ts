'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { lagServerKlient } from '@/lib/supabase/server'
import { BYTT_PASSORD_STI } from '@/lib/auth'

const skjema = z.object({
  epost: z.email('Ugyldig e-postadresse'),
  passord: z.string().min(1, 'Passord må fylles ut'),
})

export type LoggInnTilstand = { feil?: string }

export async function loggInn(
  _forrige: LoggInnTilstand,
  formData: FormData,
): Promise<LoggInnTilstand> {
  const felter = skjema.safeParse({
    epost: formData.get('epost'),
    passord: formData.get('passord'),
  })

  if (!felter.success) {
    return { feil: felter.error.issues[0].message }
  }

  const supabase = await lagServerKlient()

  const { data: økt, error } = await supabase.auth.signInWithPassword({
    email: felter.data.epost,
    password: felter.data.passord,
  })

  // Samme feilmelding uansett om e-posten finnes eller passordet er
  // feil. Ellers blir innloggingsskjemaet et verktøy for å kartlegge
  // hvem som har konto her – og her har kontoene nøklene til alt.
  if (error || !økt.user) {
    return { feil: 'Feil e-post eller passord.' }
  }

  const { data: admin } = await supabase
    .from('admin_brukere')
    .select('ma_bytte_passord')
    .eq('id', økt.user.id)
    .eq('aktiv', true)
    .single()

  if (!admin) {
    // En gyldig Supabase-bruker uten rad i admin_brukere skal ikke ha
    // en økt liggende. Logg ut med én gang, ellers står det en
    // halvinnlogget tilstand og skaper rare feil senere.
    await supabase.auth.signOut()
    return { feil: 'Denne kontoen har ikke tilgang til adminbordet.' }
  }

  redirect(admin.ma_bytte_passord ? BYTT_PASSORD_STI : '/')
}

export async function loggUt() {
  const supabase = await lagServerKlient()
  await supabase.auth.signOut()
  redirect('/logg-inn')
}
