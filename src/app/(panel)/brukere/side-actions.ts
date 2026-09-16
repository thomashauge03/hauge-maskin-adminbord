'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import { hentRaaSider, skrivRaaSider, type RaaSide } from '@/lib/github-sider'
import type { BrukerTilstand } from './actions'

/*
 * Bare https.
 *
 * Mobilappen kaster alt annet før lista i det hele tatt blir tegnet, og
 * Android nekter klartekst uansett. En side lagt inn med http ville sett ut
 * som om den ble lagret, og så bare ikke vært der på telefonen.
 *
 * Unntaket som beviser regelen: kopimaskinen står på http mot en maskin på
 * lokalnettet. Den finnes fra før og skal bli stående – vi hindrer bare at
 * det blir lagt inn flere.
 */
const skjema = z.object({
  navn: z.string().trim().min(1, 'Siden må ha et navn'),
  url: z.string().trim().url('Ugyldig adresse').startsWith('https://', 'Adressen må starte med https://'),
  gruppe: z.string().trim().min(1, 'Velg eller skriv en gruppe'),
  hjelp: z.string().trim().optional(),

  /*
   * Ikonet ligger som data-URI rett i sider.json, slik skrivebordsappen gjør
   * det. Nettleseren skalerer det til 192 × 192 PNG før det sendes, så
   * størrelsen er kjent på forhånd – rundt 33 kB, som de som ligger der.
   *
   * Grensa er en sikring, ikke en forventning: sender noen et ubehandlet
   * bilde forbi skjemaet, skal det stoppe her og ikke legge tre megabyte inn
   * i en fil mobilappen henter ved hver oppstart.
   */
  bilete: z
    .string()
    .trim()
    .max(200_000, 'Bildet er for stort. Bruk et mindre, eller la feltet stå tomt.')
    .refine((v) => v === '' || v.startsWith('data:image/'), 'Ugyldig bilde')
    .optional(),

  farge: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Fargen må være på formen #rrggbb')
    .optional()
    .or(z.literal('')),
})

/** Feltene som beskriver utseendet. Tomt felt betyr «ikke sett», ikke «fjern». */
function utsjånad(d: { bilete?: string; farge?: string }) {
  return {
    ...(d.bilete ? { image: d.bilete } : {}),
    ...(d.farge ? { color: d.farge } : {}),
  }
}

/** Lager en id av navnet. Samme form som de som finnes: små bokstaver, bindestrek. */
function lagId(navn: string, opptatt: Set<string>): string {
  const rot =
    navn
      .toLowerCase()
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'oe')
      .replace(/å/g, 'aa')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'side'

  if (!opptatt.has(rot)) return rot
  for (let n = 2; n < 100; n++) {
    const forsøk = `${rot}-${n}`
    if (!opptatt.has(forsøk)) return forsøk
  }
  // Skjer i praksis aldri, men en id som kolliderer ville overskrevet en side.
  return `${rot}-${opptatt.size + 1}`
}

