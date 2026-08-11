import Image from 'next/image'

const høyder = { sm: 22, md: 30, lg: 48, xl: 72 } as const

/**
 * HM-logoen. Bakgrunnen er gjennomsiktig, så den kan stå på både hvitt
 * og svart. Bredde/høyde er alltid satt for å unngå layouthopp mens
 * bildet lastes – forholdet 942/591 er filens egne mål.
 */
export function HMLogo({
  størrelse = 'md',
  className = '',
}: {
  størrelse?: keyof typeof høyder
  className?: string
}) {
  const h = høyder[størrelse]
  const b = Math.round(h * (942 / 591))

  return (
    <Image
      src="/hm-logo.png"
      alt="Hauge Maskin"
      width={b}
      height={h}
      priority={størrelse === 'lg' || størrelse === 'xl'}
      className={`h-auto w-auto ${className}`}
      style={{ height: h, width: b }}
    />
  )
}
