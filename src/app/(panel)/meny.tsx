'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Klientkomponent kun fordi den må vite hvilken side som er åpen.
 * Resten av panelet er server-rendret.
 */
const punkter = [
  { href: '/', tekst: 'Oversikt' },
  { href: '/systemer', tekst: 'Systemer' },
  { href: '/brukere', tekst: 'Brukere' },
  { href: '/logg', tekst: 'Logg' },
  { href: '/innstillinger', tekst: 'Innstillinger' },
] as const

export function Meny() {
  const sti = usePathname()

  return (
    <nav aria-label="Hovedmeny" className="flex gap-0 overflow-x-auto">
      {punkter.map(({ href, tekst }) => {
        // Forsiden matcher bare seg selv; de andre matcher også
        // undersider, slik at /systemer/rorlager holder «Systemer» tent.
        const aktiv = href === '/' ? sti === '/' : sti.startsWith(href)

        return (
          <Link
            key={href}
            href={href}
            aria-current={aktiv ? 'page' : undefined}
            className={`hm-display border-b-4 px-4 py-3 text-sm whitespace-nowrap transition-colors ${
              aktiv
                ? 'border-hm-red text-[var(--blekk)]'
                : 'border-transparent text-[var(--blekk-svak)] hover:border-[var(--kant)] hover:text-[var(--blekk)]'
            }`}
          >
            {tekst}
          </Link>
        )
      })}
    </nav>
  )
}
