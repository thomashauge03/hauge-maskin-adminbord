import { normaliserNummer, rensNavn, type Prosjekt } from './plan.ts'

/* ═══════════════════════════════════════════════════════════
   Leser prosjektlisten ut av en SmartDok-eksport.

   Tar imot radene som rene tabeller (første ark, cellene som de er), ikke
   fila. Da kan det samme tolkes enten det kom fra .xlsx eller .csv, og det
   kan testes uten en ekte Excel-fil.

   Kolonnene finnes på overskriften, ikke på plassen. SmartDok har endret
   rekkefølgen i eksportene før, og vi har ingen garanti for hvilke kolonner
   som er slått på hos den som eksporterer.
   ═══════════════════════════════════════════════════════════ */

type Felt = 'nummer' | 'navn' | 'kunde' | 'adresse' | 'aktiv' | 'ferdig'

const OVERSKRIFTER: Record<Felt, string[]> = {
  nummer: ['prosjektnummer', 'prosjektnr', 'pronr', 'nummer', 'nr', 'projectnumber', 'projectno'],
  navn: ['prosjektnavn', 'navn', 'prosjekt', 'pronavn', 'projectname', 'project', 'name'],
  kunde: ['kunde', 'byggherre', 'oppdragsgiver', 'kundenavn', 'customer', 'client', 'clientcompanyname'],
  adresse: ['adresse', 'arbeidssted', 'lokasjon', 'sted', 'address', 'location'],
  aktiv: ['aktiv', 'status', 'active', 'isactive'],
  ferdig: ['ferdig', 'avsluttet', 'fullført', 'finished'],
}

const JA = new Set(['ja', 'j', 'true', '1', 'x', 'aktiv', 'yes', 'pågår', 'åpen'])
const NEI = new Set(['nei', 'n', 'false', '0', 'inaktiv', 'avsluttet', 'ferdig', 'fullført', 'no', 'lukket', 'stengt'])

export type Tolkning =
  | {
      ok: true
      prosjekter: Prosjekt[]
      kolonner: Partial<Record<Felt, string>>
      /** Rader uten nummer eller navn. */
      hoppetOver: number
      /** Samme nummer flere ganger. Den siste vinner. */
      dubletter: number
    }
  | { ok: false; feil: string }

function nøkkel(overskrift: unknown) {
  return String(overskrift ?? '')
    .toLocaleLowerCase('nb')
    .replace(/[\s._\-:]/g, '')
}

function tekst(celle: unknown): string | null {
  if (celle === null || celle === undefined) return null
  const t = String(celle).replace(/\s+/g, ' ').trim()
  return t.length > 0 ? t : null
}

function sannhet(celle: unknown): boolean | null {
  if (typeof celle === 'boolean') return celle
  const t = tekst(celle)?.toLocaleLowerCase('nb')
  if (!t) return null
  if (JA.has(t)) return true
  if (NEI.has(t)) return false
  return null
}

function finnKolonner(rad: unknown[]) {
  const nøkler = rad.map(nøkkel)
  const funnet: Partial<Record<Felt, number>> = {}
  for (const felt of Object.keys(OVERSKRIFTER) as Felt[]) {
    // Overskriftene står i prioritert rekkefølge: «Prosjektnavn» skal vinne
    // over en kolonne som bare heter «Prosjekt».
    for (const kandidat of OVERSKRIFTER[felt]) {
      const i = nøkler.indexOf(kandidat)
      if (i >= 0 && !Object.values(funnet).includes(i)) {
        funnet[felt] = i
        break
      }
    }
  }
  return funnet
}

/**
 * CSV fra SmartDok eller fra Excel sin «Lagre som». Norsk Excel skriver
 * semikolon, fordi komma er desimaltegnet, så skilletegnet gjettes fra
 * første linje i stedet for å antas.
 */
