import type { Tilgangsoppsett } from '@/lib/tilgang'
import type { TilgangsRad, Tilgangsvei } from '@/lib/typer'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Å LESE tilgang, ikke bare kontoer.

   Denne fila finnes fordi matrisen på /brukere løy. Den viste en grønn «JA»
   så snart det fantes en rad i `auth.users` i prosjektet – altså når personen
   hadde en KONTO. Om personen hadde TILGANG ble aldri sjekket.

   Målt mot de levende basene ga det seks gale merker av elleve:
   - odin@haugemaskin.no sto med JA på Tilbudssystem etter at raden i
     tenant_users var slettet. Fjerningen hadde virket; visningen hadde ikke
     lest den.
   - thomashauge03@gmail.com og ttanlegg@gmail.com sto med JA på
     Tilbudssystem, men radene deres tilhører ANDRE kunder. Tilbudssystemet er
     flerkunde, og en visning uten tenant-filter viser andre bedrifters
     brukere som om de var våre.

   `tilgangsoppsett` visste hvor tilgangen ligger – den ble bare brukt til å
   SKRIVE, aldri til å LESE.

   TO SPØRRINGER PER PROSJEKT, ikke én.

   Første utkast slo kontoer og tilgang sammen i én `full outer join`, for å
   spare en rundtur. Det holdt ikke da det ble flere veier per system: veiene
   nøkles ulikt – `super_admins` på e-post, `tenant_users` på auth-id – i
   SAMME system, og en join som må velge nøkkeltype per rad blir et uttrykk
   ingen kan lese om et halvt år. De to kallene går samtidig, så veggklokka er
   uendret; det er antall kall som dobles, ikke ventetiden.
   ═══════════════════════════════════════════════════════════ */

/**
 * Postgres-identifikatorer vi tillater. Samme regel som skriveveien i
 * src/lib/tilgang.ts, gjentatt her framfor delt: en lesevei som ved et uhell
 * ble mildere enn skriveveien ville vært et hull, og to strengere kopier er en
 * billigere pris enn den risikoen.
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

/** Kontoene i et prosjekt, slik de kommer fra Postgres. */
export type RåKonto = {
  auth_id: string
  epost: string | null
  opprettet: string | null
  sist_innlogget: string | null
  epost_bekreftet: boolean | null
  konto_aktiv: boolean | null
}

/** Én tilgangsrad, fra én av veiene. */
export type RåTilgang = {
  nokkel: string
  nokkeltype: 'auth_id' | 'epost'
  vei: string
  rolle: string | null
  aktiv: boolean | null
  /**
   * 'annen_kunde' = raden finnes, men hos en ANNEN kunde i den delte basen.
   *
   * Hentes med vilje. Uten den ser en TT Anlegg-ansatt ut som «kun konto» –
   * altså som ryddearbeid – og systemkortet tilbyr «Slett», som ville slettet
   * en annen bedrifts innlogging fra en delt auth.users.
   */
  slag: 'tilgang' | 'annen_kunde'
}

/** Grensen i spørringene. Speiles i brukere.ts fordi avkorting skal SIES. */
export const GRENSE = 500

/**
 * Kontoene. Uavhengig av tilgangsoppsettet, så den er lik for alle systemer.
 *
 * `banned_until` er Supabase sin måte å deaktivere en konto: den settes langt
 * fram i tid. «Aktiv» er derfor ikke en kolonne men en sammenligning, og den
 * må gjøres i databasen – ellers må adminbordet kjenne tidssonen prosjektet
 * står i.
 */
export const SPØRRING_KONTOER = `
  select id::text                        as auth_id,
         lower(email)                    as epost,
         created_at::text                as opprettet,
         last_sign_in_at::text           as sist_innlogget,
         (email_confirmed_at is not null) as epost_bekreftet,
         (banned_until is null or banned_until < now()) as konto_aktiv
    from auth.users
   order by 2 nulls last
   limit ${GRENSE}
`

/**
 * Alle tilgangsveiene i ett system, som ÉN spørring.
 *
 * Returnerer null når det ikke finnes noen vei med en tabell – enten fordi
 * systemet mangler oppsett, eller fordi modellen er 'kun_konto'. Da er
 * kontolisten alt som skal hentes, og kallstedet slipper en rundtur.
 *
 * Tenantfiltreringen skjer INNE i hver vei, før union-en. Lagt utenfor ville
 * plattform-admin-veien – som med vilje er uten tenant-filter – blitt filtrert
 * bort, og det er nettopp den veien som avslører at en admin hos en annen kunde
 * har makt over våre data.
 */
