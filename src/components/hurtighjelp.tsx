'use client'

import { useState, useSyncExternalStore } from 'react'
import { finnBro, svarTekst } from '@/lib/hurtighjelp'
import { KNAPP_LITEN } from '@/components/ui'

// Broen legges på før siden laster og forsvinner aldri, så det er ingenting å abonnere på.
const ingenEndring = () => () => {}

export function Hurtighjelp() {
  // Tjeneren har ingen bro, og første tegning må være lik der og i fanen.
  const harBro = useSyncExternalStore(ingenEndring, () => finnBro(window) !== null, () => false)
  const [svar, settSvar] = useState<string | null>(null)
  const [starter, settStarter] = useState(false)

  if (!harBro) return null

  async function start() {
    const bro = finnBro(window)
    if (!bro) return
    settStarter(true)
    try {
      settSvar(svarTekst(await bro.start()))
    } catch {
      settSvar(svarTekst(undefined))
    }
    settStarter(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={start}
        disabled={starter}
        className={KNAPP_LITEN}
        title="Start Windows Hurtighjelp og velg «Hjelp noen» for å se og styre skjermen til den som ringer"
      >
        {starter ? 'Starter…' : 'Hurtighjelp'}
      </button>
      {svar && (
        <p
          role="status"
          className="absolute top-full right-0 z-20 mt-2 w-72 border-2 border-[var(--kant)] bg-[var(--flate-opp)] p-3 text-xs"
        >
          {svar}
          <button
            type="button"
            onClick={() => settSvar(null)}
            className="mt-2 block font-semibold underline"
          >
            Lukk
          </button>
        </p>
      )}
    </div>
  )
}
