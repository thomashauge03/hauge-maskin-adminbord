import { supabaseAdmin } from '@/lib/supabase/admin'
import { hentTokenKart, tokenFor } from '@/lib/kontoar'
import { skrivSpørring } from '@/lib/plattform/supabase-api'
import { lagFremmedKlient } from '@/lib/supabase/fremmed'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Gi og ta bort tilgang i de andre systemene.

   Hvert system lagrer tilgang på sin egen måte – ulik tabell, ulik
   nøkkel, ulik rollekolonne. `tilgangsoppsett` beskriver hvordan, slik at
   dette ikke blir fire hardkodede adaptere som må rulles ut hver gang en
   app døper om en kolonne.

   PRISEN for den fleksibiliteten er at kolonnenavn fra databasen ender
   opp i SQL som kjøres mot en produksjonsbase. Det valideres i to ledd:
   en check-constraint i migrasjonen, og `trygtNavn` her. Begge må gi
   grønt lys. Verdier sendes ALLTID som parametre, aldri limt inn i
   spørringen – bare identifikatorer bygges inn, og de er hvitelistet.
   ═══════════════════════════════════════════════════════════ */

/**
 * Postgres-identifikatorer vi tillater: små bokstaver, tall, understrek.
 *
 * Ingen anførselstegn, ingen punktum, ingen mellomrom. Et navn som ikke
 * passerer blir avvist framfor sitert – vi har ingen legitim grunn til å
 * ha rare kolonnenavn, og et avvist navn er en tydelig feil mens et
 * sitert navn skjuler at oppsettet er tuklet med.
 */
const IDENTIFIKATOR = /^[a-z_][a-z0-9_]*$/

function trygtNavn(navn: string, hva: string): string {
  if (!IDENTIFIKATOR.test(navn)) {
    throw new Error(
      `Ugyldig ${hva} i tilgangsoppsettet: «${navn}». Bare små bokstaver, tall og understrek er tillatt.`,
    )
  }
  return navn
}

export type Tilgangsoppsett = {
  systemId: string
  skjema: string
  tabell: string
  brukerKolonne: string
  brukerNokkel: 'auth_id' | 'epost'
  rolleKolonne: string | null
  aktivKolonne: string | null
  ekstraKolonner: Record<string, unknown>
  tenantKolonne: string | null
  tenantVerdi: string | null
}

export type SystemRolle = {
  verdi: string
  etikett: string
  beskrivelse: string | null
  erStandard: boolean
}

export async function hentTilgangsoppsett(
  systemId: string,
): Promise<Tilgangsoppsett | null> {
  const { data } = await supabaseAdmin
    .from('tilgangsoppsett')
    .select('*')
    .eq('system_id', systemId)
    .single()

  if (!data) return null

  return {
    systemId: data.system_id as string,
    skjema: data.skjema as string,
    tabell: data.tabell as string,
    brukerKolonne: data.bruker_kolonne as string,
    brukerNokkel: data.bruker_nokkel as 'auth_id' | 'epost',
    rolleKolonne: data.rolle_kolonne as string | null,
    aktivKolonne: data.aktiv_kolonne as string | null,
    ekstraKolonner: (data.ekstra_kolonner ?? {}) as Record<string, unknown>,
    tenantKolonne: data.tenant_kolonne as string | null,
    tenantVerdi: data.tenant_verdi as string | null,
  }
}

/** Rollene som finnes i et system, til nedtrekkslisten. */
export async function hentSystemRoller(
  systemId: string,
): Promise<SystemRolle[]> {
  const { data } = await supabaseAdmin
    .from('system_roller')
    .select('verdi, etikett, beskrivelse, er_standard')
    .eq('system_id', systemId)
    .order('sortering')

  return (data ?? []).map((r) => ({
    verdi: r.verdi as string,
    etikett: r.etikett as string,
    beskrivelse: r.beskrivelse as string | null,
    erStandard: r.er_standard as boolean,
  }))
}

