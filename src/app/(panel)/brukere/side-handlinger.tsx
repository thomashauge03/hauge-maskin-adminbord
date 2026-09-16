'use client'

import { useActionState, useId, useState } from 'react'
import { FELT, KNAPP_FARLIG, KNAPP_LITEN, KNAPP_SEKUNDÆR } from '@/components/ui'
import type { BrukerTilstand } from './actions'
import { leggTilSide, endreSide, slettSide } from './side-actions'

const start: BrukerTilstand = {}

function Melding({ tilstand }: { tilstand: BrukerTilstand }) {
  if (tilstand.feil) return <p className="text-sm text-hm-red-ink">{tilstand.feil}</p>
  if (tilstand.ok) return <p className="text-sm text-[var(--blekk-svak)]">{tilstand.ok}</p>
  return null
}

/**
 * Skalerer et valgt bilde til et ikon, i nettleseren.
 *
 * 192 × 192 PNG, samme som skrivebordsappen lager – den bruker ICON_SIZE 192
 * og `canvas.toDataURL('image/png')`. Ikonene må se like ut uansett hvor
 * siden ble lagt inn, og de havner i samme fil.
 *
 * Bildet blir liggende som data-URI i sider.json. Det er ikke pent, men det er
 * slik de tolv som finnes der ligger, og mobilappen henter bare den ene fila.
 */
const IKON = 192

function tilIkon(fil: File): Promise<string> {
  return new Promise((løs, avvis) => {
    const leser = new FileReader()
    leser.onerror = () => avvis(new Error('Kunne ikke lese fila'))
    leser.onload = () => {
      const img = new Image()
      img.onerror = () => avvis(new Error('Fila er ikke et bilde vi kan lese'))
      img.onload = () => {
        // Aldri større enn originalen – å blåse opp et 32px-favicon til 192
        // gir bare en uskarp firkant og fire ganger så mange byte.
        const side = Math.min(IKON, Math.max(img.width, img.height)) || IKON
        const lerret = document.createElement('canvas')
        lerret.width = side
        lerret.height = side
        const ctx = lerret.getContext('2d')
        if (!ctx) return avvis(new Error('Nettleseren klarte ikke å lage ikonet'))
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        const skala = Math.min(side / img.width, side / img.height)
        const b = img.width * skala
        const h = img.height * skala
        ctx.drawImage(img, (side - b) / 2, (side - h) / 2, b, h)
        løs(lerret.toDataURL('image/png'))
      }
      img.src = String(leser.result)
    }
    leser.readAsDataURL(fil)
  })
}

function Felter({
  navn,
  url,
  gruppe,
  hjelp,
  bilete,
  farge,
  grupper,
}: {
  navn?: string
  url?: string
  gruppe?: string
  hjelp?: string
  bilete?: string
  farge?: string
  grupper: string[]
}) {
  // Egen id per skjema. Uten dette får alle sidene samme datalist-id, og da
  // binder nettleseren alle feltene til den første.
  const listeId = useId()
  const [ikon, settIkon] = useState(bilete ?? '')
  const [feil, settFeil] = useState<string | null>(null)

  async function velgBilde(e: React.ChangeEvent<HTMLInputElement>) {
    const fil = e.target.files?.[0]
    if (!fil) return
    settFeil(null)
    try {
      settIkon(await tilIkon(fil))
    } catch (err) {
      settFeil(err instanceof Error ? err.message : 'Kunne ikke lese bildet')
    }
  }

  return (
    <>
      <input name="navn" defaultValue={navn} required placeholder="Navn" className={FELT} />
      <input
        name="url"
        defaultValue={url}
        required
        type="url"
        placeholder="https://…"
        className={FELT}
      />
      {/* Fri tekst med forslag: gruppene som finnes er som regel riktige,
          men en ny gruppe skal ikke kreve at man først lager den et sted. */}
      <input
        name="gruppe"
        defaultValue={gruppe}
        required
        list={listeId}
        placeholder="Gruppe"
        className={FELT}
      />
      <datalist id={listeId}>
        {grupper.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <input
        name="hjelp"
        defaultValue={hjelp}
        placeholder="Kort forklaring (valgfritt)"
        className={FELT}
      />

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {/* Slik raden ser ut i appen: ikonet, eller fargen med forbokstaven. */}
        <span
          className="grid h-12 w-12 flex-none place-items-center overflow-hidden border-2 border-[var(--kant)]"
          style={{ background: ikon ? undefined : farge || '#e2001a' }}
        >
          {ikon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ikon} alt="" className="max-h-10 max-w-10 object-contain" />
          ) : (
            <span className="text-lg font-black text-white">
              {(navn || '?').trim().charAt(0).toUpperCase()}
            </span>
          )}
        </span>

        <label className={`${KNAPP_LITEN} cursor-pointer`}>
          {ikon ? 'Bytt ikon' : 'Velg ikon'}
          <input type="file" accept="image/*" onChange={velgBilde} className="hidden" />
        </label>

        {ikon && (
          <button type="button" onClick={() => settIkon('')} className={KNAPP_LITEN}>
            Fjern ikon
          </button>
        )}

        <label className="flex items-center gap-2 text-sm text-[var(--blekk-svak)]">
          Farge
          <input
            name="farge"
            type="color"
            defaultValue={farge || '#e2001a'}
            className="h-8 w-12 cursor-pointer border-2 border-[var(--kant)] bg-transparent"
          />
        </label>

        <span className="text-xs text-[var(--blekk-svak)]">
          Fargen brukes med forbokstaven når det ikke er noe ikon.
        </span>
      </div>

      {feil && <p className="text-sm text-hm-red-ink">{feil}</p>}

      {/* Selve bildet følger med skjemaet som data-URI. */}
      <input type="hidden" name="bilete" value={ikon} />
    </>
  )
}

