import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '@/lib/env'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Kryptering av de andre systemenes nøkler.

   Adminbordet må kunne opprette brukere i sju andre Supabase-
   prosjekter. Det krever hvert prosjekts service role-nøkkel, som
   omgår all radsikkerhet. Alternativene var:

   1. Miljøvariabler på Vercel. Trygt lagret, men et nytt system
      krever ny utrulling, og syv nøkler i miljøet er lett å blande.
   2. Klartekst i databasen. Da holder det at én SELECT lekker.
   3. Kryptert i databasen med nøkkel i miljøet – valgt.

   Med (3) må en angriper både få lesetilgang til databasen OG
   miljøvariabelen for å komme videre. En databasedump alene er verdiløs.

   AES-256-GCM framfor CBC fordi GCM autentiserer: endrer noen en byte
   i basen, feiler dekrypteringen i stedet for å gi ut søppel som
   deretter sendes til Supabase som en nøkkel.
   ═══════════════════════════════════════════════════════════ */

const ALGORITME = 'aes-256-gcm'

/** GCM er spesifisert for 96-bits nonce. Lengre gir ekstra hashing uten gevinst. */
const IV_LENGDE = 12

const nøkkel = Buffer.from(env.KRYPTONOKKEL, 'base64')

/**
 * Krypterer en hemmelighet for lagring.
 *
 * Formatet er `v1.<iv>.<autentiseringsmerke>.<chiffertekst>`, alt
 * base64url. Versjonsprefikset står der for at en framtidig
 * nøkkelrotasjon skal kunne lese gamle rader mens den skriver nye –
 * uten det måtte alle nøkler legges inn på nytt manuelt.
 */
export function krypter(klartekst: string): string {
  const iv = randomBytes(IV_LENGDE)
  const chiffer = createCipheriv(ALGORITME, nøkkel, iv)

  const kryptert = Buffer.concat([
    chiffer.update(klartekst, 'utf8'),
    chiffer.final(),
  ])

  return [
    'v1',
    iv.toString('base64url'),
    chiffer.getAuthTag().toString('base64url'),
    kryptert.toString('base64url'),
  ].join('.')
}

/**
 * Dekrypterer en lagret hemmelighet.
 *
 * Kaster ved feil format eller feil autentiseringsmerke. Kallstedet
 * skal fange dette og vise «nøkkelen kan ikke leses» i grensesnittet:
 * den vanligste årsaken er at KRYPTONOKKEL er byttet, og da hjelper
 * det brukeren mer å få vite det enn å se et 500-svar.
 */
export function dekrypter(lagret: string): string {
  const deler = lagret.split('.')
  if (deler.length !== 4 || deler[0] !== 'v1') {
    throw new Error('Ukjent format på kryptert verdi')
  }

  const [, iv, merke, chiffertekst] = deler
  const dechiffer = createDecipheriv(
    ALGORITME,
    nøkkel,
    Buffer.from(iv, 'base64url'),
  )
  dechiffer.setAuthTag(Buffer.from(merke, 'base64url'))

  return Buffer.concat([
    dechiffer.update(Buffer.from(chiffertekst, 'base64url')),
    dechiffer.final(),
  ]).toString('utf8')
}

/**
 * Kort visning av en hemmelighet: nok til å kjenne igjen hvilken nøkkel
 * det er, for lite til å bruke den. Grensesnittet skal aldri vise en
 * hel nøkkel igjen etter at den er lagret – da ville en skulderkikk
 * eller en skjermdeling gitt bort alt.
 */
export function forkort(hemmelighet: string): string {
  if (hemmelighet.length <= 12) return '••••'
  return `${hemmelighet.slice(0, 6)}…${hemmelighet.slice(-4)}`
}
