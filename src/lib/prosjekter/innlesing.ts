import { supabaseAdmin } from '@/lib/supabase/admin'
import { medHøyst } from '@/lib/samtidig'
import type { Prosjekt } from './plan'
import 'server-only'

export type Innlesing = { nye: number; endret: number; feil: string[] }

/**
 * Fører SmartDok-prosjekter inn i navet, enten de kom fra Excel-eksporten
 * eller fra API-et. Samme vei for begge, så de ikke kan bli uenige om hva
 * som overskrives.
 *
 * Kunde og adresse overskrives bare med en verdi, aldri med tomt: en eksport
 * uten kundekolonnen skal ikke viske ut kundene som står der fra før.
 *
 * Det som ikke er med i lista, røres ikke. Et prosjekt som mangler kan like
 * gjerne skyldes et filter i eksporten som at det er borte i SmartDok.
 */
export async function lesInn(
  navet: (Prosjekt & { id: string })[],
  liste: Prosjekt[],
): Promise<Innlesing> {
  const perNummer = new Map(navet.map((p) => [p.nummer, p]))
  const nye: Prosjekt[] = []
  const endringer: { id: string; endring: Record<string, unknown> }[] = []

  for (const p of liste) {
    const finnes = perNummer.get(p.nummer)
    if (!finnes) {
      nye.push(p)
      continue
    }
    const endring: Record<string, unknown> = {}
    if (finnes.navn !== p.navn) endring.navn = p.navn
    if (finnes.aktiv !== p.aktiv) endring.aktiv = p.aktiv
    if (p.kunde && finnes.kunde !== p.kunde) endring.kunde = p.kunde
    if (p.adresse && finnes.adresse !== p.adresse) endring.adresse = p.adresse
    if (Object.keys(endring).length > 0) endringer.push({ id: finnes.id, endring })
  }

  if (nye.length > 0) {
    const { error } = await supabaseAdmin
      .from('prosjekter')
      .upsert(nye.map((p) => ({ ...p, kilde: 'smartdok' })), { onConflict: 'nummer' })
    if (error) throw new Error(`Kunne ikke lagre: ${error.message}`)
  }

  const feil: string[] = []
  await medHøyst(5, endringer, async ({ id, endring }) => {
    const { error } = await supabaseAdmin.from('prosjekter').update(endring).eq('id', id)
    if (error) feil.push(error.message)
  })

  return { nye: nye.length, endret: endringer.length - feil.length, feil }
}
