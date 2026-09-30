'use server'

import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import { unntakFor } from '@/lib/sideregel'
import { oppdaterAppen, type Tilstand } from './tilstand'

/**
 * Bestemmer om én person ser én side, uansett hva gruppene sier.
 *
 * Et unntak lagres bare når valget avviker fra det gruppene gir – se
 * unntakFor i lib/sideregel.ts.
 *
 * Hva gruppene gir, regnes ut her og ikke i skjermen. Skjermen kan være
 * lastet før noen endret gruppene, og da ville unntaket blitt feil.
 */
export async function settSideUnntak(
  binding: {
    personId: string
    personNavn: string
    sideId: string
    sideNavn: string
    /** Skal personen se siden etter denne endringen? */
    ser: boolean
  },
  _forrige: Tilstand,
): Promise<Tilstand> {
  const meg = await krevEier()

  const { data: mine, error: gruppeFeil } = await supabaseAdmin
    .from('person_gruppe')
    .select('gruppe_id')
    .eq('person_id', binding.personId)
  if (gruppeFeil) return { feil: `Kunne ikke lese gruppene: ${gruppeFeil.message}` }

  let fraGrupper = false
  const gruppeIder = (mine ?? []).map((r) => r.gruppe_id as string)
  if (gruppeIder.length > 0) {
    const { count, error } = await supabaseAdmin
      .from('gruppe_sider')
      .select('gruppe_id', { count: 'exact', head: true })
      .eq('side_id', binding.sideId)
      .in('gruppe_id', gruppeIder)
    if (error) return { feil: `Kunne ikke lese gruppesidene: ${error.message}` }
    fraGrupper = (count ?? 0) > 0
  }

  const lagre = unntakFor(binding.ser, fraGrupper)
  const { error } =
    lagre === null
      ? await supabaseAdmin
          .from('side_tilgang')
          .delete()
          .eq('person_id', binding.personId)
          .eq('side_id', binding.sideId)
      : await supabaseAdmin
          .from('side_tilgang')
          .upsert(
            { person_id: binding.personId, side_id: binding.sideId, gi: lagre },
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
      følgerGruppene: lagre === null,
    },
  })

  oppdaterAppen()
  return {
    ok: `${binding.personNavn} ${binding.ser ? 'ser' : 'ser ikke'} «${binding.sideNavn}».`,
  }
}

/**
 * Fjerner rader som peker på en side som ikke finnes lenger.
 *
 * Sidene bor i sider.json på GitHub, ikke i denne databasen, så ingen
 * fremmednøkkel rydder av seg selv. side_standard tas med: den leses bare av
 * gamle appversjoner, men rader der skal heller ikke bli liggende.
 */
export async function ryddForeldreløs(
  binding: { sideId: string },
  _forrige: Tilstand,
): Promise<Tilstand> {
  const meg = await krevEier()

  const svar = await Promise.all([
    supabaseAdmin.from('side_tilgang').delete().eq('side_id', binding.sideId),
    supabaseAdmin.from('gruppe_sider').delete().eq('side_id', binding.sideId),
    supabaseAdmin.from('side_standard').delete().eq('side_id', binding.sideId),
  ])
  const feil = svar.find((s) => s.error)?.error
  if (feil) return { feil: `Kunne ikke rydde: ${feil.message}` }

  await logg('side.ryddet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { sideId: binding.sideId },
  })

  oppdaterAppen()
  return { ok: `Ryddet bort «${binding.sideId}».` }
}
