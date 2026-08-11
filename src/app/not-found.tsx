import Link from 'next/link'
import { KNAPP_SEKUNDÆR } from '@/components/ui'

export default function IkkeFunnet() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <span className="hm-skrastrek mb-4" aria-hidden="true" />
        <h1 className="hm-display text-3xl">Finnes ikke</h1>
        <p className="mt-3 text-sm text-[var(--blekk-svak)]">
          Siden er flyttet, eller systemet er slettet fra registeret.
        </p>
        <Link href="/" className={`${KNAPP_SEKUNDÆR} mt-6`}>
          Til oversikten
        </Link>
      </div>
    </main>
  )
}
