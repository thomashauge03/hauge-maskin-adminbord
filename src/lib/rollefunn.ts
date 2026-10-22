/* ═══════════════════════════════════════════════════════════
   Hvilke roller som FINNES i et system – lest fra systemet selv.

   Rollene sto før bare i `system_roller`, skrevet inn for hånd i en
   migrasjon. Det holdt til første gang en app fikk en ny rolle: utleie fikk
   `ansatt` i sin CHECK-regel og rørlageret tok den i bruk, men adminbordet
   kjente den ikke. Nedtrekkslisten manglet rollen, serveren avviste den som
   ugyldig – og verst: åpnet man «Endre rolle» på en ansatt, sto listen på
   `admin`, så ett vanetrykk forfremmet personen.

   Nå er systemet kilden til HVILKE roller som finnes, og registeret bare
   kilden til hva de HETER og betyr. En rolle registeret ikke kjenner vises
   med sitt rå navn, og blir aldri borte.

   Ren fil uten server-only, så den kan testes med node --test.
   ═══════════════════════════════════════════════════════════ */

export type SystemRolle = {
  verdi: string
  etikett: string
  beskrivelse: string | null
  erStandard: boolean
  /** Funnet i systemet, men ikke beskrevet i registeret. */
  ny: boolean
  /** Antall rader med rollen. Null når systemet ikke kunne leses. */
  iBruk: number | null
}

/** Én rad fra rollespørringen i tilgangslesning.ts. */
export type RåRollefunn = {
  kilde: 'sjekk' | 'enum' | 'i_bruk'
  verdi: string | null
  antall: number | null
}

export type Rollefunn = {
  /**
   * Rollene databasen TILLATER, fra CHECK-regel eller enum. Null når kolonnen
   * er fri tekst – da finnes ingen fasit, og registeret pluss det som er i
   * bruk er det beste vi har.
   */
  lovlige: string[] | null
  iBruk: Map<string, number>
}

/**
 * Plukker lovlige verdier ut av en CHECK-regel.
 *
 * Postgres skriver `rolle in ('a', 'b')` om til `rolle = ANY (ARRAY['a'::text,
 * 'b'::text])`, så det er den formen som må gjenkjennes. En regel uten slik
 * liste – `length(rolle) > 0` – sier ingenting om hvilke roller som finnes, og
 * gir null framfor en tom liste. En tom liste ville betydd «ingen roller er
 * lov», og fjernet alle fra nedtrekkslisten.
 */
export function verdierFraSjekk(def: string): string[] | null {
  if (!/=\s*ANY\s*\(\s*\(?\s*ARRAY\s*\[/i.test(def)) return null
  const verdier = [...def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) =>
    m[1].replaceAll("''", "'"),
  )
  return verdier.length > 0 ? verdier : null
}

/**
 * `gjelder` er veiens gjelderRoller. Lagerets user_roles tillater også
 * heimesidas «admin» og en ubrukt «user», men veien adminbordet skriver i
 * gjelder bare lager, staff og viewer – og bare de skal kunne velges.
 */
export function tolkRollefunn(
  rader: RåRollefunn[],
  gjelder: string[] | null = null,
): Rollefunn {
  let lovlige: string[] | null = null
  const iBruk = new Map<string, number>()

  // To regler på samme kolonne må BEGGE holde, så snittet er det lovlige.
  const snitt = (nye: string[]) => {
    lovlige = lovlige ? lovlige.filter((v) => nye.includes(v)) : nye
  }

  const enumverdier: string[] = []
  for (const r of rader) {
    if (!r.verdi) continue
    if (r.kilde === 'i_bruk') iBruk.set(r.verdi, r.antall ?? 0)
    else if (r.kilde === 'enum') enumverdier.push(r.verdi)
    else {
      const fraSjekk = verdierFraSjekk(r.verdi)
      if (fraSjekk) snitt(fraSjekk)
    }
  }
  if (enumverdier.length > 0) snitt(enumverdier)

  if (gjelder) {
    snitt(gjelder)
    for (const verdi of [...iBruk.keys()]) {
      if (!gjelder.includes(verdi)) iBruk.delete(verdi)
    }
  }

  return { lovlige, iBruk }
}

function etikettFor(verdi: string): string {
  const pen = verdi.replaceAll('_', ' ')
  return pen.charAt(0).toUpperCase() + pen.slice(1)
}

/**
 * Registerets roller, rettet etter det systemet faktisk har.
 *
 * - En registrert rolle databasen ikke tillater, tas ut. Den ville feilet på
 *   skriving uansett, og i listen lover den noe som ikke går.
 * - En rolle databasen tillater eller bruker, men registeret ikke kjenner,
 *   legges til med sitt rå navn.
 *
 * Uten funn – systemet kunne ikke leses – er registeret alt vi har, og det
 * vises uendret framfor at listen blir tom.
 */
export function flettRoller(
  registrerte: SystemRolle[],
  funn: Rollefunn | null,
): SystemRolle[] {
  if (!funn) return registrerte

  const lov = funn.lovlige
  const kjente = registrerte
    .filter((r) => !lov || lov.includes(r.verdi))
    .map((r) => ({ ...r, iBruk: funn.iBruk.get(r.verdi) ?? 0 }))

  const sett = new Set(kjente.map((r) => r.verdi))
  // Avviste registerroller skal ikke komme inn igjen bakveien via «i bruk».
  for (const r of registrerte) sett.add(r.verdi)

  const nye: SystemRolle[] = []
  for (const verdi of [...(lov ?? []), ...funn.iBruk.keys()]) {
    if (sett.has(verdi)) continue
    sett.add(verdi)
    nye.push({
      verdi,
      etikett: etikettFor(verdi),
      beskrivelse:
        'Funnet i systemet, men ikke beskrevet i adminbordet ennå. Sjekk i appen hva rollen gir før du deler den ut.',
      erStandard: false,
      ny: true,
      iBruk: funn.iBruk.get(verdi) ?? 0,
    })
  }

  return [...kjente, ...nye]
}

/**
 * Rollen nedtrekkslisten skal starte på.
 *
 * Personens EGEN rolle først, også når den ikke står i listen. Å falle tilbake
 * til standardrollen der var feilen som gjorde en ansatt til admin: listen sto
 * på admin, og knappen het «Endre rolle».
 */
export function startrolle(
  roller: SystemRolle[],
  nåværende: string | null,
): string | null {
  if (nåværende) return nåværende
  return roller.find((r) => r.erStandard)?.verdi ?? roller[0]?.verdi ?? null
}
