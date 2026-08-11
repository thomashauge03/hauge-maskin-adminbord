import type { SupabaseClient } from '@supabase/supabase-js'
import { lesSpørring } from '@/lib/plattform/supabase-api'
import { lagFremmedKlient } from '@/lib/supabase/fremmed'
import { hentTokenKart, tokenFor } from '@/lib/kontoar'
import {
  byggTilgangsspørring,
  flettRader,
  GRENSE,
  SPØRRING_KONTOER,
  type RåKonto,
  type RåTilgang,
} from '@/lib/tilgangslesning'
import type { Tilgangsoppsett } from '@/lib/tilgang'
import type { System, TilgangsRad, Tilgangsvei } from '@/lib/typer'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Kontoer OG tilgang i de andre systemene.

   Het før bare «brukere», og det var mer enn et navn: fila hentet
   `auth.users` og ingenting annet, og siden viste en grønn «JA» for hver rad
   den fant. En konto ble vist som en tilgang. Se
   src/lib/tilgangslesning.ts for hva det gjorde galt i praksis.

   Det finnes to veier inn til dataene, og begge trengs.

   1. Management-API-ets lesespørring. Krever bare ett token, og virker for
      alle prosjekter DEN KONTOEN ser. Gir mest: sist innlogget, sperring,
      bekreftet e-post – og nå tilgangsradene.

   2. Prosjektets egen service role-nøkkel. Krever en lagret nøkkel per
      system, men er uavhengig av hvem som eier prosjektet.

   Vei 2 finnes fordi et personal access token bare ser prosjekter i
   organisasjoner kontoen er med i. Appene ligger under fire ulike
   Supabase-kontoer, så vei 1 alene ville vist tomme lister for de fleste uten
   å si hvorfor.

   ENDRING går alltid gjennom service role. Se src/lib/supabase/fremmed.ts.
   ═══════════════════════════════════════════════════════════ */

/** Hvilken vei listen kom inn. Vises, fordi de to gir ulik detaljgrad. */
export type Brukerkilde = 'management' | 'service_role'

export type Brukerliste = {
  system: System
  rader: TilgangsRad[] | null
  kilde: Brukerkilde | null
  feil: string | null
  /** Satt når vei 1 falt og vei 2 tok over. Verdt å vise: det forklarer
      hvorfor databasestatus mangler for nettopp dette systemet. */
  merknad: string | null
  /** Tilgangsveiene systemet har, slik visningen kan forklare hva merkene
      betyr og hvorfor noen kolonner ikke kan si noe om tilgang. */
  veier: Tilgangsoppsett[]
  /** Satt når spørringen traff grensen. Uten dette flagget ser en avkortet
      liste ut som en komplett liste. */
  avkortet: boolean
}

/**
 * `brukReserve` skrus av for drift-rollen.
 *
 * Reserveveien dekrypterer en produksjonsdatabases service role-nøkkel. Å
 * bruke en nøkkel er ikke det samme som å se den, men skillet mellom eier og
 * drift er nettopp at drift ikke skal utløse noe som rører de nøklene. Å la en
 * leseliste gjøre det i det stille ville uthult rollen uten at noen bestemte
 * det.
 *
 * `veier` sendes INN framfor å hentes her. Brukerlisten kalte tidligere
 * hentTilgangsoppsett én gang per system i en egen Promise.all – en hel ny
 * bølge databasekall etter at brukerne var hentet, mot samme tabell hver gang.
 */
