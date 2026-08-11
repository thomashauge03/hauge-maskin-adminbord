import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Felles HTTP-henting mot plattform-API-ene.

   Adminbordet spør sju systemer hos to leverandører hver gang
   forsiden lastes. Da er det ikke feilene som er problemet, men
   ventingen: et API som henger i 30 sekunder gjør hele siden ubrukelig
   selv om alt annet svarer. Derfor har alt her en hard tidsfrist, og
   en feil er en verdi som kan vises – ikke et unntak som tar ned siden.
   ═══════════════════════════════════════════════════════════ */

/** Åtte sekunder. Lenge nok for et kaldt API-kall, kort nok til at
    forsiden fortsatt kjennes levende når én kilde er nede. */
export const TIDSFRIST_MS = 8000

export type HentFeil = {
  slag: 'nettverk' | 'tidsavbrudd' | 'ratebegrenset' | 'avvist' | 'ugyldig_svar'
  status?: number
  melding: string
}

export type HentResultat<T> =
  | { ok: true; data: T; svartidMs: number }
  | { ok: false; feil: HentFeil; svartidMs: number }

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

    if (svar.status === 429) {
      return {
        ok: false,
        svartidMs,
        feil: {
          slag: 'ratebegrenset',
          status: 429,
          melding: 'API-et ratebegrenser oss. Prøv igjen om litt.',
        },
      }
    }

    if (!svar.ok) {
      // Feilteksten fra leverandøren tas med når den finnes: «missing
      // teamId» er langt mer nyttig enn «403».
      const tekst = await svar.text().catch(() => '')
      return {
        ok: false,
        svartidMs,
        feil: {
          slag: 'avvist',
          status: svar.status,
          melding: kortFeil(svar.status, tekst),
        },
      }
    }

    return { ok: true, data: (await svar.json()) as T, svartidMs }
  } catch (uventet) {
    const svartidMs = Date.now() - start

    // AbortSignal.timeout kaster TimeoutError, ikke AbortError.
    const erTidsavbrudd =
      uventet instanceof Error &&
      (uventet.name === 'TimeoutError' || uventet.name === 'AbortError')

    return {
      ok: false,
      svartidMs,
      feil: erTidsavbrudd
        ? {
            slag: 'tidsavbrudd',
            melding: `Svarte ikke innen ${Math.round(tidsfristMs / 1000)} sekunder.`,
          }
        : {
            slag: 'nettverk',
            melding:
              uventet instanceof Error ? uventet.message : 'Ukjent nettverksfeil',
          },
    }
  }
}

/**
 * Kort, lesbar feilmelding. API-ene svarer med JSON-objekter av
 * varierende form, og en rå JSON-blokk i grensesnittet hjelper ingen.
 */
function kortFeil(status: number, tekst: string): string {
  const fast: Record<number, string> = {
    401: 'Tokenet ble avvist. Er det utløpt?',
    403: 'Tokenet mangler tilgang til denne ressursen.',
    404: 'Finnes ikke. Er ID-en riktig?',
  }
  if (fast[status]) return fast[status]

  try {
    const json = JSON.parse(tekst) as { error?: { message?: string }; message?: string }
    const melding = json.error?.message ?? json.message
    if (melding) return `${status}: ${melding}`
  } catch {
    // Ikke JSON. Da er statuskoden alt vi har.
  }
  return `Uventet svar (${status}).`
}
