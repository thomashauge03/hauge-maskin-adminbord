'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { krevAdmin } from '@/lib/auth'
import { lagServerKlient } from '@/lib/supabase/server'

/**
 * `n` er nytt for hvert svar og brukes som key på feltene. React 19 tømmer
 * skjemaet etter hver innsending, også den som ble avvist, så teksten sendes
 * tilbake og settes inn igjen – ellers mister man det man skrev på en
 * for lang tittel.
 */
export type Gjøremålsvar = {
  n?: number
  ok?: boolean
  feil?: string
  tittel?: string
  notat?: string
}

function avvist(feil: string, formData: FormData): Gjøremålsvar {
  return {
    n: Date.now(),
    feil,
    tittel: String(formData.get('tittel') ?? ''),
    notat: String(formData.get('notat') ?? ''),
  }
}

const STI = '/gjoremal'

const tekstfelter = z.object({
  tittel: z.string().trim().min(1, 'Skriv hva som skal gjøres').max(300, 'Maks 300 tegn i tittelen'),
  notat: z
    .string()
    .trim()
    .max(4000, 'Maks 4000 tegn i notatet')
    .transform((n) => (n === '' ? null : n)),
})

const id = z.uuid()

/*
 * Alle skrivingene går med sesjonsklienten. Policyen i 0027 sørger for at
 * man bare når egne rader, så en forfalsket id treffer ingenting i stedet
 * for andres liste. krevAdmin står likevel først: uten den ville en utlogget
 * forespørsel fått en databasefeil i stedet for å bli sendt til innlogging.
 */

export async function leggTilGjøremål(_forrige: Gjøremålsvar, formData: FormData): Promise<Gjøremålsvar> {
  await krevAdmin()

  const felter = tekstfelter.safeParse({
    tittel: formData.get('tittel') ?? '',
    notat: formData.get('notat') ?? '',
  })
  if (!felter.success) return avvist(felter.error.issues[0].message, formData)

  const supabase = await lagServerKlient()
  const { error } = await supabase.from('gjoremal').insert(felter.data)
  if (error) return avvist(`Kunne ikke lagre: ${error.message}`, formData)

  revalidatePath(STI)
  return { n: Date.now(), ok: true }
}

export async function endreGjøremål(_forrige: Gjøremålsvar, formData: FormData): Promise<Gjøremålsvar> {
  await krevAdmin()

  const gjøremålId = id.safeParse(formData.get('id'))
  if (!gjøremålId.success) return avvist('Ukjent gjøremål', formData)
  const felter = tekstfelter.safeParse({
    tittel: formData.get('tittel') ?? '',
    notat: formData.get('notat') ?? '',
  })
  if (!felter.success) return avvist(felter.error.issues[0].message, formData)

  const supabase = await lagServerKlient()
  const { error } = await supabase.from('gjoremal').update(felter.data).eq('id', gjøremålId.data)
  if (error) return avvist(`Kunne ikke lagre: ${error.message}`, formData)

  revalidatePath(STI)
  return { n: Date.now(), ok: true }
}

export async function settGjort(formData: FormData): Promise<void> {
  await krevAdmin()

  const gjøremålId = id.parse(formData.get('id'))
  const gjort = formData.get('gjort') === 'ja'

  const supabase = await lagServerKlient()
  const { error } = await supabase
    .from('gjoremal')
    .update({ gjort: gjort ? new Date().toISOString() : null })
    .eq('id', gjøremålId)
  if (error) throw new Error(`Kunne ikke oppdatere gjøremålet: ${error.message}`)

  revalidatePath(STI)
}

export async function slettGjøremål(formData: FormData): Promise<void> {
  await krevAdmin()

  const gjøremålId = id.parse(formData.get('id'))

  const supabase = await lagServerKlient()
  const { error } = await supabase.from('gjoremal').delete().eq('id', gjøremålId)
  if (error) throw new Error(`Kunne ikke slette gjøremålet: ${error.message}`)

  revalidatePath(STI)
}