export function byggTilgangsspørring(veier: Tilgangsoppsett[]): {
  sql: string
  parametre: unknown[]
} | null {
  const medTabell = veier.filter((v) => v.modell === 'rolletabell' && v.tabell)
  if (medTabell.length === 0) return null

  const parametre: unknown[] = []

  /** Én gren av union-en: én vei, eller dens «hos en annen kunde»-speiling. */
  function gren(v: Tilgangsoppsett, annenKunde: boolean): string {
    const skjema = trygtNavn(v.skjema, 'skjema')
    const tabell = trygtNavn(v.tabell!, 'tabell')
    const brukerKol = trygtNavn(v.brukerKolonne, 'brukerkolonne')
    const rolleKol = v.rolleKolonne ? trygtNavn(v.rolleKolonne, 'rollekolonne') : null
    const aktivKol = v.aktivKolonne ? trygtNavn(v.aktivKolonne, 'aktiv-kolonne') : null

    // Etiketten er en VERDI, ikke en identifikator, så den går som parameter.
    parametre.push(v.etikett)
    const veiParam = `$${parametre.length}`

    const vilkår: string[] = []
    if (v.tenantKolonne && v.tenantVerdi) {
      parametre.push(v.tenantVerdi)
      vilkår.push(
        `${trygtNavn(v.tenantKolonne, 'tenant-kolonne')}::text ${annenKunde ? '<>' : '='} $${parametre.length}`,
      )
    }
    /*
     * Rollefilteret skiller «har en rad» fra «har DENNE makten».
     * Plattform-admin i tilbudssystemet leses uten tenant-vilkår, og uten
     * filteret ville hver `member` hos hver kunde blitt vist som plattform-
     * admin over Hauge Maskin.
     */
    if (v.rolleFilter && rolleKol) {
      parametre.push(v.rolleFilter)
      vilkår.push(`${rolleKol}::text = $${parametre.length}`)
    }

    /*
     * Grupperingen er ikke overdrevet forsiktighet.
     *
     * Skriveveien bruker `on conflict do nothing` nettopp fordi vi ikke vet
     * hvilken unik indeks hver tabell har – og en tabell uten unik indeks kan
     * ha to rader for samme person. Uten `group by` ville personen fått to
     * rader i matrisen, og det ser ut som en feil i adminbordet framfor det
     * det er: to rader i appens egen tabell.
     */
    return `select ${brukerKol}::text as nokkel,
                   ${v.brukerNokkel === 'epost' ? `'epost'` : `'auth_id'`}::text as nokkeltype,
                   ${veiParam}::text as vei,
                   ${rolleKol ? `string_agg(distinct ${rolleKol}::text, ', ')` : 'null::text'} as rolle,
                   ${aktivKol ? `bool_or(${aktivKol})` : 'null::boolean'} as aktiv,
                   ${annenKunde ? `'annen_kunde'` : `'tilgang'`}::text as slag
              from ${skjema}.${tabell}
             ${vilkår.length ? `where ${vilkår.join(' and ')}` : ''}
             group by 1`
  }

  const deler: string[] = []
  for (const v of medTabell) {
    deler.push(gren(v, false))
    /*
     * Flerkunde: hent også radene som hører ANDRE kunder.
     *
     * Samme spørring, én gren mer – ingen ekstra rundtur. Uten den ser en TT
     * Anlegg-ansatt ut som «kun konto», altså som noe å rydde, og systemkortet
     * tilbyr «Slett» på en innlogging som ikke er vår.
     */
    if (v.tenantKolonne && v.tenantVerdi) deler.push(gren(v, true))
  }

  return {
    sql: `${deler.join('\n union all\n')}\n limit ${GRENSE * deler.length}`,
    parametre,
  }
}

/**
 * Fletter kontoene og tilgangsradene til én rad per person.
 *
 * Gjøres her framfor i SQL fordi veiene nøkles ulikt innenfor samme system, og
 * en join som velger nøkkeltype per rad blir uleselig. Se filhodet.
 */
