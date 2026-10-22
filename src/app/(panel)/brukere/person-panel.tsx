'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import {
  FELT,
  FELT_KODE,
  KNAPP_FARLIG,
  KNAPP_LITEN,
  KNAPP_PRIMÆR,
  Merke,
  Snurr,
} from '@/components/ui'
import { visSiden } from '@/lib/format'
import { startrolle } from '@/lib/rollefunn'
import { tilgangsmerke } from '@/lib/tilgangsmerke'
import { settPassordISystem, settSperret, slettBrukerISystem } from './actions'
import { giTilgangTilSystem, taBortTilgangFraSystem, type CelleTilstand } from './tilgang-actions'
import type { CelleVisning, PersonVisning, SystemVisning } from './visning'

type Handling = (forrige: CelleTilstand, data: FormData) => Promise<CelleTilstand>

/**
 * Alt om én person, i alle systemene, på ett sted.
 *
 * Erstatter to ting som lå langt fra hverandre: en celle i matrisen som
 * utvidet seg til et skjema midt i tabellen, og et kort per system nederst på
 * siden med passord, sperring og sletting. For å fjerne en person helt måtte
 * man altså fram og tilbake mellom dem, og cellen dyttet hele tabellen ut av
 * stilling når den åpnet seg.
 *
 * Panelet lukkes ikke når en handling er ferdig. Serveren henter lista på nytt,
 * og panelet viser den nye tilstanden – det er bekreftelsen på at det virket.
 */
export function PersonPanel({
  person,
  systemer,
  erEier,
  naa,
  fokusSystem,
  lukk,
}: {
  person: PersonVisning
  systemer: SystemVisning[]
  erEier: boolean
  naa: number
  fokusSystem: string | null
  lukk: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (!d.open) d.showModal()
    if (fokusSystem) {
      d.querySelector(`[data-system="${fokusSystem}"]`)?.scrollIntoView({ block: 'center' })
    }
  }, [fokusSystem])

  return (
    <dialog
      ref={dialog}
      onClose={lukk}
      // Trykk på mørket rundt lukker, som man venter av et panel. Trykk inni
      // treffer et barn, aldri selve dialogen.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
      aria-labelledby="personpanel-tittel"
      className="hm-panel m-0 h-dvh max-h-none w-full max-w-none bg-[var(--flate-opp)] p-0 text-[var(--blekk)] md:m-auto md:h-auto md:max-h-[90vh] md:w-[44rem] md:border-2 md:border-[var(--kant-sterk)]"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b-2 border-[var(--kant)] bg-[var(--flate-opp)] px-4 py-3">
        <div className="min-w-0">
          <h2 id="personpanel-tittel" className="hm-display text-lg break-all">
            {person.epost}
          </h2>
          <p className="text-xs text-[var(--blekk-svak)]">
            Tilgang i {person.antallMedTilgang} av {systemer.length} systemer
            {person.sistInnlogget ? ` · sist inne ${visSiden(person.sistInnlogget, naa)}` : ''}
          </p>
        </div>
        <button type="button" onClick={() => dialog.current?.close()} className={KNAPP_LITEN}>
          Lukk
        </button>
      </div>

      <ul>
        {systemer.map((s) => (
          <SystemRad
            key={s.id}
            epost={person.epost}
            system={s}
            celle={person.celler[s.id]}
            erEier={erEier}
            naa={naa}
          />
        ))}
      </ul>
    </dialog>
  )
}

