'use server'

import { redirect } from 'next/navigation'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logg } from '@/lib/data'
import type { AppkontoStatus } from '@/lib/appbrukarar'
import { oppdaterAppen, type Tilstand } from './tilstand'

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
  _forrige: Tilstand,
): Promise<Tilstand> {
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

  oppdaterAppen()
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
  _forrige: Tilstand,
): Promise<Tilstand> {
  const meg = await krevEier()

  // Siste skanse: en konto med `personer`-rad er ikke foreldreløs, og skal
  // aldri kunne slettes herfra uansett hva skjermen viste da den ble lastet.
  const { data: finnes, error: finnesFeil } = await supabaseAdmin
    .from('personer')
    .select('id')
    .eq('nav_bruker_id', binding.navBrukerId)
    .maybeSingle()

  // Begge sjekkene stopper på feil. Et oppslag som feiler gir `data: null`,
  // som ser ut som «ingen rad», og en slettet innlogging kommer ikke tilbake.
  if (finnesFeil) {
    return { feil: `Kunne ikke sjekke om kontoen hører til en person: ${finnesFeil.message}` }
  }

  if (finnes) {
    return { feil: 'Kontoen hører til en person likevel. Last siden på nytt.' }
  }

  /*
   * Og aldri en admin. En admin i adminbordet har ingen personrad, og ser
   * derfor ut som en foreldreløs for alt annet enn denne sjekken. Å slette
   * innloggingen ville tatt admin-raden med seg (on delete cascade).
   */
  const { data: admin, error: adminFeil } = await supabaseAdmin
    .from('admin_brukere')
    .select('id')
    .eq('id', binding.navBrukerId)
    .maybeSingle()

  if (adminFeil) {
    return { feil: `Kunne ikke sjekke om kontoen er en admin: ${adminFeil.message}` }
  }

  if (admin) {
    return { feil: 'Dette er innloggingen til en admin i adminbordet, og den kan ikke slettes herfra.' }
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

  oppdaterAppen()
  return { ok: `${binding.epost} er fjernet og kan registrere seg på nytt.` }
}

/**
 * Fjerner en person fra appen: innloggingen, gruppene og unntakene.
 *
 * Rekkefølgen er valgt slik at en feil underveis alltid etterlater noe som
 * synes og kan ryddes. Innloggingen slettes sist: feiler det, står personen
 * enten i køen (raden ble stående) eller under «Registreringer som ikke kom
 * fram» (raden ble slettet), og kan fjernes derfra.
 *
 * Personraden blir stående når personen finnes i andre systemer –
 * kontooversikten under Brukere bruker den.
 *
 * Stopper det etter at noe er slettet, logges det som `appkonto.slettet_delvis`
 * og skjermen bygges på nytt. Ellers ville lista og historikken fortsatt vist
 * personen slik de var før, og ingen ville sett hva som er borte.
 */
export async function slettFraAppen(
  binding: { personId: string },
  _forrige: Tilstand,
): Promise<Tilstand> {
  const meg = await krevEier()

  const { data: p, error } = await supabaseAdmin
    .from('personer')
    .select('id, navn, epost, nav_bruker_id, system_tilgang(system_id)')
    .eq('id', binding.personId)
    .maybeSingle()
  if (error) return { feil: `Kunne ikke lese personen: ${error.message}` }
  if (!p || !p.nav_bruker_id) {
    return { feil: 'Personen har ikke konto i appen lenger. Last siden på nytt.' }
  }

  // Aldri en admin. Innloggingen i appen er den samme som i adminbordet, og
  // å slette den ville tatt admin-raden med seg (on delete cascade).
  // Oppslaget stopper på feil: et som feiler gir `data: null`, som ser ut som
  // «ikke en admin», og en slettet innlogging kommer ikke tilbake.
  const { data: admin, error: adminFeil } = await supabaseAdmin
    .from('admin_brukere')
    .select('id')
    .eq('id', p.nav_bruker_id)
    .maybeSingle()
  if (adminFeil) {
    return { feil: `Kunne ikke sjekke om kontoen er en admin: ${adminFeil.message}` }
  }
  if (admin) {
    return { feil: 'Dette er innloggingen til en admin i adminbordet, og den kan ikke slettes herfra.' }
  }

  const stoppetHalvveis = (steg: string, feil: string) =>
    logg('appkonto.slettet_delvis', {
      utfortAv: meg.id,
      utfortAvEpost: meg.epost,
      detaljer: { personId: p.id, epost: p.epost, steg, feil },
    })

  const rydding = await Promise.all([
    supabaseAdmin.from('person_gruppe').delete().eq('person_id', p.id),
    supabaseAdmin.from('side_tilgang').delete().eq('person_id', p.id),
  ])
  const ryddeFeil = rydding.find((r) => r.error)?.error
  if (ryddeFeil) {
    // De to slettingene går hver for seg, så den ene kan ha gått gjennom selv om
    // den andre feilet. Skjermen bygges på nytt uansett; historikken får bare
    // en rad når noe faktisk ble borte.
    oppdaterAppen()
    if (rydding.some((r) => !r.error)) await stoppetHalvveis('grupper_og_unntak', ryddeFeil.message)
    return { feil: `Kunne ikke fjerne grupper og unntak: ${ryddeFeil.message}` }
  }

  const iAndreSystemer = ((p.system_tilgang as unknown[] | null)?.length ?? 0) > 0
  const { error: radFeil } = iAndreSystemer
    ? await supabaseAdmin
        .from('personer')
        .update({ status: 'venter', godkjent_av: null, godkjent_tid: null })
        .eq('id', p.id)
    : await supabaseAdmin.from('personer').delete().eq('id', p.id)
  if (radFeil) {
    oppdaterAppen()
    await stoppetHalvveis('personrad', radFeil.message)
    return { feil: `Grupper og unntak er fjernet, men personen står: ${radFeil.message}` }
  }

  const { error: innloggingFeil } = await supabaseAdmin.auth.admin.deleteUser(p.nav_bruker_id as string)
  if (innloggingFeil) {
    oppdaterAppen()
    await stoppetHalvveis('innlogging', innloggingFeil.message)
    return {
      feil: `Grupper og unntak er fjernet, men innloggingen står igjen: ${innloggingFeil.message}. Den ligger nå ${
        iAndreSystemer ? 'i køen' : 'under «Registreringer som ikke kom fram»'
      } under Appen › Brukere, og kan slettes derfra.`,
    }
  }

  await logg('appkonto.slettet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    detaljer: { personId: p.id, epost: p.epost, beholdtPersonrad: iAndreSystemer },
  })

  oppdaterAppen()
  redirect('/appen')
}
