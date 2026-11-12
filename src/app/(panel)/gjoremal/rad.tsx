'use client'

import { useRef, useState } from 'react'
import { KNAPP_FARLIG, KNAPP_LITEN } from '@/components/ui'
import { visFrist, visKortTid } from '@/lib/format'
import type { Gjøremål, Gjøremålsfelter, Systemvalg } from '@/lib/gjoremal'
import { Valglinje, type Valg } from './valg'

/** «Frist i morgen», «Forfalt i går». Ordet bærer meningen, fargen bare forsterker. */
function fristtekst(frist: string, idag: string): { tekst: string; forfalt: boolean } {
  const når = visFrist(frist, idag)
  const liten = når.charAt(0).toLowerCase() + når.slice(1)
  return frist < idag ? { tekst: `Forfalt ${liten}`, forfalt: true } : { tekst: `Frist ${liten}`, forfalt: false }
}

/**
 * `flis` er de åpne: kraftig kant og skygge, så de er det øyet går til. De
 * viser frist og system, men ikke når de ble lagt inn – det er bare støy på
 * noe som skal gjøres.
 * De gjorte er stiplet og flate, og viser når de ble gjort: de er historikk.
 *
 * `nylig` er en gjort rad som akkurat har flyttet seg ned fra flisene. Bare
 * den glir inn, ellers ville hele historikken animert ved hver sidelast.
 */