export async function hentBrukereISystem(
  system: System,
  { brukReserve, veier }: { brukReserve: boolean; veier: Tilgangsoppsett[] },
): Promise<Brukerliste> {
  const tomt = {
    system,
    rader: null,
    kilde: null,
    merknad: null,
    veier,
    avkortet: false,
  }

  if (!system.supabaseProsjektRef) {
    return { ...tomt, feil: 'Ingen database registrert.' }
  }

  // ── Vei 1: Management-API-et, med kontoens eget token ──
  const token = tokenFor(await hentTokenKart(), system.kontoId)
  const ref = system.supabaseProsjektRef
  const tilgangsspørring = byggTilgangsspørring(veier)

  /*
   * De to kallene går SAMTIDIG.
   *
   * Sekvensielt ville hvert system fått to rundturer etter hverandre, og med
   * sju systemer er det sju ekstra ventetider på rad. Slik er veggklokka den
   * samme som med ett kall – det er antallet som dobles, ikke tiden.
   */
  const [kontoSvar, tilgangSvar] = await Promise.all([
    lesSpørring<RåKonto>(token, ref, SPØRRING_KONTOER),
    tilgangsspørring
      ? lesSpørring<RåTilgang>(
          token,
          ref,
          tilgangsspørring.sql,
          tilgangsspørring.parametre,
        )
      : Promise.resolve(null),
  ])

  if (kontoSvar.ok) {
    /*
     * Kontoene kom fram, men tilgangen kanskje ikke. Da er det ÆRLIGERE å
     * melde feil enn å vise kontoene med tom tilgang – som er nøyaktig den
     * påstanden («ingen har tilgang») vi ikke har grunnlag for.
     */
    if (tilgangSvar && !tilgangSvar.ok) {
      return {
        ...tomt,
        feil: `Kontoene ble lest, men tilgangstabellen(e) feilet: ${tilgangSvar.feil.melding} Uten dem kan ikke matrisen si hvem som har tilgang.`,
      }
    }

    return {
      ...tomt,
      kilde: 'management',
      feil: null,
      avkortet: kontoSvar.data.length >= GRENSE,
      rader: flettRader(kontoSvar.data, tilgangSvar?.data ?? [], veier),
    }
  }

  // ── Vei 2: prosjektets egen service role-nøkkel ──
  if (!brukReserve) {
    return {
      ...tomt,
      feil: `${kontoSvar.feil.melding} Reserveveien krever eier-rollen, fordi den bruker systemets service role-nøkkel.`,
    }
  }

  const reserve = await hentMedServiceRole(system, veier)
  if (reserve) {
    return {
      ...reserve,
      // Grunnen fra vei 1 tas med. «Tokenet ser ikke prosjektet» er nyttig å
      // vite selv når listen kom fram på annet vis – det er også forklaringen
      // på at databasestatus står som uvisst.
      merknad: `Management-API-et nådde ikke fram (${kontoSvar.feil.melding}) – listen er hentet med systemets egen service role-nøkkel. Databasestatus og diskbruk krever et token for kontoen som eier prosjektet.`,
    }
  }

  return {
    ...tomt,
    feil: `${kontoSvar.feil.melding} Ingen service role-nøkkel lagret som reserve – legg den inn på systemsiden.`,
  }
}

/**
 * Lister kontoer og tilgang med prosjektets egen service role-nøkkel.
 *
 * Returnerer null når det ikke finnes en lagret nøkkel, slik at kallstedet kan
 * skille «ingen reserve å prøve» fra «reserven feilet».
 *
 * Leser tilgangsveiene gjennom PostgREST. Auth-admin-API-et kan ikke lese en
 * vanlig tabell, og PostgREST kan ikke lese auth.users – derfor begge. Denne
 * veien går bare når vei 1 ikke rekker fram, og alternativet var å vise
 * tilgangen som uvisst for nettopp de systemene der vi HAR en nøkkel som kan
 * lese den.
 */