function SystemRad({
  epost,
  system,
  celle,
  erEier,
  naa,
}: {
  epost: string
  system: SystemVisning
  celle: CelleVisning | undefined
  erEier: boolean
  naa: number
}) {
  const merke =
    celle?.merke ??
    tilgangsmerke(undefined, { systemNavn: system.navn, harOppsett: true })

  /* Siste handling som svarte, eier meldingen. Raden har fem knapper, og fem
     meldinger ved siden av hverandre er ingen melding. */
  const [melding, settMelding] = useState<CelleTilstand | null>(null)
  const [bekreft, settBekreft] = useState<'fjern' | 'slett' | null>(null)
  const [passordÅpent, settPassordÅpent] = useState(false)

  const kjør = (handling: Handling) => async (forrige: CelleTilstand, data: FormData) => {
    const svar = await handling(forrige, data)
    settMelding(svar)
    if (svar.ok) {
      settBekreft(null)
      settPassordÅpent(false)
    }
    return svar
  }

  const [, gi, gir] = useActionState(kjør(giTilgangTilSystem), {})
  const [, fjern, fjerner] = useActionState(kjør(taBortTilgangFraSystem), {})
  const [, sperr, sperrer] = useActionState(kjør(settSperret), {})
  const [, slett, sletter] = useActionState(kjør(slettBrukerISystem), {})
  const [, passord, setterPassord] = useActionState(kjør(settPassordISystem), {})
  const opptatt = gir || fjerner || sperrer || sletter || setterPassord

  const nåværende = celle?.rolle ?? null
  const [valgt, settValgt] = useState(() => startrolle(system.roller, nåværende) ?? '')

  // Personens egen rolle står i listen også når systemet ikke lenger har den.
  // Ellers ville listen vist en annen rolle enn den personen faktisk har.
  const valg = [
    ...system.roller,
    ...(nåværende && !system.roller.some((r) => r.verdi === nåværende)
      ? [{ verdi: nåværende, etikett: nåværende, beskrivelse: 'Rollen personen har nå. Systemet oppgir den ikke lenger som gyldig.', ny: false, erStandard: false, iBruk: null }]
      : []),
  ]
  const valgtRolle = valg.find((r) => r.verdi === valgt)

  const harTilgang = celle?.harTilgang ?? false
  const deaktivert = celle?.deaktivert ?? false
  const uendret = harTilgang && !deaktivert && valgt === (nåværende ?? '')
  const kanEndreTilgang = system.skrivbarVei !== null && !celle?.annenKundesKonto
  const kanEndreKonto = Boolean(celle?.harKonto && celle.authId && !celle.annenKundesKonto)
  const felles = (
    <>
      <input type="hidden" name="systemId" value={system.id} />
      <input type="hidden" name="epost" value={epost} />
    </>
  )

  return (
    <li
      data-system={system.id}
      aria-busy={opptatt}
      className="border-b border-[var(--kant)] last:border-b-0"
    >
      {/* Fast høyde, så raden ikke hopper når den begynner å jobbe. */}
      <div className={opptatt ? 'hm-fremdrift' : 'h-[3px]'} aria-hidden="true" />

      <div className="space-y-3 px-4 pt-2 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{system.navn}</h3>
          {merke.tekst === '–' ? (
            <span className="text-xs text-[var(--blekk-svak)]">ingen tilgang</span>
          ) : (
            <Merke type={merke.merke}>{merke.tekst}</Merke>
          )}
        </div>
        <p className="text-xs text-[var(--blekk-svak)]">
          {merke.forklaring}
          {celle?.harKonto && celle.sistInnlogget
            ? ` Sist inne ${visSiden(celle.sistInnlogget, naa)}.`
            : ''}
        </p>

        {erEier && (
          <>
            {/* ── Tilgang og rolle ── */}
            {!kanEndreTilgang ? (
              <p className="border-l-4 border-[var(--kant)] pl-3 text-xs text-[var(--blekk-svak)]">
                {celle?.annenKundesKonto
                  ? 'Kontoen hører til en annen kunde i den delte basen. Tilgang, sperring og sletting er deres å gjøre.'
                  : `Tilgang kan ikke endres herfra. ${system.hvorforLaast}`}
              </p>
            ) : bekreft === 'fjern' ? (
              <form action={fjern} className="flex flex-wrap items-center gap-2 border-2 border-hm-red p-2">
                {felles}
                <span className="text-sm">
                  Ta bort tilgangen i <strong>{system.navn}</strong>?
                </span>
                <button type="submit" disabled={opptatt} className={KNAPP_FARLIG}>
                  {fjerner ? <><Snurr /> Fjerner …</> : 'Ja, ta bort'}
                </button>
                <button type="button" onClick={() => settBekreft(null)} disabled={opptatt} className={KNAPP_LITEN}>
                  Avbryt
                </button>
              </form>
            ) : (
              <form action={gi} className="space-y-2">
                {felles}
                <input type="hidden" name="navn" value={epost.split('@')[0]} />
                <div className="flex flex-wrap items-end gap-2">
                  {valg.length > 0 && (
                    <label className="min-w-40 flex-1">
                      <span className="mb-1 block text-xs font-semibold">
                        Rolle i {system.navn}
                      </span>
                      <select
                        name="rolle"
                        value={valgt}
                        onChange={(e) => settValgt(e.target.value)}
                        disabled={opptatt}
                        className={`${FELT} py-1.5 text-sm`}
                      >
                        {valg.map((r) => (
                          <option key={r.verdi} value={r.verdi}>
                            {r.etikett}
                            {r.verdi === nåværende ? ' (nå)' : ''}
                            {r.ny ? ' – ny' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {/* Personen mangler innlogging. For auth-nøklede systemer MÅ
                      den lages før tilgangsraden kan skrives, så passordet er
                      påkrevd. For e-postnøklede genereres det om feltet står
                      tomt. */}
                  {!celle?.harKonto && (
                    <label className="min-w-40 flex-1">
                      <span className="mb-1 block text-xs font-semibold">
                        Midlertidig passord{system.krevArPassord ? '' : ' (valgfritt)'}
                      </span>
                      <input
                        name="midlertidigPassord"
                        type="text"
                        autoComplete="off"
                        required={system.krevArPassord}
                        minLength={8}
                        disabled={opptatt}
                        className={`${FELT_KODE} py-1.5`}
                      />
                    </label>
                  )}

                  {!uendret && (
                    <button type="submit" disabled={opptatt} className={KNAPP_PRIMÆR}>
                      {gir ? (
                        <>
                          <Snurr /> Lagrer …
                        </>
                      ) : !harTilgang ? (
                        'Gi tilgang'
                      ) : deaktivert ? (
                        'Aktiver igjen'
                      ) : (
                        'Lagre rolle'
                      )}
                    </button>
                  )}
                </div>

                {valgtRolle?.beskrivelse && (
                  <p className="text-xs text-[var(--blekk-svak)]">
                    {valgtRolle.beskrivelse}
                    {valgtRolle.iBruk !== null && ` ${valgtRolle.iBruk} har rollen i dag.`}
                  </p>
                )}
                <p className="text-[11px] text-[var(--blekk-svak)]">
                  Skriver i: {system.skrivbarVei}
                </p>

                {harTilgang && !deaktivert && (
                  <button
                    type="button"
                    onClick={() => settBekreft('fjern')}
                    disabled={opptatt}
                    className={KNAPP_FARLIG}
                  >
                    Ta bort tilgang
                  </button>
                )}
              </form>
            )}

            {/* ── Kontoen (innloggingen) ── */}
            {kanEndreKonto && celle?.authId && (
              <div className="space-y-2 border-t border-dashed border-[var(--kant)] pt-3">
                <p className="text-xs font-semibold">Innloggingen</p>
                {bekreft === 'slett' ? (
                  <form action={slett} className="flex flex-wrap items-center gap-2 border-2 border-hm-red p-2">
                    {felles}
                    <input type="hidden" name="brukerId" value={celle.authId} />
                    <span className="text-sm">
                      Slette innloggingen i <strong>{system.navn}</strong> for godt? Historikk i
                      appen vil peke på en bruker som ikke finnes. Sperring kan angres; dette kan ikke.
                    </span>
                    <button type="submit" disabled={opptatt} className={KNAPP_FARLIG}>
                      {sletter ? <><Snurr /> Sletter …</> : 'Ja, slett'}
                    </button>
                    <button type="button" onClick={() => settBekreft(null)} disabled={opptatt} className={KNAPP_LITEN}>
                      Avbryt
                    </button>
                  </form>
                ) : passordÅpent ? (
                  <form action={passord} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="systemId" value={system.id} />
                    <input type="hidden" name="brukerId" value={celle.authId} />
                    <input
                      name="passord"
                      type="text"
                      required
                      minLength={8}
                      autoComplete="off"
                      placeholder="nytt passord, minst 8 tegn"
                      aria-label={`Nytt passord i ${system.navn}`}
                      disabled={opptatt}
                      className={`${FELT_KODE} w-56 flex-1 py-1.5`}
                    />
                    <button type="submit" disabled={opptatt} className={KNAPP_LITEN}>
                      {setterPassord ? <><Snurr /> Setter …</> : 'Sett passord'}
                    </button>
                    <button type="button" onClick={() => settPassordÅpent(false)} disabled={opptatt} className={KNAPP_LITEN}>
                      Avbryt
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => settPassordÅpent(true)} disabled={opptatt} className={KNAPP_LITEN}>
                      Nytt passord
                    </button>
                    {/* Måltilstanden står i skjemaet – se settSperret. */}
                    <form action={sperr}>
                      <input type="hidden" name="systemId" value={system.id} />
                      <input type="hidden" name="brukerId" value={celle.authId} />
                      <input type="hidden" name="sperret" value={celle.kontoSperret ? 'nei' : 'ja'} />
                      <button
                        type="submit"
                        disabled={opptatt}
                        className={celle.kontoSperret ? KNAPP_LITEN : KNAPP_FARLIG}
                      >
                        {sperrer ? (
                          <>
                            <Snurr /> Endrer …
                          </>
                        ) : celle.kontoSperret ? (
                          'Åpne konto'
                        ) : (
                          'Sperr'
                        )}
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => settBekreft('slett')}
                      disabled={opptatt}
                      className={KNAPP_LITEN}
                      title={`Sletter innloggingen for godt i ${system.navn}`}
                    >
                      Slett
                    </button>
                  </div>
                )}
              </div>
            )}

            {melding?.feil && (
              <p
                role="alert"
                className="border-l-4 border-hm-red bg-hm-red/10 p-2 text-sm font-semibold text-hm-red-ink"
              >
                {melding.feil}
              </p>
            )}
            {melding?.ok && (
              <p role="status" className="border-l-4 border-hm-green bg-hm-green/10 p-2 text-sm">
                {melding.ok}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  )
}
