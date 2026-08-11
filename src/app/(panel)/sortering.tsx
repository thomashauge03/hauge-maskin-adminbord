import Link from 'next/link'

/**
 * Sorteringsmåtene oversikten kan vises i.
 *
 * `verst` er standard fordi forsiden først skal svare på «er noe galt».
 * `aktivitet` finnes fordi det andre spørsmålet man stiller er «hva er på
 * vei til å pauses» – og da vil man ha den som har ligget stille lengst
 * øverst, ikke den som er mest ødelagt.
 */
export type Sortering = 'verst' | 'aktivitet'

export function lesSortering(verdi: string | string[] | undefined): Sortering {
  return verdi === 'aktivitet' ? 'aktivitet' : 'verst'
}

const valg: { verdi: Sortering; tekst: string; href: string }[] = [
  { verdi: 'verst', tekst: 'Verst først', href: '/' },
  { verdi: 'aktivitet', tekst: 'Lengst uten aktivitet', href: '/?sort=aktivitet' },
]

/**
 * To lenker framfor en nedtrekksliste.
 *
 * Med bare to valg er en liste en ekstra klikk for ingenting. Lenker gjør
 * dessuten at sorteringen kan bokmerkes – vil man alltid se
 * pause-rekkefølgen, lagrer man /?sort=aktivitet og er ferdig.
 */
export function Sorteringsvelger({ aktiv }: { aktiv: Sortering }) {
  return (
    <div className="flex items-center gap-0 border-2 border-[var(--kant)]">
      {valg.map((v) => (
        <Link
          key={v.verdi}
          href={v.href}
          aria-current={v.verdi === aktiv ? 'true' : undefined}
          className={`px-3 py-2 text-xs font-bold tracking-wide uppercase transition-colors ${
            v.verdi === aktiv
              ? 'bg-hm-black text-white'
              : 'text-[var(--blekk-svak)] hover:bg-[var(--flate-2)] hover:text-[var(--blekk)]'
          }`}
        >
          {v.tekst}
        </Link>
      ))}
    </div>
  )
}
