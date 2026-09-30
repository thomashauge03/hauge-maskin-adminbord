'use server'

import { z } from 'zod'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { loggMange } from '@/lib/data'
import { medHøyst } from '@/lib/samtidig'
import { oppdaterAppen, type Tilstand } from './tilstand'

/*
 * Handlinger på mange personer om gangen. Én handling er ett kall med alle
 * id-ene, ikke ett per person.
 *
 * 500 er en sikring, ikke en forventning. 200 brukere får plass med god
 * margin, og et skjema som sender ti tusen id-er er ikke noe vi skal prøve å
 * gjennomføre.
 */
const MAKS = 500
const iderSkjema = z
  .array(z.string().uuid())
  .min(1, 'Velg minst én.')
  .max(MAKS, `Høyst ${MAKS} om gangen.`)
const gruppeSkjema = z.string().uuid('Velg en gruppe.')

type Person = { id: string; navn: string; epost: string; nav_bruker_id: string }

async function finnGruppe(id: string): Promise<{ gruppe: { id: string; navn: string } } | { feil: string }> {
  const { data, error } = await supabaseAdmin.from('grupper').select('id, navn').eq('id', id).maybeSingle()
  if (error) return { feil: `Kunne ikke lese gruppa: ${error.message}` }
  if (!data) return { feil: 'Gruppa finnes ikke lenger. Last siden på nytt.' }
  return { gruppe: { id: data.id as string, navn: data.navn as string } }
}

/**
 * Slipper de valgte inn, eventuelt rett i en gruppe.
 *
 * Gjelder bare dem som ikke allerede er godkjent – også gruppa. Skal
 * godkjente inn i en gruppe, er det «Legg i gruppe».
 */
export async function godkjennMange(_forrige: Tilstand, data: FormData): Promise<Tilstand> {
  const meg = await krevEier()

  const ider = iderSkjema.safeParse(data.getAll('id'))
  if (!ider.success) return { feil: ider.error.issues[0].message }

  let gruppe: { id: string; navn: string } | null = null
  const ønsket = String(data.get('gruppe') ?? '')
  if (ønsket) {
    const gyldig = gruppeSkjema.safeParse(ønsket)
    if (!gyldig.success) return { feil: gyldig.error.issues[0].message }
    const funnet = await finnGruppe(gyldig.data)
    if ('feil' in funnet) return { feil: funnet.feil }
    gruppe = funnet.gruppe
  }

  const { data: rader, error } = await supabaseAdmin
    .from('personer')
    .select('id, navn, epost, nav_bruker_id')
    .in('id', ider.data)
    .neq('status', 'godkjent')
    .not('nav_bruker_id', 'is', null)
  if (error) return { feil: `Kunne ikke lese de valgte: ${error.message}` }

  const personer = (rader ?? []) as Person[]
  if (personer.length === 0) return { ok: 'Alle de valgte var allerede godkjent.' }

  /*
   * E-posten bekreftes per person før statusen settes, som i settAppstatus –
   * se begrunnelsen der. Den som ikke fikk bekreftet e-posten, blir ikke
   * godkjent.
   */
  const bekreftet = await medHøyst(8, personer, async (p) => {
    const { error: feil } = await supabaseAdmin.auth.admin.updateUserById(p.nav_bruker_id, {
      email_confirm: true,
    })
    return { p, feil: feil?.message ?? null }
  })
  const klare = bekreftet.filter((b) => !b.feil).map((b) => b.p)
  const feilet = bekreftet.filter((b) => b.feil).map((b) => b.p.epost)

  if (klare.length > 0) {
    const { error: statusFeil } = await supabaseAdmin
      .from('personer')
      .update({ status: 'godkjent', godkjent_av: meg.id, godkjent_tid: new Date().toISOString() })
      .in(
        'id',
        klare.map((p) => p.id),
      )
    if (statusFeil) return { feil: `Kunne ikke godkjenne: ${statusFeil.message}` }

    await loggMange(
      'appkonto.godkjent',
      meg,
      klare.map((p) => ({ personId: p.id, epost: p.epost })),
    )

    if (gruppe) {
      const { id: gruppeId, navn: gruppeNavn } = gruppe
      const { error: gruppeFeil } = await supabaseAdmin
        .from('person_gruppe')
        .upsert(
          klare.map((p) => ({ person_id: p.id, gruppe_id: gruppeId })),
          { onConflict: 'person_id,gruppe_id', ignoreDuplicates: true },
        )
      if (gruppeFeil) {
        oppdaterAppen()
        return { feil: `${klare.length} godkjent, men ikke lagt i ${gruppeNavn}: ${gruppeFeil.message}` }
      }
      await loggMange(
        'gruppe.person_inn',
        meg,
        klare.map((p) => ({ personId: p.id, person: p.navn, gruppe: gruppeNavn })),
      )
    }
  }

  oppdaterAppen()
  return {
    ok:
      klare.length > 0
        ? `${klare.length} godkjent${gruppe ? ` og lagt i ${gruppe.navn}` : ' – de ser ingenting før de er i en gruppe'}.`
        : undefined,
    feil:
      feilet.length > 0
        ? `Fikk ikke bekreftet e-posten til ${feilet.join(', ')}, så de er ikke godkjent.`
        : undefined,
  }
}