export async function leggTilSide(
  _forrige: BrukerTilstand,
  formData: FormData,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const felter = skjema.safeParse({
    navn: formData.get('navn'),
    url: formData.get('url'),
    gruppe: formData.get('gruppe'),
    hjelp: formData.get('hjelp'),
    bilete: formData.get('bilete'),
    farge: formData.get('farge'),
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const { sider, sha, hylse } = await hentRaaSider()
  if (!sha) return { feil: 'Adminbordet har ikke GitHub-token, og kan ikke endre sider.' }

  const opptatt = new Set(sider.map((s) => String(s.id ?? s.name ?? '')))
  const id = lagId(felter.data.navn, opptatt)

  const ny: RaaSide = {
    id,
    name: felter.data.navn,
    url: felter.data.url,
    group: felter.data.gruppe,
    ...(felter.data.hjelp ? { help: felter.data.hjelp } : {}),
    ...utsjånad(felter.data),
  }

  const svar = await skrivRaaSider(
    [...sider, ny],
    sha,
    `Ny felles side: ${felter.data.navn}`,
    hylse,
  )
  if (!svar.ok) return { feil: svar.grunn }

  await logg('side.lagt_til', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { sideId: id, navn: felter.data.navn, url: felter.data.url },
  })

  revalidatePath('/brukere')
  return { ok: `«${felter.data.navn}» er lagt til. Alle ser den.` }
}

export async function endreSide(
  binding: { sideId: string },
  _forrige: BrukerTilstand,
  formData: FormData,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const felter = skjema.safeParse({
    navn: formData.get('navn'),
    url: formData.get('url'),
    gruppe: formData.get('gruppe'),
    hjelp: formData.get('hjelp'),
    bilete: formData.get('bilete'),
    farge: formData.get('farge'),
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const { sider, sha, hylse } = await hentRaaSider()
  if (!sha) return { feil: 'Adminbordet har ikke GitHub-token, og kan ikke endre sider.' }

  const finnes = sider.some((s) => String(s.id ?? s.name) === binding.sideId)
  if (!finnes) return { feil: 'Siden finnes ikke lenger. Last siden på nytt.' }

  /*
   * Bare feltene skjemaet eier blir rørt. Farge, ikon, plattform og alt annet
   * skrivebordsappen har lagt inn står urørt – et felt vi kaster her er borte
   * for alltid, og ingen ville skjønt hvorfor ikonet forsvant.
   */
  const oppdatert = sider.map((s) =>
    String(s.id ?? s.name) === binding.sideId
      ? {
          ...s,
          name: felter.data.navn,
          url: felter.data.url,
          group: felter.data.gruppe,
          help: felter.data.hjelp || undefined,
          ...utsjånad(felter.data),
        }
      : s,
  )

  const svar = await skrivRaaSider(
    oppdatert,
    sha,
    `Endre felles side: ${felter.data.navn}`,
    hylse,
  )
  if (!svar.ok) return { feil: svar.grunn }

  await logg('side.endret', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { sideId: binding.sideId, navn: felter.data.navn },
  })

  revalidatePath('/brukere')
  return { ok: `«${felter.data.navn}» er lagret.` }
}

/**
 * Sletter en side for godt.
 *
 * Fjerner den fra fila OG rydder tilgangsradene som peker på den. Uten det
 * siste blir de liggende foreldreløse i samme øyeblikk – det finnes ingen
 * fremmednøkkel, fordi sidene ikke bor i denne databasen.
 *
 * Fila først. Feiler ryddingen etterpå, er siden borte og noen rader ligger
 * igjen, og det er synlig og fiksbart. Motsatt rekkefølge ville gitt en side
 * som fortsatt vises, men der alle unntakene stille var slettet.
 */
export async function slettSide(
  binding: { sideId: string; navn: string },
  _forrige: BrukerTilstand,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const { sider, sha, hylse } = await hentRaaSider()
  if (!sha) return { feil: 'Adminbordet har ikke GitHub-token, og kan ikke slette sider.' }

  const utan = sider.filter((s) => String(s.id ?? s.name) !== binding.sideId)
  if (utan.length === sider.length) {
    return { feil: 'Siden finnes ikke lenger. Last siden på nytt.' }
  }

  const svar = await skrivRaaSider(
    utan,
    sha,
    `Fjern felles side: ${binding.navn}`,
    hylse,
  )
  if (!svar.ok) return { feil: svar.grunn }

  await Promise.all([
    supabaseAdmin.from('side_tilgang').delete().eq('side_id', binding.sideId),
    supabaseAdmin.from('side_standard').delete().eq('side_id', binding.sideId),
    supabaseAdmin.from('gruppe_sider').delete().eq('side_id', binding.sideId),
  ])

  await logg('side.slettet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { sideId: binding.sideId, navn: binding.navn },
  })

  revalidatePath('/brukere')
  return { ok: `«${binding.navn}» er fjernet for alle.` }
}
