'use server'

import { revalidatePath } from 'next/cache'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import type { AppkontoStatus } from '@/lib/appbrukarar'
import type { BrukerTilstand } from './actions'

const ORD: Record<AppkontoStatus, string> = {
  venter: 'satt på vent',
  godkjent: 'godkjent',
  sperra: 'avvist',
}

/**
 * Slipper noen inn i mobilappen, eller stenger dem ute.
 *
 * Måltilstanden bindes på serveren, som for sperring av brukere i de andre
 * systemene. Da finnes den ikke som et felt i skjemaet.
 */
export async function settAppstatus(
  binding: { personId: string; epost: string; navBrukerId: string; nyStatus: AppkontoStatus },
  _forrige: BrukerTilstand,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  /*
   * Godkjenning bekrefter også e-postadressen.
   *
   * Med `mailer_autoconfirm` på er den allerede bekreftet, og dette er et
   * kall som ikke gjør noe. Står flagget av, er det derimot det eneste som
   * gjør at personen i det hele tatt kan logge inn – og viktigere:
   *
   * Den felles innloggingen (Del B) kobler en portalinnlogging til en
   * eksisterende konto BARE når e-posten er bekreftet. En bruker med
   * email_confirmed_at = null får en helt ny auth-rad den dagen portalen
   * tas i bruk, og den gamle raden med all tilgangen blir liggende ved
   * siden av. Det skjer uten feilmelding, og er nesten umulig å feilsøke
   * etterpå. Se docs/INNLOGGINGSPORTAL.md.
   *
   * Derfor: ingen skal kunne bli godkjent uten bekreftet e-post. Kallet
   * står her, foran statusendringen, slik at en person som blir godkjent
   * alltid har begge deler.
   */
  if (binding.nyStatus === 'godkjent') {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(binding.navBrukerId, {
      email_confirm: true,
    })
    if (error) {
      return { feil: `Kunne ikke bekrefte e-postadressen: ${error.message}` }
    }
  }

  const godkjenning =
    binding.nyStatus === 'godkjent'
      ? { godkjent_av: meg.id, godkjent_tid: new Date().toISOString() }
      : {}

  const { error } = await supabaseAdmin
    .from('personer')
    .update({ status: binding.nyStatus, ...godkjenning })
    .eq('id', binding.personId)

  if (error) {
    return { feil: `Kunne ikke endre tilgangen: ${error.message}` }
  }

  await logg(`appkonto.${binding.nyStatus}`, {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { personId: binding.personId, epost: binding.epost },
  })

  revalidatePath('/brukere')
  return { ok: `${binding.epost} er ${ORD[binding.nyStatus]}.` }
}

/**
 * Fjerner en registrering som aldri ble til en person.
 *
 * Kontoen finnes i innloggingen, men har ingen `personer`-rad, så den kan
 * verken godkjennes eller avvises – den henger. Å slette den frigjør
 * e-postadressen slik at personen kan registrere seg på nytt, og det er
 * hele poenget: dette er den eneste veien ut av den tilstanden.
 */
export async function slettForeldreløs(
  binding: { navBrukerId: string; epost: string },
  _forrige: BrukerTilstand,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  // Siste skanse: en konto med `personer`-rad er ikke foreldreløs, og skal
  // aldri kunne slettes herfra uansett hva skjermen viste da den ble lastet.
  const { data: finnes } = await supabaseAdmin
    .from('personer')
    .select('id')
    .eq('nav_bruker_id', binding.navBrukerId)
    .maybeSingle()

  if (finnes) {
    return { feil: 'Kontoen hører til en person likevel. Last siden på nytt.' }
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(binding.navBrukerId)
  if (error) {
    return { feil: `Kunne ikke slette: ${error.message}` }
  }

  await logg('appkonto.foreldrelos_slettet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { navBrukerId: binding.navBrukerId, epost: binding.epost },
  })

  revalidatePath('/brukere')
  return { ok: `${binding.epost} er fjernet og kan registrere seg på nytt.` }
}
