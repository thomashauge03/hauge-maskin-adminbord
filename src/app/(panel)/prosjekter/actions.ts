'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { krevAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import { medHøyst } from '@/lib/samtidig'
import { normaliserNummer } from '@/lib/prosjekter/plan'
import { hentNavet, synkProsjekter, type Synkresultat } from '@/lib/prosjekter/synk'

export type Svar = { feil?: string; ok?: string; synk?: Synkresultat }

const nummer = z
  .string()
  .transform((v) => normaliserNummer(v) ?? '')
  .refine((v) => v.length > 0, 'Prosjektnummer mangler')
const fritekst = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim() ? v.trim().slice(0, 300) : null))

const prosjekt = z.object({
  nummer,
  navn: z.string().trim().min(1, 'Navn mangler').max(200),
  kunde: fritekst,
  adresse: fritekst,
  aktiv: z.boolean(),
})

function synkTekst(s: Synkresultat) {
  if (s.opptatt) return 'En synk pågikk allerede. Endringen tas med i den, eller i neste kjøring om et kvarter.'
  const feilet = s.apper.filter((a) => !a.ok)
  return feilet.length === 0
    ? 'Synket ut til alle appene.'
    : `Synket, men ${feilet.map((a) => a.navn).join(', ')} feilet. Se synkkortet.`
}

/**
 * Leser inn SmartDok-eksporten. Fila tolkes i nettleseren, så det som kommer
 * hit er ferdige prosjekter, validert på nytt fordi en server action kan
 * treffes med hva som helst.
 *
 * Kunde og adresse overskrives bare med en verdi, aldri med tomt: en eksport
 * uten kundekolonnen skal ikke viske ut kundene som står der fra før.
 */
export async function importerProsjekter(liste: unknown): Promise<Svar> {
  const meg = await krevAdmin()

  const tolket = z.array(prosjekt).min(1, 'Ingen prosjekter i fila').max(20000).safeParse(liste)
  if (!tolket.success) return { feil: tolket.error.issues[0].message }

  const navet = new Map((await hentNavet()).map((p) => [p.nummer, p]))
  const nye: z.infer<typeof prosjekt>[] = []
  const endringer: { id: string; endring: Record<string, unknown> }[] = []

  for (const p of tolket.data) {
    const finnes = navet.get(p.nummer)
    if (!finnes) {
      nye.push(p)
      continue
    }
    const endring: Record<string, unknown> = {}
    if (finnes.navn !== p.navn) endring.navn = p.navn
    if (finnes.aktiv !== p.aktiv) endring.aktiv = p.aktiv
    if (p.kunde && finnes.kunde !== p.kunde) endring.kunde = p.kunde
    if (p.adresse && finnes.adresse !== p.adresse) endring.adresse = p.adresse
    if (Object.keys(endring).length > 0) endringer.push({ id: finnes.id, endring })
  }

  if (nye.length > 0) {
    const { error } = await supabaseAdmin
      .from('prosjekter')
      .upsert(nye.map((p) => ({ ...p, kilde: 'smartdok' })), { onConflict: 'nummer' })
    if (error) return { feil: `Kunne ikke lagre: ${error.message}` }
  }

  const feil: string[] = []
  await medHøyst(5, endringer, async ({ id, endring }) => {
    const { error } = await supabaseAdmin.from('prosjekter').update(endring).eq('id', id)
    if (error) feil.push(error.message)
  })

  await logg('prosjekter.importert', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { iFila: tolket.data.length, nye: nye.length, endret: endringer.length, feil: feil.length },
  })

  const synk = await synkProsjekter()
  revalidatePath('/prosjekter')

  if (feil.length > 0) {
    return { feil: `${feil.length} prosjekter kunne ikke oppdateres: ${feil[0]}`, synk }
  }
  return {
    ok:
      `${tolket.data.length} prosjekter i fila: ${nye.length} nye, ${endringer.length} endret, ` +
      `${tolket.data.length - nye.length - endringer.length} var like. ${synkTekst(synk)}`,
    synk,
  }
}

/** Nytt prosjekt, eller endring av et. Nummeret kan ikke endres: det er nøkkelen i alle appene. */
export async function lagreProsjekt(_forrige: Svar, formData: FormData): Promise<Svar> {
  const meg = await krevAdmin()
  const id = formData.get('id')

  const felter = prosjekt.safeParse({
    nummer: String(formData.get('nummer') ?? ''),
    navn: String(formData.get('navn') ?? ''),
    kunde: (formData.get('kunde') as string | null) ?? null,
    adresse: (formData.get('adresse') as string | null) ?? null,
    aktiv: formData.get('aktiv') === 'on',
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }

  if (typeof id === 'string' && id) {
    if (!z.string().uuid().safeParse(id).success) return { feil: 'Ugyldig prosjekt.' }
    const { nummer: _nummer, ...endring } = felter.data
    const { data, error } = await supabaseAdmin.from('prosjekter').update(endring).eq('id', id).select('nummer')
    if (error) return { feil: `Kunne ikke lagre: ${error.message}` }
    if (!data?.length) return { feil: 'Fant ikke prosjektet.' }
    await logg('prosjekt.endret', {
      utfortAv: meg.id,
      utfortAvEpost: meg.epost,
      detaljer: { nummer: data[0].nummer, ...endring },
    })
  } else {
    const { error } = await supabaseAdmin.from('prosjekter').insert({ ...felter.data, kilde: 'adminbord' })
    if (error) {
      return {
        feil: error.code === '23505' ? `Prosjektnummer ${felter.data.nummer} finnes allerede.` : `Kunne ikke lagre: ${error.message}`,
      }
    }
    await logg('prosjekt.opprettet', { utfortAv: meg.id, utfortAvEpost: meg.epost, detaljer: felter.data })
  }

  const synk = await synkProsjekter()
  revalidatePath('/prosjekter')
  return { ok: `Lagret. ${synkTekst(synk)}`, synk }
}

export async function synkNå(): Promise<Svar> {
  await krevAdmin()
  const synk = await synkProsjekter()
  revalidatePath('/prosjekter')
  return { ok: synkTekst(synk), synk }
}
