import type { Metadata } from 'next'
import { HMLogo } from '@/components/hm-logo'
import { krevInnlogget } from '@/lib/auth'
import { ByttPassordSkjema } from './skjema'

export const metadata: Metadata = { title: 'Bytt passord' }

export default async function ByttPassordSide() {
  const bruker = await krevInnlogget()

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <HMLogo størrelse="md" />
          <span className="hm-skrastrek mt-4" aria-hidden="true" />
          <h1 className="hm-display mt-3 text-2xl">Velg nytt passord</h1>
          <p className="mt-1 text-center text-sm text-[var(--blekk-svak)]">
            {bruker.maByttePassord
              ? 'Passordet du logget inn med er midlertidig og kjent av den som opprettet kontoen.'
              : 'Du kan endre passordet ditt her.'}
          </p>
        </div>

        <div className="border-2 border-[var(--kant)] bg-[var(--flate-opp)] p-6">
          <ByttPassordSkjema />
        </div>
      </div>
    </main>
  )
}
