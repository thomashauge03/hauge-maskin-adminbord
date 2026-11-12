import type { Metadata } from 'next'
import { krevAdmin } from '@/lib/auth'
import { hentGjøremål } from '@/lib/gjoremal'
import { Seksjonstittel } from '@/components/ui'
import { Gjøremålsliste } from './liste'

export const metadata: Metadata = { title: 'Gjøremål' }

export default async function GjøremålSide() {
  await krevAdmin()
  const { liste, systemer, gjortAvkortet, idag, mandag } = await hentGjøremål()

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Seksjonstittel under="Din egen huskeliste. Bare du ser den.">Gjøremål</Seksjonstittel>
      <Gjøremålsliste start={liste} systemer={systemer} gjortAvkortet={gjortAvkortet} idag={idag} mandag={mandag} />
    </div>
  )
}
