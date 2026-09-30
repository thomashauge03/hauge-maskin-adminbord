/*
 * Søk og filter i lista over appbrukere.
 *
 * Skjer i nettleseren, over én slank rad per person. 1000 personer er rundt
 * 200 KB og under et millisekund å filtrere – å spørre serveren per
 * tastetrykk ville vært tregere og mer kode, for en skala dette ikke når.
 *
 * Ingen import, med vilje: testene kjører fila direkte i Node.
 */

export type AppStatus = 'venter' | 'godkjent' | 'sperra'

/** Én person i lista. Ingen sideliste og ingen ikoner – de hentes på personsiden. */
export type Appbruker = {
  id: string
  navn: string
  epost: string
  telefon: string | null
  status: AppStatus
  /** ISO-tid for registreringen */
  registrert: string
  /** Har personen tilgang i minst ett av de andre systemene? */
  kjentFraFør: boolean
  /** Id-ene til gruppene personen er i */
  grupper: string[]
  /** Antall egne unntak (side_tilgang) */
  unntak: number
}

export type Filtervalg = {
  q: string
  status: AppStatus | 'alle'
  /** En gruppe-id, 'uten' eller 'alle' */
  gruppe: string
  /** Bare dem som ikke finnes i noen av de andre systemene */
  ukjent: boolean
  sortering: 'nyeste' | 'navn'
}

export const STANDARDVALG: Filtervalg = {
  q: '',
  status: 'alle',
  gruppe: 'alle',
  ukjent: false,
  sortering: 'nyeste',
}

/**
 * Gjør tekst sammenlignbar. Brukes likt på søket og på det det søkes i.
 *
 * aa og oe er de gamle skrivemåtene for å og ø, og det folk skriver på et
 * tastatur uten dem. Derfor finner både «bjorn» og «bjoern» Bjørn, og
 * «haakon» finner Håkon.
 */
export function normaliser(tekst: string): string {
  return tekst
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/aa/g, 'a')
    .replace(/oe/g, 'o')
    .trim()
}

const bareSifre = (tekst: string) => tekst.replace(/\D/g, '')

const navnsortering = new Intl.Collator('nb')

export function sorter(liste: readonly Appbruker[], sortering: Filtervalg['sortering']): Appbruker[] {
  return sortering === 'navn'
    ? [...liste].sort((a, b) => navnsortering.compare(a.navn, b.navn))
    : [...liste].sort((a, b) => b.registrert.localeCompare(a.registrert))
}

/**
 * Lager søket én gang per liste. Teksten det søkes i normaliseres her, ikke
 * per tastetrykk.
 */
export function lagSøk(
  brukere: readonly Appbruker[],
  gruppenavn: ReadonlyMap<string, string>,
): (valg: Filtervalg) => Appbruker[] {
  const indeks = brukere.map((bruker) => ({
    bruker,
    tekst: [
      bruker.navn,
      bruker.epost,
      bruker.telefon ?? '',
      ...bruker.grupper.map((g) => gruppenavn.get(g) ?? ''),
    ]
      .map(normaliser)
      .join(' '),
    sifre: bareSifre(bruker.telefon ?? ''),
  }))

  return (valg) => {
    const ord = normaliser(valg.q).split(/\s+/).filter(Boolean)
    const treff = indeks
      .filter(({ bruker: b, tekst, sifre }) => {
        if (valg.status !== 'alle' && b.status !== valg.status) return false
        if (valg.gruppe === 'uten' && b.grupper.length > 0) return false
        if (valg.gruppe !== 'alle' && valg.gruppe !== 'uten' && !b.grupper.includes(valg.gruppe)) {
          return false
        }
        if (valg.ukjent && b.kjentFraFør) return false
        // Et tall treffer også telefonnummeret uten mellomrom:
        // «91234567» finner «912 34 567».
        return ord.every(
          (o) => tekst.includes(o) || (sifre !== '' && /^\d+$/.test(o) && sifre.includes(o)),
        )
      })
      .map(({ bruker }) => bruker)
    return sorter(treff, valg.sortering)
  }
}

export function tellStatus(brukere: readonly Appbruker[]): Record<AppStatus, number> {
  const tall = { venter: 0, godkjent: 0, sperra: 0 }
  for (const b of brukere) tall[b.status]++
  return tall
}

/**
 * Filteret fra adressen. Ukjente verdier blir standard, så en gammel lenke –
 * til en gruppe som er slettet – aldri gir en tom liste uten grunn.
 */
export function lesValg(
  p: { get(navn: string): string | null },
  kjenteGrupper: ReadonlySet<string>,
): Filtervalg {
  const status = p.get('status')
  const gruppe = p.get('gruppe')
  return {
    q: p.get('q') ?? '',
    status: status === 'venter' || status === 'godkjent' || status === 'sperra' ? status : 'alle',
    gruppe: gruppe === 'uten' || (gruppe !== null && kjenteGrupper.has(gruppe)) ? gruppe : 'alle',
    ukjent: p.get('ukjent') === '1',
    sortering: p.get('sortering') === 'navn' ? 'navn' : 'nyeste',
  }
}

/** Filteret til adressen. Bare det som avviker fra standard, så lenka blir kort. */
export function skrivValg(valg: Filtervalg): string {
  const p = new URLSearchParams()
  if (valg.q) p.set('q', valg.q)
  if (valg.status !== 'alle') p.set('status', valg.status)
  if (valg.gruppe !== 'alle') p.set('gruppe', valg.gruppe)
  if (valg.ukjent) p.set('ukjent', '1')
  if (valg.sortering !== 'nyeste') p.set('sortering', valg.sortering)
  const streng = p.toString()
  return streng ? `?${streng}` : ''
}
