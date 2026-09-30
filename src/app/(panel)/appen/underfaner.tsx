'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Klientkomponent bare fordi den må vite hvilken fane som er åpen. */
const faner = [
  { href: '/appen', tekst: 'Brukere', aktiv: (sti: string) => sti === '/appen' || sti.startsWith('/appen/person') },
  { href: '/appen/grupper', tekst: 'Grupper', aktiv: (sti: string) => sti.startsWith('/appen/grupper') },
  { href: '/appen/sider', tekst: 'Sider', aktiv: (sti: string) => sti.startsWith('/appen/sider') },
]

export function Underfaner() {
  const sti = usePathname()

  return (
    <nav aria-label="Appen" className="flex gap-1 border-b-2 border-[var(--kant)]">
      {faner.map((f) => {
        const aktiv = f.aktiv(sti)
        return (
          <Link
            key={f.href}
            href={f.href}
            aria-current={aktiv ? 'page' : undefined}
            className={`-mb-[2px] border-b-4 px-3 py-2 text-sm font-semibold ${
              aktiv
                ? 'border-hm-red text-[var(--blekk)]'
                : 'border-transparent text-[var(--blekk-svak)] hover:text-[var(--blekk)]'
            }`}
          >
            {f.tekst}
          </Link>
        )
      })}
    </nav>
  )
}