async function hentMedServiceRole(
  system: System,
  veier: Tilgangsoppsett[],
): Promise<Omit<Brukerliste, 'merknad'> | null> {
  const fremmed = await lagFremmedKlient(system.id)
  if (!fremmed.ok) return null

  const grunn = { system, kilde: 'service_role' as const, veier, avkortet: false }

  const [kontoer, tilganger] = await Promise.all([
    fremmed.klient.auth.admin.listUsers({ page: 1, perPage: GRENSE }),
    lesTilgangMedPostgrest(fremmed.klient, veier),
  ])

  if (kontoer.error) {
    return {
      ...grunn,
      rader: null,
      feil: `Service role-nøkkelen ble avvist: ${kontoer.error.message}`,
    }
  }

  if (tilganger === null) {
    return {
      ...grunn,
      rader: null,
      feil: 'Kontoene ble lest med service role-nøkkelen, men tilgangstabellen(e) kunne ikke leses. Uten dem kan ikke matrisen si hvem som har tilgang.',
    }
  }

  const råKontoer: RåKonto[] = kontoer.data.users.map((u) => {
    const sperretTil = (u as { banned_until?: string | null }).banned_until
    return {
      auth_id: u.id,
      epost: u.email?.toLowerCase() ?? null,
      opprettet: u.created_at,
      sist_innlogget: u.last_sign_in_at ?? null,
      epost_bekreftet: Boolean(u.email_confirmed_at),
      /*
       * listUsers eksponerer ikke banned_until i alle versjoner. Null betyr
       * «vet ikke», og visningen viser da ingen sperret-merkelapp framfor en
       * gal en. Vei 1 har ikke dette problemet.
       */
      konto_aktiv:
        sperretTil === undefined
          ? null
          : !sperretTil || new Date(sperretTil) < new Date(),
    }
  })

  return { ...grunn, rader: flettRader(råKontoer, tilganger, veier), feil: null }
}

/**
 * Tilgangsveiene lest gjennom PostgREST, med service role-nøkkelen.
 *
 * Null betyr at minst én vei ikke kunne leses. Kallstedet melder da feil
 * framfor å vise «ingen tilgang» – en delvis lest tilgang er en gal tilgang.
 */
async function lesTilgangMedPostgrest(
  klient: SupabaseClient,
  veier: Tilgangsoppsett[],
): Promise<RåTilgang[] | null> {
  const medTabell = veier.filter((v) => v.modell === 'rolletabell' && v.tabell)
  if (medTabell.length === 0) return []

  const ut: RåTilgang[] = []

  for (const v of medTabell) {
    const kolonner = [v.brukerKolonne, v.rolleKolonne, v.aktivKolonne].filter(
      Boolean,
    ) as string[]
    const flerkunde = Boolean(v.tenantKolonne && v.tenantVerdi)

    // Flerkunde leses to ganger: vår kunde, og alle de andre. Den andre
    // runden er ikke tilgang – den forklarer hvorfor kontoen finnes, og
    // hindrer at systemkortet tilbyr sletting av en annen bedrifts innlogging.
    for (const annenKunde of flerkunde ? [false, true] : [false]) {
      let spørring = klient.from(v.tabell!).select(kolonner.join(','))
      if (flerkunde) {
        // Uten dette filteret havner andre kunders rader blant våre – nøyaktig
        // lekkasjen tilgangslesningen finnes for å stoppe.
        spørring = annenKunde
          ? spørring.neq(v.tenantKolonne!, v.tenantVerdi!)
          : spørring.eq(v.tenantKolonne!, v.tenantVerdi!)
      }
      // Samme grunn som i byggTilgangsspørring: uten rollefilteret vises hver
      // rad som om den ga den makten veien beskriver.
      if (v.rolleFilter && v.rolleKolonne) {
        spørring = spørring.eq(v.rolleKolonne, v.rolleFilter)
      }

      const { data, error } = await spørring.limit(GRENSE)
      if (error || !data) return null

      for (const rad of data as unknown as Record<string, unknown>[]) {
        const nøkkel = rad[v.brukerKolonne]
        if (nøkkel == null) continue
        ut.push({
          nokkel: String(nøkkel),
          nokkeltype: v.brukerNokkel,
          vei: v.etikett,
          rolle: v.rolleKolonne ? ((rad[v.rolleKolonne] as string) ?? null) : null,
          aktiv: v.aktivKolonne ? ((rad[v.aktivKolonne] as boolean) ?? null) : null,
          slag: annenKunde ? 'annen_kunde' : 'tilgang',
        })
      }
    }
  }

  return ut
}

/**
 * Kontoer og tilgang i alle systemer som har database.
 *
 * Kallene går samtidig. Sekvensielt ville sju prosjekter med åtte sekunders
 * tidsfrist gitt nesten et minutt i verste fall, og da hadde ingen brukt
 * siden.
 *
 * `hentetMs` følger med fordi visningen trenger et tidspunkt å regne «sist
 * inne for 3 dager siden» fra, og en komponent som leser klokka under rendring
 * ikke er ren.
 */
