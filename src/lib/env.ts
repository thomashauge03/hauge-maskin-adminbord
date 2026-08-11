import { z } from 'zod'
import 'server-only'

/**
 * Miljøvariabler valideres ved oppstart i stedet for å feile med
 * "undefined is not a string" et tilfeldig sted midt i en forespørsel.
 *
 * Skillet mellom påkrevd og valgfri er bevisst: adminbordet skal kunne
 * startes med bare sin egen database, og så få plattformtokenene lagt
 * inn etterpå. Var VERCEL_TOKEN påkrevd, ville en manglende variabel
 * tatt ned hele adminbordet – inkludert siden som forklarer hva som
 * mangler. Integrasjoner uten token melder seg i stedet som
 * «ikke satt opp» i grensesnittet.
 */
const skjema = z.object({
  // ── Adminbordets egen database ────────────────────────────
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),

  /*
   * Nøkkel som krypterer de andre systemenes service role-nøkler før
   * de lagres. 32 byte, base64. Mistes den, er alle lagrede nøkler
   * uleselige og må legges inn på nytt – det er en irriterende, men
   * trygg feiltilstand. Byttes den, må nøklene rekrypteres.
   */
  KRYPTONOKKEL: z
    .string()
    .min(1)
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message:
        'må være 32 byte kodet som base64 – lag en med: openssl rand -base64 32',
    }),

  // ── Plattformtokens, valgfrie ─────────────────────────────
  /** Personal access token fra supabase.com/dashboard/account/tokens. */
  SUPABASE_MANAGEMENT_TOKEN: z.string().min(1).optional(),
  /** Personal access token fra vercel.com/account/tokens. */
  VERCEL_TOKEN: z.string().min(1).optional(),
  /** Alle prosjektene ligger under et team, så teamId må følge hvert kall. */
  VERCEL_TEAM_ID: z.string().min(1).optional(),

  /*
   * Vercel setter denne selv og sender den som Bearer-token til
   * cron-ruter. Uten den ville /api/status/oppdater vært en åpen
   * endepunkt som hvem som helst kunne trigge sju API-kall med.
   */
  CRON_SECRET: z.string().min(1).optional(),
})

const resultat = skjema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  KRYPTONOKKEL: process.env.KRYPTONOKKEL,
  SUPABASE_MANAGEMENT_TOKEN: process.env.SUPABASE_MANAGEMENT_TOKEN,
  VERCEL_TOKEN: process.env.VERCEL_TOKEN,
  VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID,
  CRON_SECRET: process.env.CRON_SECRET,
})

if (!resultat.success) {
  const mangler = resultat.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('\n  ')
  throw new Error(
    `Manglende eller ugyldige miljøvariabler:\n  ${mangler}\n\n` +
      `Kopier .env.local.example til .env.local og fyll inn verdiene.`,
  )
}

export const env = resultat.data
