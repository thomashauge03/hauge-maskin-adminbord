'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { krevEier } from '@/lib/auth'
import { lagServerKlient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import { forkort, krypter } from '@/lib/krypto'
import { hentTokenKart, tokenFor } from '@/lib/kontoar'
import {
  finnAnon,
  finnServiceRole,
  hentProsjektNøkler,
} from '@/lib/plattform/supabase-api'

export type SystemTilstand = { feil?: string; ok?: string }

/**
 * Tomme felt kommer inn som tomme strenger fra et HTML-skjema, men skal
 * bli null i databasen. Uten dette får man rader der
 * vercel_prosjekt_id er '' – som ikke er null, og derfor slår ut i
 * `if (system.vercelProsjektId)` og gir «finnes ikke på Vercel».
 */
const tomTilNull = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()

const skjema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, 'Kortnavn må fylles ut')
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Kortnavn kan bare ha små bokstaver, tall og bindestrek',
    ),
  navn: z.string().trim().min(2, 'Navn må fylles ut'),
  beskrivelse: tomTilNull,
  supabaseProsjektRef: tomTilNull,
  vercelProsjektId: tomTilNull,
  vercelProsjektNavn: tomTilNull,
  githubRepo: tomTilNull,
  produksjonsUrl: tomTilNull,
  notat: tomTilNull,
  sortering: z.coerce.number().int().min(0).max(9999),
  aktiv: z.coerce.boolean(),
  overvakes: z.coerce.boolean(),
})

function lesSkjema(formData: FormData) {
  return skjema.safeParse({
    slug: formData.get('slug'),
    navn: formData.get('navn'),
    beskrivelse: formData.get('beskrivelse'),
    supabaseProsjektRef: formData.get('supabaseProsjektRef'),
    vercelProsjektId: formData.get('vercelProsjektId'),
    vercelProsjektNavn: formData.get('vercelProsjektNavn'),
    githubRepo: formData.get('githubRepo'),
    produksjonsUrl: formData.get('produksjonsUrl'),
    notat: formData.get('notat'),
    sortering: formData.get('sortering') ?? 100,
    // Avkrysningsbokser sender ingenting når de er av, ikke 'false'.
    aktiv: formData.get('aktiv') === 'på',
    overvakes: formData.get('overvakes') === 'på',
  })
}

/**
 * Supabase-URL-en utledes av prosjektreferansen i stedet for å være et
 * eget felt. Den er alltid https://<ref>.supabase.co, og to felt som må
 * stemme med hverandre er to felt som før eller siden ikke gjør det.
 */
function urlFraRef(ref: string | null): string | null {
  return ref ? `https://${ref}.supabase.co` : null
}

export async function opprettSystem(
  _forrige: SystemTilstand,
  formData: FormData,
): Promise<SystemTilstand> {
  const meg = await krevEier()

  const felter = lesSkjema(formData)
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const supabase = await lagServerKlient()
  const { error } = await supabase.from('systemer').insert({
    slug: felter.data.slug,
    navn: felter.data.navn,
    beskrivelse: felter.data.beskrivelse,
    supabase_prosjekt_ref: felter.data.supabaseProsjektRef,
    supabase_url: urlFraRef(felter.data.supabaseProsjektRef),
    vercel_prosjekt_id: felter.data.vercelProsjektId,
    vercel_prosjekt_navn: felter.data.vercelProsjektNavn,
    github_repo: felter.data.githubRepo,
    produksjons_url: felter.data.produksjonsUrl,
    notat: felter.data.notat,
    sortering: felter.data.sortering,
    aktiv: felter.data.aktiv,
    overvakes: felter.data.overvakes,
  })

  if (error) {
    return {
      feil: error.message.includes('duplicate')
        ? `Kortnavnet «${felter.data.slug}» er alt i bruk.`
        : `Kunne ikke lagre: ${error.message}`,
    }
  }

  await logg('system.opprettet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { slug: felter.data.slug },
  })

  revalidatePath('/systemer')
  revalidatePath('/')
  redirect(`/systemer/${felter.data.slug}`)
}

