'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'

export type Unntakssvar = { feil?: string; ok?: string }

const nyttUnntak = z.object({
  maskinId: z.coerce.number().int().positive(),
  navn: z.string().trim().min(1).max(200),
  grunn: z.string().trim().min(3, 'Skriv hvorfor maskinen ikke skal belastes').max(300),
})

/**
 * Setter en maskin på listen «belastes ikke» (valg 4 i designnotatet).
 * Bare eieren: listen avgjør hva som føres i regnskapet.
 */
export async function leggTilUnntak(_forrige: Unntakssvar, formData: FormData): Promise<Unntakssvar> {
  const meg = await krevEier()
  const felter = nyttUnntak.safeParse({
    maskinId: formData.get('maskinId'),
    navn: formData.get('navn'),
    grunn: formData.get('grunn') ?? '',
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }
  const { maskinId, navn, grunn } = felter.data

  const { error } = await supabaseAdmin
    .from('internbelastning_unntak')
    .insert({ maskin_id: maskinId, navn, grunn, lagt_inn_av: meg.epost })
  if (error) {
    return { feil: error.code === '23505' ? 'Maskinen står allerede på listen.' : `Kunne ikke lagre: ${error.message}` }
  }

  await logg('internbelastning.unntak_lagt_til', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { maskinId, navn, grunn },
  })
  revalidatePath('/internbelastning')
  return { ok: `${navn} belastes ikke lenger.` }
}

export async function fjernUnntak(formData: FormData): Promise<void> {
  const meg = await krevEier()
  const id = z.string().uuid().parse(formData.get('id'))
  const { data, error } = await supabaseAdmin
    .from('internbelastning_unntak')
    .delete()
    .eq('id', id)
    .select('navn, maskin_id, kategori')
    .maybeSingle()
  // Kastes, ikke svelges: en maskin som ser ut til å være tatt av listen, men ikke er det, blir stille ikke belastet.
  if (error) throw new Error(`Kunne ikke ta den av listen: ${error.message}`)
  await logg('internbelastning.unntak_fjernet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { id, navn: data?.navn ?? null, maskinId: data?.maskin_id ?? null, kategori: data?.kategori ?? null },
  })
  revalidatePath('/internbelastning')
}