export function delCsv(tekst: string): string[][] {
  const renset = tekst.replace(new RegExp('^' + String.fromCodePoint(0xfeff)), '')
  const første = renset.split(/\r?\n/, 1)[0] ?? ''
  const skille = (første.match(/;/g)?.length ?? 0) >= (første.match(/,/g)?.length ?? 0) ? ';' : ','

  const rader: string[][] = []
  let rad: string[] = []
  let celle = ''
  let iSitat = false

  for (let i = 0; i < renset.length; i++) {
    const tegn = renset[i]
    if (iSitat) {
      if (tegn === '"' && renset[i + 1] === '"') {
        celle += '"'
        i++
      } else if (tegn === '"') iSitat = false
      else celle += tegn
    } else if (tegn === '"') iSitat = true
    else if (tegn === skille) {
      rad.push(celle)
      celle = ''
    } else if (tegn === '\n' || tegn === '\r') {
      if (tegn === '\r' && renset[i + 1] === '\n') i++
      rad.push(celle)
      rader.push(rad)
      rad = []
      celle = ''
    } else celle += tegn
  }
  if (celle || rad.length) {
    rad.push(celle)
    rader.push(rad)
  }
  return rader
}

export function tolkEksport(rader: unknown[][]): Tolkning {
  // Eksporter har ofte en tittel eller et filter over tabellen.
  let overskriftRad = -1
  let kolonner: Partial<Record<Felt, number>> = {}
  for (let i = 0; i < Math.min(rader.length, 15); i++) {
    const funnet = finnKolonner(rader[i] ?? [])
    if (funnet.navn !== undefined || funnet.nummer !== undefined) {
      overskriftRad = i
      kolonner = funnet
      break
    }
  }

  if (overskriftRad < 0 || kolonner.navn === undefined) {
    const første = (rader.find((r) => r?.some((c) => tekst(c))) ?? []).map(tekst).filter(Boolean)
    return {
      ok: false,
      feil:
        'Fant ingen kolonne for prosjektnavn. ' +
        (første.length
          ? `Første rad med innhold har: ${første.slice(0, 12).join(', ')}.`
          : 'Arket ser tomt ut.'),
    }
  }

  const perNummer = new Map<string, Prosjekt>()
  let hoppetOver = 0
  let dubletter = 0

  for (const rad of rader.slice(overskriftRad + 1)) {
    if (!rad || !rad.some((c) => tekst(c))) continue

    let navn = tekst(rad[kolonner.navn])
    let nummer = kolonner.nummer !== undefined ? normaliserNummer(tekst(rad[kolonner.nummer])) : null

    // Timelisteeksporten har nummer og navn i samme celle: «2026117 Herdalen».
    if (!nummer && navn) {
      const delt = navn.match(/^(\d[\w/-]*)\s+(.+)$/)
      if (delt) {
        nummer = normaliserNummer(delt[1])
        navn = delt[2]
      }
    }

    if (!nummer || !navn) {
      hoppetOver++
      continue
    }

    let aktiv = kolonner.aktiv !== undefined ? sannhet(rad[kolonner.aktiv]) : null
    const ferdig = kolonner.ferdig !== undefined ? sannhet(rad[kolonner.ferdig]) : null
    if (aktiv === null && ferdig !== null) aktiv = !ferdig
    else if (aktiv === true && ferdig === true) aktiv = false

    if (perNummer.has(nummer)) dubletter++
    perNummer.set(nummer, {
      nummer,
      navn: rensNavn(navn, nummer).slice(0, 200),
      kunde: kolonner.kunde !== undefined ? tekst(rad[kolonner.kunde]) : null,
      adresse: kolonner.adresse !== undefined ? tekst(rad[kolonner.adresse]) : null,
      aktiv: aktiv ?? true,
    })
  }

  const navnPå = (i: number | undefined) =>
    i === undefined ? undefined : (tekst(rader[overskriftRad][i]) ?? undefined)

  return {
    ok: true,
    prosjekter: [...perNummer.values()],
    kolonner: Object.fromEntries(
      (Object.keys(kolonner) as Felt[]).map((f) => [f, navnPå(kolonner[f])]),
    ),
    hoppetOver,
    dubletter,
  }
}
