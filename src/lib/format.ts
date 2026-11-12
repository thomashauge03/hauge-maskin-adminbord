/* ═══════════════════════════════════════════════════════════
   Formatering. Samlet her fordi de samme tallene og datoene vises på
   fire sider, og fordi «for 3 minutter siden» skrevet fire steder blir
   fire litt ulike varianter.
   ═══════════════════════════════════════════════════════════ */

// Serveren kjører i UTC; klient og server må skrive samme tid, ellers stemmer ikke hydreringen.
const dato = new Intl.DateTimeFormat('nb-NO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Oslo',
})

const datoTid = new Intl.DateTimeFormat('nb-NO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Oslo',
})

const kortTid = new Intl.DateTimeFormat('nb-NO', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Oslo',
})

/** «12. nov., 13:30». For lister der året sjelden er spørsmålet og plassen er trang. */
export function visKortTid(iso: string | null): string {
  if (!iso) return '–'
  return kortTid.format(new Date(iso))
}

export function visDato(iso: string | null): string {
  if (!iso) return '–'
  return dato.format(new Date(iso))
}

export function visDatoTid(iso: string | null): string {
  if (!iso) return '–'
  return datoTid.format(new Date(iso))
}

/** ÅÅÅÅ-MM-DD i norsk tid. `toISOString` er UTC, og gir gårsdagen den første timen etter midnatt. */
export function isoDato(naa: number): string {
  return new Date(naa).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' })
}

/** ÅÅÅÅ-MM-DD flyttet `dager` fram (eller tilbake). Regnet på datoen alene, så sommertid ikke flytter den. */
export function leggTilDager(dato: string, dager: number): string {
  const d = new Date(`${dato}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dager)
  return d.toISOString().slice(0, 10)
}

const fristDato = new Intl.DateTimeFormat('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const fristDatoÅr = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/**
 * «I dag», «I morgen», «I går», ellers «fre. 14. nov.». Året bare når det
 * ikke er i år. `idag` kommer fra serveren, så server og nettleser skriver
 * det samme ved hydrering.
 */
export function visFrist(frist: string, idag: string): string {
  if (frist === idag) return 'I dag'
  if (frist === leggTilDager(idag, 1)) return 'I morgen'
  if (frist === leggTilDager(idag, -1)) return 'I går'
  const d = new Date(`${frist}T00:00:00Z`)
  return (frist.slice(0, 4) === idag.slice(0, 4) ? fristDato : fristDatoÅr).format(d)
}

/** Mandagen i uka `naa` faller i, som ÅÅÅÅ-MM-DD i norsk tid. Sammenlignes som tekst med isoDato. */
export function ukestart(naa: number): string {
  // Regnet på datoen alene, i UTC: et klokkeslett ville flyttet seg en
  // time når sommertida slår inn midt i uka.
  const dag = new Date(`${isoDato(naa)}T00:00:00Z`)
  dag.setUTCDate(dag.getUTCDate() - ((dag.getUTCDay() + 6) % 7))
  return dag.toISOString().slice(0, 10)
}

/**
 * «for 3 minutter siden». Det man vil vite om en utrulling er hvor
 * gammel den er, ikke hvilken dato den har – en dato krever at man
 * regner i hodet for å svare på om dette skjedde i dag.
 *
 * Tar `naa` som argument i stedet for å kalle Date.now() selv, slik at
 * server og klient regner fra samme øyeblikk og React ikke klager på at
 * teksten ikke stemmer etter hydrering.
 */
export function visSiden(iso: string | null, naa: number): string {
  if (!iso) return '–'

  const sekunder = Math.round((naa - new Date(iso).getTime()) / 1000)
  if (sekunder < 0) return 'nå nettopp'
  if (sekunder < 60) return 'nå nettopp'

  const minutter = Math.round(sekunder / 60)
  if (minutter < 60) return `for ${minutter} min siden`

  const timer = Math.round(minutter / 60)
  if (timer < 24) return `for ${timer} ${timer === 1 ? 'time' : 'timer'} siden`

  const dager = Math.round(timer / 24)
  if (dager < 31) return `for ${dager} ${dager === 1 ? 'dag' : 'dager'} siden`

  const måneder = Math.round(dager / 30)
  if (måneder < 12)
    return `for ${måneder} ${måneder === 1 ? 'måned' : 'måneder'} siden`

  const år = Math.round(måneder / 12)
  return `for ${år} år siden`
}

/** Bytes til noe et menneske kan lese. Binære prefikser, som Supabase bruker. */
export function visBytes(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return '–'
  if (bytes < 1024) return `${bytes} B`

  const enheter = ['kB', 'MB', 'GB', 'TB']
  let verdi = bytes / 1024
  let i = 0
  while (verdi >= 1024 && i < enheter.length - 1) {
    verdi /= 1024
    i++
  }
  // Én desimal under 100, ingen over: «1,4 GB» er nyttig, «847,3 MB» er støy.
  const desimaler = verdi < 100 ? 1 : 0
  return `${verdi.toFixed(desimaler).replace('.', ',')} ${enheter[i]}`
}

export function visProsent(andel: number): string {
  return `${Math.round(andel * 100)} %`
}

/** Første linje av en commit-melding. Resten er sjelden interessant i en tabell. */
export function førsteLinje(tekst: string | null, maksTegn = 60): string {
  if (!tekst) return '–'
  const linje = tekst.split('\n')[0].trim()
  return linje.length > maksTegn ? `${linje.slice(0, maksTegn - 1)}…` : linje
}
