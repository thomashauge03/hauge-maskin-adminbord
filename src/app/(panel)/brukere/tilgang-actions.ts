'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { giTilgang, taBortTilgang } from '@/lib/tilgang'
import { logg } from '@/lib/data'

export type CelleTilstand = { feil?: string; ok?: string }

const giSkjema = z.object({
  epost: z.email('Ugyldig e-postadresse'),
  navn: z.string().trim().default(''),
  rolle: z.string().trim().nullable().default(null),
  midlertidigPassord: z.string().trim().nullable().default(null),
})

/** Henter det giTilgang trenger om systemet, i ett oppslag. */
async function hentSystemFelt(systemId: string) {
  const { data } = await supabaseAdmin
    .from('systemer')
    .select('navn, supabase_prosjekt_ref, konto_id')
    .eq('id', systemId)
    .single()
  return data
}

/**
 * Gir en person tilgang til ett system, med en rolle.
 *
 * Skriver i systemets EGEN tabell – se lib/tilgang.ts for hvordan hvert
 * system lagrer tilgang, og hvorfor det ikke er hardkodet per app.
 */
export async function giTilgangTilSystem(
  systemId: string,
  _forrige: CelleTilstand,
  formData: FormData,
): Promise<CelleTilstand> {
  const meg = await krevEier()

  const felter = giSkjema.safeParse({
    epost: formData.get('epost'),
    navn: formData.get('navn') ?? '',
    // Tom streng fra et select uten valg skal bli null, ikke ''.
    rolle: formData.get('rolle') || null,
    midlertidigPassord: formData.get('midlertidigPassord') || null,
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const system = await hentSystemFelt(systemId)
  if (!system) return { feil: 'Fant ikke systemet.' }

  const svar = await giTilgang({
    systemId,
    prosjektRef: system.supabase_prosjekt_ref as string | null,
    kontoId: (system.konto_id as string | null) ?? null,
    epost: felter.data.epost,
    navn: felter.data.navn || felter.data.epost.split('@')[0],
    rolle: felter.data.rolle,
    midlertidigPassord: felter.data.midlertidigPassord,
  })

  if (!svar.ok) return { feil: svar.feil }

  await logg('tilgang.gitt', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
    detaljer: {
      epost: felter.data.epost,
      rolle: felter.data.rolle,
      system: system.navn,
    },
  })

  revalidatePath('/brukere')
  return { ok: svar.melding }
}

/**
 * Tar bort tilgangen til ett system.
 *
 * Deaktiverer framfor å slette der tabellen har en aktiv-kolonne –
 * ordrer og signaturer peker på brukeren, og en slettet rad etterlater en
 * referanse ingen kan tyde.
 *
 * Returnerer et resultat framfor `void`. Den første versjonen returnerte
 * `void`, og da forsvant enhver feil: handlingen loggførte at den mislyktes
 * mens skjermen viste ingenting. Det ble bare oppdaget fordi noen la merke
 * til at raden sto igjen. En handling som kan feile må kunne si det.
 */
export async function taBortTilgangFraSystem(
  systemId: string,
  epost: string,
  _forrige: CelleTilstand,
  _formData: FormData,
): Promise<CelleTilstand> {
  const meg = await krevEier()

  const system = await hentSystemFelt(systemId)
  if (!system) return { feil: 'Fant ikke systemet.' }

  const svar = await taBortTilgang({
    systemId,
    prosjektRef: system.supabase_prosjekt_ref as string | null,
    kontoId: (system.konto_id as string | null) ?? null,
    epost,
  })

  await logg(svar.ok ? 'tilgang.fjernet' : 'tilgang.fjern_feilet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
    detaljer: {
      epost,
      system: system.navn,
      // Feilen logges også. En handling som ikke gikk gjennom er nettopp
      // det man vil finne igjen når noen sier «jeg fjernet ham i går».
      ...(svar.ok ? {} : { feil: svar.feil }),
    },
  })

  revalidatePath('/brukere')
  return svar.ok ? { ok: svar.melding } : { feil: svar.feil }
}
