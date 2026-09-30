import { Feilstripe, Kort, KortTittel, Merke } from '@/components/ui'
import { visDatoTid } from '@/lib/format'
import type { Foreldreløs } from '@/lib/appbrukarar'
import { ForeldreløsHandling } from './person-handlinger'

/**
 * Registreringer som aldri ble til en person.
 *
 * Vises bare når det finnes noen. En tom liste her ville vært en fast
 * påminnelse om en feil som nesten aldri skjer.
 */
export function Foreldreløse({
  liste,
  feil,
  erEier,
}: {
  liste: Foreldreløs[]
  feil: string | null
  erEier: boolean
}) {
  if (feil) {
    return <Feilstripe tittel="Fikk ikke sjekket om noen registreringer har hengt seg">{feil}</Feilstripe>
  }
  if (liste.length === 0) return null

  return (
    <Kort>
      <KortTittel handling={<Merke type="rød">{liste.length}</Merke>}>
        Registreringer som ikke kom fram
      </KortTittel>
      <p className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
        Disse har en innlogging, men ble aldri til en person – noe feilet underveis i
        registreringen. De kan verken godkjennes eller avvises, og ser for seg selv ut som om
        de venter. Å fjerne innloggingen gjør adressen ledig, så personen kan prøve på nytt.
      </p>
      <ul className="mt-3">
        {liste.map((f) => (
          <li
            key={f.navBrukerId}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <strong className="truncate">{f.epost}</strong>
              <div className="text-sm text-[var(--blekk-svak)]">
                registrerte seg {visDatoTid(f.registrert)}
              </div>
            </div>
            {erEier ? (
              <ForeldreløsHandling navBrukerId={f.navBrukerId} epost={f.epost} />
            ) : (
              <span className="text-xs text-[var(--blekk-svak)]">Bare eier kan endre dette</span>
            )}
          </li>
        ))}
      </ul>
    </Kort>
  )
}