export function Rad({
  gjøremål: g,
  flis = false,
  nylig = false,
  idag,
  systemer,
  onHukAv,
  onEndre,
  onSlett,
}: {
  gjøremål: Gjøremål
  flis?: boolean
  nylig?: boolean
  idag: string
  systemer: Systemvalg[]
  onHukAv: (g: Gjøremål) => void
  onEndre: (g: Gjøremål, felter: Gjøremålsfelter) => void
  onSlett: (g: Gjøremål) => void
}) {
  const systemNavn = g.systemId ? (systemer.find((s) => s.id === g.systemId)?.navn ?? null) : null
  const frist = flis && g.frist ? fristtekst(g.frist, idag) : null
  const [redigerer, settRedigerer] = useState(false)
  // Blyanten finnes ikke mens skjemaet står framme. Uten dette ville fokus
  // falt til toppen av siden etter Lagre, Avbryt eller Esc.
  const tilbakeTilBlyant = useRef(false)
  const gjort = g.gjort !== null

  function lukk() {
    tilbakeTilBlyant.current = true
    settRedigerer(false)
  }

  return (
    <li
      data-gjort={(flis && gjort) || undefined}
      className={`group flex items-start ${
        flis
          ? `hm-flis hm-kant-skygge gap-3 border-2 border-[var(--kant-sterk)] bg-[var(--flate-opp)] px-4 py-3.5 ${
              // Tykk rød venstrekant framfor et ikon: den ses i øyekroken når
              // man skummer lista, og tar ingen plass fra tittelen.
              g.viktig && !g.gjort ? 'border-l-[6px] border-l-hm-red pl-3.5' : ''
            }`
          : `gap-3.5 border-2 border-dashed border-[var(--kant)] px-4 py-2.5 transition-colors hover:border-[var(--kant-sterk)] ${nylig ? 'hm-inn' : ''}`
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={gjort}
        aria-label={g.tittel}
        onClick={() => onHukAv(g)}
        className={`flex shrink-0 items-center justify-center border-2 transition-colors ${
          flis ? 'size-8 pointer-coarse:size-11' : "relative mt-0.5 size-5 after:absolute after:-inset-3 after:content-['']"
        } ${
          !gjort
            ? 'border-[var(--blekk-svak)] hover:border-hm-red'
            : flis
              ? 'border-hm-red bg-hm-red'
              : 'border-[var(--blekk-svak)] bg-transparent'
        }`}
      >
        {gjort && (
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={`hm-hak ${flis ? 'size-5 text-white pointer-coarse:size-6' : 'size-3.5 text-[var(--blekk-svak)]'}`}
          >
            <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
          </svg>
        )}
      </button>

      {redigerer ? (
        <Redigering
          gjøremål={g}
          onLagre={(felter) => {
            onEndre(g, felter)
            lukk()
          }}
          onAvbryt={lukk}
          onSlett={() => onSlett(g)}
          systemer={systemer}
        />
      ) : (
        <>
          <div className={`min-w-0 flex-1 ${flis ? 'pt-1 pointer-coarse:pt-2.5' : ''}`}>
            <p className={`break-words ${flis ? 'font-semibold' : 'text-sm'}`}>
              {g.viktig && flis && <span className="sr-only">Viktig: </span>}
              <span
                data-gjort={gjort || undefined}
                className={`hm-strek ${gjort ? 'text-[var(--blekk-svak)]' : 'text-[var(--blekk)]'} ${
                  flis && gjort ? '[--strek:var(--color-hm-red)]' : ''
                }`}
              >
                {g.tittel}
              </span>
            </p>
            {g.notat && (
              <p className="mt-0.5 text-sm break-words whitespace-pre-line text-[var(--blekk-svak)]">{g.notat}</p>
            )}
            {flis && (frist || systemNavn) && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {frist && (
                  <span
                    className={`hm-tall font-semibold ${frist.forfalt ? 'text-hm-red' : 'text-[var(--blekk-svak)]'}`}
                  >
                    {frist.tekst}
                  </span>
                )}
                {systemNavn && (
                  <span className="border border-[var(--kant-sterk)] px-1.5 py-px font-semibold text-[var(--blekk-svak)]">
                    {systemNavn}
                  </span>
                )}
              </p>
            )}
            {!flis && systemNavn && <p className="mt-0.5 text-xs text-[var(--blekk-svak)]">{systemNavn}</p>}
            {!flis && (
              <p className="hm-tall mt-1 text-xs text-[var(--blekk-svak)] sm:hidden">Gjort {visKortTid(g.gjort)}</p>
            )}
          </div>

          {!flis && (
            <span className="hm-tall hidden shrink-0 pt-0.5 text-xs whitespace-nowrap text-[var(--blekk-svak)] sm:block">
              Gjort {visKortTid(g.gjort)}
            </span>
          )}

          {/* Skjult til raden er under musa eller har fokus, så lista er
              rolig å lese. På berøring finnes ingen «under musa», så der står
              den alltid. */}
          <button
            type="button"
            ref={(knapp) => {
              if (knapp && tilbakeTilBlyant.current) {
                tilbakeTilBlyant.current = false
                knapp.focus()
              }
            }}
            onClick={() => settRedigerer(true)}
            aria-label={`Endre «${g.tittel}»`}
            title={`Endre «${g.tittel}»`}
            className={`flex size-8 shrink-0 items-center justify-center text-[var(--blekk-svak)] opacity-0 transition-[opacity,color,background-color] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-[var(--kant)] hover:text-[var(--blekk)] pointer-coarse:size-11 pointer-coarse:opacity-100 ${
              flis ? '' : '-my-1'
            }`}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M10.5 2.5 13.5 5.5 5.5 13.5H2.5V10.5Z" />
            </svg>
          </button>
        </>
      )}
    </li>
  )
}

function Redigering({
  gjøremål: g,
  onLagre,
  onAvbryt,
  onSlett,
  systemer,
}: {
  gjøremål: Gjøremål
  onLagre: (felter: Gjøremålsfelter) => void
  onAvbryt: () => void
  onSlett: () => void
  systemer: Systemvalg[]
}) {
  const [tittel, settTittel] = useState(g.tittel)
  const [notat, settNotat] = useState(g.notat ?? '')
  const [valg, settValg] = useState<Valg>({ systemId: g.systemId, frist: g.frist, viktig: g.viktig })

  function lagre() {
    const t = tittel.trim()
    if (!t) return
    onLagre({ tittel: t, notat: notat.trim() || null, ...valg })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        lagre()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onAvbryt()
      }}
      className="min-w-0 flex-1 space-y-2"
    >
      <input
        value={tittel}
        onChange={(e) => settTittel(e.target.value)}
        maxLength={300}
        required
        autoFocus
        aria-label="Tittel"
        className="w-full border-2 border-hm-red bg-[var(--flate)] px-2.5 py-1.5 text-[var(--blekk)] outline-none"
      />
      <textarea
        value={notat}
        onChange={(e) => settNotat(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            lagre()
          }
        }}
        rows={2}
        maxLength={4000}
        aria-label="Notat"
        placeholder="Notat"
        className="block w-full resize-y border-2 border-[var(--kant)] bg-[var(--flate)] px-2.5 py-1.5 text-sm text-[var(--blekk)] outline-none placeholder:text-[var(--blekk-svak)] focus:border-hm-red"
      />
      <Valglinje systemer={systemer} valg={valg} onEndre={settValg} />
      <p className="hm-tall text-xs text-[var(--blekk-svak)]">Lagt til {visKortTid(g.opprettet)}</p>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!tittel.trim()} className={KNAPP_LITEN}>
          Lagre
        </button>
        <button type="button" onClick={onAvbryt} className={KNAPP_LITEN}>
          Avbryt
        </button>
        {/* Slett står her og ikke på raden, så raden har plass til tittelen
            på telefon. Angre-varselet gjør at ett trykk for mye kan rettes. */}
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-[var(--blekk-svak)] sm:inline">Esc avbryter</span>
          <button type="button" onClick={onSlett} className={KNAPP_FARLIG}>
            Slett
          </button>
        </div>
      </div>
    </form>
  )
}
