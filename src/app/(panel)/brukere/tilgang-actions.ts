'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { giTilgang, hentGyldigeRoller, taBortTilgang } from '@/lib/tilgang'
import { logg } from '@/lib/data'

export type CelleTilstand = { feil?: string; ok?: string }

const giSkjema = z.object({
  systemId: z.uuid('Ukjent system'),
  epost: z.email('Ugyldig e-postadresse'),
  navn: z.string().trim().default(''),
  rolle: z.string().trim().nullable().default(null),
  /*
   * Samme minstekrav som nyBrukerSkjema.
   *
   * Sto uten lengdekrav, mens verdien går rett til auth.admin.createUser i et
   * annet systems produksjonsbase. Å opprette en konto med passordet «a» i
   * tilbudssystemet er verre enn å ikke kunne opprette den.
   */
  midlertidigPassord: z
    .string()
    .trim()
    .min(8, 'Det midlertidige passordet må være minst 8 tegn')
    .nullable()
    .default(null),
})

const fjernSkjema = z.object({
  systemId: z.uuid('Ukjent system'),
  epost: z.email('Ugyldig e-postadresse'),
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
 * Et unntak skal bli en melding i panelet, ikke en feilside.
 *
 * Handlingene kaller et fremmed API og bygger SQL av registerverdier; begge
 * kan kaste. Et kast fra en server action går til nærmeste feilgrense, og da
 * forsvant hele brukerlisten for én mislykket rolleendring – med en tekst som
 * ikke sa hvilken person eller hvilket system det gjaldt.
 */
function uventet(hva: string, e: unknown): CelleTilstand {
  return {
    feil: `${hva} stoppet med en uventet feil: ${e instanceof Error ? e.message : String(e)}`,
  }
}

/**
 * Gir en person tilgang til ett system, med en rolle – eller endrer rollen.
 *
 * Skriver i systemets EGEN tabell – se lib/tilgang.ts for hvordan hvert
 * system lagrer tilgang, og hvorfor det ikke er hardkodet per app.
 *
 * System og person kommer fra skjemaet framfor å være bundet inn. Personpanelet
 * bruker samme handling for alle systemene, og bundne verdier er uansett like
 * mye klientens som skjemafeltene – det er sjekkene under som er vernet.
 */
export async function giTilgangTilSystem(
  _forrige: CelleTilstand,
  formData: FormData,
): Promise<CelleTilstand> {
  const meg = await krevEier()

  const felter = giSkjema.safeParse({
    systemId: formData.get('systemId'),
    epost: formData.get('epost'),
    navn: formData.get('navn') ?? '',
    // Tom streng fra et select uten valg skal bli null, ikke ''.
    rolle: formData.get('rolle') || null,
    midlertidigPassord: formData.get('midlertidigPassord') || null,
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }
  const { systemId, epost, rolle } = felter.data

  try {
    const system = await hentSystemFelt(systemId)
    if (!system) return { feil: 'Fant ikke systemet.' }

    const prosjektRef = system.supabase_prosjekt_ref as string | null
    const kontoId = (system.konto_id as string | null) ?? null

    /*
     * Rollen må være en av systemets EGNE roller.
     *
     * Verdien kom fra et skjemafelt og gikk rett inn i en insert mot en fremmed
     * produksjonstabell. Rollekolonnen i tenant_users har ingen CHECK, så en
     * skrivefeil ga en rad som ser gitt ut og oppfører seg som ingenting – og
     * omvendt er `admin` der plattform-admin over tre bedrifter, inkludert
     * sletting av en hel kunde. Da skal verdien komme fra registeret og systemet
     * selv, ikke fra det klienten sendte.
     */
    if (rolle) {
      const roller = await hentGyldigeRoller({ systemId, prosjektRef, kontoId })
      if (roller.length > 0 && !roller.some((r) => r.verdi === rolle)) {
        return {
          feil: `«${rolle}» er ikke en rolle i ${system.navn}. Gyldige: ${roller.map((r) => r.verdi).join(', ')}.`,
        }
      }
    }

    const svar = await giTilgang({
      systemId,
      prosjektRef,
      kontoId,
      epost,
      navn: felter.data.navn || epost.split('@')[0],
      rolle,
      midlertidigPassord: felter.data.midlertidigPassord,
    })

    await logg(svar.ok ? 'tilgang.gitt' : 'tilgang.gi_feilet', {
      utfortAv: meg.id,
      utfortAvEpost: meg.epost,
      systemId,
      detaljer: {
        epost,
        rolle,
        system: system.navn,
        ...(svar.ok ? {} : { feil: svar.feil }),
      },
    })

    if (!svar.ok) return { feil: svar.feil }

    revalidatePath('/brukere')
    return { ok: svar.melding }
  } catch (e) {
    return uventet('Tilgangen', e)
  }
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
  _forrige: CelleTilstand,
  formData: FormData,
): Promise<CelleTilstand> {
  const meg = await krevEier()

  const felter = fjernSkjema.safeParse({
    systemId: formData.get('systemId'),
    epost: formData.get('epost'),
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }
  const { systemId, epost } = felter.data

  try {
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

    if (!svar.ok) return { feil: svar.feil }

    revalidatePath('/brukere')
    return { ok: svar.melding }
  } catch (e) {
    return uventet('Fjerningen', e)
  }
}
