'use client'

import { useState } from 'react'
import { KNAPP_FARLIG, KNAPP_LITEN } from '@/components/ui'
import { leggTilDager, visFrist, visKortDato, visKortTid } from '@/lib/format'
import type { Gjøremål, Gjøremålsfelter, Systemvalg } from '@/lib/gjoremal'
import { Valglinje, type Valg } from './valg'

/**
 * Søndagen i uka `idag` faller i. Står her og ikke i liste.tsx fordi både
 * grupperingen og fristteksten trenger den, og de må være enige: ellers
 * kunne en flis under «Senere» fått bare en ukedag.
 */
export function søndagI(idag: string): string {
  return leggTilDager(idag, 6 - ((new Date(`${idag}T00:00:00Z`).getUTCDay() + 6) % 7))
}

const UKEDAGER = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag']

/**
 * «Lørdag» denne uka, «15. des.» senere, «Forfalt i går». Overskriften over
 * flisa sier alt hvilken uke det gjelder, så ukedagen alene er nok i
 * «Resten av uka», og datoen alene i «Senere» – begge med ukedag ble mest
 * støy. Ingenting for i dag, der «I dag» ville stått to ganger. Forfalt
 * beholder ordet: fargen alene bærer ikke meningen.
 */
function fristtekst(frist: string, idag: string, søndag: string): { tekst: string; forfalt: boolean } | null {
  if (frist === idag) return null
  if (frist < idag) {
    const når = visFrist(frist, idag)
    return { tekst: `Forfalt ${når.charAt(0).toLowerCase() + når.slice(1)}`, forfalt: true }
  }
  // Sjekkes før søndagen: på en søndag er i morgen neste uke, og «I morgen»
  // sier mer enn «16. nov.».
  if (frist === leggTilDager(idag, 1)) return { tekst: 'I morgen', forfalt: false }
  if (frist <= søndag) {
    return { tekst: UKEDAGER[(new Date(`${frist}T00:00:00Z`).getUTCDay() + 6) % 7], forfalt: false }
  }
  // visFrist gir «tir. 15. des.»; alt før første siffer er ukedagen.
  return { tekst: visFrist(frist, idag).replace(/^\D+/, ''), forfalt: false }
}

const HAK = 'M3 8.5 6.5 12 13 4.5'