/** Rollene for ALLE systemer på én gang, til matrisen. */
export async function hentAlleRoller(): Promise<Map<string, SystemRolle[]>> {
  const { data } = await supabaseAdmin
    .from('system_roller')
    .select('system_id, verdi, etikett, beskrivelse, er_standard, sortering')
    .order('sortering')

  const kart = new Map<string, SystemRolle[]>()
  for (const r of data ?? []) {
    const id = r.system_id as string
    if (!kart.has(id)) kart.set(id, [])
    kart.get(id)!.push({
      verdi: r.verdi as string,
      etikett: r.etikett as string,
      beskrivelse: r.beskrivelse as string | null,
      erStandard: r.er_standard as boolean,
    })
  }
  return kart
}

export type TilgangResultat = { ok: true; melding: string } | { ok: false; feil: string }

/**
 * Sørger for at det finnes en auth-bruker i systemet, og gir id-en.
 *
 * Bare nødvendig for systemer nøklet på auth-id. De e-postnøklede
 * appene trenger det ikke – der er raden i rolletabellen hele tilgangen,
 * og den kan skrives før brukeren noen gang har logget inn.
 *
 * Krever service role-nøkkelen for det systemet: å opprette en auth-bruker
 * går ikke gjennom Management-API-et.
 */
async function sikreAuthBruker(
  systemId: string,
  epost: string,
  midlertidigPassord: string | null,
): Promise<{ ok: true; id: string } | { ok: false; feil: string }> {
  const fremmed = await lagFremmedKlient(systemId)
  if (!fremmed.ok) return { ok: false, feil: fremmed.grunn }

  // Finnes brukeren alt? listUsers framfor et oppslag på e-post, fordi
  // admin-API-et ikke har et slikt oppslag.
  const { data: liste } = await fremmed.klient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  const funnet = liste?.users.find(
    (u) => u.email?.toLowerCase() === epost.toLowerCase(),
  )
  if (funnet) return { ok: true, id: funnet.id }

  if (!midlertidigPassord) {
    return {
      ok: false,
      feil: `${epost} finnes ikke i dette systemet ennå. Dette systemet er nøklet på auth-id, så brukeren må opprettes først – oppgi et midlertidig passord.`,
    }
  }

  /*
   * email_confirm: true er ikke en bekvemmelighet.
   *
   * Den felles innloggingen kobler en portalinnlogging til en
   * eksisterende konto bare når e-posten er BEKREFTET. En bruker med
   * email_confirmed_at = null får en helt ny auth-rad når portalen tas i
   * bruk, og den gamle raden med all tilgangen ligger igjen ved siden av.
   * Se docs/INNLOGGINGSPORTAL.md.
   */
  const { data, error } = await fremmed.klient.auth.admin.createUser({
    email: epost,
    password: midlertidigPassord,
    email_confirm: true,
  })

  if (error || !data.user) {
    return { ok: false, feil: `Kunne ikke opprette bruker: ${error?.message}` }
  }
  return { ok: true, id: data.user.id }
}

/**
 * Gir en person tilgang til et system, med en rolle.
 *
 * Skriver raden i systemets EGEN tabell – det er den appen faktisk leser.
 * Registeret her i `system_tilgang` oppdateres etterpå, som et speil, og
 * med `skrevet_til_system` satt så vi vet forskjellen på «planlagt» og
 * «faktisk skrevet».
 */
