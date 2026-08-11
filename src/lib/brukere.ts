import { lesSpørring } from '@/lib/plattform/supabase-api'
import { lagFremmedKlient } from '@/lib/supabase/fremmed'
import { hentTokenKart, tokenFor } from '@/lib/kontoar'
import type { EksternBruker, System } from '@/lib/typer'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Brukere i de andre systemene.

   Det finnes TO veier inn, og begge trengs.

   1. Management-API-ets lesespørring. Krever bare ett token, og virker
      for alle prosjekter DEN KONTOEN ser. Gir mest: sist innlogget,
      om kontoen er sperret, om e-posten er bekreftet.

   2. Prosjektets egen service role-nøkkel mot /auth/v1/admin/users.
      Krever en lagret nøkkel per system, men er helt uavhengig av hvem
      som eier prosjektet.

   Vei 2 finnes fordi et personal access token bare ser prosjekter i
   organisasjoner kontoen er med i. Ligger appene under ulike
   Supabase-kontoer – slik de gjør her – ville vei 1 alene vist en tom
   liste for de fleste av dem, uten å si hvorfor.

   Rekkefølgen er 1 så 2: vei 1 er rikere og krever ingen lagret nøkkel.
   Faller den, prøves vei 2 før det meldes feil.

   ENDRING går alltid gjennom service role. Se src/lib/supabase/fremmed.ts.
   ═══════════════════════════════════════════════════════════ */

/*
 * `banned_until` er Supabase sin egen måte å deaktivere en konto: den
 * settes langt fram i tid. Derfor er «aktiv» ikke en kolonne, men en
 * sammenligning – og den må gjøres i databasen, ellers må adminbordet
 * kjenne tidssonen prosjektet står i.
 */
const SPØRRING_BRUKERE = `
  select
    id::text as id,
    email,
    created_at,
    last_sign_in_at,
    (email_confirmed_at is not null) as epost_bekreftet,
    (banned_until is null or banned_until < now()) as aktiv
  from auth.users
  order by created_at desc
  limit 200
`

/** Hvilken vei listen kom inn. Vises i grensesnittet, fordi de to gir
    ulik detaljgrad og ulike ting kan mangle. */
export type Brukerkilde = 'management' | 'service_role'

export type Brukerliste = {
  system: System
  brukere: EksternBruker[] | null
  kilde: Brukerkilde | null
  feil: string | null
  /** Satt når vei 1 falt og vei 2 tok over. Verdt å vise: det forklarer
      hvorfor databasestatus mangler for nettopp dette systemet. */
  merknad: string | null
}

/**
 * `brukReserve` skrus av for drift-rollen.
 *
 * Reserveveien dekrypterer en produksjonsdatabase sin service
 * role-nøkkel. Å bruke en nøkkel er ikke det samme som å se den, men
 * skillet mellom eier og drift er nettopp at drift ikke skal utløse noe
 * som rører de nøklene. Å la en leseliste gjøre det i det stille ville
 * uthult rollen uten at noen bestemte det.
 *
 * Konsekvensen for drift er at systemer utenfor management-tokenets
 * rekkevidde vises som utilgjengelige framfor tomme. Det er riktigere:
 * de ER utilgjengelige for den rollen.
 */
export async function hentBrukereISystem(
  system: System,
  { brukReserve }: { brukReserve: boolean },
): Promise<Brukerliste> {
  if (!system.supabaseProsjektRef) {
    return {
      system,
      brukere: null,
      kilde: null,
      feil: 'Ingen database registrert.',
      merknad: null,
    }
  }

  // ── Vei 1: Management-API-et, med kontoens eget token ──
  const token = tokenFor(await hentTokenKart(), system.kontoId)
  const svar = await lesSpørring<{
    id: string
    email: string | null
    created_at: string
    last_sign_in_at: string | null
    epost_bekreftet: boolean
    aktiv: boolean
  }>(token, system.supabaseProsjektRef, SPØRRING_BRUKERE)

  if (svar.ok) {
    return {
      system,
      kilde: 'management',
      feil: null,
      merknad: null,
      brukere: svar.data.map((r) => ({
        id: r.id,
        epost: r.email,
        opprettet: r.created_at,
        sistInnlogget: r.last_sign_in_at,
        epostBekreftet: r.epost_bekreftet,
        rolleISystem: null,
        aktivISystem: r.aktiv,
      })),
    }
  }

  // ── Vei 2: prosjektets egen service role-nøkkel ──
  if (!brukReserve) {
    return {
      system,
      brukere: null,
      kilde: null,
      merknad: null,
      feil: `${svar.feil.melding} Reserveveien krever eier-rollen, fordi den bruker systemets service role-nøkkel.`,
    }
  }

  const reserve = await hentMedServiceRole(system)
  if (reserve) {
    return {
      ...reserve,
      // Grunnen fra vei 1 tas med. «Tokenet ser ikke prosjektet» er
      // nyttig å vite selv når listen kom fram på annet vis – det er
      // også forklaringen på at databasestatus står som uvisst.
      merknad: `Management-API-et nådde ikke fram (${svar.feil.melding}) – listen er hentet med systemets egen service role-nøkkel. Databasestatus og diskbruk krever et token for kontoen som eier prosjektet.`,
    }
  }

  return {
    system,
    brukere: null,
    kilde: null,
    merknad: null,
    feil: `${svar.feil.melding} Ingen service role-nøkkel lagret som reserve – legg den inn på systemsiden.`,
  }
}

