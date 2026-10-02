'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { loggUt } from '@/app/logg-inn/actions'
import { KNAPP_SEKUNDÆR } from '@/components/ui'

/**
 * Klientkomponenter kun fordi de må vite hvilken side som er åpen.
 * Resten av panelet er server-rendret.
 *
 * Fanene på PC og bunnmenyen på telefon bruker de samme punktene og den
 * samme regelen for hva som er aktivt. To lister ville drevet fra hverandre
 * den første gangen en side kom til.
 */
const punkter = [
  { href: '/', tekst: 'Oversikt' },
  { href: '/systemer', tekst: 'Systemer' },
  { href: '/appen', tekst: 'Appen' },
  { href: '/brukere', tekst: 'Brukere' },
  { href: '/logg', tekst: 'Logg' },
  { href: '/innstillinger', tekst: 'Innstillinger' },
] as const

type Adresse = (typeof punkter)[number]['href']

// Forsiden matcher bare seg selv; de andre matcher også undersider, slik at
// /systemer/rorlager holder «Systemer» tent.
function erAktiv(href: Adresse, sti: string) {
  return href === '/' ? sti === '/' : sti.startsWith(href)
}

// Venter noen på svar, går «Appen» rett til køen. Det er det eneste i
// adminbordet noen står og venter på.
function harKø(href: Adresse, ventende: number) {
  return href === '/appen' && ventende > 0
}

function tekstFor(href: Adresse) {
  return punkter.find((p) => p.href === href)?.tekst ?? href
}

function Køtall({ ventende }: { ventende: number }) {
  return (
    <span className="ml-1.5 inline-flex min-w-5 justify-center bg-hm-amber px-1.5 text-[11px] font-bold text-white">
      {ventende}
      <span className="sr-only"> venter</span>
    </span>
  )
}

export function Meny({ ventende }: { ventende: number }) {
  const sti = usePathname()

  return (
    <nav aria-label="Hovedmeny" className="flex gap-0 overflow-x-auto">
      {punkter.map(({ href, tekst }) => {
        const aktiv = erAktiv(href, sti)
        const kø = harKø(href, ventende)

        return (
          <Link
            key={href}
            href={kø ? '/appen?status=venter' : href}
            aria-current={aktiv ? 'page' : undefined}
            className={`hm-display border-b-4 px-4 py-3 text-sm whitespace-nowrap transition-colors ${
              aktiv
                ? 'border-hm-red text-[var(--blekk)]'
                : 'border-transparent text-[var(--blekk-svak)] hover:border-[var(--kant)] hover:text-[var(--blekk)]'
            }`}
          >
            {tekst}
            {kø && <Køtall ventende={ventende} />}
          </Link>
        )
      })}
    </nav>
  )
}

/* Telefonen: fire faner der tommelen når, resten bak «Mer». Rekkefølgen er
   etter hva man gjør fra telefonen – køen i Appen før registeret. */
const iBunnen = ['/', '/appen', '/brukere', '/systemer'] as const
const iMer = ['/logg', '/innstillinger'] as const

const BUNNFANE =
  'hm-display flex h-full w-full items-center justify-center border-t-4 text-xs transition-colors'

function bunnfarge(aktiv: boolean) {
  return aktiv ? 'border-hm-red text-[var(--blekk)]' : 'border-transparent text-[var(--blekk-svak)]'
}

function lukkPanel(panel: HTMLElement | null) {
  // matches(':popover-open') kaster der Popover API mangler.
  if (panel && typeof panel.hidePopover === 'function' && panel.matches(':popover-open')) {
    panel.hidePopover()
  }
}

export function Bunnmeny({
  ventende,
  navn,
  rolle,
}: {
  ventende: number
  navn: string
  rolle: string
}) {
  const sti = usePathname()
  const mer = useRef<HTMLDivElement>(null)

  // Også tilbakeknappen bytter side, og da skal panelet ikke bli stående.
  useEffect(() => {
    lukkPanel(mer.current)
  }, [sti])

  const merAktiv = iMer.some((href) => erAktiv(href, sti))

  return (
    <>
      {/* Plassholder i flyten, så det siste på siden ikke havner bak menyen.
          Ligger her og ikke på body: innloggingssiden har ingen meny. */}
      <div aria-hidden="true" className="h-[var(--bunnlinje)] md:hidden" />

      <nav
        aria-label="Hovedmeny"
        className="fixed inset-x-0 bottom-0 z-30 h-[var(--bunnlinje)] border-t-2 border-[var(--kant)] bg-[var(--flate-opp)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:hidden"
      >
        <ul className="grid h-full grid-cols-5">
          {iBunnen.map((href) => {
            const aktiv = erAktiv(href, sti)
            const kø = harKø(href, ventende)
            return (
              <li key={href}>
                <Link
                  href={kø ? '/appen?status=venter' : href}
                  aria-current={aktiv ? 'page' : undefined}
                  className={`${BUNNFANE} ${bunnfarge(aktiv)}`}
                >
                  {tekstFor(href)}
                  {kø && <Køtall ventende={ventende} />}
                </Link>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              popoverTarget="mer-meny"
              className={`${BUNNFANE} ${bunnfarge(merAktiv)}`}
            >
              Mer
            </button>
          </li>
        </ul>
      </nav>

      {/* Ingen visningsklasse (flex, block) på selve panelet: nettleseren
          skjuler det med display: none når det er lukket, og en slik klasse
          ville holdt det åpent. Uten Popover API står innholdet i stedet
          nederst på siden, og kan fortsatt nås. */}
      <div
        id="mer-meny"
        ref={mer}
        popover="auto"
        className="inset-x-0 top-auto bottom-[var(--bunnlinje)] m-0 w-auto border-0 border-t-2 border-[var(--kant-sterk)] bg-[var(--flate-opp)] p-0 pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] text-[var(--blekk)] shadow-[0_-8px_24px_rgb(0_0_0/0.25)] md:hidden"
      >
        <p className="border-b border-[var(--kant)] px-4 py-3 text-sm text-[var(--blekk-svak)]">
          Innlogget som <strong className="text-[var(--blekk)]">{navn}</strong> · {rolle}
        </p>
        <ul>
          {iMer.map((href) => {
            const aktiv = erAktiv(href, sti)
            return (
              <li key={href} className="border-b border-[var(--kant)]">
                <Link
                  href={href}
                  onClick={() => lukkPanel(mer.current)}
                  aria-current={aktiv ? 'page' : undefined}
                  className={`hm-display flex min-h-14 items-center border-l-4 px-4 text-base ${
                    aktiv ? 'border-hm-red' : 'border-transparent'
                  }`}
                >
                  {tekstFor(href)}
                </Link>
              </li>
            )
          })}
        </ul>
        <form action={loggUt} className="px-4 py-4">
          <button type="submit" className={`${KNAPP_SEKUNDÆR} w-full`}>
            Logg ut
          </button>
        </form>
      </div>
    </>
  )
}