export async function endreSystem(
  systemId: string,
  _forrige: SystemTilstand,
  formData: FormData,
): Promise<SystemTilstand> {
  const meg = await krevEier()

  const felter = lesSkjema(formData)
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const supabase = await lagServerKlient()
  const { error } = await supabase
    .from('systemer')
    .update({
      slug: felter.data.slug,
      navn: felter.data.navn,
      beskrivelse: felter.data.beskrivelse,
      supabase_prosjekt_ref: felter.data.supabaseProsjektRef,
      supabase_url: urlFraRef(felter.data.supabaseProsjektRef),
      vercel_prosjekt_id: felter.data.vercelProsjektId,
      vercel_prosjekt_navn: felter.data.vercelProsjektNavn,
      github_repo: felter.data.githubRepo,
      produksjons_url: felter.data.produksjonsUrl,
      notat: felter.data.notat,
      sortering: felter.data.sortering,
      aktiv: felter.data.aktiv,
      overvakes: felter.data.overvakes,
    })
    .eq('id', systemId)

  if (error) return { feil: `Kunne ikke lagre: ${error.message}` }

  await logg('system.endret', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
    detaljer: { slug: felter.data.slug },
  })

  revalidatePath('/systemer')
  revalidatePath(`/systemer/${felter.data.slug}`)
  revalidatePath('/')
  return { ok: 'Lagret.' }
}

/**
 * Skjuler eller viser et system, uten å slette det.
 *
 * Dette er nesten alltid det man vil framfor sletting. Et skjult system
 * blir borte fra oversikten og fra brukerlisten, men beholder
 * prosjektref, nøkler, notater og statushistorikk – så det kan hentes
 * tilbake med ett klikk. Sletter man i stedet, må alt legges inn på nytt,
 * og historikken er borte for godt.
 */
export async function settSystemAktiv(systemId: string, aktiv: boolean) {
  const meg = await krevEier()

  const supabase = await lagServerKlient()
  await supabase.from('systemer').update({ aktiv }).eq('id', systemId)

  await logg(aktiv ? 'system.vist' : 'system.skjult', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
  })

  revalidatePath('/systemer')
  revalidatePath('/')
  revalidatePath('/brukere')
}

/**
 * Skrur overvåking av eller på for et system som blir stående.
 *
 * Forskjellen fra å skjule: systemet vises fortsatt i registeret og på
 * oversikten, men lyser ikke rødt. Det er riktig for en mal eller en base
 * som med vilje står stille – den skal ikke gi et varsel hver dag, men
 * man vil se at den finnes.
 */
export async function settOvervakes(systemId: string, overvakes: boolean) {
  const meg = await krevEier()

  const supabase = await lagServerKlient()
  await supabase.from('systemer').update({ overvakes }).eq('id', systemId)

  await logg(overvakes ? 'system.tilsyn_på' : 'system.tilsyn_av', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
  })

  revalidatePath('/systemer')
  revalidatePath('/')
}

/**
 * Sletter et system fra registeret.
 *
 * Rører ingenting hos Supabase eller Vercel – bare registeret her.
 * Det er en bevisst begrensning: adminbordet skal ikke kunne slette en
 * produksjonsdatabase ved et uhell, og et Supabase-prosjekt slettes
 * sjelden nok at det kan gjøres i konsollet.
 */
export async function slettSystem(systemId: string) {
  const meg = await krevEier()

  const supabase = await lagServerKlient()
  const { data } = await supabase
    .from('systemer')
    .select('slug')
    .eq('id', systemId)
    .single()

  await supabase.from('systemer').delete().eq('id', systemId)

  await logg('system.slettet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { slug: data?.slug ?? null },
  })

  revalidatePath('/systemer')
  revalidatePath('/')
  redirect('/systemer')
}

// ── Hemmeligheter ─────────────────────────────────────────────

