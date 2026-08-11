import { lagServerKlient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type {
  Hemmelighet,
  Hendelse,
  System,
  StatusMaaling,
} from '@/lib/typer'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Lesing og skriving mot adminbordets egen database.

   Alt som leses som den innloggede brukeren går gjennom
   lagServerKlient, slik at radsikkerheten gjelder. Bare det som må
   omgå den – hemmeligheter, logging, cron – bruker supabaseAdmin, og da
   står det hvorfor i kommentaren over funksjonen.

   Radene mappes fra snake_case til camelCase her, ett sted. Uten det
   siver database-skrivemåten ut i alle komponentene, og da må hver av
   dem endres når en kolonne får nytt navn.
   ═══════════════════════════════════════════════════════════ */

type SystemRad = {
  id: string
  slug: string
  navn: string
  beskrivelse: string | null
  supabase_prosjekt_ref: string | null
  supabase_url: string | null
  vercel_prosjekt_id: string | null
  vercel_prosjekt_navn: string | null
  github_repo: string | null
  produksjons_url: string | null
  sortering: number
  aktiv: boolean
  overvakes: boolean
  notat: string | null
  opprettet: string
  endret: string
}

function tilSystem(r: SystemRad): System {
  return {
    id: r.id,
    slug: r.slug,
    navn: r.navn,
    beskrivelse: r.beskrivelse,
    supabaseProsjektRef: r.supabase_prosjekt_ref,
    supabaseUrl: r.supabase_url,
    vercelProsjektId: r.vercel_prosjekt_id,
    vercelProsjektNavn: r.vercel_prosjekt_navn,
    githubRepo: r.github_repo,
    produksjonsUrl: r.produksjons_url,
    sortering: r.sortering,
    aktiv: r.aktiv,
    overvakes: r.overvakes,
    notat: r.notat,
    opprettet: r.opprettet,
    endret: r.endret,
  }
}

/** Systemene som skal vises. `medInaktive` brukes bare på /systemer. */
export async function hentSystemer(medInaktive = false): Promise<System[]> {
  const supabase = await lagServerKlient()

  let spørring = supabase
    .from('systemer')
    .select('*')
    .order('sortering', { ascending: true })
    .order('navn', { ascending: true })

  if (!medInaktive) spørring = spørring.eq('aktiv', true)

  const { data, error } = await spørring
  if (error) throw new Error(`Kunne ikke hente systemer: ${error.message}`)

  return (data as SystemRad[]).map(tilSystem)
}

export async function hentSystem(slug: string): Promise<System | null> {
  const supabase = await lagServerKlient()
  const { data } = await supabase
    .from('systemer')
    .select('*')
    .eq('slug', slug)
    .single()

  return data ? tilSystem(data as SystemRad) : null
}

/**
 * Hemmelighetene som er lagret for et system – uten verdiene.
 *
 * Går via service role fordi tabellen ikke har noen leselig policy. Det
 * er med vilje: se kommentaren i migrasjonen. Kallstedet må ha kalt
 * krevEier() først.
 */
export async function hentHemmeligheter(
  systemId: string,
): Promise<Hemmelighet[]> {
  const { data } = await supabaseAdmin
    .from('hemmeligheter')
    .select('id, system_id, slag, navn, hint, opprettet, endret')
    .eq('system_id', systemId)
    .order('slag')

  return (data ?? []).map((r) => ({
    id: r.id as string,
    systemId: r.system_id as string,
    slag: r.slag as Hemmelighet['slag'],
    navn: r.navn as string,
    hint: r.hint as string,
    opprettet: r.opprettet as string,
    endret: r.endret as string,
  }))
}

/** Siste måling per kilde for ett system. Brukes til «sist sett OK». */
export async function hentSisteMaalinger(
  systemId: string,
  antall = 30,
): Promise<StatusMaaling[]> {
  const supabase = await lagServerKlient()
  const { data } = await supabase
    .from('status_maalinger')
    .select('*')
    .eq('system_id', systemId)
    .order('malt_tid', { ascending: false })
    .limit(antall)

  return (data ?? []).map((r) => ({
    id: r.id as number,
    systemId: r.system_id as string,
    kilde: r.kilde as StatusMaaling['kilde'],
    tilstand: r.tilstand as StatusMaaling['tilstand'],
    melding: r.melding as string | null,
    detaljer: (r.detaljer ?? {}) as Record<string, unknown>,
    svartidMs: r.svartid_ms as number | null,
    maltTid: r.malt_tid as string,
  }))
}

/**
 * Nyeste lagrede måling per system og kilde, som reserve når et
 * live-kall feiler.
 *
 * Nøkkelen er `${systemId}:${kilde}`.
 *
 * Henter de siste 300 radene og plukker den nyeste per nøkkel i
 * JavaScript, framfor en `distinct on`-spørring. Grunnen er at
 * PostgREST ikke har `distinct on`, og alternativet – en databasevisning
 * – ville lagt en migrasjon til for noe som med ti systemer og tre
 * målinger om dagen er tretti rader i døgnet.
 *
 * `maksAlderTimer` er 26 og ikke 6, fordi cron-en bare kjører én gang i
 * døgnet. Vercel tillater ikke oftere på Hobby-planen – en hyppigere
 * cron-uttrykk får hele utrullingen til å feile. Med 26 timer finnes det
 * alltid en måling å falle tilbake på, med en times slark for at
 * invokeringen kan komme hvor som helst i timen.
 *
 * At en gammel måling ikke villeder, hviler derfor helt på at alderen
 * ALLTID vises ved siden av tilstanden. «Pauset · for 14 timer siden» er
 * ærlig og nyttig; «Pauset» alene ville vært en påstand om nåtiden vi
 * ikke kan stå for. Se Kildelinje i src/components/tilstand.tsx – fjernes
 * aldersvisningen der, må dette tallet ned igjen.
 */
export async function hentReserveMaalinger(
  maksAlderTimer = 26,
): Promise<Map<string, StatusMaaling>> {
  const supabase = await lagServerKlient()
  const grense = new Date(
    Date.now() - maksAlderTimer * 60 * 60 * 1000,
  ).toISOString()

  const { data } = await supabase
    .from('status_maalinger')
    .select('*')
    .gte('malt_tid', grense)
    .order('malt_tid', { ascending: false })
    .limit(300)

  const kart = new Map<string, StatusMaaling>()

  for (const r of data ?? []) {
    const nøkkel = `${r.system_id}:${r.kilde}`
    // Radene kommer nyeste først, så den første vi ser er den vi vil ha.
    if (kart.has(nøkkel)) continue

    kart.set(nøkkel, {
      id: r.id as number,
      systemId: r.system_id as string,
      kilde: r.kilde as StatusMaaling['kilde'],
      tilstand: r.tilstand as StatusMaaling['tilstand'],
      melding: r.melding as string | null,
      detaljer: (r.detaljer ?? {}) as Record<string, unknown>,
      svartidMs: r.svartid_ms as number | null,
      maltTid: r.malt_tid as string,
    })
  }

  return kart
}

export async function hentHendelser(antall = 100): Promise<Hendelse[]> {
  const supabase = await lagServerKlient()
  const { data } = await supabase
    .from('hendelseslogg')
    .select('id, utfort_av_epost, handling, system_id, detaljer, tid')
    .order('tid', { ascending: false })
    .limit(antall)

  return (data ?? []).map((r) => ({
    id: r.id as number,
    utfortAvEpost: r.utfort_av_epost as string | null,
    handling: r.handling as string,
    systemId: r.system_id as string | null,
    detaljer: (r.detaljer ?? {}) as Record<string, unknown>,
    tid: r.tid as string,
  }))
}

/**
 * Skriver en linje i hendelsesloggen.
 *
 * Service role fordi tabellen ikke har noen insert-policy: en logg som
 * kan skrives av den innloggede brukeren kan også formes av den.
 *
 * Feiler stille. En logg som ikke kan skrives skal ikke gjøre at en
 * brukeropprettelse rulles tilbake – da mister man handlingen i tillegg
 * til loggen.
 */
export async function logg(
  handling: string,
  opplysninger: {
    utfortAv?: string
    utfortAvEpost?: string
    systemId?: string | null
    detaljer?: Record<string, unknown>
  } = {},
): Promise<void> {
  const { error } = await supabaseAdmin.from('hendelseslogg').insert({
    handling,
    utfort_av: opplysninger.utfortAv ?? null,
    utfort_av_epost: opplysninger.utfortAvEpost ?? null,
    system_id: opplysninger.systemId ?? null,
    detaljer: opplysninger.detaljer ?? {},
  })

  if (error) {
    console.error(`Kunne ikke logge «${handling}»: ${error.message}`)
  }
}
