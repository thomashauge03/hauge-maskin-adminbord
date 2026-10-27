'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { krevAdmin, krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import { forkort, krypter } from '@/lib/krypto'
import { isoDato } from '@/lib/format'
import { normaliserNummer } from '@/lib/prosjekter/plan'
import { lesInn } from '@/lib/prosjekter/innlesing'
import { hentProsjekterFraSmartdok } from '@/lib/prosjekter/smartdok'
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
  const smartdok = s.smartdok && !s.smartdok.ok ? ` Henting fra SmartDok feilet: ${s.smartdok.feil}` : ''
  return (
    (feilet.length === 0
      ? 'Synket ut til alle appene.'
      : `Synket, men ${feilet.map((a) => a.navn).join(', ')} feilet. Se synkkortet.`) + smartdok
  )
}

/**
 * Leser inn SmartDok-eksporten. Fila tolkes i nettleseren, så det som kommer
 * hit er ferdige prosjekter, validert på nytt fordi en server action kan
 * treffes med hva som helst.
 */
export async function importerProsjekter(liste: unknown): Promise<Svar> {
  const meg = await krevAdmin()

  const tolket = z.array(prosjekt).min(1, 'Ingen prosjekter i fila').max(20000).safeParse(liste)
  if (!tolket.success) return { feil: tolket.error.issues[0].message }

  let innlest
  try {
    innlest = await lesInn(await hentNavet(), tolket.data)
  } catch (e) {
    return { feil: e instanceof Error ? e.message : String(e) }
  }
  const { nye, endret, feil } = innlest

  await logg('prosjekter.importert', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { iFila: tolket.data.length, nye, endret, feil: feil.length },
  })

  const synk = await synkProsjekter()
  revalidatePath('/prosjekter')

  if (feil.length > 0) {
    return { feil: `${feil.length} prosjekter kunne ikke oppdateres: ${feil[0]}`, synk }
  }
  return {
    ok:
      `${tolket.data.length} prosjekter i fila: ${nye} nye, ${endret} endret, ` +
      `${tolket.data.length - nye - endret} var like. ${synkTekst(synk)}`,
    synk,
  }
}

export type Nøkkelsvar = { feil?: string; ok?: string }

const smartdokSkjema = z.object({
  nøkkel: z.string().trim().min(16, 'Nøkkelen ser for kort ut').max(4000),
  opprettet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datoen må være på formen ÅÅÅÅ-MM-DD'),
})

/**
 * Legger inn eller bytter SmartDok-nøkkelen. Bare eieren, som for de andre
 * nøklene: den gir lesetilgang til det modulene i SmartDok er krysset av for.
 *
 * Nøkkelen prøves mot /Projects før den lagres. En nøkkel som er gyldig, men
 * mangler tilgang til Prosjekter, skal avvises her og ikke bli en feil i
 * synken et kvarter senere.
 */
export async function lagreSmartdokNøkkel(_forrige: Nøkkelsvar, formData: FormData): Promise<Nøkkelsvar> {
  const meg = await krevEier()

  const felter = smartdokSkjema.safeParse({
    nøkkel: formData.get('nokkel') ?? '',
    opprettet: formData.get('opprettet') ?? '',
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const { nøkkel, opprettet } = felter.data
  const iDag = isoDato(Date.now())
  // Begge feiler i den farlige retningen: fornyingen ville kommet for sent.
  if (opprettet > iDag) return { feil: 'Datoen ligger fram i tid. Oppgi dagen nøkkelen ble laget i SmartDok.' }
  if (opprettet <= isoDato(Date.now() - 365 * 86_400_000)) {
    return { feil: 'En nøkkel laget for over et år siden er utløpt. Lag en ny i SmartDok.' }
  }

  let antall: number
  try {
    antall = (await hentProsjekterFraSmartdok(nøkkel)).prosjekter.length
  } catch (e) {
    return { feil: `Ikke lagret. ${e instanceof Error ? e.message : String(e)}` }
  }

  const { error } = await supabaseAdmin
    .from('smartdok_tilkobling')
    .update({ nokkel_kryptert: krypter(nøkkel), hint: forkort(nøkkel), nokkel_opprettet: opprettet })
    .eq('id', 1)
  if (error) return { feil: `Kunne ikke lagre: ${error.message}` }

  await logg('smartdok.nokkel_lagt_inn', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { hint: forkort(nøkkel), opprettet, serProsjekter: antall },
  })

  const synk = await synkProsjekter()
  revalidatePath('/prosjekter')
  return { ok: `Nøkkelen virker og ser ${antall} prosjekter. ${synkTekst(synk)}` }
}

export async function fjernSmartdokNøkkel(): Promise<void> {
  const meg = await krevEier()
  const { error } = await supabaseAdmin
    .from('smartdok_tilkobling')
    .update({ nokkel_kryptert: null, hint: null, nokkel_opprettet: null })
    .eq('id', 1)
  await logg(error ? 'smartdok.nokkel_fjern_feilet' : 'smartdok.nokkel_fjernet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: error ? { feil: error.message } : {},
  })
  // Kastes, ikke svelges: å tro at nøkkelen er borte når den står igjen, gir to levende nøkler.
  if (error) throw new Error(`Kunne ikke fjerne nøkkelen: ${error.message} Den ligger fortsatt lagret.`)
  revalidatePath('/prosjekter')
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