export async function giTilgang({
  systemId,
  prosjektRef,
  kontoId,
  epost,
  navn,
  rolle,
  midlertidigPassord,
}: {
  systemId: string
  prosjektRef: string | null
  kontoId: string | null
  epost: string
  navn: string
  rolle: string | null
  midlertidigPassord?: string | null
}): Promise<TilgangResultat> {
  const oppsett = await hentTilgangsoppsett(systemId)
  if (!oppsett) {
    return {
      ok: false,
      feil: 'Systemet mangler tilgangsoppsett. Adminbordet vet ikke hvilken tabell tilgang skal skrives i.',
    }
  }
  if (!prosjektRef) {
    return { ok: false, feil: 'Systemet har ingen Supabase-database registrert.' }
  }
  if (oppsett.tenantKolonne && !oppsett.tenantVerdi) {
    return {
      ok: false,
      feil: 'Systemet er flerkunde, men tenant-verdien er ikke satt. Uten den kan tilgangen havne hos feil kunde – nekter å skrive.',
    }
  }

  const token = tokenFor(await hentTokenKart(), kontoId)
  if (!token) {
    return {
      ok: false,
      feil: 'Mangler Supabase-token for kontoen som eier dette prosjektet.',
    }
  }

  // ── Hva skal stå i brukerkolonnen ──
  let brukerVerdi: string
  if (oppsett.brukerNokkel === 'epost') {
    brukerVerdi = epost.toLowerCase()
  } else {
    const auth = await sikreAuthBruker(systemId, epost, midlertidigPassord ?? null)
    if (!auth.ok) return { ok: false, feil: auth.feil }
    brukerVerdi = auth.id
  }

  // ── Bygg raden ──
  // Identifikatorer valideres; verdier går som parametre.
  const kolonner: string[] = [trygtNavn(oppsett.brukerKolonne, 'brukerkolonne')]
  const verdier: unknown[] = [brukerVerdi]

  if (oppsett.rolleKolonne && rolle) {
    kolonner.push(trygtNavn(oppsett.rolleKolonne, 'rollekolonne'))
    verdier.push(rolle)
  }
  if (oppsett.tenantKolonne) {
    kolonner.push(trygtNavn(oppsett.tenantKolonne, 'tenant-kolonne'))
    verdier.push(oppsett.tenantVerdi)
  }
  if (oppsett.aktivKolonne) {
    kolonner.push(trygtNavn(oppsett.aktivKolonne, 'aktiv-kolonne'))
    verdier.push(true)
  }
  for (const [kol, mal] of Object.entries(oppsett.ekstraKolonner)) {
    kolonner.push(trygtNavn(kol, 'ekstrakolonne'))
    verdier.push(
      typeof mal === 'string'
        ? mal.replace('{{navn}}', navn).replace('{{epost}}', epost)
        : mal,
    )
  }

  const plassholdere = verdier.map((_, i) => `$${i + 1}`).join(', ')
  const skjema = trygtNavn(oppsett.skjema, 'skjema')
  const tabell = trygtNavn(oppsett.tabell, 'tabell')

  /*
   * `on conflict do nothing` framfor upsert.
   *
   * Vi kjenner ikke hvilken unik indeks tabellen har – den varierer
   * mellom appene, og å gjette feil kolonne i `on conflict (...)` gir en
   * feil som ser ut som et rettighetsproblem. Finnes raden alt, er
   * tilgangen alt gitt, og da er «ingenting skjedde» riktig utfall.
   */
  const sql = `insert into ${skjema}.${tabell} (${kolonner.join(', ')})
               values (${plassholdere})
               on conflict do nothing`

  const svar = await skrivSpørring(token, prosjektRef, sql, verdier)
  if (!svar.ok) return { ok: false, feil: svar.feil.melding }

  await speilTilgang({ systemId, epost, navn, rolle, skrevet: true })

  return {
    ok: true,
    melding: `${epost} har nå tilgang${rolle ? ` som ${rolle}` : ''}.`,
  }
}

/**
 * Tar bort tilgangen.
 *
 * Deaktiverer framfor å slette der tabellen har en aktiv-kolonne. Det er
 * å foretrekke: ordrer, signaturer og leveringssedler peker på brukeren,
 * og en slettet rad etterlater en referanse ingen kan tyde. Har tabellen
 * ingen slik kolonne, må raden slettes – da ER raden hele tilgangen.
 */