const hemmelighetSkjema = z.object({
  slag: z.enum(['service_role', 'anon', 'annet']),
  navn: z.string().trim().max(60).default(''),
  verdi: z.string().trim().min(10, 'Verdien ser for kort ut til å være en nøkkel'),
})

/**
 * Lagrer en nøkkel kryptert.
 *
 * Verdien leses her og krypteres før den treffer databasen. Den logges
 * aldri, og hintet som lagres i klartekst er seks tegn foran og fire bak.
 */
export async function lagreHemmelighet(
  systemId: string,
  _forrige: SystemTilstand,
  formData: FormData,
): Promise<SystemTilstand> {
  const meg = await krevEier()

  const felter = hemmelighetSkjema.safeParse({
    slag: formData.get('slag'),
    navn: formData.get('navn') ?? '',
    verdi: formData.get('verdi'),
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const { error } = await supabaseAdmin.from('hemmeligheter').upsert(
    {
      system_id: systemId,
      slag: felter.data.slag,
      navn: felter.data.navn,
      verdi_kryptert: krypter(felter.data.verdi),
      hint: forkort(felter.data.verdi),
    },
    { onConflict: 'system_id,slag,navn' },
  )

  if (error) return { feil: `Kunne ikke lagre nøkkel: ${error.message}` }

  await logg('hemmelighet.lagret', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
    // Slaget logges, verdien aldri.
    detaljer: { slag: felter.data.slag, navn: felter.data.navn },
  })

  revalidatePath('/systemer')
  return { ok: 'Nøkkelen er lagret kryptert.' }
}

export async function slettHemmelighet(hemmelighetId: string, systemId: string) {
  const meg = await krevEier()

  await supabaseAdmin.from('hemmeligheter').delete().eq('id', hemmelighetId)

  await logg('hemmelighet.slettet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
  })

  revalidatePath('/systemer')
}

/**
 * Henter nøklene fra Supabase selv, i stedet for at de limes inn.
 *
 * Management-API-et kan gi ut prosjektets egne nøkler, og da er det
 * bedre at adminbordet henter dem: en nøkkel som kopieres manuelt
 * havner i utklippstavla, og ofte i en chat etterpå.
 */
export async function hentNøklerAutomatisk(
  systemId: string,
  prosjektRef: string,
  _forrige: SystemTilstand,
  _formData: FormData,
): Promise<SystemTilstand> {
  const meg = await krevEier()

  // Kontoen som eier prosjektet avgjor hvilket token som rekker fram.
  const { data: rad } = await supabaseAdmin
    .from('systemer')
    .select('konto_id')
    .eq('id', systemId)
    .single()

  const token = tokenFor(
    await hentTokenKart(),
    (rad?.konto_id as string | null) ?? null,
  )
  const svar = await hentProsjektNøkler(token, prosjektRef)
  if (!svar.ok) return { feil: svar.feil.melding }

  const service = finnServiceRole(svar.data)
  const anon = finnAnon(svar.data)

  if (!service && !anon) {
    return {
      feil:
        'Fant ingen lesbare nøkler. Er de gamle JWT-nøklene slått av på prosjektet?',
    }
  }

  const rader = []
  if (service) {
    rader.push({
      system_id: systemId,
      slag: 'service_role' as const,
      navn: '',
      verdi_kryptert: krypter(service),
      hint: forkort(service),
    })
  }
  if (anon) {
    rader.push({
      system_id: systemId,
      slag: 'anon' as const,
      navn: '',
      verdi_kryptert: krypter(anon),
      hint: forkort(anon),
    })
  }

  const { error } = await supabaseAdmin
    .from('hemmeligheter')
    .upsert(rader, { onConflict: 'system_id,slag,navn' })

  if (error) return { feil: `Kunne ikke lagre nøkler: ${error.message}` }

  await logg('hemmelighet.hentet_automatisk', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
    detaljer: { service: Boolean(service), anon: Boolean(anon) },
  })

  revalidatePath('/systemer')
  return {
    ok: `Hentet ${[service && 'service_role', anon && 'anon']
      .filter(Boolean)
      .join(' og ')} fra Supabase.`,
  }
}
