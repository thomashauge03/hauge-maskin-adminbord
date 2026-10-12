/* ═══════════════════════════════════════════════════════════
   Hva synken skal gjøre, regnet ut uten å røre noen database.

   Ren logikk med vilje: dette er stedet der en feil gir doble prosjekter i
   fem apper, så det skal kunne testes uten nettverk og uten nøkler.

   Reglene:
   - SmartDok er eneste kilde. Appene skal ikke ha egne prosjekter, så
     synken går bare én vei: fra navet ut.
   - Prosjektnummeret er nøkkelen. Navet vinner på navn og aktiv.
   - Et prosjekt appen har som ikke finnes i SmartDok, settes inaktivt, slik
     at det forsvinner fra nedtrekkslistene.
   - Kunde og adresse fylles bare inn der appen har tomt felt. Appene har
     ofte mer presise opplysninger enn SmartDok-eksporten, og de skal ikke
     overskrives av en tom eller grovere verdi.
   - Ingenting slettes, verken i navet eller i appene. Bestillinger, utleier
     og tilbud henger på prosjektene, og et prosjekt som forsvinner fra
     eksporten er nesten alltid avsluttet, ikke feilført.
   ═══════════════════════════════════════════════════════════ */

export type Prosjekt = {
  nummer: string
  navn: string
  kunde: string | null
  adresse: string | null
  aktiv: boolean
}

/** En rad slik den står i en app. `id` er appens egen primærnøkkel. */
export type AppRad = {
  id: string
  nummer: string | null
  navn: string
  kunde: string | null
  adresse: string | null
  /** null der appen ikke har noe begrep om aktiv (varsling). */
  aktiv: boolean | null
}

export type Endring = Partial<Pick<AppRad, 'nummer' | 'navn' | 'kunde' | 'adresse' | 'aktiv'>>

export type Utskrivingsplan = {
  nye: Prosjekt[]
  endringer: { id: string; endring: Endring }[]
  /** Appens egne prosjekter som ikke finnes i SmartDok, nå satt inaktive. */
  deaktivert: number
  /** Navet har dem, men appen kan ikke lagre nummeret (rørlager vil ha tall). */
  hoppetOver: string[]
}

export type Valg = {
  /** Om appen kan lagre dette nummeret. Standard: alle. */
  godtarNummer?: (nummer: string) => boolean
  /** Utleie har unik indeks på navn, så to prosjekter med likt navn må skilles. */
  unikeNavn?: boolean
  /** Varsling har ingen aktiv-kolonne. */
  harAktiv?: boolean
  /** Varsling har ingen adresse, lager har verken kunde eller adresse. */
  harKunde?: boolean
  harAdresse?: boolean
}

/**
 * «2026 117», « 2026117 » og 2026117.0 fra Excel er samme nummer.
 * Tomt blir null, fordi et tomt nummer ikke er en nøkkel.
 */
export function normaliserNummer(verdi: unknown): string | null {
  if (verdi === null || verdi === undefined) return null
  let tekst = typeof verdi === 'number' ? String(verdi) : String(verdi)
  tekst = tekst.replace(/\s+/g, '')
  if (/^\d+\.0+$/.test(tekst)) tekst = tekst.replace(/\.0+$/, '')
  return tekst.length > 0 && tekst.length <= 40 ? tekst : null
}

/**
 * Tilbudssystemet har navn som «2025151 Surtekvæven velforening». Nummeret
 * står allerede i sin egen kolonne, og ble det stående i navnet, ville det
 * stått to ganger i hver nedtrekksliste.
 */
export function rensNavn(navn: string, nummer: string | null): string {
  let renset = navn.replace(/\s+/g, ' ').trim()
  if (nummer && renset.startsWith(nummer)) {
    const rest = renset.slice(nummer.length).replace(/^[\s\-–:.]+/, '')
    if (rest.length > 0) renset = rest
  }
  return renset
}

function navnenøkkel(navn: string) {
  return navn.toLocaleLowerCase('nb').replace(/\s+/g, ' ').trim()
}

