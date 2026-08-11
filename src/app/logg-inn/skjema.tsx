'use client'

import { useActionState } from 'react'
import { loggInn, type LoggInnTilstand } from './actions'

const start: LoggInnTilstand = {}

// Innloggingskortet står alltid på hvit flate, også i mørk modus, så
// feltene er låst til lyse farger her framfor å bruke temavariablene.
const felt =
  'w-full border-2 border-hm-200 bg-white px-3.5 py-3 text-base text-hm-black outline-none transition-colors focus:border-hm-red'

export function LoggInnSkjema() {
  const [tilstand, handling, venter] = useActionState(loggInn, start)

  return (
    <form action={handling} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold tracking-widest text-hm-500 uppercase">
          E-post
        </span>
        <input
          name="epost"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className={felt}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-bold tracking-widest text-hm-500 uppercase">
          Passord
        </span>
        <input
          name="passord"
          type="password"
          autoComplete="current-password"
          required
          className={felt}
        />
      </label>

      {tilstand.feil && (
        <p
          role="alert"
          className="border-l-4 border-hm-red bg-hm-red/10 p-3 text-sm font-semibold text-hm-red-ink"
        >
          {tilstand.feil}
        </p>
      )}

      <button
        type="submit"
        disabled={venter}
        className="hm-trykk inline-flex min-h-[3.25rem] w-full items-center justify-center border-2 border-hm-black bg-hm-red px-6 text-base font-bold tracking-wide text-white uppercase shadow-[4px_4px_0_0_var(--color-hm-black)] hover:bg-hm-red-hover disabled:opacity-50"
      >
        {venter ? 'Logger inn …' : 'Logg inn'}
      </button>
    </form>
  )
}
