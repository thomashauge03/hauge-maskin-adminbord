import type { Metadata } from 'next'
import { krevAdmin } from '@/lib/auth'
import { GJORT_GRENSE, hentGjøremål } from '@/lib/gjoremal'
import { Kort, KortTittel, Seksjonstittel, TomTilstand } from '@/components/ui'
import { GjøremålRad, NyttGjøremål } from './skjema'

export const metadata: Metadata = { title: 'Gjøremål' }

export default async function GjøremålSide() {
  await krevAdmin()
  const { åpne, gjort } = await hentGjøremål()

  return (
    <div className="space-y-7">
      <Seksjonstittel under="Din egen huskeliste. Bare du ser den.">Gjøremål</Seksjonstittel>

      <Kort>
        <NyttGjøremål />
      </Kort>

      {åpne.length === 0 ? (
        <TomTilstand tittel="Ingenting åpent">
          {gjort.length > 0 ? 'Alt er gjort.' : 'Legg inn det første gjøremålet over.'}
        </TomTilstand>
      ) : (
        <Kort>
          <KortTittel>{åpne.length} åpne</KortTittel>
          <ul>
            {åpne.map((g) => (
              <GjøremålRad key={g.id} gjøremål={g} />
            ))}
          </ul>
        </Kort>
      )}

      {gjort.length > 0 && (
        <Kort>
          <details>
            <summary className="hm-display cursor-pointer border-b-2 border-[var(--kant)] px-4 py-2.5 text-base">
              Gjort ({gjort.length === GJORT_GRENSE ? `siste ${GJORT_GRENSE}` : gjort.length})
            </summary>
            <ul>
              {gjort.map((g) => (
                <GjøremålRad key={g.id} gjøremål={g} />
              ))}
            </ul>
          </details>
        </Kort>
      )}
    </div>
  )
}
