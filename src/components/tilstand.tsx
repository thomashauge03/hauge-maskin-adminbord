import { Merke, type MerkeType } from '@/components/ui'
import type { Kilde, Tilstand } from '@/lib/typer'
import { visDatoTid, visSiden } from '@/lib/format'
import { slagNavn, type HentFeil } from '@/lib/plattform/hent'

/**
 * Ett sted som bestemmer hvilken farge en tilstand har.
 *
 * Ligger her og ikke i hver visning fordi «nede» må se likt ut på
 * oversikten, systemsiden og i loggen. Ser den ulik ut, begynner man å
 * lure på om det betyr noe forskjellig.
 */
const farge: Record<Tilstand, MerkeType> = {
  ok: 'grønn',
  advarsel: 'gul',
  nede: 'rød',
  ukjent: 'nøytral',
}

const ord: Record<Tilstand, string> = {
  ok: 'OK',
  advarsel: 'Se på',
  nede: 'Nede',
  // Ikke «feil»: vi vet ikke om det er feil, vi vet bare at vi ikke fikk svar.
  ukjent: 'Uvisst',
}

export function TilstandsMerke({
  tilstand,
  tekst,
}: {
  tilstand: Tilstand
  tekst?: string
}) {
  return <Merke type={farge[tilstand]}>{tekst ?? ord[tilstand]}</Merke>
}

/**
 * Alt vi vet om en feil, i én blokk.
 *
 * Slaget og statuskoden står alltid framme; den rå svarkroppen ligger bak
 * «Vis rått svar». Grunnen er at den pene meldingen av og til utelater
 * nettopp det som forklarer feilen, og alternativet da er å reprodusere
 * kallet med curl. Det skal man ikke måtte.
 */
export function Feildetalj({ feil }: { feil: HentFeil }) {
  const merker = [
    slagNavn[feil.slag],
    feil.status !== undefined ? `HTTP ${feil.status}` : null,
    feil.kode ?? null,
    feil.gjenstaaende !== undefined ? `${feil.gjenstaaende} kall igjen` : null,
    feil.nullstillesOm !== undefined ? `nullstilles om ${feil.nullstillesOm} s` : null,
  ].filter((m): m is string => Boolean(m))

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {merker.map((m) => (
          <span
            key={m}
            className="hm-kode border border-hm-red/50 bg-hm-red/10 px-1.5 py-0.5 text-[11px] text-hm-red-ink"
          >
            {m}
          </span>
        ))}
      </div>
      <p className="text-sm text-[var(--blekk-svak)]">{feil.melding}</p>
      {feil.raatt && (
        <details>
          <summary className="cursor-pointer text-xs text-[var(--blekk-svak)] underline">
            Vis rått svar
          </summary>
          <pre className="hm-kode mt-1 overflow-x-auto border border-[var(--kant)] bg-[var(--flate-2)] p-2 text-[11px] whitespace-pre-wrap">
            {feil.raatt}
          </pre>
        </details>
      )}
    </div>
  )
}

const kildeNavn: Record<Kilde, string> = {
  supabase: 'Database',
  vercel: 'Utrulling',
  nettside: 'Nettside',
}

export function visKilde(kilde: Kilde): string {
  return kildeNavn[kilde]
}

/**
 * Kilde og tilstand på én linje, slik den vises i systemkortene.
 * Teksten fra målingen står ved siden av merket, aldri i stedet for det:
 * «Pauset» alene sier ikke om det er greit.
 *
 * Er `fraLager` satt, kommer tilstanden fra en lagret måling fordi
 * live-kallet feilet. Da MÅ alderen vises. Uten den er «Pauset» en
 * påstand om nåtiden vi ikke kan stå for – og det er nettopp den
 * forskjellen mellom «vet» og «visste» som gjør et adminbord til å
 * stole på.
 */
export function Kildelinje({
  kilde,
  tilstand,
  melding,
  fraLager,
  naa,
}: {
  kilde: Kilde
  tilstand: Tilstand
  melding: string | null
  fraLager?: string | null
  naa: number
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--kant)] px-4 py-2 first:border-t-0">
      <span className="text-xs font-bold tracking-widest text-[var(--blekk-svak)] uppercase">
        {kildeNavn[kilde]}
      </span>
      <span className="flex items-center gap-2 text-right">
        {melding && (
          <span className="text-sm text-[var(--blekk-svak)]">{melding}</span>
        )}
        {fraLager && (
          <span
            className="text-xs text-[var(--blekk-svak)] italic"
            title={`Live-kallet feilet. Dette er siste lagrede måling, gjort ${visDatoTid(fraLager)}.`}
          >
            {visSiden(fraLager, naa)}
          </span>
        )}
        <TilstandsMerke tilstand={tilstand} />
      </span>
    </div>
  )
}