export async function taBortTilgang({
  systemId,
  prosjektRef,
  kontoId,
  epost,
}: {
  systemId: string
  prosjektRef: string | null
  kontoId: string | null
  epost: string
}): Promise<TilgangResultat> {
  const oppsett = await hentTilgangsoppsett(systemId)
  if (!oppsett) return { ok: false, feil: 'Systemet mangler tilgangsoppsett.' }
  if (!prosjektRef) {
    return { ok: false, feil: 'Systemet har ingen Supabase-database registrert.' }
  }

  const token = tokenFor(await hentTokenKart(), kontoId)
  if (!token) {
    return { ok: false, feil: 'Mangler Supabase-token for kontoen.' }
  }

  const skjema = trygtNavn(oppsett.skjema, 'skjema')
  const tabell = trygtNavn(oppsett.tabell, 'tabell')
  const brukerKol = trygtNavn(oppsett.brukerKolonne, 'brukerkolonne')

  // Nøkkelen vi finner raden på. For e-postnøklede systemer er det
  // e-posten; ellers må auth-id-en slås opp i det systemet.
  let brukerVerdi: string
  if (oppsett.brukerNokkel === 'epost') {
    brukerVerdi = epost.toLowerCase()
  } else {
    const fremmed = await lagFremmedKlient(systemId)
    if (!fremmed.ok) return { ok: false, feil: fremmed.grunn }
    const { data: liste } = await fremmed.klient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    const funnet = liste?.users.find(
      (u) => u.email?.toLowerCase() === epost.toLowerCase(),
    )
    if (!funnet) {
      return { ok: false, feil: `Fant ingen bruker med ${epost} i systemet.` }
    }
    brukerVerdi = funnet.id
  }

  const vilkår = oppsett.tenantKolonne
    ? `${brukerKol} = $1 and ${trygtNavn(oppsett.tenantKolonne, 'tenant-kolonne')} = $2`
    : `${brukerKol} = $1`
  const parametre: unknown[] = oppsett.tenantKolonne
    ? [brukerVerdi, oppsett.tenantVerdi]
    : [brukerVerdi]

  const sql = oppsett.aktivKolonne
    ? `update ${skjema}.${tabell} set ${trygtNavn(oppsett.aktivKolonne, 'aktiv-kolonne')} = false where ${vilkår}`
    : `delete from ${skjema}.${tabell} where ${vilkår}`

  const svar = await skrivSpørring(token, prosjektRef, sql, parametre)
  if (!svar.ok) return { ok: false, feil: svar.feil.melding }

  await speilTilgang({ systemId, epost, navn: null, rolle: null, skrevet: false })

  return {
    ok: true,
    melding: oppsett.aktivKolonne
      ? `Tilgangen til ${epost} er deaktivert. Raden står igjen, så historikken peker fortsatt riktig.`
      : `Tilgangen til ${epost} er fjernet.`,
  }
}

/**
 * Oppdaterer adminbordets eget speil av tilgangen.
 *
 * Feiler stille. Speilet er en bekvemmelighet – sannheten ligger i det
 * andre systemets tabell, og den er alt skrevet når vi kommer hit. At
 * registeret ikke ble oppdatert skal ikke gjøre at handlingen ser
 * mislykket ut når den lykkes.
 */
async function speilTilgang({
  systemId,
  epost,
  navn,
  rolle,
  skrevet,
}: {
  systemId: string
  epost: string
  navn: string | null
  rolle: string | null
  skrevet: boolean
}): Promise<void> {
  const { data: person } = await supabaseAdmin
    .from('personer')
    .upsert(
      { epost: epost.toLowerCase(), navn: navn ?? epost.split('@')[0] },
      { onConflict: 'epost' },
    )
    .select('id')
    .single()

  if (!person) return

  await supabaseAdmin.from('system_tilgang').upsert(
    {
      person_id: person.id,
      system_id: systemId,
      rolle: rolle ?? 'ukjent',
      aktiv: skrevet,
      skrevet_til_system: skrevet,
      sist_bekreftet: new Date().toISOString(),
    },
    { onConflict: 'person_id,system_id' },
  )
}
