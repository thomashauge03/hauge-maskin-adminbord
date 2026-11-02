'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import { forkort, krypter } from '@/lib/krypto'
import { OBJEKTPROSJEKT, prøvTripletexNøkkel } from '@/lib/tripletex/tilkobling'

export type Tripletexsvar = { feil?: string; ok?: string }

const skjema = z.object({
  nøkkel: z.string().trim().min(16, 'Nøkkelen ser for kort ut').max(4000),
})

/**
 * Legger inn eller bytter Tripletex-nøkkelen. Bare eieren: nøkkelen skal få
 * føre bilag i regnskapet.
 *
 * Prøves før den lagres, så en nøkkel til feil regnskap eller uten
 * lesetilgang stopper her og ikke midt i den første kjøringen.
 */
export async function lagreTripletexNøkkel(_forrige: Tripletexsvar, formData: FormData): Promise<Tripletexsvar> {
  const meg = await krevEier()

  const felter = skjema.safeParse({ nøkkel: formData.get('nokkel') ?? '' })
  if (!felter.success) return { feil: felter.error.issues[0].message }
  const { nøkkel } = felter.data

  let prøve
  try {
    prøve = await prøvTripletexNøkkel(nøkkel)
  } catch (e) {
    return { feil: `Ikke lagret. ${e instanceof Error ? e.message : String(e)}` }
  }
  if (!prøve.objektprosjekt) {
    return { feil: 'Ikke lagret. Nøkkelen får ikke lese prosjekter i Tripletex. Gi den tilgang til Prosjekt.' }
  }
  if (!prøve.kanLeseHovedbok) {
    return { feil: 'Ikke lagret. Nøkkelen får ikke lese kontoplanen i Tripletex. Gi den tilgang til Regnskap.' }
  }

  const { error } = await supabaseAdmin
    .from('tripletex_tilkobling')
    .update({ nokkel_kryptert: krypter(nøkkel), hint: forkort(nøkkel), firma: prøve.firma })
    .eq('id', 1)
  if (error) return { feil: `Kunne ikke lagre: ${error.message}` }

  await logg('tripletex.nokkel_lagt_inn', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { hint: forkort(nøkkel), firma: prøve.firma, serObjektprosjekt: prøve.objektprosjekt.finnes },
  })

  revalidatePath('/innstillinger')
  // Lagret også uten 2011700: prosjektet kan opprettes etterpå, og nøkkelen er riktig.
  return {
    ok: prøve.objektprosjekt.finnes
      ? `Nøkkelen virker mot ${prøve.firma} og ser prosjekt ${OBJEKTPROSJEKT}.`
      : `Nøkkelen virker mot ${prøve.firma}, men fant ikke prosjekt ${OBJEKTPROSJEKT} i Tripletex.`,
  }
}

export async function fjernTripletexNøkkel(): Promise<void> {
  const meg = await krevEier()
  const { error } = await supabaseAdmin
    .from('tripletex_tilkobling')
    .update({ nokkel_kryptert: null, hint: null, firma: null })
    .eq('id', 1)
  await logg(error ? 'tripletex.nokkel_fjern_feilet' : 'tripletex.nokkel_fjernet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: error ? { feil: error.message } : {},
  })
  // Kastes, ikke svelges: å tro at nøkkelen er borte når den står igjen, gir to levende nøkler.
  if (error) throw new Error(`Kunne ikke fjerne nøkkelen: ${error.message} Den ligger fortsatt lagret.`)
  revalidatePath('/innstillinger')
}
