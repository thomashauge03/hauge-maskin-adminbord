'use server'

import { revalidatePath } from 'next/cache'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import type { BrukerTilstand } from './actions'

/**
 * Bestemmer om en side er standard, altså om alle godkjente får den.
 *
 * En side er standard med mindre det finnes en rad som sier noe annet.
 * Derfor: sette den til standard er å SLETTE raden, ikke å skrive true.
 * Det betyr også at en ny side lagt inn fra skrivebordsappen automatisk blir
 * synlig for alle, uten at noen må huske å gjøre noe her.
 */
export async function settStandard(
  binding: { sideId: string; navn: string; standard: boolean },
  _forrige: BrukerTilstand,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const { error } = binding.standard
    ? await supabaseAdmin.from('side_standard').delete().eq('side_id', binding.sideId)
    : await supabaseAdmin
        .from('side_standard')
        .upsert({ side_id: binding.sideId, standard: false }, { onConflict: 'side_id' })

  if (error) return { feil: `Kunne ikke endre: ${error.message}` }

  await logg(binding.standard ? 'side.standard_på' : 'side.standard_av', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { sideId: binding.sideId, navn: binding.navn },
  })

  revalidatePath('/brukere')
  return {
    ok: binding.standard
      ? `«${binding.navn}» vises nå for alle.`
      : `«${binding.navn}» vises nå bare for dem du gir den til.`,
  }
}

/**
 * Bestemmer om én person ser én side.
 *
 * Tre tilstander, ikke to: personen kan følge standarden, ha fått siden
 * særskilt, eller fått den fratatt særskilt. Vi lagrer en rad BARE når
 * personen avviker – havner valget på det standarden allerede sier, slettes
 * raden i stedet.
 *
 * Det er ikke sparing for sparingens skyld. Uten det ville en side som
 * senere blir standard for alle, fortsatt vært skjult for alle som en gang
 * hadde en rad med samme verdi – og ingen ville skjønt hvorfor.
 */
export async function settSideTilgang(
  binding: {
    personId: string
    personNavn: string
    sideId: string
    sideNavn: string
    /** Skal personen se siden etter denne endringen? */
    ser: boolean
    /** Hva standarden sier for denne siden. */
    standard: boolean
  },
  _forrige: BrukerTilstand,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const følgerStandarden = binding.ser === binding.standard

  const { error } = følgerStandarden
    ? await supabaseAdmin
        .from('side_tilgang')
        .delete()
        .eq('person_id', binding.personId)
        .eq('side_id', binding.sideId)
    : await supabaseAdmin.from('side_tilgang').upsert(
        { person_id: binding.personId, side_id: binding.sideId, gi: binding.ser },
        { onConflict: 'person_id,side_id' },
      )

  if (error) return { feil: `Kunne ikke endre: ${error.message}` }

  await logg(binding.ser ? 'side.gitt' : 'side.fratatt', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: {
      personId: binding.personId,
      person: binding.personNavn,
      sideId: binding.sideId,
      side: binding.sideNavn,
      fulgteStandarden: følgerStandarden,
    },
  })

  revalidatePath('/brukere')
  return {
    ok: `${binding.personNavn} ${binding.ser ? 'ser' : 'ser ikke'} «${binding.sideNavn}».`,
  }
}

/**
 * Fjerner rader som peker på en side som ikke finnes lenger.
 *
 * Sidene bor i `sider.json` på GitHub, ikke i denne databasen, så det finnes
 * ingen fremmednøkkel som kunne ryddet av seg selv. Slettes en side der, blir
 * radene her liggende igjen usynlig.
 */
export async function ryddForeldreløs(
  binding: { sideId: string },
  _forrige: BrukerTilstand,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const a = await supabaseAdmin.from('side_tilgang').delete().eq('side_id', binding.sideId)
  const b = await supabaseAdmin.from('side_standard').delete().eq('side_id', binding.sideId)

  if (a.error || b.error) {
    return { feil: `Kunne ikke rydde: ${(a.error ?? b.error)?.message}` }
  }

  await logg('side.ryddet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { sideId: binding.sideId },
  })

  revalidatePath('/brukere')
  return { ok: `Ryddet bort «${binding.sideId}».` }
}