function tomt(verdi: string | null | undefined) {
  return verdi === null || verdi === undefined || verdi.trim() === ''
}

/** Det appen må få for å bli lik navet. */
export function planleggUtskriving(
  navet: Prosjekt[],
  app: AppRad[],
  valg: Valg = {},
): Utskrivingsplan {
  const godtar = valg.godtarNummer ?? (() => true)
  const harAktiv = valg.harAktiv ?? true
  const harKunde = valg.harKunde ?? true
  const harAdresse = valg.harAdresse ?? true

  const perNummer = new Map<string, AppRad>()
  const utenNummerPerNavn = new Map<string, AppRad>()
  for (const rad of app) {
    const nummer = normaliserNummer(rad.nummer)
    if (nummer) {
      if (!perNummer.has(nummer)) perNummer.set(nummer, rad)
    } else {
      const nøkkel = navnenøkkel(rad.navn)
      if (!utenNummerPerNavn.has(nøkkel)) utenNummerPerNavn.set(nøkkel, rad)
    }
  }

  // Navn som er tatt i appen, for apper med unik indeks på navn.
  const tatteNavn = new Set(app.map((r) => navnenøkkel(r.navn)))
  const ledigNavn = (ønsket: string, nummer: string, eier?: AppRad) => {
    if (!valg.unikeNavn) return ønsket
    const nøkkel = navnenøkkel(ønsket)
    const opptatt = tatteNavn.has(nøkkel) && (!eier || navnenøkkel(eier.navn) !== nøkkel)
    return opptatt ? `${ønsket} (${nummer})` : ønsket
  }

  const plan: Utskrivingsplan = { nye: [], endringer: [], hoppetOver: [], deaktivert: 0 }
  const truffet = new Set<string>()

  for (const p of navet) {
    if (!godtar(p.nummer)) {
      plan.hoppetOver.push(p.nummer)
      continue
    }

    let rad = perNummer.get(p.nummer)
    const endring: Endring = {}

    // Et prosjekt uten nummer i appen, med samme navn, er samme prosjekt.
    // Det får nummeret i stedet for å bli liggende ved siden av en kopi.
    if (!rad) {
      const navnetreff =
        utenNummerPerNavn.get(navnenøkkel(p.navn)) ??
        utenNummerPerNavn.get(navnenøkkel(`${p.nummer} ${p.navn}`))
      if (navnetreff) {
        rad = navnetreff
        utenNummerPerNavn.delete(navnenøkkel(navnetreff.navn))
        endring.nummer = p.nummer
      }
    }

    if (rad) truffet.add(rad.id)

    if (!rad) {
      const navn = ledigNavn(p.navn, p.nummer)
      tatteNavn.add(navnenøkkel(navn))
      plan.nye.push({
        ...p,
        navn,
        kunde: harKunde ? p.kunde : null,
        adresse: harAdresse ? p.adresse : null,
      })
      continue
    }

    if (rad.navn !== p.navn) {
      const navn = ledigNavn(p.navn, p.nummer, rad)
      if (navn !== rad.navn) {
        tatteNavn.add(navnenøkkel(navn))
        endring.navn = navn
      }
    }
    if (harAktiv && rad.aktiv !== null && rad.aktiv !== p.aktiv) endring.aktiv = p.aktiv
    if (harKunde && tomt(rad.kunde) && !tomt(p.kunde)) endring.kunde = p.kunde
    if (harAdresse && tomt(rad.adresse) && !tomt(p.adresse)) endring.adresse = p.adresse

    if (Object.keys(endring).length > 0) plan.endringer.push({ id: rad.id, endring })
  }

  /*
   * En tom liste betyr at SmartDok-eksporten ikke er lest inn ennå, ikke at
   * alle prosjektene er borte. Uten vakten ville første synk slått av alt.
   */
  if (harAktiv && navet.length > 0) {
    for (const rad of app) {
      if (truffet.has(rad.id) || rad.aktiv !== true) continue
      plan.endringer.push({ id: rad.id, endring: { aktiv: false } })
      plan.deaktivert++
    }
  }

  return plan
}
