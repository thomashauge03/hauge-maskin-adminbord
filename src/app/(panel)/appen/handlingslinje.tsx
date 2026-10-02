'use client'

import { useActionState, useState } from 'react'
import { KNAPP_FARLIG, KNAPP_LITEN, KNAPP_PRIMÆR, VELGER } from '@/components/ui'
import { godkjennMange, settGruppeForMange, stengUteMange } from './mange-actions'
import type { Tilstand } from './tilstand'

function Idene({ valgte }: { valgte: string[] }) {
  return (
    <>
      {valgte.map((id) => (
        <input key={id} type="hidden" name="id" value={id} />
      ))}
    </>
  )
}

/**
 * Linja nederst når noen er valgt. Boksen rundt, som fester seg til
 * nederkanten, står i Brukerliste: svaret fra handlingen ligger i den samme
 * boksen, rett over linja.
 *
 * Svaret går til lista over (`ferdig`), ikke hit: går handlingen bra, tømmes
 * utvalget, og da forsvinner denne linja – med meldingen, om den stod her.
 */
export function Handlingslinje({
  valgte,
  skjulte,
  grupper,
  ferdig,
}: {
  valgte: string[]
  skjulte: number
  grupper: { id: string; navn: string }[]
  ferdig: (svar: Tilstand) => void
}) {
  const [gruppeVedGodkjenning, settGruppeVedGodkjenning] = useState('')
  const [gruppe, settGruppe] = useState(grupper[0]?.id ?? '')
  const [bekreftStenging, settBekreftStenging] = useState(false)
  const [flere, settFlere] = useState(false)

  // Under md står bare godkjenningen framme, resten bak «Flere valg». På
  // telefon tok linja ellers fem rader, rundt 40 % av skjermen, og dekket
  // lista man valgte fra.
  const ekstra = flere ? 'flex' : 'hidden md:flex'

  const kjør =
    (handling: (forrige: Tilstand, data: FormData) => Promise<Tilstand>) =>
    async (forrige: Tilstand, data: FormData) => {
      const svar = await handling(forrige, data)
      ferdig(svar)
      return svar
    }

  const [, godkjenn, godkjenner] = useActionState(kjør(godkjennMange), {})
  const [, leggInn, leggerInn] = useActionState(kjør(settGruppeForMange.bind(null, true)), {})
  const [, taUt, tarUt] = useActionState(kjør(settGruppeForMange.bind(null, false)), {})
  const [, steng, stenger] = useActionState(kjør(stengUteMange), {})
  const opptatt = godkjenner || leggerInn || tarUt || stenger

  return (
    <div className="border-2 border-[var(--kant-sterk)] bg-[var(--flate-opp)] px-4 py-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* På telefon står antallet og «Fjern valget» på første linje. Fra md
            løser boksen seg opp (contents), og knappen går sist, som før. */}
        <div className="flex w-full items-center justify-between gap-3 md:contents">
          <strong className="text-sm">
            {valgte.length} valgt{skjulte > 0 ? ` (${skjulte} skjult av søket)` : ''}
          </strong>
          <button
            type="button"
            onClick={() => ferdig({})}
            className={`${KNAPP_LITEN} md:order-last`}
          >
            Fjern valget
          </button>
        </div>

        {/* Begge gruppevelgerne står utenfor skjemaene, og verdien reiser med i et
            skjult felt. React tilbakestiller et skjema etter hver handling, og en
            kontrollert select inni det faller da tilbake til første valg i DOM-en
            mens tilstanden husker gruppa – et nytt forsøk etter en feil ville
            sendt «ingen gruppe». Skjulte felt tegnes på nytt fra tilstanden. */}
        <div className="flex flex-wrap items-center gap-2">
          <form action={godkjenn}>
            <Idene valgte={valgte} />
            <input type="hidden" name="gruppe" value={gruppeVedGodkjenning} />
            <button type="submit" disabled={opptatt} className={KNAPP_PRIMÆR}>
              {godkjenner ? 'Godkjenner …' : 'Godkjenn'}
            </button>
          </form>
          <span className="text-sm">og legg i</span>
          <select
            value={gruppeVedGodkjenning}
            onChange={(e) => settGruppeVedGodkjenning(e.target.value)}
            aria-label="Gruppe ved godkjenning"
            className={VELGER}
          >
            <option value="">ingen gruppe</option>
            {grupper.map((g) => (
              <option key={g.id} value={g.id}>
                {g.navn}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => settFlere((f) => !f)}
          aria-expanded={flere}
          className={`${KNAPP_LITEN} md:hidden`}
        >
          {flere ? 'Færre valg' : 'Flere valg'}
        </button>

        {grupper.length > 0 && (
          <div className={`${ekstra} flex-wrap items-center gap-2`}>
            <select
              value={gruppe}
              onChange={(e) => settGruppe(e.target.value)}
              aria-label="Gruppe"
              className={VELGER}
            >
              {grupper.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.navn}
                </option>
              ))}
            </select>
            <form action={leggInn}>
              <Idene valgte={valgte} />
              <input type="hidden" name="gruppe" value={gruppe} />
              <button type="submit" disabled={opptatt} className={KNAPP_LITEN}>
                {leggerInn ? '…' : 'Legg i gruppe'}
              </button>
            </form>
            <form action={taUt}>
              <Idene valgte={valgte} />
              <input type="hidden" name="gruppe" value={gruppe} />
              <button type="submit" disabled={opptatt} className={KNAPP_LITEN}>
                {tarUt ? '…' : 'Ta ut av gruppe'}
              </button>
            </form>
          </div>
        )}

        <div className={`${ekstra} flex-wrap items-center gap-2`}>
          {bekreftStenging ? (
            <form action={steng} className="flex flex-wrap items-center gap-2">
              <Idene valgte={valgte} />
              <span className="text-sm">Stenge ute {valgte.length}?</span>
              <button type="submit" disabled={opptatt} className={KNAPP_FARLIG}>
                {stenger ? 'Stenger …' : 'Ja, steng ute'}
              </button>
              <button type="button" onClick={() => settBekreftStenging(false)} className={KNAPP_LITEN}>
                Avbryt
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => settBekreftStenging(true)}
              disabled={opptatt}
              className={KNAPP_FARLIG}
            >
              Steng ute
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