function Klokke({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  )
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
  visSystem = true,
  onHukAv,
  onEndre,
  onSlett,
  onFølgOpp,
  onLukk,
  skalFåFokus,
}: {
  gjøremål: Gjøremål
  flis?: boolean
  nylig?: boolean
  idag: string
  systemer: Systemvalg[]
  /** Av når lista alt er filtrert på systemet: da sier merket ingenting nytt. */
  visSystem?: boolean
  /** `tastatur` avgjør om fokus skal følge med når raden flytter seg. */
  onHukAv: (g: Gjøremål, tastatur?: boolean) => void
  onEndre: (g: Gjøremål, felter: Gjøremålsfelter) => void
  onSlett: (g: Gjøremål) => void
  onFølgOpp?: (g: Gjøremål) => void
  /**
   * Blyanten finnes ikke mens skjemaet står framme, og bytter gjøremålet
   * gruppe ved Lagre, monteres raden på nytt i en annen liste. Derfor
   * huskes hvem som skal ha fokus i liste.tsx og ikke her: en ref i raden
   * forsvinner med den gamle raden, og fokus falt til toppen av siden.
   */
  onLukk?: (id: string) => void
  skalFåFokus?: (id: string, mål: 'hak' | 'blyant') => boolean
}) {
  const systemNavn =
    visSystem && g.systemId ? (systemer.find((s) => s.id === g.systemId)?.navn ?? null) : null
  const frist = flis && g.frist ? fristtekst(g.frist, idag, søndagI(idag)) : null
  const [redigerer, settRedigerer] = useState(false)
  const gjort = g.gjort !== null
  const viktig = g.viktig && !gjort
  // På de gjorte er oppfølgingen over; merket ville bare sagt at noe pågår.
  const følgesOpp = g.oppfølgingSiden !== null && !gjort

  function lukk() {
    onLukk?.(g.id)
    settRedigerer(false)
  }

  return (
    <li
      data-gjort={(flis && gjort) || undefined}
      data-forfalt={(frist?.forfalt && !gjort) || undefined}
      className={`group flex items-start ${
        flis
          ? `hm-flis hm-kant-skygge gap-3 border-2 border-[var(--kant-sterk)] bg-[var(--flate-opp)] px-4 py-3.5 max-sm:gap-2.5 max-sm:px-3 max-sm:py-3 ${
              // Tykk rød venstrekant framfor et ikon: den ses i øyekroken når
              // man skummer lista, og tar ingen plass fra tittelen.
              g.viktig && !g.gjort ? 'border-l-[6px] border-l-hm-red pl-3 max-sm:pl-2' : ''
            }`
          : `gap-3.5 border-2 border-dashed border-[var(--kant)] px-4 py-2.5 transition-colors hover:border-[var(--kant-sterk)] ${nylig ? 'hm-inn' : ''}`
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={gjort}
        aria-label={g.tittel}
        data-hak={g.id}
        ref={(b) => {
          if (b && skalFåFokus?.(g.id, 'hak')) b.focus()
        }}
        onClick={(e) => onHukAv(g, e.currentTarget.matches(':focus-visible'))}
        // Forhåndsvisningen bare etter at musa faktisk er beveget. Med
        // :hover gled neste flis inn under en mus som sto stille, så ut som
        // den var huket av, og neste klikk i samme punkt traff feil. Sjekken
        // på bevegelse fordi Chrome sender kunstige mousemove med 0 når
        // layouten flytter seg under pekeren. Rett i DOM og ikke i state, så
        // ingenting tegnes på nytt mens musa beveger seg.
        onPointerMove={
          flis
            ? (e) => {
                if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) e.currentTarget.dataset.mus = ''
              }
            : undefined
        }
        onPointerLeave={
          flis
            ? (e) => {
                delete e.currentTarget.dataset.mus
              }
            : undefined
        }
        // Skjult under redigering på telefon: skjemaet trenger bredden mer
        // enn ruta, og et hak midt i en redigering ville kastet endringene.
        className={`flex shrink-0 items-center justify-center border-2 transition-colors ${redigerer ? 'max-sm:hidden' : ''} ${
          flis
            ? 'group/hak size-8 pointer-coarse:size-11'
            : "relative mt-0.5 size-5 after:absolute after:-inset-3 after:content-['']"
        } ${
          !gjort
            ? // De gjorte radene viser ikke noe hak, så der er vanlig hover ufarlig.
              `border-[var(--blekk-svak)] ${flis ? 'data-[mus]:border-hm-red data-[mus]:bg-[var(--flate)]' : 'hover:border-hm-red'}`
            : flis
              ? 'border-hm-red bg-hm-red'
              : 'border-[var(--blekk-svak)] bg-transparent'
        }`}
      >
        {gjort ? (
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={`hm-hak ${flis ? 'size-5 text-white pointer-coarse:size-6' : 'size-3.5 text-[var(--blekk-svak)]'}`}
          >
            <path d={HAK} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
          </svg>
        ) : (
          flis && (
            // Forsmaken uten hm-hak, så pop-animasjonen er spart til den ekte
            // avhukingen. Bare med mus (data-mus): etter et trykk på telefon
            // ville hover blitt hengende og vist et hak som ikke er satt.
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="size-5 text-[var(--blekk-svak)] opacity-0 transition-opacity group-data-[mus]/hak:opacity-40"
            >
              <path d={HAK} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
            </svg>
          )
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
          idag={idag}
        />
      ) : (
        <>
          {/* 11 px på berøring: linjehøyden er 22 px og ruta 44, så første
              linje står midt mot ruta og ikke et par piksler for høyt. */}
          <div className={`min-w-0 flex-1 ${flis ? 'pt-1 pointer-coarse:pt-[11px]' : ''}`}>
            <p className={`break-words ${flis ? 'leading-snug font-semibold' : 'text-sm'}`}>
              {viktig && flis && (
                <>
                  <span className="sr-only">Viktig: </span>
                  {/* Venstrekanten er rød, og rødt alene skiller ikke for alle.
                      Tegnet er formen som bærer det samme uten farge. */}
                  <span aria-hidden="true" className="hm-display mr-1.5 text-hm-red">
                    !
                  </span>
                </>
              )}
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
            {flis && følgesOpp && (
              // Gult og ikke rødt: rødt betyr at noe haster eller er forfalt,
              // dette betyr at noe er i gang. Ordet bærer meningen, så fargen
              // ikke trengs for å forstå det.
              <p className="mt-2">
                <span className="inline-flex items-center gap-1.5 border-2 border-hm-amber px-1.5 py-px text-[11px] leading-4 font-bold tracking-wider text-[var(--blekk)] uppercase">
                  <Klokke className="size-3 text-hm-amber" />
                  Under oppfølging
                  <span className="hm-tall font-semibold tracking-normal text-[var(--blekk-svak)] normal-case">
                    siden {visKortDato(g.oppfølgingSiden)}
                  </span>
                </span>
              </p>
            )}
            {flis && (frist || systemNavn) && (
              // Bryter heller enn å kutte: «HAUGE MASKIN – HEIMESIDE» ble
              // «HA…» på telefon, og et kuttet navn er verre enn en linje til.
              // Frist først fordi det er den som haster. Systemet skilles med
              // en egen strek og ikke «·»: et skilletegn ble hengende alene
              // på slutten av første linje når linja brøt på telefon.
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {frist && (
                  <span
                    className={`hm-tall text-xs whitespace-nowrap ${
                      // Rødt er spart til båndet og overskriften. Ordet
                      // «Forfalt» bærer meningen, vekten løfter det.
                      frist.forfalt ? 'font-semibold text-[var(--blekk)]' : 'text-[var(--blekk-svak)]'
                    }`}
                  >
                    {frist.tekst}
                  </span>
                )}
                {systemNavn && (
                  <span
                    className={`${
                      frist ? 'border-l-2 border-[var(--kant-sterk)] pl-2' : ''
                    } text-[11px] leading-4 font-bold tracking-wider text-[var(--blekk-svak)] uppercase`}
                  >
                    {/* Streken er bare for øyet; uten denne ble frist og system
                        lest som ett ord. */}
                    {frist && <span className="sr-only">, </span>}
                    {systemNavn}
                  </span>
                )}
              </p>
            )}
            {!flis && systemNavn && (
              <p className="mt-0.5 text-[11px] font-bold tracking-wider text-[var(--blekk-svak)] uppercase">
                {systemNavn}
              </p>
            )}
            {!flis && (
              <p className="hm-tall mt-1 text-xs text-[var(--blekk-svak)] sm:hidden">Gjort {visKortTid(g.gjort)}</p>
            )}
          </div>

          {!flis && (
            <span className="hm-tall hidden shrink-0 pt-0.5 text-xs whitespace-nowrap text-[var(--blekk-svak)] sm:block">
              Gjort {visKortTid(g.gjort)}
            </span>
          )}

          {flis && onFølgOpp && (
            // Står fast mens den er på, så man ser at den kan slås av igjen
            // der merket står; ellers skjult som blyanten til raden er i bruk.
            <button
              type="button"
              aria-pressed={følgesOpp}
              onClick={() => onFølgOpp(g)}
              aria-label={følgesOpp ? `Avslutt oppfølging av «${g.tittel}»` : `Merk «${g.tittel}» som under oppfølging`}
              title={følgesOpp ? 'Avslutt oppfølging' : 'Merk som under oppfølging'}
              className={`flex size-8 shrink-0 items-center justify-center transition-[opacity,color,background-color] pointer-coarse:-my-1.5 pointer-coarse:size-11 ${
                følgesOpp
                  ? 'bg-hm-amber text-white hover:bg-hm-amber/80'
                  : 'text-[var(--blekk-svak)] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-[var(--kant)] hover:text-[var(--blekk)] pointer-coarse:opacity-100'
              }`}
            >
              <Klokke className="size-4" />
            </button>
          )}

          {/* Skjult til raden er under musa eller har fokus, så lista er
              rolig å lese. På berøring finnes ingen «under musa», så der står
              den alltid. */}
          <button
            type="button"
            ref={(knapp) => {
              if (knapp && skalFåFokus?.(g.id, 'blyant')) knapp.focus()
            }}
            onClick={() => settRedigerer(true)}
            aria-label={`Endre «${g.tittel}»`}
            title={`Endre «${g.tittel}»`}
            className={`flex size-8 shrink-0 items-center justify-center text-[var(--blekk-svak)] opacity-0 transition-[opacity,color,background-color] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-[var(--kant)] hover:text-[var(--blekk)] pointer-coarse:size-11 pointer-coarse:opacity-100 ${
              // Trykkflaten er 44 px, men på flisene får den stikke inn i
              // polstringen, så tittelen får bredden i stedet for luft.
              flis ? 'pointer-coarse:-my-1.5 pointer-coarse:-mr-2' : '-my-1'
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
  idag,
}: {
  gjøremål: Gjøremål
  onLagre: (felter: Gjøremålsfelter) => void
  onAvbryt: () => void
  onSlett: () => void
  systemer: Systemvalg[]
  idag: string
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
        // Rød kant bare med fokus: alltid rød lot det ikke synes hvilket av
        // feltene man skrev i. Kanten er fokusmarkeringen, så ringen utenpå
        // ville bare vært en ramme til.
        className="w-full border-2 border-[var(--kant-sterk)] bg-[var(--flate)] px-2.5 py-1.5 text-[var(--blekk)] outline-none focus:border-hm-red focus-visible:outline-none!"
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
        // Vokser med teksten, så et tomt notat ikke tar 60 px av flisa.
        rows={1}
        maxLength={4000}
        aria-label="Notat"
        placeholder="Notat"
        className="field-sizing-content block min-h-9 w-full resize-y border-2 border-[var(--kant)] bg-[var(--flate)] px-2.5 py-1.5 text-sm text-[var(--blekk)] outline-none placeholder:text-[var(--blekk-svak)] focus:border-hm-red"
      />
      <Valglinje systemer={systemer} valg={valg} onEndre={settValg} idag={idag} />
      <p className="hm-tall text-xs text-[var(--blekk-svak)]">Lagt til {visKortTid(g.opprettet)}</p>
      <div className="flex items-center gap-2">
        {/* Viktig-merkene fordi KNAPP_LITEN har egen kant og flate, og
            rekkefølgen to like Tailwind-klasser vinner i er ikke å stole på. */}
        <button
          type="submit"
          disabled={!tittel.trim()}
          className={`${KNAPP_LITEN} border-[var(--kant-sterk)]! bg-hm-red! text-white hover:bg-hm-red-hover!`}
        >
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