export function flettRader(
  kontoer: RåKonto[],
  tilganger: RåTilgang[],
  veier: Tilgangsoppsett[],
): TilgangsRad[] {
  const harOppsett = veier.length > 0
  // 'kun_konto': enhver konto gir full tilgang. Sant for leveringseddel og
  // rorlager, der hver RLS-policy er `to authenticated using (true)`.
  const kunKonto = veier.find((v) => v.modell === 'kun_konto') ?? null

  const perAuthId = new Map<string, Tilgangsvei[]>()
  const perEpost = new Map<string, Tilgangsvei[]>()
  // Antall rader personen har hos ANDRE kunder. Holdes utenfor `veier`, fordi
  // det ikke er tilgang – det er en forklaring på at kontoen finnes.
  const annenPerAuthId = new Map<string, number>()
  const annenPerEpost = new Map<string, number>()

  for (const t of tilganger) {
    const nøkkel = t.nokkeltype === 'epost' ? t.nokkel.toLowerCase() : t.nokkel

    if (t.slag === 'annen_kunde') {
      const kart = t.nokkeltype === 'epost' ? annenPerEpost : annenPerAuthId
      kart.set(nøkkel, (kart.get(nøkkel) ?? 0) + 1)
      continue
    }

    const vei: Tilgangsvei = { etikett: t.vei, rolle: t.rolle, aktiv: t.aktiv }
    const kart = t.nokkeltype === 'epost' ? perEpost : perAuthId
    if (!kart.has(nøkkel)) kart.set(nøkkel, [])
    kart.get(nøkkel)!.push(vei)
  }

  const rader: TilgangsRad[] = []
  const brukteAuthId = new Set<string>()
  const brukteEpost = new Set<string>()

  for (const k of kontoer) {
    const veierHer = [
      ...(perAuthId.get(k.auth_id) ?? []),
      ...(k.epost ? (perEpost.get(k.epost) ?? []) : []),
    ]
    brukteAuthId.add(k.auth_id)
    if (k.epost) brukteEpost.add(k.epost)

    if (kunKonto) veierHer.unshift({ etikett: kunKonto.etikett, rolle: null, aktiv: true })

    rader.push({
      epost: k.epost,
      authId: k.auth_id,
      harKonto: true,
      kontoAktiv: k.konto_aktiv,
      epostBekreftet: k.epost_bekreftet,
      opprettet: k.opprettet,
      sistInnlogget: k.sist_innlogget,
      harTilgang: harOppsett ? veierHer.length > 0 : null,
      veier: veierHer,
      annenKunde:
        (annenPerAuthId.get(k.auth_id) ?? 0) +
        (k.epost ? (annenPerEpost.get(k.epost) ?? 0) : 0),
      rolle: veierHer.map((v) => v.rolle).find((r) => r) ?? null,
      tilgangAktiv: veierHer.some((v) => v.aktiv === false)
        ? veierHer.every((v) => v.aktiv === false)
          ? false
          : true
        : null,
    })
  }

  // Tilgangsrader uten konto. Vanlig i de e-postnøklede veiene, der raden kan
  // skrives før personen har registrert seg – og usynlig i hele den forrige
  // versjonen av denne siden.
  for (const [nøkkel, veierHer] of perEpost) {
    if (brukteEpost.has(nøkkel)) continue
    rader.push(utenKonto(nøkkel, null, veierHer))
  }
  for (const [nøkkel, veierHer] of perAuthId) {
    if (brukteAuthId.has(nøkkel)) continue
    rader.push(utenKonto(null, nøkkel, veierHer))
  }

  return rader
}

function utenKonto(
  epost: string | null,
  authId: string | null,
  veier: Tilgangsvei[],
): TilgangsRad {
  return {
    epost,
    authId,
    harKonto: false,
    kontoAktiv: null,
    epostBekreftet: null,
    opprettet: null,
    sistInnlogget: null,
    harTilgang: true,
    veier,
    // En tilgangsrad uten konto kan ikke samtidig være en annen kundes konto.
    annenKunde: 0,
    rolle: veier.map((v) => v.rolle).find((r) => r) ?? null,
    tilgangAktiv: veier.every((v) => v.aktiv === false) ? false : null,
  }
}
