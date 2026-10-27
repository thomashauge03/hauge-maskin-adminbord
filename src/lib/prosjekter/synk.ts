import { supabaseAdmin } from '@/lib/supabase/admin'
import { alleRader } from '@/lib/supabase/alle-rader'
import { medHøyst } from '@/lib/samtidig'
import { alleKilder, utførEndringer, type Kilde } from './kilder'
import { planleggUtskriving, type AppRad, type Prosjekt } from './plan'
import { hentFraSmartdok, type Smartdokresultat } from './smartdok'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Synken: den felles lista ut til appene.

   Bare én vei. Prosjektene opprettes i SmartDok og hentes inn i navet først
   i hver kjøring, og appene skal ikke ha egne. Et prosjekt en app har som ikke står i lista,
   settes inaktivt der, men slettes ikke: bestillinger, utleier og tilbud
   henger på det.

   En app som feiler, stopper ikke de andre. Den står med feilen i
   resultatet, og tas igjen ved neste kjøring.
   ═══════════════════════════════════════════════════════════ */

export type AppResultat = {
  slug: string
  navn: string
  ok: boolean
  feil?: string
  /** Fra navet ut til appen. */
  nye: number
  endret: number
  /** Appens egne prosjekter, satt inaktive. */
  deaktivert: number
  hoppetOver: number
}

export type Synkresultat =
  | { opptatt: true }
  | {
      opptatt: false
      ferdig: string
      prosjekter: number
      /** Null når SmartDok ikke er satt opp. Mangler i resultater fra før API-hentingen. */
      smartdok?: Smartdokresultat | null
      apper: AppResultat[]
    }

/** Lengre enn en kjøring tar, kortere enn intervallet i pg_cron. */
const LÅS_SEKUNDER = 240

export async function hentNavet(): Promise<(Prosjekt & { id: string; kilde: string; endret: string })[]> {
  return alleRader('prosjekter', (fra, til) =>
    supabaseAdmin
      .from('prosjekter')
      .select('id, nummer, navn, kunde, adresse, aktiv, kilde, endret')
      .order('nummer')
      .range(fra, til),
  )
}

function melding(feil: unknown) {
  return feil instanceof Error ? feil.message : String(feil)
}

export async function synkProsjekter(): Promise<Synkresultat> {
  const { data: fikkLås } = await supabaseAdmin.rpc('ta_prosjekt_synk_las', { sekunder: LÅS_SEKUNDER })
  if (fikkLås !== true) return { opptatt: true }

  try {
    const kilder = alleKilder()
    // Innenfor låsen, så to kjøringer ikke legger inn de samme nye prosjektene.
    // Feiler SmartDok, går lista ut slik den står: appene skal ikke vente på det.
    const smartdok = await hentFraSmartdok(await hentNavet()).catch(
      (e): Smartdokresultat => ({ ok: false, feil: melding(e) }),
    )
    const navet: Prosjekt[] = await hentNavet()

    const hentet = await medHøyst(5, kilder, async (kilde) => {
      try {
        return { kilde, rader: await kilde.hent(), feil: null as string | null }
      } catch (e) {
        return { kilde, rader: [] as AppRad[], feil: melding(e) }
      }
    })

    const apper = await medHøyst(5, hentet, async ({ kilde, rader, feil }): Promise<AppResultat> => {
      const grunnlag = { slug: kilde.slug, navn: kilde.navn }
      if (feil) return { ...grunnlag, ok: false, feil, nye: 0, endret: 0, deaktivert: 0, hoppetOver: 0 }
      return skrivUt(kilde, navet, rader, grunnlag)
    })

    const resultat: Synkresultat = {
      opptatt: false,
      ferdig: new Date().toISOString(),
      prosjekter: navet.length,
      smartdok,
      apper,
    }

    await supabaseAdmin
      .from('prosjekt_synk')
      .update({ sist_ferdig: resultat.ferdig, sist_resultat: resultat })
      .eq('id', 1)

    return resultat
  } finally {
    await supabaseAdmin.from('prosjekt_synk').update({ laast_til: null }).eq('id', 1)
  }
}

async function skrivUt(
  kilde: Kilde,
  navet: Prosjekt[],
  rader: AppRad[],
  grunnlag: Pick<AppResultat, 'slug' | 'navn'>,
): Promise<AppResultat> {
  const plan = planleggUtskriving(navet, rader, kilde.valg)
  try {
    if (plan.nye.length > 0) await kilde.leggTil(plan.nye)
    await utførEndringer(kilde, plan.endringer)
    return {
      ...grunnlag,
      ok: true,
      nye: plan.nye.length,
      endret: plan.endringer.length - plan.deaktivert,
      deaktivert: plan.deaktivert,
      hoppetOver: plan.hoppetOver.length,
    }
  } catch (e) {
    return {
      ...grunnlag,
      ok: false,
      feil: melding(e),
      nye: 0,
      endret: 0,
      deaktivert: 0,
      hoppetOver: plan.hoppetOver.length,
    }
  }
}

export async function hentSisteSynk() {
  const { data } = await supabaseAdmin
    .from('prosjekt_synk')
    .select('sist_ferdig, sist_resultat, laast_til')
    .eq('id', 1)
    .maybeSingle()
  return data as { sist_ferdig: string | null; sist_resultat: Synkresultat | null; laast_til: string | null } | null
}
