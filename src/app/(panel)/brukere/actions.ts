'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { lagFremmedKlient } from '@/lib/supabase/fremmed'
import { logg } from '@/lib/data'
import { taBortTilgang } from '@/lib/tilgang'

export type BrukerTilstand = { feil?: string; ok?: string }

const nyBrukerSkjema = z.object({
  systemId: z.string().uuid('Velg et system'),
  epost: z.email('Ugyldig e-postadresse'),
  passord: z.string().min(8, 'Passordet må være minst 8 tegn'),
})

/**
 * Oppretter en bruker i et ANNET systems database.
 *
 * Passordet settes direkte i stedet for å sende invitasjon på e-post.
 * Supabase sin innebygde e-posttjeneste har lave ratebegrensninger og er
 * ikke egnet i drift uten egen SMTP – og adminbordet har ingen SMTP.
 * Den som oppretter brukeren formidler passordet videre.
 *
 * MERK at denne bare lager auth-brukeren. De fleste appene krever i
 * tillegg en rad i sin egen rolletabell (`admin_brukere`,
 * `super_admin_users`), og den må legges inn i appen selv. Adminbordet
 * later ikke som det kjenner hver apps rollemodell – å gjette feil der
 * gir en bruker som kan logge inn men ikke se noe, og det er verre enn
 * å ikke ha opprettet den.
 */
export async function opprettBrukerISystem(
  _forrige: BrukerTilstand,
  formData: FormData,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const felter = nyBrukerSkjema.safeParse({
    systemId: formData.get('systemId'),
    epost: formData.get('epost'),
    passord: formData.get('passord'),
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const fremmed = await lagFremmedKlient(felter.data.systemId)
  if (!fremmed.ok) return { feil: fremmed.grunn }

  const { data, error } = await fremmed.klient.auth.admin.createUser({
    email: felter.data.epost,
    password: felter.data.passord,
    email_confirm: true,
  })

  if (error || !data.user) {
    return {
      feil: error?.message.includes('already')
        ? 'Det finnes allerede en bruker med denne e-postadressen i systemet.'
        : `Kunne ikke opprette bruker: ${error?.message ?? 'ukjent feil'}`,
    }
  }

  // Registrerer tilgangen i navet, slik at oversikten stemmer uten at
  // brukerlisten må hentes fra sju prosjekter på nytt.
  await registrerTilgang({
    systemId: felter.data.systemId,
    epost: felter.data.epost,
    eksternBrukerId: data.user.id,
  })

  await logg('bruker.opprettet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId: felter.data.systemId,
    detaljer: { epost: felter.data.epost },
  })

  revalidatePath('/brukere')
  return {
    ok: `${felter.data.epost} kan nå logge inn. Husk at appen kan kreve en rad i sin egen rolletabell i tillegg.`,
  }
}

const passordSkjema = z.object({
  systemId: z.string().uuid(),
  brukerId: z.string().uuid(),
  passord: z.string().min(8, 'Passordet må være minst 8 tegn'),
})

/** Setter nytt passord på en bruker i et annet system. */
export async function settPassordISystem(
  _forrige: BrukerTilstand,
  formData: FormData,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const felter = passordSkjema.safeParse({
    systemId: formData.get('systemId'),
    brukerId: formData.get('brukerId'),
    passord: formData.get('passord'),
  })
  if (!felter.success) return { feil: felter.error.issues[0].message }

  const fremmed = await lagFremmedKlient(felter.data.systemId)
  if (!fremmed.ok) return { feil: fremmed.grunn }

  const { error } = await fremmed.klient.auth.admin.updateUserById(
    felter.data.brukerId,
    { password: felter.data.passord },
  )
  if (error) return { feil: `Kunne ikke endre passord: ${error.message}` }

  await logg('bruker.passord_satt', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId: felter.data.systemId,
    // Bruker-ID, aldri passordet.
    detaljer: { brukerId: felter.data.brukerId },
  })

  revalidatePath('/brukere')
  return { ok: 'Passordet er endret. Formidle det til brukeren selv.' }
}

/**
 * Sperrer eller åpner en konto i et annet system.
 *
 * Supabase har ingen «aktiv»-bryter; man setter `ban_duration`. En
 * hundreårig sperre er den vanlige måten å si «for godt», og den kan
 * angres ved å sette 'none'.
 *
 * Dette er den anbefalte veien, og står først i grensesnittet: en sperret
 * konto beholder id-en, så ordrer og signaturer peker fortsatt på en
 * bruker som finnes. Sletting finnes også – se slettBrukerISystem – men
 * den etterlater referanser ingen kan tyde, og bør være unntaket.
 *
 * `sperret` er MÅLtilstanden, ikke en veksling. Den regnes ut på serveren,
 * der vi vet hva kontoen står i nå – en veksling utregnet i nettleseren
 * bommer hvis siden ble hentet før noen andre endret kontoen.
 */
