import { randomInt } from 'node:crypto'

/* ═══════════════════════════════════════════════════════════
   Rene hjelpere til timer på Tripletex-ordre. Ingen nett, ingen database.

   Det som tolkes her havner på kundefakturaer. Uventet form gir derfor feil
   i stedet for at noe stille faller bort: en manglende linje er verre enn
   en avbrutt sending.
   ═══════════════════════════════════════════════════════════ */

const TEGN = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Merket som står på ordren, så en sending kan gjenkjennes og ikke gjøres to ganger. */
export function lagMerke(ordrenummer: string, kode: string): string {
  return `Tripletex ordre ${ordrenummer} (${kode})`
}

/** Seks tilfeldige tegn, med kryptografisk tilfeldighet så to sendinger ikke får samme kode. */
export function lagKode(): string {
  let kode = ''
  for (let i = 0; i < 6; i++) kode += TEGN[randomInt(TEGN.length)]
  return kode
}

/** Første aktive sending som allerede har noen av disse timene. */
export function overlapp(
  nye: number[],
  aktive: { kode: string; ordrenummer: string | null; timer_ider: number[] }[],
): { kode: string; ordrenummer: string | null } | null {
  const sett = new Set(nye)
  for (const a of aktive) {
    if (a.timer_ider.some((id) => sett.has(id))) return { kode: a.kode, ordrenummer: a.ordrenummer }
  }
  return null
}

function objekt(x: unknown, hva: string): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`Uventet svar fra Tripletex: ${hva} er ikke et objekt.`)
  return x as Record<string, unknown>
}

function verdier(json: unknown, hva: string): unknown[] {
  const v = objekt(json, hva).values
  if (!Array.isArray(v)) throw new Error(`Uventet svar fra Tripletex: ${hva} mangler values.`)
  return v
}

function heltall(x: unknown, hva: string): number {
  if (typeof x !== 'number' || !Number.isSafeInteger(x)) throw new Error(`Uventet svar fra Tripletex: ${hva} er ikke et heltall.`)
  return x
}

function tekst(x: unknown, hva: string): string {
  if (typeof x === 'string' && x) return x
  if (typeof x === 'number' && Number.isFinite(x)) return String(x)
  throw new Error(`Uventet svar fra Tripletex: ${hva} mangler.`)
}

/** Bare aktive produkter. Filtreres her fordi Tripletex overser noen filtre stille. */
export function tolkProdukter(json: unknown): { id: number; nummer: string; navn: string; pris: number | null }[] {
  return verdier(json, 'produktlista')
    .map((p) => objekt(p, 'et produkt'))
    .filter((p) => p.isInactive !== true)
    .map((p) => {
      const pris = p.priceExcludingVatCurrency
      return {
        id: heltall(p.id, 'produkt-id'),
        nummer: tekst(p.number, 'produktnummer'),
        navn: tekst(p.name, 'produktnavn'),
        pris: typeof pris === 'number' && Number.isFinite(pris) ? pris : null,
      }
    })
}

/** Eksakt prosjektnummer. Tripletex kan gi prefikstreff (2026118 mot 20261180). */
export function tolkProsjekt(json: unknown, nummer: string): { id: number; kundeId: number } | 'ingen' | 'flere' {
  const treff = verdier(json, 'prosjektlista')
    .map((p) => objekt(p, 'et prosjekt'))
    .filter((p) => String(p.number) === nummer)
  if (treff.length === 0) return 'ingen'
  if (treff.length > 1) return 'flere'
  const p = treff[0]
  return {
    id: heltall(p.id, 'prosjekt-id'),
    kundeId: heltall(objekt(p.customer, 'prosjektets kunde').id, 'kunde-id'),
  }
}

/** Åpne ordrer på prosjektet, med linjene som allerede står der. */
export function tolkApneOrdrer(
  json: unknown,
  prosjektId: number,
): { id: number; nummer: string; dato: string; linjer: { produktnavn: string; antall: number }[] }[] {
  return verdier(json, 'ordrelista')
    .map((o) => objekt(o, 'en ordre'))
    .filter((o) => o.isClosed === false && o.project && typeof o.project === 'object' && (o.project as { id?: unknown }).id === prosjektId)
    .map((o) => {
      const rå = o.orderLines === undefined ? [] : o.orderLines
      if (!Array.isArray(rå)) throw new Error('Uventet svar fra Tripletex: orderLines er ikke en liste.')
      return {
        id: heltall(o.id, 'ordre-id'),
        nummer: tekst(o.number, 'ordrenummer'),
        dato: tekst(o.orderDate, 'ordredato'),
        linjer: rå.map((l) => {
          const linje = objekt(l, 'en ordrelinje')
          const produkt = linje.product && typeof linje.product === 'object' ? (linje.product as { name?: unknown }).name : undefined
          if (typeof linje.count !== 'number' || !Number.isFinite(linje.count)) {
            throw new Error('Uventet svar fra Tripletex: ordrelinje uten antall.')
          }
          return { produktnavn: tekst(produkt || linje.description, 'navn på ordrelinje'), antall: linje.count }
        }),
      }
    })
}

/** Linjene brukeren vil sende. Gir norsk melding ved første feil, ellers de rensede linjene. */
export function sjekkLinjer(x: unknown): { produktId: number; antall: number; tekst: string }[] | string {
  if (!Array.isArray(x) || x.length === 0) return 'Ingen linjer å sende.'
  const ut: { produktId: number; antall: number; tekst: string }[] = []
  for (let i = 0; i < x.length; i++) {
    const nr = `Linje ${i + 1}`
    const l = x[i]
    if (!l || typeof l !== 'object') return `${nr} er ugyldig.`
    const { produktId, antall, tekst } = l as Record<string, unknown>
    if (typeof produktId !== 'number' || !Number.isSafeInteger(produktId) || produktId <= 0) return `${nr} mangler produkt.`
    if (typeof antall !== 'number' || !Number.isFinite(antall) || antall <= 0 || antall > 10000) {
      return `${nr}: antall må være over 0 og høyst 10000.`
    }
    if (Math.abs(Math.round(antall * 100) - antall * 100) > 1e-6) return `${nr}: antall kan ha høyst to desimaler.`
    if (typeof tekst !== 'string' || tekst.trim().length < 1 || tekst.length > 200) return `${nr}: teksten må være 1 til 200 tegn.`
    // Flyttallsstøy (0.1 + 0.2) skal ikke stå som antall på en faktura.
    ut.push({ produktId, antall: Math.round(antall * 100) / 100, tekst })
  }
  return ut
}
