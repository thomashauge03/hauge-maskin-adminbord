import Link from 'next/link'
import { HMLogo } from '@/components/hm-logo'
import { krevAdmin } from '@/lib/auth'
import { loggUt } from '@/app/logg-inn/actions'
import { KNAPP_LITEN, Merke } from '@/components/ui'
import { Meny } from './meny'

/**
 * Layouten sjekker tilgang, men er ikke sikringen: hver side og hver
 * server action kaller krevAdmin() selv. En layout kjører ikke på nytt
 * ved en server action-POST, så tilgang som bare sto her ville vært
 * mulig å gå rundt.
 */
export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const bruker = await krevAdmin()

  return (
    <>
      <header className="border-b-2 border-[var(--kant)] bg-[var(--flate-opp)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 pt-3">
          <Link href="/" className="flex items-center gap-3">
            <HMLogo størrelse="sm" />
            <span className="hm-display text-lg">Adminbord</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-[var(--blekk-svak)] sm:inline">
              {bruker.navn}
            </span>
            {/* Rollen står synlig fordi den avgjør hva knappene under
                gjør. Ser man ikke at man er innlogget som drift, leser
                man en manglende knapp som en feil i appen. */}
            <Merke type={bruker.rolle === 'eier' ? 'svart' : 'nøytral'}>
              {bruker.rolle}
            </Merke>
            <form action={loggUt}>
              <button type="submit" className={KNAPP_LITEN}>
                Logg ut
              </button>
            </form>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4">
          <Meny />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7">
        {children}
      </main>

      <footer className="border-t-2 border-[var(--kant)] px-4 py-4">
        <p className="mx-auto max-w-7xl text-xs text-[var(--blekk-svak)]">
          Hauge Maskin Adminbord
        </p>
      </footer>
    </>
  )
}
