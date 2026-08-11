import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Felles HTTP-henting mot plattform-API-ene.

   Adminbordet spør flere systemer hos to leverandører hver gang forsiden
   lastes. Da er det ikke feilene som er problemet, men ventingen: et API
   som henger i 30 sekunder gjør hele siden ubrukelig selv om alt annet
   svarer. Derfor har alt her en hard tidsfrist, og en feil er en verdi
   som kan vises – ikke et unntak som tar ned siden.

   ALT som kan hjelpe en feilsøking blir tatt vare på: HTTP-statusen,
   leverandørens egen feilkode, ratebegrensningshodene og svartiden. Det
   koster ingenting å bære med seg, og forskjellen på «virker ikke» og
   «429, 12 forsøk igjen, nullstilles 14:32» er forskjellen på å gjette og
   å vite.
   ═══════════════════════════════════════════════════════════ */

/** Åtte sekunder. Lenge nok for et kaldt API-kall, kort nok til at
    forsiden fortsatt kjennes levende når én kilde er nede. */
export const TIDSFRIST_MS = 8000

export type FeilSlag =
  | 'nettverk'
  | 'tidsavbrudd'
  | 'ratebegrenset'
  | 'avvist'
  | 'ugyldig_svar'

export type HentFeil = {
  slag: FeilSlag
  /** HTTP-statuskoden, når vi fikk et svar i det hele tatt. */
  status?: number
  /** Kort, lesbar melding. Inneholder statuskoden. */
  melding: string
  /** Leverandørens egen feilkode, f.eks. `rate_limit_exceeded`. */
  kode?: string
  /**
   * Rå svarkropp, avkortet.
   *
   * Vises bare bak «Vis detaljer» i grensesnittet. Finnes fordi den
   * pene meldingen av og til utelater nettopp det som forklarer feilen,
   * og da er alternativet å reprodusere kallet med curl.
   */
  raatt?: string
  /** Ratebegrensning, når leverandøren oppgir den. */
  gjenstaaende?: number
  nullstillesOm?: number
}

export type HentResultat<T> =
  | { ok: true; data: T; svartidMs: number; gjenstaaende?: number }
  | { ok: false; feil: HentFeil; svartidMs: number }

/** Navnet på et feilslag, til visning. */
export const slagNavn: Record<FeilSlag, string> = {
  nettverk: 'Nettverksfeil',
  tidsavbrudd: 'Tidsavbrudd',
  ratebegrenset: 'Ratebegrenset',
  avvist: 'Avvist',
  ugyldig_svar: 'Ugyldig svar',
}

/**
 * Henter JSON og gir alltid et resultat tilbake, aldri et kast.
 *
 * Kallstedene skal kunne skrive `if (!svar.ok) return maaling('ukjent',
 * svar.feil.melding)` uten try/catch rundt alt. Med kast måtte hver
 * statuskilde hatt sin egen feilhåndtering, og den ene som glemte det
 * ville tatt ned oversikten for alle de andre.
 */
export async function hentJson<T>(
  url: string,
  init: RequestInit & { token: string; tidsfristMs?: number },
): Promise<HentResultat<T>> {
  const { token, tidsfristMs = TIDSFRIST_MS, headers, ...resten } = init
  const start = Date.now()

  try {
    const svar = await fetch(url, {
      ...resten,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...headers,
      },
      /*
       * Uten no-store ville Next bakt svaret inn ved bygg på en side
       * som ellers kunne forhåndsrendres, og adminbordet ville vist
       * driftsstatus fra det øyeblikket koden ble rullet ut. Det er
       * verre enn ingen status: den ser riktig ut.
       */
      cache: 'no-store',
      signal: AbortSignal.timeout(tidsfristMs),
    })

    const svartidMs = Date.now() - start
    const rate = lesRatehoder(svar.headers)

    if (svar.status === 429) {
      const tekst = await svar.text().catch(() => '')
      const { kode } = lesFeilKropp(tekst)
      return {
        ok: false,
        svartidMs,
        feil: {
          slag: 'ratebegrenset',
          status: 429,
          kode,
          raatt: kort(tekst),
          ...rate,
          melding:
            `429 ratebegrenset` +
            (rate.nullstillesOm !== undefined
              ? ` – prøv igjen om ${rate.nullstillesOm} s`
              : ' – prøv igjen om litt') +
            (kode ? ` (${kode})` : ''),
        },
      }
    }

    if (!svar.ok) {
      const tekst = await svar.text().catch(() => '')
      const { kode, melding } = lesFeilKropp(tekst)
      return {
        ok: false,
        svartidMs,
        feil: {
          slag: 'avvist',
          status: svar.status,
          kode,
          raatt: kort(tekst),
          ...rate,
          melding: byggMelding(svar.status, kode, melding),
        },
      }
    }

    // Et 2xx-svar med uleselig kropp er en egen feil, ikke en tom liste.
    // Å returnere [] her ville vist «ingen prosjekter» når sannheten er
    // «vi forstod ikke svaret».
    const tekst = await svar.text()
    try {
      return {
        ok: true,
        data: JSON.parse(tekst) as T,
        svartidMs,
        gjenstaaende: rate.gjenstaaende,
      }
    } catch {
      return {
        ok: false,
        svartidMs,
        feil: {
          slag: 'ugyldig_svar',
          status: svar.status,
          raatt: kort(tekst),
          melding: `${svar.status}, men svaret var ikke gyldig JSON`,
        },
      }
    }
  } catch (uventet) {
    const svartidMs = Date.now() - start

    // AbortSignal.timeout kaster TimeoutError, ikke AbortError.
    const erTidsavbrudd =
      uventet instanceof Error &&
      (uventet.name === 'TimeoutError' || uventet.name === 'AbortError')

    if (erTidsavbrudd) {
      return {
        ok: false,
        svartidMs,
        feil: {
          slag: 'tidsavbrudd',
          melding: `Svarte ikke innen ${Math.round(tidsfristMs / 1000)} s`,
        },
      }
    }

    /*
     * Node legger den virkelige årsaken i `cause`, ikke i `message`.
     * Den ytre meldingen er ofte bare «fetch failed», som ikke skiller
     * en DNS-feil fra et avvist sertifikat.
     */
    const feil = uventet as Error & { cause?: { code?: string; message?: string } }
    const kode = feil.cause?.code
    return {
      ok: false,
      svartidMs,
      feil: {
        slag: 'nettverk',
        kode,
        melding: [feil.message, feil.cause?.message, kode]
          .filter(Boolean)
          .join(' · ') || 'Ukjent nettverksfeil',
      },
    }
  }
}

