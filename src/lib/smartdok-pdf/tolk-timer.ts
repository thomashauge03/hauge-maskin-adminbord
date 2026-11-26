/* ═══════════════════════════════════════════════════════════
   Gjør SmartDoks rå svar om til en smal timeliste som er trygg å sende
   videre til en annen app.

   Adminbordet er det eneste som holder SmartDok-nøklene. Radene fra
   /WorkHours har rundt 60 felter (lønn, ansattnummer, bruker-id …), og
   /Users har fødselsdato, telefon og pårørende. Derfor plukkes hvert felt
   ut for seg her; ingenting kopieres «som det er».
   ═══════════════════════════════════════════════════════════ */

export type SmartdokTime = {
  id: number
  maskinradId: number | null
  type: 'arbeid' | 'tillegg' | 'maskin'
  /** 'YYYY-MM-DD' */
  dato: string
  fra: number | null
  til: number | null
  /** Fra brukerlista, tom hvis ukjent. */
  navn: string
  aktivitet: string
  lonnsart: string
  kommentar: string
  mengde: number
  fakturert: boolean
  /** `${nummer} ${navn}`, eller tom. */
  underprosjekt: string
  /** Maskinnavn fra /Machines, ellers EquipmentCode, ellers tom. */
  maskin: string
  /** EquipmentId, bare for maskinrader. Ikke-tall gir null i stedet for å stoppe hele svaret. */
  maskinId: number | null
  /** ExportedExternalId, som er Tripletex-merket vi skrev dit. Tom gir null. */
  eksterntMerke: string | null
}

/*
 * SmartDok svarer med enten en ren liste eller `{ Items }`. Alt annet
 * (feilkropp, omdøpt nøkkel, null) skal stoppe: radene havner på et
 * fakturavedlegg, og en stille tom liste ser ut som «ingen timer».
 */
function liste(svar: unknown): unknown[] {
  if (Array.isArray(svar)) return svar
  const innpakket = svar as { Items?: unknown; TotalCount?: unknown } | null
  const items = innpakket?.Items
  if (Array.isArray(items)) {
    // Et sidedelt svar ville gitt for få timer uten at noen ser det.
    const totalt = innpakket?.TotalCount
    if (typeof totalt === 'number' && totalt > items.length) {
      throw new Error(`SmartDok svarte med bare ${items.length} av ${totalt} rader. Prøv en kortere periode.`)
    }
    return items
  }
  throw new Error('SmartDok svarte i et uventet format')
}

function tekst(verdi: unknown): string {
  if (typeof verdi === 'string') return verdi.trim()
  if (typeof verdi === 'number') return String(verdi)
  return ''
}

function tallEllerNull(verdi: unknown): number | null {
  return typeof verdi === 'number' && Number.isFinite(verdi) ? verdi : null
}

export function tolkTimer(
  rader: unknown,
  prosjektnummer: string,
  navn: Map<string, string>,
  maskiner: Map<number, string>,
): SmartdokTime[] {
  const ut: SmartdokTime[] = []

  for (const element of liste(rader)) {
    if (typeof element !== 'object' || element === null) {
      throw new Error('SmartDok ga en timerad i et uventet format')
    }
    const r = element as Record<string, unknown>
    if (String(r.ProjectNumber) !== prosjektnummer) continue

    const maskinradId = tallEllerNull(r.MachineHourId)
    const type =
      maskinradId !== null ? 'maskin' : r.WageAddition === true || r.UnitAddition === true ? 'tillegg' : 'arbeid'

    // Ingen stille 0: en manglende mengde eller id ville gitt feil på fakturaen.
    if (typeof r.WorkHourID !== 'number') throw new Error('SmartDok-rad mangler WorkHourID')
    if (typeof r.NetHours !== 'number' || !Number.isFinite(r.NetHours)) {
      throw new Error(`SmartDok-rad ${r.WorkHourID} mangler NetHours`)
    }
    if (typeof r.Date !== 'string') throw new Error(`SmartDok-rad ${r.WorkHourID} mangler Date`)

    const utstyrId = tallEllerNull(r.EquipmentId)
    const maskin = (utstyrId !== null ? maskiner.get(utstyrId) : undefined) ?? tekst(r.EquipmentCode)
    const eksterntMerke = tekst(r.ExportedExternalId)

    ut.push({
      id: r.WorkHourID,
      maskinradId,
      type,
      dato: r.Date.slice(0, 10),
      fra: tallEllerNull(r.OrdinaryHoursFrom),
      til: tallEllerNull(r.OrdinaryHoursTo),
      navn: navn.get(String(r.UserID)) ?? '',
      aktivitet: tekst(r.WorkDescription),
      lonnsart: tekst(r.WageName),
      kommentar: tekst(r.Comment),
      mengde: r.NetHours,
      fakturert: r.Invoiced === true,
      underprosjekt: [tekst(r.SubProjectNumber), tekst(r.SubProjectName)].filter(Boolean).join(' '),
      maskin,
      maskinId: maskinradId !== null ? utstyrId : null,
      eksterntMerke: eksterntMerke || null,
    })
  }

  return ut
}

