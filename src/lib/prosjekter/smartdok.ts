import { supabaseAdmin } from '@/lib/supabase/admin'
import { dekrypter, forkort, krypter } from '@/lib/krypto'
import { logg } from '@/lib/data'
import { isoDato } from '@/lib/format'
import { lesInn } from './innlesing'
import { tolkSmartdok, type Smartdoktolkning } from './tolk-smartdok'
import type { Prosjekt } from './plan'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Henting av prosjektlista fra SmartDok-API-et.

   Slik SmartDok vil ha det (api.smartdok.no/api-docs):
   - API-nøkkelen lages av en administrator under Firmainnstillinger →
     API-administrasjon, og byttes mot et økttoken med POST
     /Authorize/ApiToken. Økttokenet går som Bearer på alle andre kall.
   - Nøkkelen varer i tolv måneder. Etter seks kan den fornyes med POST
     /Authorize/ApiToken/Renew, og da slutter den gamle å virke straks.

   Og slik SmartDok ba om i e-post (oktober 2026): ingen fast grense for
   antall kall, men jevnlig synk skal bruke `updatedSince` framfor å hente
   hele lista ofte, kallene skal ikke gå samtidig, og integrasjonen skal tåle
   429 og prøve igjen etter en pause. De kan innføre grenser senere.

   Bare lesing. Prosjektene opprettes i SmartDok, og adminbordet skal aldri
   skrive tilbake dit.
   ═══════════════════════════════════════════════════════════ */

const ADRESSE = 'https://api.smartdok.no'

/** Hele synken skal holde seg under låsen, også om SmartDok henger. */
const TIDSAVBRUDD_MS = 15_000

/** Pausen før nytt forsøk etter 429. Lengre ventetid enn dette tas neste kvarter. */
const MAKS_PAUSE_MS = 10_000

/*
 * Endringskallene spør fra forrige henting minus dette. Det dekker klokker som
 * går ulikt, og at vi ikke vet om SmartDok leser tidspunktet som UTC eller
 * norsk tid (en til to timer fram). Å få de samme prosjektene to ganger koster
 * ingenting: like verdier gir ingen skriving.
 */
const OVERLAPP_MS = 3 * 60 * 60 * 1000

/** Hele lista som sikkerhetsnett, for det endringskallene ikke fanger. */
const HELE_LISTA_HVER_MS = 24 * 60 * 60 * 1000

/**
 * SmartDok avviser fornying før seks måneder (182 dager). Sju gir litt
 * slakk for ulik regning av måneder, og fem måneder med nye forsøk hvert
 * kvarter før nøkkelen dør.
 */
export const FORNY_ETTER_DAGER = 212

export type Smartdokresultat =
  | {
      ok: true
      hentet: number
      nye: number
      endret: number
      fravær: number
      /** Hele lista, eller bare endringer siden forrige henting. */
      hele: boolean
      /** Advarsler som ikke stoppet hentingen. */
      merknader: string[]
    }
  | { ok: false; feil: string }

const DAG_MS = 86_400_000

export type Smartdoktilkobling = {
  /** Dagens dato, til skjemaet. Følger med dataene så komponenten slipper å lese klokka. */
  iDag: string
  nøkkel: {
    hint: string | null
    opprettet: string | null
    utloper: string | null
    dagerIgjen: number | null
    fornyesFra: string | null
  } | null
}

function pluss(dato: string, dager: number) {
  return new Date(new Date(`${dato}T00:00:00Z`).getTime() + dager * DAG_MS).toISOString().slice(0, 10)
}

export async function hentTilkobling(): Promise<Smartdoktilkobling> {
  const iDag = isoDato(Date.now())
  const { data } = await supabaseAdmin
    .from('smartdok_tilkobling')
    .select('nokkel_kryptert, hint, nokkel_opprettet, nokkel_utloper')
    .eq('id', 1)
    .maybeSingle()
  if (!data?.nokkel_kryptert) return { iDag, nøkkel: null }

  const opprettet = data.nokkel_opprettet as string | null
  const utloper = data.nokkel_utloper as string | null
  return {
    iDag,
    nøkkel: {
      hint: data.hint as string | null,
      opprettet,
      utloper,
      dagerIgjen: utloper ? dagerSiden(iDag, new Date(`${utloper}T00:00:00Z`).getTime()) : null,
      fornyesFra: opprettet ? pluss(opprettet, FORNY_ETTER_DAGER) : null,
    },
  }
}

