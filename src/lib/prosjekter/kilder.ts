import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { lagFremmedKlient } from '@/lib/supabase/fremmed'
import { alleRader } from '@/lib/supabase/alle-rader'
import { iBiter, medHøyst } from '@/lib/samtidig'
import type { AppRad, Endring, Prosjekt, Valg } from './plan'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   De fem prosjekttabellene, oversatt til samme form.

   Hver app kalte det sitt: `number`/`name`/`active` i lageret,
   `project_number`/`status` i rørlageret og tilbudssystemet, `nummer`/`navn`
   i utleie og varsling. Oversettelsen bor her, slik at plan.ts bare ser
   én form og kan testes uten å kjenne noen av dem.

   Ingen kilde sletter. Se plan.ts for hvorfor.
   ═══════════════════════════════════════════════════════════ */

export type Kilde = {
  slug: string
  navn: string
  valg: Valg
  hent: () => Promise<AppRad[]>
  leggTil: (nye: Prosjekt[]) => Promise<void>
  endre: (id: string, endring: Endring) => Promise<void>
}

/** Hauge Maskin i tilbudssystemet, som også har Techauge og TT Anlegg. */
const HAUGE_MASKIN_TENANT = '95ee2a3d-6bd3-4a94-ab44-c000c49beae5'

const BIT = 500

function feilVed(hva: string, error: { message: string } | null) {
  if (error) throw new Error(`${hva}: ${error.message}`)
}

async function settInn(klient: { insert: (r: object[]) => PromiseLike<{ error: { message: string } | null }> }, hva: string, rader: object[]) {
  for (const bit of iBiter(rader, BIT)) {
    const { error } = await klient.insert(bit)
    feilVed(`Kunne ikke sette inn ${hva}`, error)
  }
}

async function klientFor(slug: string): Promise<SupabaseClient> {
  const { data: system } = await supabaseAdmin.from('systemer').select('id').eq('slug', slug).single()
  if (!system) throw new Error(`Systemet «${slug}» står ikke i registeret.`)
  const fremmed = await lagFremmedKlient(system.id as string)
  if (!fremmed.ok) throw new Error(fremmed.grunn)
  return fremmed.klient
}

/** Én klient per kjøring, ikke per kall: nøkkelen hentes fra Management-API-et. */
function lat(slug: string) {
  let klient: Promise<SupabaseClient> | null = null
  return () => (klient ??= klientFor(slug))
}

function lager(): Kilde {
  const k = lat('lagersystem')
  const tabell = async () => (await k()).schema('lager').from('projects')
  return {
    slug: 'lagersystem',
    navn: 'Lager',
    valg: { harKunde: false, harAdresse: false },
    async hent() {
      const t = await tabell()
      const rader = await alleRader<{ id: string; number: string; name: string; active: boolean }>(
        'lagerprosjekter',
        (fra, til) => t.select('id, number, name, active').order('id').range(fra, til),
      )
      return rader.map((r) => ({ id: r.id, nummer: r.number, navn: r.name, kunde: null, adresse: null, aktiv: r.active }))
    },
    async leggTil(nye) {
      await settInn(await tabell(), 'lagerprosjekter', nye.map((p) => ({ number: p.nummer, name: p.navn, active: p.aktiv })))
    },
    async endre(id, e) {
      const { error } = await (await tabell())
        .update({ number: e.nummer, name: e.navn, active: e.aktiv })
        .eq('id', id)
      feilVed('Kunne ikke endre lagerprosjekt', error)
    },
  }
}

function rørlager(): Kilde {
  const k = lat('rorlager')
  const tabell = async () => (await k()).from('projects')
  return {
    slug: 'rorlager',
    navn: 'Rørlager',
    // project_number er bigint. Nummer med bokstaver kan ikke lagres der.
    valg: { godtarNummer: (n) => /^\d{1,15}$/.test(n) },
    async hent() {
      const t = await tabell()
      const rader = await alleRader<{ id: string; project_number: number; name: string; client: string | null; address: string | null; status: string }>(
        'rørlagerprosjekter',
        (fra, til) => t.select('id, project_number, name, client, address, status').order('id').range(fra, til),
      )
      return rader.map((r) => ({
        id: r.id,
        nummer: String(r.project_number),
        navn: r.name,
        kunde: r.client,
        adresse: r.address,
        aktiv: r.status === 'aktiv',
      }))
    },
    async leggTil(nye) {
      await settInn(
        await tabell(),
        'rørlagerprosjekter',
        nye.map((p) => ({
          project_number: Number(p.nummer),
          name: p.navn,
          client: p.kunde,
          address: p.adresse,
          status: p.aktiv ? 'aktiv' : 'avsluttet',
        })),
      )
    },
    async endre(id, e) {
      const { error } = await (await tabell())
        .update({
          name: e.navn,
          client: e.kunde,
          address: e.adresse,
          status: e.aktiv === undefined ? undefined : e.aktiv ? 'aktiv' : 'avsluttet',
        })
        .eq('id', id)
      feilVed('Kunne ikke endre rørlagerprosjekt', error)
    },
  }
}

