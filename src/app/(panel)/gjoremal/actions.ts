'use server'

import { z } from 'zod'
import { krevAdmin } from '@/lib/auth'
import { lagServerKlient } from '@/lib/supabase/server'
import type { Gjøremål, Gjøremålsfelter } from '@/lib/gjoremal'

/*
 * Lista oppdateres i nettleseren før disse svarer, så de tar rene verdier
 * og returnerer bare en eventuell feil. Ingen revalidatePath: den ville
 * sendt hele siden tilbake etter hvert klikk, og en ny liste fra serveren
 * midt i en rekke raske avhukinger ville hoppet over de som ennå ikke var
 * lagret.
 *
 * Alle skrivingene går med sesjonsklienten. Policyen i 0027 sørger for at
 * man bare når egne rader, så en forfalsket id treffer ingenting i stedet
 * for andres liste. krevAdmin står likevel først: en server action er en
 * POST-rute som kan treffes direkte.
 */

export type Svar = { feil?: string }

const id = z.uuid()
const tid = z.iso.datetime({ offset: true })

const felter = z.object({
  tittel: z.string().trim().min(1, 'Tittelen kan ikke være tom').max(300, 'Maks 300 tegn i tittelen'),
  notat: z
    .string()
    .trim()
    .max(4000, 'Maks 4000 tegn i notatet')
    .nullable()
    .transform((n) => (n ? n : null)),
  frist: z.iso.date({ message: 'Ugyldig frist' }).nullable(),
  viktig: z.boolean(),
  // Finnes ikke systemet, stopper fremmednøkkelen skrivingen.
  systemId: id.nullable(),
})

const nytt = felter.extend({ id })
const helt = felter.extend({ id, gjort: tid.nullable(), oppfølgingSiden: tid.nullable(), opprettet: tid })

function tilRad(f: z.infer<typeof felter>) {
  return { tittel: f.tittel, notat: f.notat, frist: f.frist, viktig: f.viktig, system_id: f.systemId }
}

function feilFra(e: z.ZodError): Svar {
  return { feil: e.issues[0].message }
}

export async function leggTilGjøremål(inn: Gjøremålsfelter & { id: string }): Promise<Svar> {
  await krevAdmin()
  const f = nytt.safeParse(inn)
  if (!f.success) return feilFra(f.error)

  const supabase = await lagServerKlient()
  const { error } = await supabase.from('gjoremal').insert({ id: f.data.id, ...tilRad(f.data) })
  return error ? { feil: `Kunne ikke lagre «${f.data.tittel}»: ${error.message}` } : {}
}

export async function endreGjøremål(inn: Gjøremålsfelter & { id: string }): Promise<Svar> {
  await krevAdmin()
  const f = nytt.safeParse(inn)
  if (!f.success) return feilFra(f.error)

  const supabase = await lagServerKlient()
  const { error } = await supabase.from('gjoremal').update(tilRad(f.data)).eq('id', f.data.id)
  return error ? { feil: `Kunne ikke lagre endringen: ${error.message}` } : {}
}

export async function settGjort(gjøremålId: string, gjort: boolean): Promise<Svar> {
  await krevAdmin()
  const felt = id.safeParse(gjøremålId)
  if (!felt.success) return { feil: 'Ukjent gjøremål' }

  const supabase = await lagServerKlient()
  const { error } = await supabase
    .from('gjoremal')
    .update({ gjort: gjort ? new Date().toISOString() : null })
    .eq('id', felt.data)
  return error ? { feil: `Kunne ikke huke av: ${error.message}` } : {}
}

export async function settOppfølging(gjøremålId: string, på: boolean): Promise<Svar> {
  await krevAdmin()
  const felt = id.safeParse(gjøremålId)
  if (!felt.success) return { feil: 'Ukjent gjøremål' }

  const supabase = await lagServerKlient()
  const { error } = await supabase
    .from('gjoremal')
    .update({ under_oppfolging_siden: på ? new Date().toISOString() : null })
    .eq('id', felt.data)
  return error ? { feil: `Kunne ikke endre oppfølgingen: ${error.message}` } : {}
}

export async function slettGjøremål(gjøremålId: string): Promise<Svar> {
  await krevAdmin()
  const felt = id.safeParse(gjøremålId)
  if (!felt.success) return { feil: 'Ukjent gjøremål' }

  const supabase = await lagServerKlient()
  const { error } = await supabase.from('gjoremal').delete().eq('id', felt.data)
  return error ? { feil: `Kunne ikke slette: ${error.message}` } : {}
}

/**
 * «Angre» etter sletting. Raden er alt borte fra databasen, så den settes
 * inn på nytt med samme id og tidspunkter – ellers ville den havnet øverst
 * som nylagt, og et gjort gjøremål ville stått som åpent.
 *
 * Valgt framfor å vente med selve slettingen til angrefristen var ute: da
 * ville en side som lukkes innen fristen latt gjøremålet stå igjen.
 */
export async function gjenopprettGjøremål(inn: Gjøremål): Promise<Svar> {
  await krevAdmin()
  const f = helt.safeParse(inn)
  if (!f.success) return feilFra(f.error)

  const supabase = await lagServerKlient()
  const { error } = await supabase
    .from('gjoremal')
    .insert({
      id: f.data.id,
      gjort: f.data.gjort,
      under_oppfolging_siden: f.data.oppfølgingSiden,
      opprettet: f.data.opprettet,
      ...tilRad(f.data),
    })
  return error ? { feil: `Kunne ikke angre slettingen: ${error.message}` } : {}
}