/**
 * Lister brukere med prosjektets egen service role-nøkkel.
 *
 * Returnerer null når det ikke finnes en lagret nøkkel, slik at
 * kallstedet kan skille «ingen reserve å prøve» fra «reserven feilet».
 *
 * Gir mindre enn vei 1: supabase-js sin listUsers eksponerer ikke
 * `banned_until` i alle versjoner, så `aktivISystem` settes til null
 * framfor å gjette. Null betyr «vet ikke», og grensesnittet viser da
 * ingen sperret-merkelapp i stedet for en gal en.
 */
async function hentMedServiceRole(
  system: System,
): Promise<Omit<Brukerliste, 'merknad'> | null> {
  const fremmed = await lagFremmedKlient(system.id)
  if (!fremmed.ok) return null

  const { data, error } = await fremmed.klient.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })

  if (error) {
    return {
      system,
      brukere: null,
      kilde: 'service_role',
      feil: `Service role-nøkkelen ble avvist: ${error.message}`,
    }
  }

  return {
    system,
    kilde: 'service_role',
    feil: null,
    brukere: data.users.map((u) => {
      const sperretTil = (u as { banned_until?: string | null }).banned_until
      return {
        id: u.id,
        epost: u.email ?? null,
        opprettet: u.created_at,
        sistInnlogget: u.last_sign_in_at ?? null,
        epostBekreftet: Boolean(u.email_confirmed_at),
        rolleISystem: null,
        aktivISystem:
          sperretTil === undefined
            ? null
            : !sperretTil || new Date(sperretTil) < new Date(),
      }
    }),
  }
}

/**
 * Brukere i alle systemer som har database.
 *
 * Kallene går samtidig. Sekvensielt ville sju prosjekter med åtte
 * sekunders tidsfrist gitt nesten et minutt i verste fall, og da hadde
 * ingen brukt siden.
 *
 * `hentetMs` følger med fordi visningen trenger et tidspunkt å regne
 * «sist inne for 3 dager siden» fra, og en komponent som leser klokka
 * under rendring ikke er ren.
 */
export async function hentAlleBrukere(
  systemer: System[],
  { brukReserve }: { brukReserve: boolean },
): Promise<{
  lister: Brukerliste[]
  hentetMs: number
}> {
  const medDatabase = systemer.filter((s) => s.supabaseProsjektRef)
  const lister = await Promise.all(
    medDatabase.map((s) => hentBrukereISystem(s, { brukReserve })),
  )
  return { lister, hentetMs: Date.now() }
}

/**
 * Samler brukerne på e-post, på tvers av systemene.
 *
 * Dette er tabellen som gjør at spørsmålet «hvem har tilgang til hva»
 * har et svar. Den er også forarbeidet til den felles innloggingen: er
 * samme e-post registrert i fem prosjekter, er det én person som i dag
 * har fem passord.
 */
export type SamletPerson = {
  epost: string
  /** Systemslug → brukerens tilstand i det systemet. */
  iSystem: Map<string, EksternBruker>
  sistInnlogget: string | null
}

export function samlePåEpost(lister: Brukerliste[]): SamletPerson[] {
  const kart = new Map<string, SamletPerson>()

  for (const liste of lister) {
    for (const bruker of liste.brukere ?? []) {
      // Brukere uten e-post finnes (telefoninnlogging, anonyme økter).
      // De hører ikke i en oversikt som samler på e-post.
      if (!bruker.epost) continue

      const nøkkel = bruker.epost.toLowerCase()
      const eksisterende = kart.get(nøkkel)

      if (eksisterende) {
        eksisterende.iSystem.set(liste.system.slug, bruker)
        if (
          bruker.sistInnlogget &&
          (!eksisterende.sistInnlogget ||
            bruker.sistInnlogget > eksisterende.sistInnlogget)
        ) {
          eksisterende.sistInnlogget = bruker.sistInnlogget
        }
      } else {
        kart.set(nøkkel, {
          epost: nøkkel,
          iSystem: new Map([[liste.system.slug, bruker]]),
          sistInnlogget: bruker.sistInnlogget,
        })
      }
    }
  }

  // Flest systemer først: det er de som er mest berørt av en endring i
  // innloggingen, og de man vil flytte til navet først.
  return [...kart.values()].sort(
    (a, b) => b.iSystem.size - a.iSystem.size || a.epost.localeCompare(b.epost),
  )
}