function utleie(): Kilde {
  const k = lat('utleie')
  const tabell = async () => (await k()).from('prosjekter')
  return {
    slug: 'utleie',
    navn: 'Utleie',
    valg: { unikeNavn: true, harKunde: false, harAdresse: false },
    async hent() {
      const t = await tabell()
      const rader = await alleRader<{ id: string; nummer: string | null; navn: string; aktiv: boolean }>(
        'utleieprosjekter',
        (fra, til) => t.select('id, nummer, navn, aktiv').order('id').range(fra, til),
      )
      return rader.map((r) => ({ ...r, kunde: null, adresse: null }))
    },
    async leggTil(nye) {
      await settInn(await tabell(), 'utleieprosjekter', nye.map((p) => ({ nummer: p.nummer, navn: p.navn, aktiv: p.aktiv })))
    },
    async endre(id, e) {
      const { error } = await (await tabell())
        .update({ nummer: e.nummer, navn: e.navn, aktiv: e.aktiv })
        .eq('id', id)
      feilVed('Kunne ikke endre utleieprosjekt', error)
    },
  }
}

function tilbud(): Kilde {
  const k = lat('tilbudssystem')
  const tabell = async () => (await k()).from('projects')
  return {
    slug: 'tilbudssystem',
    navn: 'Tilbud',
    valg: { harAdresse: false },
    async hent() {
      const t = await tabell()
      const rader = await alleRader<{ id: string; project_number: string | null; name: string; customer_name: string | null; status: string }>(
        'tilbudsprosjekter',
        (fra, til) =>
          t
            .select('id, project_number, name, customer_name, status')
            .eq('tenant_id', HAUGE_MASKIN_TENANT)
            .order('id')
            .range(fra, til),
      )
      return rader.map((r) => ({
        id: r.id,
        nummer: r.project_number,
        navn: r.name,
        kunde: r.customer_name,
        adresse: null,
        // «På vent» er fortsatt et levende prosjekt.
        aktiv: r.status !== 'fullført',
      }))
    },
    async leggTil(nye) {
      await settInn(
        await tabell(),
        'tilbudsprosjekter',
        nye.map((p) => ({
          tenant_id: HAUGE_MASKIN_TENANT,
          project_number: p.nummer,
          name: p.navn,
          customer_name: p.kunde,
          status: p.aktiv ? 'aktiv' : 'fullført',
        })),
      )
    },
    async endre(id, e) {
      const { error } = await (await tabell())
        .update({
          project_number: e.nummer,
          name: e.navn,
          customer_name: e.kunde,
          status: e.aktiv === undefined ? undefined : e.aktiv ? 'aktiv' : 'fullført',
        })
        .eq('id', id)
        .eq('tenant_id', HAUGE_MASKIN_TENANT)
      feilVed('Kunne ikke endre tilbudsprosjekt', error)
    },
  }
}

/** Varslingskontroll ligger i navets egen base, i skjemaet `varsling`. */
function varsling(): Kilde {
  const tabell = () => supabaseAdmin.schema('varsling').from('prosjekt')
  return {
    slug: 'varslingskontroll',
    navn: 'Varsling',
    valg: { harAdresse: false },
    async hent() {
      const rader = await alleRader<{ id: string; nummer: string | null; navn: string; byggherre: string | null; aktiv: boolean }>(
        'varslingsprosjekter',
        (fra, til) => tabell().select('id, nummer, navn, byggherre, aktiv').order('id').range(fra, til),
      )
      return rader.map((r) => ({ id: r.id, nummer: r.nummer, navn: r.navn, kunde: r.byggherre, adresse: null, aktiv: r.aktiv }))
    },
    async leggTil(nye) {
      await settInn(tabell(), 'varslingsprosjekter', nye.map((p) => ({ nummer: p.nummer, navn: p.navn, byggherre: p.kunde, aktiv: p.aktiv })))
    },
    async endre(id, e) {
      const { error } = await tabell()
        .update({ nummer: e.nummer, navn: e.navn, byggherre: e.kunde, aktiv: e.aktiv })
        .eq('id', id)
      feilVed('Kunne ikke endre varslingsprosjekt', error)
    },
  }
}

export function alleKilder(): Kilde[] {
  return [tilbud(), lager(), rørlager(), utleie(), varsling()]
}

/** Endringene én om gangen per app, noen få parallelt. */
export async function utførEndringer(kilde: Kilde, endringer: { id: string; endring: Endring }[]) {
  await medHøyst(5, endringer, ({ id, endring }) => kilde.endre(id, endring))
}