/* ── Perioder ──────────────────────────────────────────────── */

const DAG_MS = 86_400_000
/** SmartDok godtar ikke lengre spørring enn dette på /WorkHours. */
const MAKS_DAGER_PER_BIT = 93
const MAKS_DAGER_TOTALT = 366

/** Null hvis teksten ikke er en ekte kalenderdato (2026-02-30 avvises). */
function dagnummer(dato: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dato)) return null
  const ms = Date.parse(`${dato}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  if (new Date(ms).toISOString().slice(0, 10) !== dato) return null
  return ms / DAG_MS
}

function tilDato(dag: number): string {
  return new Date(dag * DAG_MS).toISOString().slice(0, 10)
}

/** Forutsetter en periode som har passert `sjekkPeriode`. */
export function delPeriode(fra: string, til: string): { fra: string; til: string }[] {
  const start = dagnummer(fra)
  const slutt = dagnummer(til)
  if (start === null || slutt === null) throw new Error('delPeriode fikk en ugyldig dato')

  const biter: { fra: string; til: string }[] = []
  for (let a = start; a <= slutt; a += MAKS_DAGER_PER_BIT) {
    biter.push({ fra: tilDato(a), til: tilDato(Math.min(a + MAKS_DAGER_PER_BIT - 1, slutt)) })
  }
  return biter
}

export function sjekkPeriode(fra: string, til: string): string | null {
  const start = dagnummer(fra)
  const slutt = dagnummer(til)
  if (start === null || slutt === null) return 'Datoene må være gyldige og skrives som ÅÅÅÅ-MM-DD.'
  if (start > slutt) return 'Fra-datoen kan ikke være etter til-datoen.'
  if (slutt - start + 1 > MAKS_DAGER_TOTALT) return 'Perioden kan ikke være lengre enn 366 dager.'
  return null
}

/* ── Oppslagslister ────────────────────────────────────────── */

/** Bare Id og navn. Resten av brukerradene er persondata som ikke skal videre. */
export function tolkNavn(brukere: unknown): Map<string, string> {
  const kart = new Map<string, string>()
  for (const element of liste(brukere)) {
    const b = (element ?? {}) as Record<string, unknown>
    const id = tekst(b.Id)
    const navn = tekst(b.Name)
    if (id && navn) kart.set(id, navn)
  }
  return kart
}

export function tolkMaskiner(maskiner: unknown): Map<number, string> {
  const kart = new Map<number, string>()
  for (const element of liste(maskiner)) {
    const m = (element ?? {}) as Record<string, unknown>
    const id = tallEllerNull(m.Id)
    const navn = tekst(m.Name)
    if (id !== null && navn) kart.set(id, navn)
  }
  return kart
}

/** Aktive maskiner til nedtrekkslista. Uventet form stopper i stedet for å gi en tom liste. */
export function tolkMaskinliste(maskiner: unknown): { id: number; nummer: string; navn: string; kategori: string }[] {
  const ut: { id: number; nummer: string; navn: string; kategori: string }[] = []
  for (const element of liste(maskiner)) {
    if (typeof element !== 'object' || element === null) throw new Error('SmartDok ga en maskin i et uventet format')
    const m = element as Record<string, unknown>
    if (m.IsActive === false) continue
    const id = tallEllerNull(m.Id)
    const navn = tekst(m.Name)
    if (id === null || !navn) throw new Error('SmartDok ga en maskin uten Id eller Name')
    ut.push({ id, nummer: tekst(m.InternalNumber), navn, kategori: tekst(m.CategoryName) })
  }
  return ut
}