export async function hentAlleBrukere(
  systemer: System[],
  {
    brukReserve,
    oppsett,
  }: { brukReserve: boolean; oppsett: Map<string, Tilgangsoppsett[]> },
): Promise<{ lister: Brukerliste[]; hentetMs: number }> {
  const medDatabase = systemer.filter((s) => s.supabaseProsjektRef)
  const lister = await Promise.all(
    medDatabase.map((s) =>
      hentBrukereISystem(s, { brukReserve, veier: oppsett.get(s.id) ?? [] }),
    ),
  )
  return { lister, hentetMs: Date.now() }
}

/**
 * Samler personene på e-post, på tvers av systemene.
 *
 * Dette er tabellen som gjør at spørsmålet «hvem har tilgang til hva» har et
 * svar. Den er også forarbeidet til den felles innloggingen: er samme e-post
 * registrert i fem prosjekter, er det én person som i dag har fem passord.
 */
export type SamletPerson = {
  epost: string
  /** Systemslug → personens tilstand i det systemet. */
  iSystem: Map<string, TilgangsRad>
  sistInnlogget: string | null
  /** Antall systemer personen faktisk HAR tilgang i. Skilt fra iSystem.size,
      som bare er antall systemer personen er kjent i. */
  antallMedTilgang: number
  /** Veier som gir makt utover eget system. Verdt å løfte fram: en admin hos
      en annen kunde i tilbudssystemet har full makt over Hauge Maskin-data. */
  brede: Tilgangsvei[]
}

export function samlePåEpost(lister: Brukerliste[]): SamletPerson[] {
  const kart = new Map<string, SamletPerson>()

  for (const liste of lister) {
    // Veier som ikke er begrenset til Hauge Maskin. Utpekt av at de mangler
    // tenant-kolonne i et system som ellers har den.
    const brede = new Set(
      liste.veier
        .filter(
          (v) =>
            !v.tenantKolonne &&
            liste.veier.some((a) => a.tenantKolonne) &&
            v.modell === 'rolletabell',
        )
        .map((v) => v.etikett),
    )

    for (const rad of liste.rader ?? []) {
      /*
       * Rader uten e-post finnes: telefoninnlogging, anonyme økter, og
       * foreldreløse tilgangsrader som peker på en auth-id som er slettet. De
       * hører ikke i en oversikt som samler på e-post – men de er verdt å se,
       * så systemkortene lenger ned viser dem.
       */
      if (!rad.epost) continue

      const nøkkel = rad.epost.toLowerCase()
      const bredeHer = rad.veier.filter((v) => brede.has(v.etikett))
      const eksisterende = kart.get(nøkkel)

      if (eksisterende) {
        eksisterende.iSystem.set(liste.system.slug, rad)
        if (rad.harTilgang) eksisterende.antallMedTilgang++
        eksisterende.brede.push(...bredeHer)
        if (
          rad.sistInnlogget &&
          (!eksisterende.sistInnlogget ||
            rad.sistInnlogget > eksisterende.sistInnlogget)
        ) {
          eksisterende.sistInnlogget = rad.sistInnlogget
        }
      } else {
        kart.set(nøkkel, {
          epost: nøkkel,
          iSystem: new Map([[liste.system.slug, rad]]),
          sistInnlogget: rad.sistInnlogget,
          antallMedTilgang: rad.harTilgang ? 1 : 0,
          brede: bredeHer,
        })
      }
    }
  }

  // Flest tilganger først. Sorterte før på antall systemer personen fantes i,
  // som satte den som hadde kontoer overalt og tilgang ingen steder øverst –
  // stikk i strid med hva listen skal svare på.
  return [...kart.values()].sort(
    (a, b) =>
      b.antallMedTilgang - a.antallMedTilgang ||
      b.iSystem.size - a.iSystem.size ||
      a.epost.localeCompare(b.epost),
  )
}
