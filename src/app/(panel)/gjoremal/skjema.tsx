'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { ETIKETT, FELT, KNAPP_FARLIG, KNAPP_LITEN, KNAPP_PRIMÆR, Snurr } from '@/components/ui'
import { visDatoTid } from '@/lib/format'
import type { Gjøremål } from '@/lib/gjoremal'
import { endreGjøremål, leggTilGjøremål, settGjort, slettGjøremål, type Gjøremålsvar } from './actions'

const start: Gjøremålsvar = {}

function Feil({ svar }: { svar: Gjøremålsvar }) {
  if (!svar.feil) return null
  return (
    <p role="alert" className="text-sm font-semibold text-hm-red-ink">
      {svar.feil}
    </p>
  )
}

/** Egen komponent så key={svar.n} kan nullstille både feltene og notatvalget. */
function NyeFelter({ svar }: { svar: Gjøremålsvar }) {
  const [visNotat, settVisNotat] = useState(Boolean(svar.notat))

  return (
    <>
      <label className="block">
        <span className={ETIKETT}>Nytt gjøremål</span>
        <input
          name="tittel"
          required
          maxLength={300}
          autoComplete="off"
          defaultValue={svar.tittel}
          // Etter et svar, så man kan skrive det neste rett etter Enter.
          autoFocus={svar.n !== undefined}
          placeholder="F.eks. Bytt Vercel-token før 1. desember"
          className={FELT}
        />
      </label>

      {visNotat ? (
        <label className="block">
          <span className={ETIKETT}>Notat</span>
          <textarea name="notat" rows={3} maxLength={4000} defaultValue={svar.notat} className={FELT} />
        </label>
      ) : (
        <button type="button" onClick={() => settVisNotat(true)} className="text-sm underline">
          Legg til notat
        </button>
      )}
    </>
  )
}

export function NyttGjøremål() {
  const [svar, send, venter] = useActionState(leggTilGjøremål, start)

  return (
    <form action={send} className="space-y-3 px-4 py-4">
      <NyeFelter key={svar.n} svar={svar} />

      <Feil svar={svar} />

      <button type="submit" disabled={venter} className={KNAPP_PRIMÆR}>
        {venter ? (
          <>
            <Snurr /> Lagrer …
          </>
        ) : (
          'Legg til'
        )}
      </button>
    </form>
  )
}

function Avhuking({ gjort }: { gjort: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={gjort ? 'Merk som ikke gjort' : 'Merk som gjort'}
      className="flex size-6 shrink-0 items-center justify-center border-2 border-[var(--kant-sterk)] bg-[var(--flate-opp)] text-sm font-bold hover:border-hm-red disabled:opacity-50 pointer-coarse:size-11"
    >
      {pending ? <Snurr /> : gjort ? '✓' : ''}
    </button>
  )
}

function Redigering({ gjøremål, ferdig }: { gjøremål: Gjøremål; ferdig: () => void }) {
  const [svar, send, venter] = useActionState(endreGjøremål, start)

  useEffect(() => {
    if (svar.ok) ferdig()
  }, [svar.ok, svar.n, ferdig])

  return (
    <form action={send} className="flex-1 space-y-2">
      <input type="hidden" name="id" value={gjøremål.id} />
      <div key={svar.n} className="space-y-2">
        <input
          name="tittel"
          required
          maxLength={300}
          defaultValue={svar.tittel ?? gjøremål.tittel}
          autoFocus
          aria-label="Tittel"
          className={FELT}
        />
        <textarea
          name="notat"
          rows={3}
          maxLength={4000}
          defaultValue={svar.notat ?? gjøremål.notat ?? ''}
          aria-label="Notat"
          placeholder="Notat"
          className={FELT}
        />
      </div>
      <Feil svar={svar} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={venter} className={KNAPP_LITEN}>
          {venter ? 'Lagrer …' : 'Lagre'}
        </button>
        <button type="button" onClick={ferdig} className={KNAPP_LITEN}>
          Avbryt
        </button>
      </div>
    </form>
  )
}

export function GjøremålRad({ gjøremål }: { gjøremål: Gjøremål }) {
  const [redigerer, settRedigerer] = useState(false)
  const gjort = gjøremål.gjort !== null

  return (
    <li className="flex items-start gap-3 border-b border-[var(--kant)] px-4 py-3 last:border-b-0">
      <form action={settGjort} className="pt-0.5">
        <input type="hidden" name="id" value={gjøremål.id} />
        <input type="hidden" name="gjort" value={gjort ? 'nei' : 'ja'} />
        <Avhuking gjort={gjort} />
      </form>

      {redigerer ? (
        <Redigering gjøremål={gjøremål} ferdig={() => settRedigerer(false)} />
      ) : (
        <div className="min-w-0 flex-1">
          <p className={`break-words ${gjort ? 'text-[var(--blekk-svak)] line-through' : 'font-semibold'}`}>
            {gjøremål.tittel}
          </p>
          {gjøremål.notat && (
            <p className="mt-1 text-sm break-words whitespace-pre-line text-[var(--blekk-svak)]">{gjøremål.notat}</p>
          )}
          <p className="hm-tall mt-1 text-xs text-[var(--blekk-svak)]">
            Lagt inn {visDatoTid(gjøremål.opprettet)}
            {gjort && <> · gjort {visDatoTid(gjøremål.gjort)}</>}
          </p>
        </div>
      )}

      {!redigerer && (
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <button type="button" onClick={() => settRedigerer(true)} className={KNAPP_LITEN}>
            Endre
          </button>
          <form
            action={slettGjøremål}
            onSubmit={(e) => {
              if (!confirm(`Slette «${gjøremål.tittel}»? Det kan ikke angres.`)) e.preventDefault()
            }}
          >
            <input type="hidden" name="id" value={gjøremål.id} />
            <button type="submit" className={KNAPP_FARLIG}>
              Slett
            </button>
          </form>
        </div>
      )}
    </li>
  )
}
