import { supabaseAdmin } from '@/lib/supabase/admin'
import { hentTokenKart, tokenFor } from '@/lib/kontoar'
import { lesSpørring, skrivSpørring } from '@/lib/plattform/supabase-api'
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

/**
 * Én VEI inn i et system. Et system kan ha flere.
 *
 * Het før «oppsettet» i entall, med system_id som primærnøkkel, og det var en
 * antakelse som ikke holdt: tilbudssystemet har plattform-admin ved siden av
 * tenant-medlemskap, og de to lager-appene har `super_admins` ved siden av
 * «alle med konto». Se 0006_tilgangsveier.sql.
 */
export type Tilgangsoppsett = {
  id: string
  systemId: string
  /** Navnet på veien, slik matrisen kan si HVILKEN tilgang det er snakk om. */
  etikett: string
  /**
   * 'rolletabell' – en tabell holder tilgangen.
   * 'kun_konto'   – enhver rad i auth.users gir full tilgang, og det finnes
   *                 ingen tabell. Sant for leveringseddel og rorlager.
   */
  modell: 'rolletabell' | 'kun_konto'
  skjema: string
  /** Null når modell er 'kun_konto'. */
  tabell: string | null
  brukerKolonne: string
  brukerNokkel: 'auth_id' | 'epost'
  rolleKolonne: string | null
  /**
   * Bare rader der rollekolonnen har denne verdien teller som denne veien.
   *
   * Null = alle rader teller, som er riktig når det å ha raden ER tilgangen.
   * Satt der én rolleverdi utløser noe eget: `admin` i tenant_users gir
   * plattform-makt gjennom is_system_admin(), som ikke har tenant-filter,
   * mens `member` i samme tabell ikke gir noe utenfor sin egen kunde.
   */
  rolleFilter: string | null
  aktivKolonne: string | null
  ekstraKolonner: Record<string, unknown>
  tenantKolonne: string | null
  tenantVerdi: string | null
  /**
   * Får adminbordet skrive her? Fail-closed.
   *
   * En vei vi kan lese er ikke automatisk en vei vi skal skrive i:
   * `super_admins` er retten til å bestemme hvem andre som slipper inn, og
   * plattform-admin i tilbudssystemet gir makt over andre bedrifters data.
   */
  kanSkrive: boolean
  sortering: number
  /** Hvorfor veien er som den er. Vises i grensesnittet, ikke bare i koden:
      «tilgang kan ikke gis herfra» er ubrukelig uten begrunnelsen. */
  notat: string | null
}

export type SystemRolle = {
  verdi: string
  etikett: string
  beskrivelse: string | null
  erStandard: boolean
}

/**
 * Veien adminbordet får SKRIVE i for et system, om noen.
 *
 * Brukte `.single()` da det var én rad per system. Nå kan det være flere, og
 * valget må være eksplisitt: `kan_skrive` er default false i skjemaet, så et
 * system uten en uttrykkelig utpekt vei gir null – og da nekter giTilgang
 * framfor å gjette hvilken tabell som er trygg.
 */
export async function hentTilgangsoppsett(
  systemId: string,
): Promise<Tilgangsoppsett | null> {
  const { data } = await supabaseAdmin
    .from('tilgangsoppsett')
    .select('*')
    .eq('system_id', systemId)
    .eq('kan_skrive', true)
    .order('sortering')
    .limit(1)

  const rad = data?.[0]
  if (!rad) return null
  return tolkOppsett(rad)
}

/** Alle veiene inn i ett system, til lesning. */
export async function hentTilgangsveier(
  systemId: string,
): Promise<Tilgangsoppsett[]> {
  const { data } = await supabaseAdmin
    .from('tilgangsoppsett')
    .select('*')
    .eq('system_id', systemId)
    .order('sortering')

  return (data ?? []).map(tolkOppsett)
}

/** Én rad fra `tilgangsoppsett` som type. Delt, slik at de to henterne ikke
    kan komme i utakt om hva en kolonne betyr. */
