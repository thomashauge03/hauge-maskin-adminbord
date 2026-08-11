import Link from 'next/link'

/* ═══════════════════════════════════════════════════════════
   Delte byggeklosser. Ett sted å endre, så følger hele appen
   etter – i stedet for at klasserekker driver fra hverandre.

   Målene er strammere enn i utleieappen: adminbordet brukes med
   mus ved et skrivebord, og skal få mange systemer på skjermen
   samtidig. 44 px i stedet for 56.
   ═══════════════════════════════════════════════════════════ */

export const KNAPP_PRIMÆR =
  'hm-trykk hm-kant-skygge-sm inline-flex min-h-[2.75rem] items-center justify-center gap-2 border-2 border-[var(--kant-sterk)] bg-hm-red px-5 text-sm font-bold tracking-wide text-white uppercase hover:bg-hm-red-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-hm-red'

export const KNAPP_SEKUNDÆR =
  'hm-trykk inline-flex min-h-[2.75rem] items-center justify-center gap-2 border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-4 text-sm font-semibold hover:border-[var(--kant-sterk)] disabled:opacity-50'

export const KNAPP_LITEN =
  'hm-trykk inline-flex min-h-[2.25rem] items-center justify-center gap-1.5 border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-3 text-xs font-semibold hover:border-[var(--kant-sterk)] disabled:opacity-50'

/** Farlige handlinger ser farlige ut. Rød kant, ikke rød flate – en
    full rød flate ville konkurrert med primærknappen om blikket. */
export const KNAPP_FARLIG =
  'hm-trykk inline-flex min-h-[2.25rem] items-center justify-center gap-1.5 border-2 border-hm-red bg-transparent px-3 text-xs font-bold tracking-wide text-hm-red-ink uppercase hover:bg-hm-red hover:text-white disabled:opacity-50'

/** 16 px hindrer at iOS zoomer inn når feltet får fokus. */
export const FELT =
  'w-full border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-3 py-2.5 text-base text-[var(--blekk)] outline-none transition-colors placeholder:text-[var(--blekk-svak)] focus:border-hm-red'

/** Nøkler og prosjekt-ID-er limes inn og leses tegn for tegn. */
export const FELT_KODE = `${FELT} hm-kode`

export const ETIKETT =
  'mb-1.5 block text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase'

export function Kort({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`border-2 border-[var(--kant)] bg-[var(--flate-opp)] ${className}`}
    >
      {children}
    </section>
  )
}

export function KortTittel({
  children,
  handling,
}: {
  children: React.ReactNode
  handling?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--kant)] px-4 py-2.5">
      <h2 className="hm-display text-base">{children}</h2>
      {handling}
    </div>
  )
}

export type MerkeType = 'nøytral' | 'grønn' | 'rød' | 'gul' | 'svart'

const merkeStil: Record<MerkeType, string> = {
  nøytral: 'border-[var(--kant)] bg-[var(--flate-2)] text-[var(--blekk-svak)]',
  grønn: 'border-hm-green bg-hm-green text-white',
  rød: 'border-hm-red bg-hm-red text-white',
  gul: 'border-hm-amber bg-hm-amber text-white',
  svart: 'border-[var(--kant-sterk)] bg-hm-black text-white',
}

/**
 * Status vises alltid med tekst, aldri farge alene – ellers går
 * informasjonen tapt for de som ikke skiller rødt fra grønt. Det er
 * hele poenget med et adminbord: du skal se svaret, ikke tolke en prikk.
 */
export function Merke({
  type = 'nøytral',
  children,
}: {
  type?: MerkeType
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center border-2 px-2 py-0.5 text-[11px] font-bold tracking-wider whitespace-nowrap uppercase ${merkeStil[type]}`}
    >
      {children}
    </span>
  )
}

/** Seksjonstittel med den skrå røde streken fra logoen. */
export function Seksjonstittel({
  children,
  under,
  handling,
}: {
  children: React.ReactNode
  under?: React.ReactNode
  handling?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="hm-skrastrek mb-3" aria-hidden="true" />
        <h1 className="hm-display text-3xl">{children}</h1>
        {under && (
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--blekk-svak)]">
            {under}
          </p>
        )}
      </div>
      {handling}
    </div>
  )
}

export function TomTilstand({
  tittel,
  children,
  handling,
}: {
  tittel: string
  children: React.ReactNode
  handling?: { href: string; tekst: string }
}) {
  return (
    <div className="border-2 border-dashed border-[var(--kant)] px-6 py-14 text-center">
      <p className="hm-display text-xl">{tittel}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--blekk-svak)]">
        {children}
      </p>
      {handling && (
        <Link href={handling.href} className={`${KNAPP_SEKUNDÆR} mt-5`}>
          {handling.tekst}
        </Link>
      )}
    </div>
  )
}

/**
 * Feilmelding på plass i grensesnittet, ikke som en varsling som
 * forsvinner. Når en integrasjon er nede skal det stå der til det er
 * rettet, ellers blir det oppdaget først når noe annet ryker.
 */
export function Feilstripe({
  tittel,
  children,
}: {
  tittel: string
  children?: React.ReactNode
}) {
  return (
    <div className="border-2 border-hm-red bg-[var(--flate-opp)]">
      <div className="hm-varselstriper h-1.5" aria-hidden="true" />
      <div className="px-4 py-3">
        <p className="text-sm font-bold text-hm-red-ink">{tittel}</p>
        {children && (
          <div className="mt-1 text-sm text-[var(--blekk-svak)]">{children}</div>
        )}
      </div>
    </div>
  )
}

/**
 * Nøkkeltall. Verdien er stor og tallet står først, fordi det er det
 * eneste man ser etter når man skummer forbi.
 */
export function Tallkort({
  merkelapp,
  verdi,
  under,
}: {
  merkelapp: string
  verdi: React.ReactNode
  under?: React.ReactNode
}) {
  return (
    <div className="border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-4 py-3">
      <p className={ETIKETT}>{merkelapp}</p>
      <p className="hm-display hm-tall text-3xl">{verdi}</p>
      {under && (
        <p className="mt-0.5 text-xs text-[var(--blekk-svak)]">{under}</p>
      )}
    </div>
  )
}

/** Verdi som skal kunne kopieres ut, typisk en prosjekt-ID eller URL. */
export function Kodebit({ children }: { children: React.ReactNode }) {
  return (
    <code className="hm-kode border border-[var(--kant)] bg-[var(--flate-2)] px-1.5 py-0.5 break-all">
      {children}
    </code>
  )
}
