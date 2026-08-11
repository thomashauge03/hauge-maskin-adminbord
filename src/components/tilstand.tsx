import { Merke, type MerkeType } from '@/components/ui'
import type { Kilde, Tilstand } from '@/lib/typer'

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
 */
export function Kildelinje({
  kilde,
  tilstand,
  melding,
}: {
  kilde: Kilde
  tilstand: Tilstand
  melding: string | null
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
        <TilstandsMerke tilstand={tilstand} />
      </span>
    </div>
  )
}