export async function settSperret(
  systemId: string,
  brukerId: string,
  sperret: boolean,
  _forrige: BrukerTilstand,
  _formData: FormData,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const fremmed = await lagFremmedKlient(systemId)
  if (!fremmed.ok) {
    return {
      feil: `Kunne ikke ${sperret ? 'sperre' : 'åpne'} kontoen: ${fremmed.grunn}`,
    }
  }

  const { error } = await fremmed.klient.auth.admin.updateUserById(brukerId, {
    ban_duration: sperret ? '876000h' : 'none',
  })

  await logg(
    error
      ? 'bruker.sperring_feilet'
      : sperret
        ? 'bruker.sperret'
        : 'bruker.apnet',
    {
      utfortAv: meg.id,
      utfortAvEpost: meg.epost,
      systemId,
      detaljer: { brukerId, ...(error ? { feil: error.message } : {}) },
    },
  )

  revalidatePath('/brukere')

  if (error) {
    return {
      feil: `Kunne ikke ${sperret ? 'sperre' : 'åpne'} kontoen: ${error.message}`,
    }
  }
  return { ok: sperret ? 'Kontoen er sperret.' : 'Kontoen er åpnet igjen.' }
}

/**
 * Sletter brukeren i ett system, for godt.
 *
 * Jeg valgte først bevisst sperring framfor sletting, med begrunnelsen at
 * en slettet auth-bruker etterlater rader i appens egne tabeller – ordrer,
 * signaturer, leveringssedler – som peker på en id som ikke finnes. Det
 * argumentet står fortsatt, og derfor er sperring det som ligger først i
 * grensesnittet.
 *
 * Men sletting må finnes: en testbruker, en feilskrevet e-post eller en
 * person som slutter og skal ut av systemet for godt hører ikke i en
 * evighetsliste av sperrede kontoer.
 *
 * Rolleraden fjernes FØRST, auth-brukeren etterpå. Går det galt midt i, er
 * en bruker uten tilgang en tryggere halvveis tilstand enn tilgang uten
 * bruker.
 */
export async function slettBrukerISystem(
  systemId: string,
  brukerId: string,
  epost: string,
  _forrige: BrukerTilstand,
  _formData: FormData,
): Promise<BrukerTilstand> {
  const meg = await krevEier()

  const { data: system } = await supabaseAdmin
    .from('systemer')
    .select('navn, supabase_prosjekt_ref, konto_id')
    .eq('id', systemId)
    .single()

  // 1. Rolleraden, slik at tilgangen er borte selv om steg 2 feiler.
  const fjernet = await taBortTilgang({
    systemId,
    prosjektRef: (system?.supabase_prosjekt_ref as string | null) ?? null,
    kontoId: (system?.konto_id as string | null) ?? null,
    epost,
  })

  // 2. Selve auth-brukeren.
  const fremmed = await lagFremmedKlient(systemId)
  if (!fremmed.ok) {
    return {
      feil: `Tilgangen er fjernet, men brukeren kunne ikke slettes: ${fremmed.grunn}`,
    }
  }

  const { error } = await fremmed.klient.auth.admin.deleteUser(brukerId)

  await logg(error ? 'bruker.slett_feilet' : 'bruker.slettet', {
    utfortAv: meg.id,
    utfortAvEpost: meg.epost,
    systemId,
    detaljer: {
      epost,
      brukerId,
      rolleradFjernet: fjernet.ok,
      ...(error ? { feil: error.message } : {}),
    },
  })

  revalidatePath('/brukere')

  if (error) {
    return { feil: `Tilgangen er fjernet, men sletting feilet: ${error.message}` }
  }
  return {
    ok: `${epost} er slettet fra ${system?.navn ?? 'systemet'}. Rader i appen som pekte på brukeren peker nå på en id som ikke finnes – det er normalt, men verdt å vite om hvis noe ser rart ut i historikken.`,
  }
}

/**
 * Sørger for at personen og tilgangen finnes i navet.
 *
 * Kalles etter hver endring i et fremmed system, slik at registeret
 * ikke drifter fra virkeligheten. Feiler stille: en manglende
 * registerrad skal ikke gjøre at brukeren som nettopp ble opprettet
 * ser ut som en feil.
 */
async function registrerTilgang({
  systemId,
  epost,
  eksternBrukerId,
}: {
  systemId: string
  epost: string
  eksternBrukerId: string
}) {
  const { data: person } = await supabaseAdmin
    .from('personer')
    .upsert(
      { epost: epost.toLowerCase(), navn: epost.split('@')[0] },
      { onConflict: 'epost', ignoreDuplicates: false },
    )
    .select('id')
    .single()

  if (!person) return

  await supabaseAdmin.from('system_tilgang').upsert(
    {
      person_id: person.id,
      system_id: systemId,
      // Rollen er ukjent her: appen bestemmer den i sin egen tabell.
      rolle: 'ukjent',
      ekstern_bruker_id: eksternBrukerId,
      sist_bekreftet: new Date().toISOString(),
    },
    { onConflict: 'person_id,system_id' },
  )
}
