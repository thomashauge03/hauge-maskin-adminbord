import { lesSpørring } from '@/lib/plattform/supabase-api'
import type { EksternBruker, System } from '@/lib/typer'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Brukere i de andre systemene.

   LESING går gjennom Management-API-ets lesespørring. Det betyr at
   brukerlisten virker for alle prosjekter tokenet ser, også de som ikke
   har fått lagret en service role-nøkkel – og at adminbordet ikke må
   holde sju nøkler bare for å vise en liste.

   ENDRING krever service role, og går gjennom lagFremmedKlient. Se
   src/lib/supabase/fremmed.ts.
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

export type Brukerliste = {
  system: System
  brukere: EksternBruker[] | null
  feil: string | null
}

export async function hentBrukereISystem(system: System): Promise<Brukerliste> {
  if (!system.supabaseProsjektRef) {
    return { system, brukere: null, feil: 'Ingen database registrert.' }
  }

  const svar = await lesSpørring<{
    id: string
    email: string | null
    created_at: string
    last_sign_in_at: string | null
    epost_bekreftet: boolean
    aktiv: boolean
  }>(system.supabaseProsjektRef, SPØRRING_BRUKERE)

  if (!svar.ok) return { system, brukere: null, feil: svar.feil.melding }

  return {
    system,
    feil: null,
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
export async function hentAlleBrukere(systemer: System[]): Promise<{
  lister: Brukerliste[]
  hentetMs: number
}> {
  const medDatabase = systemer.filter((s) => s.supabaseProsjektRef)
  const lister = await Promise.all(medDatabase.map(hentBrukereISystem))
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