/** Legg til en ny side. Skjult til man ber om den. */
export function NySide({ grupper }: { grupper: string[] }) {
  const [åpen, settÅpen] = useState(false)
  const [tilstand, send, lagrer] = useActionState(leggTilSide, start)

  if (!åpen) {
    return (
      <div className="px-4 py-3">
        <button onClick={() => settÅpen(true)} className={KNAPP_SEKUNDÆR}>
          Ny side
        </button>
        <Melding tilstand={tilstand} />
      </div>
    )
  }

  return (
    <form action={send} className="space-y-2 border-b-2 border-[var(--kant)] px-4 py-4">
      <Felter grupper={grupper} />
      <Melding tilstand={tilstand} />
      <div className="flex gap-2">
        <button type="submit" disabled={lagrer} className={KNAPP_SEKUNDÆR}>
          {lagrer ? 'Legger til …' : 'Legg til'}
        </button>
        <button type="button" onClick={() => settÅpen(false)} className={KNAPP_LITEN}>
          Avbryt
        </button>
      </div>
      <p className="text-xs text-[var(--blekk-svak)]">
        En ny side blir synlig for alle med én gang. Skal den bare gjelde noen,
        setter du den til «Bare utvalgte» etterpå.
      </p>
    </form>
  )
}

/**
 * Endre eller slette én side.
 *
 * Sletting bak en bekreftelse som sier hva som faktisk skjer. Den fjerner
 * siden for alle – også på PC – og rydder bort tilgangene til den. Det er
 * ikke reversibelt herfra.
 */
export function SideRedigering({
  sideId,
  navn,
  url,
  gruppe,
  hjelp,
  bilete,
  farge,
  grupper,
}: {
  sideId: string
  navn: string
  url: string
  gruppe: string
  hjelp?: string
  bilete?: string
  farge?: string
  grupper: string[]
}) {
  const [modus, settModus] = useState<'lukket' | 'endre' | 'slett'>('lukket')
  const [endreTilstand, sendEndre, endrer] = useActionState(
    endreSide.bind(null, { sideId }),
    start,
  )
  const [slettTilstand, sendSlett, sletter] = useActionState(
    slettSide.bind(null, { sideId, navn }),
    start,
  )

  if (modus === 'endre') {
    return (
      <form action={sendEndre} className="mt-3 w-full space-y-2">
        <Felter
          navn={navn}
          url={url}
          gruppe={gruppe}
          hjelp={hjelp}
          bilete={bilete}
          farge={farge}
          grupper={grupper}
        />
        <Melding tilstand={endreTilstand} />
        <div className="flex gap-2">
          <button type="submit" disabled={endrer} className={KNAPP_SEKUNDÆR}>
            {endrer ? 'Lagrer …' : 'Lagre'}
          </button>
          <button type="button" onClick={() => settModus('lukket')} className={KNAPP_LITEN}>
            Avbryt
          </button>
        </div>
      </form>
    )
  }

  if (modus === 'slett') {
    return (
      <div className="mt-3 w-full space-y-2">
        <p className="text-sm">
          Fjerne <strong>{navn}</strong> for godt? Den forsvinner for alle, også
          på PC, og tilgangene til den blir ryddet bort.
        </p>
        <Melding tilstand={slettTilstand} />
        <div className="flex gap-2">
          <form action={sendSlett}>
            <button type="submit" disabled={sletter} className={KNAPP_FARLIG}>
              {sletter ? 'Fjerner …' : 'Ja, fjern'}
            </button>
          </form>
          <button onClick={() => settModus('lukket')} className={KNAPP_LITEN}>
            Avbryt
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Melding tilstand={endreTilstand.ok ? endreTilstand : slettTilstand} />
      <button onClick={() => settModus('endre')} className={KNAPP_LITEN}>
        Endre
      </button>
      <button onClick={() => settModus('slett')} className={KNAPP_LITEN}>
        Slett
      </button>
    </div>
  )
}
