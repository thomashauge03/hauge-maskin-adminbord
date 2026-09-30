/*
 * Tilgangsregelen i mobilappen, som ren logikk.
 *
 * MÅ være samme regel som visningen `mine_sider` i migrasjon 0017:
 *
 *   1. Har personen et eget unntak for siden?  → det avgjør.
 *   2. Gir en av gruppene personen er i siden? → ja.
 *   3. Ellers                                  → nei.
 *
 * Det finnes ingen standardsider. En ny side ser ingen før den er lagt i en
 * gruppe, og en ny person ser ingenting før de er lagt i en. Endres regelen
 * her uten i 0017 – eller omvendt – viser adminbordet noe annet enn appen.
 * Samme tilfeller er testet begge steder: sideregel.test.mjs og
 * supabase/test/0017_appen.test.sql.
 *
 * Ingen import, med vilje: testene kjører fila direkte i Node.
 */

export type GruppeMedSider = { id: string; navn: string; sider: readonly string[] }

export type Grunn = {
  ser: boolean
  hvorfor: 'gitt' | 'tatt' | 'gruppe' | 'ingen'
  /** Gruppene – blant personens – som gir siden, uansett unntak */
  grupper: string[]
}

/** Side-id → navnene på gruppene (blant `mineGrupper`) som gir siden. */
export function siderFraGrupper(
  mineGrupper: Iterable<string>,
  grupper: readonly GruppeMedSider[],
): Map<string, string[]> {
  const mine = new Set(mineGrupper)
  const ut = new Map<string, string[]>()
  for (const g of grupper) {
    if (!mine.has(g.id)) continue
    for (const side of g.sider) {
      const liste = ut.get(side) ?? []
      liste.push(g.navn)
      ut.set(side, liste)
    }
  }
  return ut
}

export function grunnFor(
  sideId: string,
  unntak: ReadonlyMap<string, boolean>,
  fraGrupper: ReadonlyMap<string, readonly string[]>,
): Grunn {
  const grupper = [...(fraGrupper.get(sideId) ?? [])]
  const eget = unntak.get(sideId)
  if (eget === true) return { ser: true, hvorfor: 'gitt', grupper }
  if (eget === false) return { ser: false, hvorfor: 'tatt', grupper }
  return grupper.length > 0
    ? { ser: true, hvorfor: 'gruppe', grupper }
    : { ser: false, hvorfor: 'ingen', grupper }
}

export function serSiden(
  sideId: string,
  unntak: ReadonlyMap<string, boolean>,
  fraGrupper: ReadonlyMap<string, readonly string[]>,
): boolean {
  return grunnFor(sideId, unntak, fraGrupper).ser
}

/**
 * Hva som skal lagres når admin vil at personen skal se – eller ikke se – en
 * side: `true`/`false` for et unntak, `null` for å slette det.
 *
 * Et unntak lagres bare når valget avviker fra det gruppene gir. Ellers ville
 * unntak blitt stående etter at de sluttet å bety noe, og en side som senere
 * legges i personens gruppe fortsatt vært skjult – uten at noen skjønte
 * hvorfor.
 */
export function unntakFor(ønsket: boolean, fraGrupper: boolean): boolean | null {
  return ønsket === fraGrupper ? null : ønsket
}

/**
 * Side-id-er som står i databasen, men ikke i sider.json.
 *
 * Sidene bor i en fil på GitHub, så ingen fremmednøkkel rydder av seg selv
 * når en side slettes der. Uten dette hoper radene seg opp usynlig.
 */
export function foreldreløse(kjente: ReadonlySet<string>, ...kilder: Iterable<string>[]): string[] {
  const ut = new Set<string>()
  for (const kilde of kilder) for (const id of kilde) if (!kjente.has(id)) ut.add(id)
  return [...ut].sort()
}