/**
 * Ratebegrensningshodene, når de finnes.
 *
 * Supabase sender X-RateLimit-*; Vercel gjør det etter alt å dømme også,
 * men hodenavnene er ikke dokumentert der. Vi leser dem defensivt –
 * mangler de, blir feltene bare stående tomme.
 */
function lesRatehoder(h: Headers): {
  gjenstaaende?: number
  nullstillesOm?: number
} {
  const ut: { gjenstaaende?: number; nullstillesOm?: number } = {}

  const rest = h.get('x-ratelimit-remaining') ?? h.get('ratelimit-remaining')
  if (rest !== null && rest !== '' && !Number.isNaN(Number(rest))) {
    ut.gjenstaaende = Number(rest)
  }

  const nullstill = h.get('x-ratelimit-reset') ?? h.get('retry-after')
  if (nullstill !== null && nullstill !== '' && !Number.isNaN(Number(nullstill))) {
    const n = Number(nullstill)
    // Verdien er noen ganger sekunder til nullstilling, andre ganger et
    // absolutt tidsstempel. Over en milliard er det åpenbart det siste.
    ut.nullstillesOm = n > 1_000_000_000 ? Math.max(0, Math.round(n - Date.now() / 1000)) : n
  }

  return ut
}

/** Plukker kode og melding ut av en feilkropp, uansett hvilken form den har. */
function lesFeilKropp(tekst: string): { kode?: string; melding?: string } {
  if (!tekst.trim().startsWith('{')) return {}
  try {
    const j = JSON.parse(tekst) as {
      error?: string | { message?: string; code?: string }
      error_code?: string
      code?: string | number
      message?: string
      msg?: string
      hint?: string
    }
    const kode =
      j.error_code ??
      (typeof j.code === 'string' ? j.code : undefined) ??
      (typeof j.error === 'object' ? j.error?.code : undefined)
    const melding =
      j.message ??
      j.msg ??
      (typeof j.error === 'string' ? j.error : j.error?.message) ??
      j.hint
    return { kode, melding }
  } catch {
    return {}
  }
}

/**
 * Kort, lesbar melding som ALLTID inneholder statuskoden.
 *
 * Tidligere byttet denne ut kjente statuser med en vennlig setning og
 * kastet koden. Det gjorde meldingen finere å lese og verre å feilsøke –
 * «Tokenet ble avvist» sier ikke om det var 401 eller 403, og de to har
 * ulik årsak. Nå står begge.
 */
function byggMelding(status: number, kode?: string, melding?: string): string {
  const hint: Record<number, string> = {
    400: 'ugyldig forespørsel',
    401: 'tokenet ble avvist – utløpt?',
    403: 'tokenet mangler tilgang til denne ressursen',
    404: 'finnes ikke – er ID-en riktig?',
    409: 'konflikt',
    422: 'kunne ikke behandles',
    500: 'feil hos leverandøren',
    502: 'leverandøren svarte ikke',
    503: 'tjenesten er utilgjengelig',
    504: 'leverandøren fikk tidsavbrudd',
  }

  const deler = [`${status}`]
  if (hint[status]) deler.push(hint[status])
  if (melding && melding !== hint[status]) deler.push(melding)
  if (kode) deler.push(`(${kode})`)
  return deler.join(' ')
}

/** Rå kropp, avkortet. Nok til å forstå, ikke nok til å fylle en side. */
function kort(tekst: string, maks = 400): string | undefined {
  const t = tekst.trim()
  if (!t) return undefined
  return t.length > maks ? `${t.slice(0, maks)}…` : t
}