/** Legger de valgte i en gruppe (inn = true), eller tar dem ut. */
export async function settGruppeForMange(
  inn: boolean,
  _forrige: Tilstand,
  data: FormData,
): Promise<Tilstand> {
  const meg = await krevEier()

  const ider = iderSkjema.safeParse(data.getAll('id'))
  if (!ider.success) return { feil: ider.error.issues[0].message }
  const gyldig = gruppeSkjema.safeParse(data.get('gruppe'))
  if (!gyldig.success) return { feil: gyldig.error.issues[0].message }

  const funnet = await finnGruppe(gyldig.data)
  if ('feil' in funnet) return { feil: funnet.feil }
  const { gruppe } = funnet

  const { data: rader, error: lesFeil } = await supabaseAdmin
    .from('personer')
    .select('id, navn')
    .in('id', ider.data)
    .not('nav_bruker_id', 'is', null)
  if (lesFeil) return { feil: `Kunne ikke lese de valgte: ${lesFeil.message}` }
  const personer = (rader ?? []) as { id: string; navn: string }[]
  if (personer.length === 0) {
    return { feil: 'Ingen av de valgte har konto i appen lenger. Last siden på nytt.' }
  }

  // Svaret sier hvilke rader som faktisk ble endret. Da blir tallet og
  // loggen riktige også for dem som alt var der – eller aldri var det.
  const { data: endret, error } = inn
    ? await supabaseAdmin
        .from('person_gruppe')
        .upsert(
          personer.map((p) => ({ person_id: p.id, gruppe_id: gruppe.id })),
          { onConflict: 'person_id,gruppe_id', ignoreDuplicates: true },
        )
        .select('person_id')
    : await supabaseAdmin
        .from('person_gruppe')
        .delete()
        .eq('gruppe_id', gruppe.id)
        .in(
          'person_id',
          personer.map((p) => p.id),
        )
        .select('person_id')
  if (error) return { feil: `Kunne ikke endre: ${error.message}` }

  const berørte = new Set((endret ?? []).map((r) => r.person_id as string))
  await loggMange(
    inn ? 'gruppe.person_inn' : 'gruppe.person_ut',
    meg,
    personer
      .filter((p) => berørte.has(p.id))
      .map((p) => ({ personId: p.id, person: p.navn, gruppe: gruppe.navn })),
  )

  oppdaterAppen()
  const uendret = personer.length - berørte.size
  return {
    ok:
      `${berørte.size} ${inn ? 'lagt i' : 'tatt ut av'} ${gruppe.navn}` +
      (uendret > 0 ? ` (${uendret} ${inn ? 'var der fra før' : 'var ikke i gruppa'}).` : '.'),
  }
}

/**
 * Stenger de valgte ute. De beholder gruppene, så «Slipp inn igjen» gir dem
 * det samme tilbake.
 */
export async function stengUteMange(_forrige: Tilstand, data: FormData): Promise<Tilstand> {
  const meg = await krevEier()

  const ider = iderSkjema.safeParse(data.getAll('id'))
  if (!ider.success) return { feil: ider.error.issues[0].message }

  const { data: stengte, error } = await supabaseAdmin
    .from('personer')
    .update({ status: 'sperra' })
    .in('id', ider.data)
    .neq('status', 'sperra')
    .not('nav_bruker_id', 'is', null)
    .select('id, epost')
  if (error) return { feil: `Kunne ikke stenge ute: ${error.message}` }
  if (!stengte || stengte.length === 0) return { ok: 'Alle de valgte var allerede stengt ute.' }

  await loggMange(
    'appkonto.sperra',
    meg,
    stengte.map((p) => ({ personId: p.id as string, epost: p.epost as string })),
  )

  oppdaterAppen()
  return {
    ok: `${stengte.length} stengt ute. De beholder gruppene, så «Slipp inn igjen» gir dem det samme tilbake.`,
  }
}
