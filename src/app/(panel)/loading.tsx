import { Snurr } from '@/components/ui'

/**
 * Vises med en gang man trykker i menyen, mens siden hentes.
 *
 * Uten denne sto den forrige siden urørt til den nye var ferdig – på Brukere
 * og Oversikt flere sekunder, fordi de spør hvert system. Det så ut som
 * trykket ikke ble registrert, og man trykket igjen.
 */
export default function Laster() {
  return (
    <div className="space-y-7" aria-busy="true">
      <div>
        <span className="hm-skrastrek mb-3" aria-hidden="true" />
        <div className="hm-skjelett h-8 w-48" />
        <p className="mt-3 flex items-center gap-2 text-sm text-[var(--blekk-svak)]">
          <Snurr />
          Henter …
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-4 py-3">
            <div className="hm-skjelett h-3 w-20" />
            <div className="hm-skjelett mt-2 h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="border-2 border-[var(--kant)] bg-[var(--flate-opp)]">
        <div className="border-b-2 border-[var(--kant)] px-4 py-3">
          <div className="hm-skjelett h-4 w-44" />
        </div>
        <div className="space-y-2 px-4 py-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="hm-skjelett h-3.5 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
