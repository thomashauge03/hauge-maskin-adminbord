'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import type { BrukerTilstand } from './actions'

const nyttNavn = z.object({
  navn: z.string().trim().min(1, 'Gruppa må ha et navn').max(40, 'Navnet er for langt'),
  beskrivelse: z.string().trim().max(120).optional(),
})

export async function lagGruppe(
  _forrige: BrukerTilstand,
  formData: FormData,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const felter = nyttNavn.safeParse({
    navn: formData.get('navn'),
    beskrivelse: formData.get('beskrivelse'),
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const { error } = await supabaseAdmin.from('grupper').insert({
    navn: felter.data.navn,
    beskrivelse: felter.data.beskrivelse || null,
  })

  if (error) {
    return {
      feil: error.message.includes('duplicate') || error.code === '23505'
        ? `Det finnes allerede en gruppe som heter «${felter.data.navn}».`
        : `Kunne ikke lage gruppa: ${error.message}`,
    }
  }

  await logg('gruppe.laget', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { navn: felter.data.navn },
  })

  revalidatePath('/brukere')
  return { ok: `Gruppa «${felter.data.navn}» er laget. Gi den sider, og legg folk i den.` }
}

/**
 * Sletter en gruppe.
 *
 * Koblingene til sider og personer forsvinner med den, gjennom
 * `on delete cascade`. Det er med vilje: en gruppe uten medlemmer og uten
 * sider er ingenting, og rader som pekte på den ville bare vært støy.
 *
 * Folk mister tilgangen gruppa ga dem. Er det noen som skal beholde en side
 * likevel, må de få den særskilt først - derfor sier bekreftelsen i skjermen
 * hvor mange det gjelder.
 */
export async function slettGruppe(
  binding: { gruppeId: string; navn: string },
  _forrige: BrukerTilstand,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const { error } = await supabaseAdmin.from('grupper').delete().eq('id', binding.gruppeId)
  if (error) return { feil: `Kunne ikke slette: ${error.message}` }

  await logg('gruppe.slettet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { gruppeId: binding.gruppeId, navn: binding.navn },
  })

  revalidatePath('/brukere')
  return { ok: `Gruppa «${binding.navn}» er slettet.` }
}

/** Gir eller tar bort én side for én gruppe. */
export async function settGruppeSide(
  binding: { gruppeId: string; gruppeNavn: string; sideId: string; sideNavn: string; gi: boolean },
  _forrige: BrukerTilstand,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const { error } = binding.gi
    ? await supabaseAdmin
        .from('gruppe_sider')
        .upsert(
          { gruppe_id: binding.gruppeId, side_id: binding.sideId },
          { onConflict: 'gruppe_id,side_id' },
        )
    : await supabaseAdmin
        .from('gruppe_sider')
        .delete()
        .eq('gruppe_id', binding.gruppeId)
        .eq('side_id', binding.sideId)

  if (error) return { feil: `Kunne ikke endre: ${error.message}` }

  await logg(binding.gi ? 'gruppe.side_gitt' : 'gruppe.side_fjernet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: {
      gruppe: binding.gruppeNavn,
      side: binding.sideNavn,
      sideId: binding.sideId,
    },
  })

  revalidatePath('/brukere')
  return {
    ok: `«${binding.sideNavn}» ${binding.gi ? 'gis nå av' : 'gis ikke lenger av'} ${binding.gruppeNavn}.`,
  }
}

/** Legger en person i en gruppe, eller tar dem ut. */
export async function settPersonGruppe(
  binding: {
    personId: string
    personNavn: string
    gruppeId: string
    gruppeNavn: string
    inn: boolean
  },
  _forrige: BrukerTilstand,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const { error } = binding.inn
    ? await supabaseAdmin
        .from('person_gruppe')
        .upsert(
          { person_id: binding.personId, gruppe_id: binding.gruppeId },
          { onConflict: 'person_id,gruppe_id' },
        )
    : await supabaseAdmin
        .from('person_gruppe')
        .delete()
        .eq('person_id', binding.personId)
        .eq('gruppe_id', binding.gruppeId)

  if (error) return { feil: `Kunne ikke endre: ${error.message}` }

  await logg(binding.inn ? 'gruppe.person_inn' : 'gruppe.person_ut', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: {
      person: binding.personNavn,
      personId: binding.personId,
      gruppe: binding.gruppeNavn,
    },
  })

  revalidatePath('/brukere')
  return {
    ok: `${binding.personNavn} er ${binding.inn ? 'lagt i' : 'tatt ut av'} ${binding.gruppeNavn}.`,
  }
}
