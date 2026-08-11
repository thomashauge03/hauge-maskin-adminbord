import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { HMLogo } from '@/components/hm-logo'
import { hentAdmin } from '@/lib/auth'
import { LoggInnSkjema } from './skjema'

export const metadata: Metadata = { title: 'Logg inn' }

export default async function LoggInnSide() {
  // Er man alt innlogget, er dette skjemaet en blindvei.
  if (await hentAdmin()) redirect('/')

  return (
    <main className="flex flex-1 items-center justify-center bg-hm-black px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center">
          <HMLogo størrelse="lg" />
          <span className="hm-skrastrek mt-5" aria-hidden="true" />
          <h1 className="hm-display mt-3 text-2xl text-white">Adminbord</h1>
          <p className="mt-1 text-sm text-hm-300">Drift og brukere, alle systemer</p>
        </div>

        <div className="hm-kant-skygge border-2 border-hm-black bg-white p-6">
          <LoggInnSkjema />
        </div>

        {/* Ingen «glemt passord»-lenke. Adminbordet har ingen egen
            e-posttjeneste, og en lenke som ikke virker er verre enn
            ingen lenke. Passord settes av en eier på /brukere. */}
        <p className="mt-5 text-center text-xs text-hm-500">
          Låst ute? Sett nytt passord fra Supabase-konsollet.
        </p>
      </div>
    </main>
  )
}