function tolkOppsett(data: Record<string, unknown>): Tilgangsoppsett {
  return {
    id: data.id as string,
    systemId: data.system_id as string,
    etikett: data.etikett as string,
    modell: data.modell as 'rolletabell' | 'kun_konto',
    kanSkrive: data.kan_skrive as boolean,
    sortering: data.sortering as number,
    notat: (data.notat as string | null) ?? null,
    skjema: data.skjema as string,
    tabell: (data.tabell as string | null) ?? null,
    brukerKolonne: data.bruker_kolonne as string,
    brukerNokkel: data.bruker_nokkel as 'auth_id' | 'epost',
    rolleKolonne: data.rolle_kolonne as string | null,
    rolleFilter: (data.rolle_filter as string | null) ?? null,
    aktivKolonne: data.aktiv_kolonne as string | null,
    ekstraKolonner: (data.ekstra_kolonner ?? {}) as Record<string, unknown>,
    tenantKolonne: data.tenant_kolonne as string | null,
    tenantVerdi: data.tenant_verdi as string | null,
  }
}

/**
 * Tilgangsoppsettet for ALLE systemer, i ett oppslag.
 *
 * Fantes først bare som hentTilgangsoppsett(systemId), og brukerlisten kalte
 * den én gang per system i en egen Promise.all – altså en hel ny bølge
 * databasekall etter at brukerne var hentet. Det er ren spillsykdom når det
 * er samme tabell hver gang.
 */
export async function hentAlleTilgangsoppsett(): Promise<
  Map<string, Tilgangsoppsett[]>
