'use client'

import { useState } from 'react'
import { FELT } from '@/components/ui'
import { passerSøk } from '@/lib/personsok'

/**
 * Søket over lista per person i Brukere på telefon.
 *
 * Personene kommer ferdig bygget fra serveren, med tilgangsskjemaene inni,
 * og denne komponenten eier bare søketeksten. De som ikke passer, skjules i
 * stedet for å fjernes: et tilgangsskjema man har åpnet, skal ikke lukkes og
 * miste det man skrev fordi man søkte etter noen andre.
 */
export function Personsok({
  personer,
}: {
  personer: { epost: string; innhold: React.ReactNode }[]
}) {
  const [søk, settSøk] = useState('')
  const antall = personer.filter((p) => passerSøk(p.epost, søk)).length

  return (
    <>
      <div className="space-y-2 border-b border-[var(--kant)] px-4 py-3">
        <input
          type="search"
          value={søk}
          onChange={(e) => settSøk(e.target.value)}
          placeholder="Søk på e-post"
          aria-label="Søk på e-post"
          className={FELT}
        />
        <p role="status" className="text-xs text-[var(--blekk-svak)]">
          Viser {antall} av {personer.length}
        </p>
      </div>
      <ul>
        {personer.map((p) => (
          <li
            key={p.epost}
            hidden={!passerSøk(p.epost, søk)}
            className="border-b border-[var(--kant)] last:border-b-0"
          >
            {p.innhold}
          </li>
        ))}
      </ul>
    </>
  )
}
