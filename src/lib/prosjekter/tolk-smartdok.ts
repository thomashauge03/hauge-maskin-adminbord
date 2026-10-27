import { normaliserNummer, rensNavn, type Prosjekt } from './plan.ts'

/* ═══════════════════════════════════════════════════════════
   Gjør svaret fra SmartDoks GET /Projects om til navets prosjekter.

   Skilt fra klienten fordi den holder nøkkelen og importerer server-only,
   og da kan den ikke lastes i `npm test`. Det som kan gå galt her, er det
   samme som i eksporttolkningen: dubletter, nummer med mellomrom, og
   prosjekter som ikke er prosjekter.
   ═══════════════════════════════════════════════════════════ */

export type Smartdoktolkning = {
  prosjekter: Prosjekt[]
  /** Fravær som «Ferie» og «Sykdom» er prosjekter i SmartDok, men ingen skal bestille til dem. */
  fravær: number
  /** Uten nummer eller navn. */
  hoppetOver: number
  /** Rader i svaret, før noe er tatt bort. */
  mottatt: number
  /** Hvor mange SmartDok sier det finnes. Større enn `mottatt` betyr at lista ble kuttet. */
  totalt: number | null
}

function tekst(verdi: unknown): string | null {
  if (typeof verdi !== 'string') return null
  const t = verdi.replace(/\s+/g, ' ').trim()
  return t.length > 0 ? t.slice(0, 300) : null
}

export function tolkSmartdok(svar: unknown): Smartdoktolkning {
  const samling = (svar ?? {}) as { Items?: unknown; TotalCount?: unknown }
  if (!Array.isArray(samling.Items)) {
    throw new Error('SmartDok svarte uten prosjektliste (Items mangler)')
  }

  const perNummer = new Map<string, Prosjekt>()
  let fravær = 0
  let hoppetOver = 0

  for (const element of samling.Items) {
    const p = (element ?? {}) as Record<string, unknown>
    if (p.IsAbsenceProject === true) {
      fravær++
      continue
    }
    const nummer = normaliserNummer(tekst(p.ProjectNumber))
    const navn = tekst(p.ProjectName)
    if (!nummer || !navn) {
      hoppetOver++
      continue
    }
    perNummer.set(nummer, {
      nummer,
      navn: rensNavn(navn, nummer).slice(0, 200),
      kunde: tekst(p.ClientCompanyName),
      adresse: tekst(p.Location),
      // Et ferdigmeldt prosjekt kan stå som aktivt i SmartDok til noen rydder.
      // I nedtrekkslistene skal det likevel ikke stå.
      aktiv: p.IsActive !== false && p.Finished !== true,
    })
  }

  return {
    prosjekter: [...perNummer.values()],
    fravær,
    hoppetOver,
    mottatt: samling.Items.length,
    totalt: typeof samling.TotalCount === 'number' ? samling.TotalCount : null,
  }
}