> {
  const { data } = await supabaseAdmin
    .from('tilgangsoppsett')
    .select('*')
    .order('sortering')

  const kart = new Map<string, Tilgangsoppsett[]>()
  for (const d of data ?? []) {
    const id = d.system_id as string
    if (!kart.has(id)) kart.set(id, [])
    kart.get(id)!.push(tolkOppsett(d))
  }
  return kart
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
 * Slår opp auth-id-en til en e-post i et annet system, med SQL.
 *
 * Bruker Management-API-et framfor systemets service role-nøkkel. Det er
 * hele forskjellen på at dette virker og ikke: vi har token for hver konto,
 * men nesten ingen lagrede service role-nøkler.
 *
 * Første versjon slo opp via auth-admin-API-et, som KREVER service role – og
 * da feilet «ta bort tilgang» med «ingen nøkkel lagret» selv om alt vi
 * trengte var å oversette en e-post til en id. Å lese auth.users er noe
 * Management-API-et gjør fint.
 */
async function finnAuthId(
  token: string,
  prosjektRef: string,
  epost: string,
): Promise<{ ok: true; id: string | null } | { ok: false; feil: string }> {
  const svar = await lesSpørring<{ id: string }>(
    token,
    prosjektRef,
    // Parametre framfor innliming: e-posten kommer fra et skjema.
    'select id::text as id from auth.users where lower(email) = lower($1) limit 1',
    [epost],
  )

  if (!svar.ok) return { ok: false, feil: svar.feil.melding }
  return { ok: true, id: svar.data[0]?.id ?? null }
}

/**
 * Sørger for at det finnes en auth-bruker i systemet, og gir id-en.
 *
 * Bare nødvendig for systemer nøklet på auth-id. De e-postnøklede
 * appene trenger det ikke – der er raden i rolletabellen hele tilgangen,
 * og den kan skrives før brukeren noen gang har logget inn.
 *
 * Service role-nøkkelen kreves BARE hvis brukeren må opprettes. Finnes den
 * alt – som er det vanlige – går alt med Management-API-et.
 */
async function sikreAuthBruker(
  systemId: string,
  token: string,
  prosjektRef: string,
  epost: string,
  midlertidigPassord: string | null,
): Promise<{ ok: true; id: string } | { ok: false; feil: string }> {
  /*
   * Finnes brukeren alt? Da trengs INGEN service role-nøkkel – oppslaget
   * går med SQL. Det er det vanlige tilfellet, og det bør ikke kreve en
   * nøkkel vi sjelden har lagret.
   */
  const oppslag = await finnAuthId(token, prosjektRef, epost)
  if (!oppslag.ok) return { ok: false, feil: oppslag.feil }
  if (oppslag.id) return { ok: true, id: oppslag.id }

  if (!midlertidigPassord) {
    return {
      ok: false,
      feil: `${epost} finnes ikke i dette systemet ennå. Systemet er nøklet på auth-id, så brukeren må opprettes først – oppgi et midlertidig passord.`,
    }
  }

  /*
   * Å OPPRETTE en auth-bruker krever service role. Det finnes ingen vei
   * rundt: Management-API-et kan lese auth.users, men ikke lage brukere
   * med gyldig passordhash. Derfor er nøkkelen bare påkrevd her, i det ene
   * tilfellet den faktisk trengs.
   */
  const fremmed = await lagFremmedKlient(systemId)
  if (!fremmed.ok) {
    return {
      ok: false,
      feil: `${fremmed.grunn} Nøkkelen kreves bare for å OPPRETTE en ny bruker – å gi tilgang til en som alt finnes går uten.`,
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
      feil: 'Systemet har ingen tilgangsvei adminbordet får skrive i. Enten mangler oppsettet, eller alle veiene er merket som lesbare bare – som for leveringseddel og rørlager, der tilgang styres ved å opprette eller sperre kontoen i stedet.',
    }
  }
  if (oppsett.modell === 'kun_konto' || !oppsett.tabell) {
    return {
      ok: false,
      feil: `${oppsett.etikett}: alle med konto har full tilgang i dette systemet, så det finnes ingen rad å skrive. Tilgang styres ved å opprette eller sperre kontoen.`,
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
  /*
   * Rollen er PÅKREVD når tabellen har en rollekolonne.
   *
   * Utelatt rolle ble tidligere bare hoppet over, og da slo databasens default
   * inn: 'admin' i utleie og i system_users, 'member' i tenant_users. En glemt
   * rolle ga altså full admin i det ene systemet og nesten ingenting i det
   * andre. Fail-closed er det eneste forsvarlige når utfallet spriker slik.
   */
  if (oppsett.rolleKolonne && !rolle) {
    return {
      ok: false,
      feil: `${oppsett.etikett} krever en rolle. Uten den ville databasens standardverdi bestemt nivået – og den er «full admin» i noen av systemene.`,
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
    const auth = await sikreAuthBruker(
      systemId,
      token,
      prosjektRef,
      epost,
      midlertidigPassord ?? null,
    )
    if (!auth.ok) return { ok: false, feil: auth.feil }
    brukerVerdi = auth.id
  }

  /*
   * Flerkunde: har personen alt en rad hos EN ANNEN kunde, låser en ny rad
   * dem ute av hele appen.
   *
   * Tilbudssystemet slår opp medlemskapet med `.single()`. To rader gir
   * PGRST116, som appen tolker som «ingen rader» – altså «Ingen tilgang»-siden.
   * Å gi tilgang ville dermed FJERNET all tilgang, stille. Bekreftet mot den
   * levende basen: to rader svarer HTTP 406 «The result contains 2 rows».
   */
  if (oppsett.tenantKolonne) {
    const tenantKol = trygtNavn(oppsett.tenantKolonne, 'tenant-kolonne')
    const brukerKol = trygtNavn(oppsett.brukerKolonne, 'brukerkolonne')
    const andre = await lesSpørring<{ tenant: string }>(
      token,
      prosjektRef,
      `select ${tenantKol}::text as tenant
         from ${trygtNavn(oppsett.skjema, 'skjema')}.${trygtNavn(oppsett.tabell, 'tabell')}
        where ${brukerKol}::text = $1 and ${tenantKol}::text <> $2`,
      [brukerVerdi, oppsett.tenantVerdi],
    )
    if (andre.ok && andre.data.length > 0) {
      return {
        ok: false,
        feil: `${epost} er allerede registrert hos en annen kunde i dette systemet (${andre.data.map((r) => r.tenant).join(', ')}). Appen slår opp medlemskapet med .single(), så to rader gir «ingen tilgang» – å legge til en rad her ville låst personen ut av hele appen. Fjern den andre raden først.`,
      }
    }
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
        ? mal
            .replace('{{navn}}', navn)
            // Små bokstaver, slik at admin_brukere.epost i utleie matcher
            // auth.users.email. Auth-oppslaget er case-insensitivt, så uten
            // dette kunne de to stavet samme person ulikt.
            .replace('{{epost}}', epost.toLowerCase())
        : mal,
    )
  }

  const plassholdere = verdier.map((_, i) => `$${i + 1}`).join(', ')
  const skjema = trygtNavn(oppsett.skjema, 'skjema')
  const tabell = trygtNavn(oppsett.tabell, 'tabell')

  /*
   * `on conflict do nothing` med `returning`, og en UPDATE når ingenting ble
   * satt inn.
   *
   * Vi kjenner ikke hvilken unik indeks tabellen har – den varierer mellom
   * appene, og å gjette feil kolonne i `on conflict (...)` gir en feil som ser
   * ut som et rettighetsproblem. Derfor `do nothing` framfor upsert.
   *
   * Men «ingenting skjedde» er IKKE riktig utfall, slik det sto her før.
   * Knappen heter «Endre rolle», og det fantes ingen vei i hele adminbordet
   * som faktisk endret en rolle: insert-en traff konflikten, gjorde
   * ingenting, og meldte suksess. Verst i utleie, der taBortTilgang setter
   * aktiv=false og beholder raden – et senere «gi tilgang» traff da
   * primærnøkkelen, endret ingenting, og brukeren sto fortsatt utestengt mens
   * meldingen sa det motsatte.
   */
  const sql = `insert into ${skjema}.${tabell} (${kolonner.join(', ')})
               values (${plassholdere})
               on conflict do nothing
               returning 1 as traff`

  const svar = await skrivSpørring<{ traff: number }>(
    token,
    prosjektRef,
    sql,
    verdier,
  )
  if (!svar.ok) return { ok: false, feil: svar.feil.melding }

  let melding = `${epost} har nå tilgang${rolle ? ` som ${rolle}` : ''}.`

  if (svar.data.length === 0) {
    // Raden fantes. Da er dette en ENDRING, og den må faktisk skrives.
    const endret = await oppdaterEksisterende({
      token,
      prosjektRef,
      oppsett,
      brukerVerdi,
      rolle,
    })
    if (!endret.ok) return endret
    melding = endret.melding
  }

  await speilTilgang({ systemId, epost, navn, rolle, skrevet: true })
  return { ok: true, melding }
}

/**
 * Oppdaterer rolle og aktiv på en rad som alt finnes.
 *
 * Egen funksjon fordi den bare kalles når insert-en traff en konflikt, og
 * fordi den må kunne si «ingen rad traff» hvis konflikten kom fra en helt
 * annen unik indeks enn den vi tror – for eksempel `admin_brukere.epost`, som
 * er UNIQUE ved siden av primærnøkkelen `id`. Da er raden en ANNEN persons, og
 * å oppdatere den ville vært verre enn å feile.
 */
async function oppdaterEksisterende({
  token,
  prosjektRef,
  oppsett,
  brukerVerdi,
  rolle,
}: {
  token: string
  prosjektRef: string
  oppsett: Tilgangsoppsett
  brukerVerdi: string
  rolle: string | null
}): Promise<TilgangResultat> {
  const skjema = trygtNavn(oppsett.skjema, 'skjema')
  const tabell = trygtNavn(oppsett.tabell!, 'tabell')
  const brukerKol = trygtNavn(oppsett.brukerKolonne, 'brukerkolonne')

  const sett: string[] = []
  const verdier: unknown[] = [brukerVerdi]

  if (oppsett.rolleKolonne && rolle) {
    verdier.push(rolle)
    sett.push(`${trygtNavn(oppsett.rolleKolonne, 'rollekolonne')} = $${verdier.length}`)
  }
  // En tilgang som ble deaktivert skal bli aktiv igjen når den gis på nytt.
  if (oppsett.aktivKolonne) {
    sett.push(`${trygtNavn(oppsett.aktivKolonne, 'aktiv-kolonne')} = true`)
  }

  if (sett.length === 0) {
    return {
      ok: true,
      melding: `Tilgangen fantes allerede, og tabellen har ingen rolle eller aktiv-kolonne å endre. Ingenting å gjøre.`,
    }
  }

  let vilkår = `${brukerKol}::text = $1`
  if (oppsett.tenantKolonne) {
    verdier.push(oppsett.tenantVerdi)
    vilkår += ` and ${trygtNavn(oppsett.tenantKolonne, 'tenant-kolonne')}::text = $${verdier.length}`
  }

  const svar = await skrivSpørring<{ traff: number }>(
    token,
    prosjektRef,
    `update ${skjema}.${tabell} set ${sett.join(', ')} where ${vilkår} returning 1 as traff`,
    verdier,
  )
  if (!svar.ok) return { ok: false, feil: svar.feil.melding }

  if (svar.data.length === 0) {
    return {
      ok: false,
      feil: `Innsettingen traff en konflikt, men ingen rad å oppdatere ble funnet på ${brukerKol}. Da kommer konflikten fra en annen unik kolonne – i utleie er «epost» UNIQUE ved siden av primærnøkkelen, så raden hører sannsynligvis til en annen auth-bruker med samme e-post. Ingenting er endret.`,
    }
  }

  return {
    ok: true,
    melding: rolle
      ? `Rollen er endret til ${rolle}.`
      : 'Tilgangen er aktivert igjen.',
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
  if (!oppsett) {
    return {
      ok: false,
      feil: 'Systemet har ingen tilgangsvei adminbordet får skrive i, så det finnes ingen rad å fjerne.',
    }
  }
  if (oppsett.modell === 'kun_konto' || !oppsett.tabell) {
    return {
      ok: false,
      feil: `${oppsett.etikett}: alle med konto har full tilgang i dette systemet. Det finnes ingen tilgangsrad å fjerne – kontoen må sperres eller slettes i stedet.`,
    }
  }
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
  // e-posten; ellers slås auth-id-en opp med SQL – ikke med systemets
  // service role-nøkkel, som vi sjelden har lagret.
  let brukerVerdi: string
  if (oppsett.brukerNokkel === 'epost') {
    brukerVerdi = epost.toLowerCase()
  } else {
    const oppslag = await finnAuthId(token, prosjektRef, epost)
    if (!oppslag.ok) return { ok: false, feil: oppslag.feil }
    if (!oppslag.id) {
      return { ok: false, feil: `Fant ingen bruker med ${epost} i systemet.` }
    }
    brukerVerdi = oppslag.id
  }

  const vilkår = oppsett.tenantKolonne
    ? `${brukerKol} = $1 and ${trygtNavn(oppsett.tenantKolonne, 'tenant-kolonne')} = $2`
    : `${brukerKol} = $1`
  const parametre: unknown[] = oppsett.tenantKolonne
    ? [brukerVerdi, oppsett.tenantVerdi]
    : [brukerVerdi]

  /*
   * `returning` er ikke pynt: uten den er «ingen rader traff» og «raden er
   * borte» det samme svaret. Det er nøyaktig feilen som gjorde at en
   * fjerning kunne meldes vellykket mens raden sto igjen i tabellen.
   */
  const sql = oppsett.aktivKolonne
    ? `update ${skjema}.${tabell} set ${trygtNavn(oppsett.aktivKolonne, 'aktiv-kolonne')} = false where ${vilkår} returning 1 as traff`
    : `delete from ${skjema}.${tabell} where ${vilkår} returning 1 as traff`

  const svar = await skrivSpørring<{ traff: number }>(
    token,
    prosjektRef,
    sql,
    parametre,
  )
  if (!svar.ok) return { ok: false, feil: svar.feil.melding }

  if (svar.data.length === 0) {
    return {
      ok: false,
      feil: `Ingen rad i ${skjema}.${tabell} traff ${epost}. Tilgangen kan ligge under en annen nøkkel enn adminbordet leter etter${oppsett.tenantKolonne ? ', eller hos en annen kunde' : ''} – ingenting er endret.`,
    }
  }

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