function pause(svar: Response) {
  const sekunder = Number(svar.headers.get('retry-after'))
  // Retry-After kan også være en dato. Da, og når den mangler, holder fem sekunder.
  return Number.isFinite(sekunder) && sekunder > 0 ? sekunder * 1000 : 5000
}

async function send(sti: string, init: RequestInit) {
  try {
    return await fetch(`${ADRESSE}${sti}`, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIDSAVBRUDD_MS),
    })
  } catch (e) {
    throw new Error(`Fikk ikke kontakt med SmartDok: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function kall(sti: string, init: RequestInit): Promise<unknown> {
  let svar = await send(sti, init)
  if (svar.status === 429) {
    const vent = pause(svar)
    if (vent > MAKS_PAUSE_MS) {
      throw new Error(`SmartDok ber oss vente ${Math.round(vent / 1000)} sekunder (429). Prøves igjen neste kvarter.`)
    }
    await new Promise((ferdig) => setTimeout(ferdig, vent))
    svar = await send(sti, init)
    if (svar.status === 429) throw new Error('SmartDok ber oss vente (429). Prøves igjen neste kvarter.')
  }

  const tekst = await svar.text()
  let innhold: unknown = tekst
  try {
    innhold = JSON.parse(tekst)
  } catch {
    // Økttokenet kan komme som text/plain.
  }

  if (svar.status === 401 || svar.status === 403) {
    throw new Error(
      `SmartDok avviste nøkkelen (${svar.status}). Den kan være utløpt eller slettet, ` +
        'eller mangle tilgang til Prosjekter under API-administrasjon.',
    )
  }
  if (!svar.ok) {
    // Bare SmartDoks egne feilfelt. Hele svaret kunne i teorien gjentatt det vi sendte.
    const f = (innhold && typeof innhold === 'object' ? innhold : {}) as Record<string, unknown>
    const grunn = [f.Error, f.Message, f.Title, f.Detail].filter((v) => typeof v === 'string').join(': ')
    throw new Error(`SmartDok svarte ${svar.status}${grunn ? ` (${grunn.slice(0, 200)})` : ''}`)
  }
  return innhold
}

function somToken(innhold: unknown, hva: string): string {
  if (typeof innhold !== 'string' || innhold.trim().length < 16) {
    throw new Error(`SmartDok svarte uten ${hva}`)
  }
  return innhold.trim()
}

async function økttoken(nøkkel: string): Promise<string> {
  const svar = await kall('/Authorize/ApiToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ Token: nøkkel }),
  })
  return somToken(svar, 'økttoken')
}

/**
 * Logger inn og henter prosjekter, også avsluttede. Uten `siden` kommer hele
 * lista, som også brukes til å prøve en ny nøkkel.
 */
export async function hentProsjekterFraSmartdok(nøkkel: string, siden?: Date): Promise<Smartdoktolkning> {
  const økt = await økttoken(nøkkel)
  const hent = (filter: string) =>
    kall(`/Projects?all=true${filter}`, {
      headers: { Authorization: `Bearer ${økt}`, Accept: 'application/json' },
    })

  if (!siden) return tolkSmartdok(await hent(''))

  /*
   * Både opprettet og endret. `Updated` kan være null i SmartDoks skjema, og
   * et prosjekt som aldri er rørt etter at det ble laget, ville da ikke kommet
   * med i `updatedSince`. Etter hverandre, ikke samtidig, som SmartDok ba om.
   */
  const tidspunkt = encodeURIComponent(siden.toISOString())
  const opprettet = await hent(`&createdSince=${tidspunkt}`)
  const endret = await hent(`&updatedSince=${tidspunkt}`)
  return tolkSmartdok(opprettet, endret)
}

/** Fornyet hos SmartDok, men ikke lagret. Den eneste feilen her som ikke går over av seg selv. */
class TaptNøkkel extends Error {}

function dagerSiden(dato: string, naa: number) {
  return Math.floor((naa - new Date(`${dato}T00:00:00Z`).getTime()) / DAG_MS)
}

/**
 * Fornyer nøkkelen og lagrer den nye.
 *
 * Rekkefølgen er den farlige delen: SmartDok gjør den gamle ugyldig i samme
 * svar som gir den nye. Feiler lagringen etterpå, finnes den nye bare i minnet
 * her, og ingen kan hente den igjen. Derfor ett nytt forsøk, og en feilmelding
 * som sier hva som må gjøres, i stedet for å late som ingenting.
 */
async function forny(nøkkel: string, naa: number): Promise<string> {
  const ny = somToken(
    await kall('/Authorize/ApiToken/Renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ Token: nøkkel }),
    }),
    'ny nøkkel',
  )

  const rad = { nokkel_kryptert: krypter(ny), hint: forkort(ny), nokkel_opprettet: isoDato(naa) }
  let { error } = await supabaseAdmin.from('smartdok_tilkobling').update(rad).eq('id', 1)
  if (error) ({ error } = await supabaseAdmin.from('smartdok_tilkobling').update(rad).eq('id', 1))
  if (error) {
    await logg('smartdok.fornying_tapt', { detaljer: { feil: error.message } })
    throw new TaptNøkkel(
      `SmartDok fornyet nøkkelen, men den nye kunne ikke lagres (${error.message}). ` +
        'Den gamle virker ikke lenger: lag en ny nøkkel i SmartDok og legg den inn her.',
    )
  }

  await logg('smartdok.nokkel_fornyet', { detaljer: { hint: forkort(ny) } })
  return ny
}

/**
 * Henter fra SmartDok og fører inn i navet. Null når ingen nøkkel er lagt
 * inn: da er SmartDok ikke satt opp, og det er ikke en feil.
 */
export async function hentFraSmartdok(
  navet: (Prosjekt & { id: string })[],
): Promise<Smartdokresultat | null> {
  const { data } = await supabaseAdmin
    .from('smartdok_tilkobling')
    .select('nokkel_kryptert, nokkel_opprettet, hentet_til, sist_hele')
    .eq('id', 1)
    .maybeSingle()
  if (!data?.nokkel_kryptert) return null

  let nøkkel: string
  try {
    nøkkel = dekrypter(data.nokkel_kryptert as string)
  } catch {
    return { ok: false, feil: 'Den lagrede nøkkelen kan ikke leses. Er KRYPTONOKKEL byttet? Legg inn nøkkelen på nytt.' }
  }

  const merknader: string[] = []
  const naa = Date.now()
  const opprettet = data.nokkel_opprettet as string | null

  if (opprettet && dagerSiden(opprettet, naa) >= FORNY_ETTER_DAGER) {
    try {
      nøkkel = await forny(nøkkel, naa)
    } catch (e) {
      if (e instanceof TaptNøkkel) return { ok: false, feil: e.message }
      // Den gamle virker fortsatt, så hentingen går videre. Nytt forsøk neste kvarter.
      merknader.push(`Fornying av nøkkelen feilet, prøves igjen: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const hentetTil = data.hentet_til ? new Date(data.hentet_til as string).getTime() : null
  const sistHele = data.sist_hele ? new Date(data.sist_hele as string).getTime() : null
  const hele = hentetTil === null || sistHele === null || naa - sistHele >= HELE_LISTA_HVER_MS

  try {
    const tolkning = await hentProsjekterFraSmartdok(
      nøkkel,
      hele ? undefined : new Date((hentetTil as number) - OVERLAPP_MS),
    )
    if (tolkning.hoppetOver > 0) merknader.push(`${tolkning.hoppetOver} uten nummer eller navn ble hoppet over.`)

    const innlest = await lesInn(navet, tolkning.prosjekter)
    if (innlest.feil.length > 0) {
      merknader.push(`${innlest.feil.length} prosjekter kunne ikke oppdateres: ${innlest.feil[0]}`)
    } else {
      // Bare når alt kom inn. Ellers spør neste kjøring fra samme sted, og får dem igjen.
      const start = new Date(naa).toISOString()
      const { error } = await supabaseAdmin
        .from('smartdok_tilkobling')
        .update(hele ? { hentet_til: start, sist_hele: start } : { hentet_til: start })
        .eq('id', 1)
      if (error) merknader.push(`Kunne ikke huske hentetidspunktet, så neste kjøring henter mer enn nødvendig: ${error.message}`)
    }
    return {
      ok: true,
      hentet: tolkning.prosjekter.length,
      nye: innlest.nye,
      endret: innlest.endret,
      fravær: tolkning.fravær,
      hele,
      merknader,
    }
  } catch (e) {
    return { ok: false, feil: e instanceof Error ? e.message : String(e) }
  }
}
