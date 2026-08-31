import { after } from 'next/server'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hentOversikt } from '@/lib/helse'
import { hentTokenKart, tokenFor } from '@/lib/kontoar'
import { sendLivstegn } from '@/lib/livstegn'
import type { System } from '@/lib/typer'

/* ═══════════════════════════════════════════════════════════
   Cron: lagrer en statusmåling for hvert system.

   Oversikten henter status live hver gang den vises, så denne ruten er
   ikke der for å gjøre forsiden rask. Den er der for å svare på «hvor
   lenge har dette vært nede» – et spørsmål ingen live-henting kan
   besvare, fordi svaret krever at noen har sett etter mens du sov.

   Route handlers er dynamiske som standard i Next 16, så ingen
   cache-erklæring er nødvendig her.
   ═══════════════════════════════════════════════════════════ */

/** Målinger eldre enn dette slettes. Nok til å se et mønster, lite nok
    til at tabellen ikke vokser i det uendelige. */
const OPPBEVARING_DAGER = 60

/*
 * Cron-en kjører én gang i døgnet, kl. 06 UTC. Ikke oftere, og det er
 * ikke et valg: Vercel avviser hyppigere uttrykk på Hobby-planen med
 * feilet utrulling. På Hobby kan invokeringen dessuten komme hvor som
 * helst i den timen, for å spre last – derfor er reservevinduet i
 * hentReserveMaalinger 26 timer og ikke 24.
 *
 * Oversikten henter live uansett, så én gang i døgnet er nok: denne
 * ruten er for historikk og for å ha noe å falle tilbake på.
 */

export async function GET(request: Request) {
  /*
   * Vercel sender CRON_SECRET som Bearer-token på cron-kall. Uten
   * sjekken er dette et åpent endepunkt hvem som helst kan bruke til å
   * utløse et titalls API-kall mot Supabase og Vercel på våre tokens –
   * og til å ratebegrense oss ut av vår egen driftsovervåking.
   *
   * Er hemmeligheten ikke satt, avvises alt. Å åpne ruten fordi
   * konfigurasjonen mangler er den verste av de to feilene.
   */
  const oppgitt = request.headers.get('authorization')
  if (!env.CRON_SECRET || oppgitt !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ feil: 'Ikke autorisert' }, { status: 401 })
  }

  /*
   * Service role: ingen bruker er innlogget under et cron-kall, så det finnes
   * ingen sesjon radsikkerheten kan vurdere.
   *
   * `overvakes` filtreres IKKE her lenger. Det gjorde den, og konsekvensen var
   * at qr-admin – som står uten tilsyn fordi ingen skal varsles om den – heller
   * aldri fikk livstegn. «Ikke varsle meg om dette» og «la denne dø» er to
   * forskjellige ting, og kolonnen betyr det første. Målingene filtreres på den
   * lenger ned, der den hører.
   */
  const { data, error } = await supabaseAdmin
    .from('systemer')
    .select('*')
    .eq('aktiv', true)
    .order('sortering')

  if (error) {
    return Response.json(
      { feil: `Kunne ikke hente systemer: ${error.message}` },
      { status: 500 },
    )
  }

  const systemer: System[] = (data ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    navn: r.navn,
    beskrivelse: r.beskrivelse,
    kontoId: r.konto_id,
    supabaseProsjektRef: r.supabase_prosjekt_ref,
    supabaseUrl: r.supabase_url,
    dbSkjema: r.db_skjema,
    livstegnTabell: r.livstegn_tabell ?? null,
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
  }))

  /*
   * Livstegnet OG målingen, samtidig.
   *
   * Cron-en målte bare status, gjennom Management-API-et – altså
   * kontrollplanet, som ikke teller som trafikk på prosjektet. Resultatet var
   * at overvåkingen så at prosjektene nærmet seg pause, dag for dag, og ikke
   * gjorde noe med det. Utleie ble pauset mens denne ruten kjørte hver morgen.
   *
   * Dette er DEN viktigste av de to: en knapp hjelper bare den dagen noen
   * husker å trykke, mens ett livstegn i døgnet er nok når grensen er sju.
   */
  const tokenKart = await hentTokenKart()

  /*
   * Ett livstegn per PROSJEKT, ikke per system.
   *
   * Lagersystemet og heimesida deler prosjekt – lagersystemet ligger i skjemaet
   * `lager` i heimesidas base, fordi gratisplanen bare gir to aktive prosjekt
   * per konto. Uten denne dedupliseringen ville de fått to identiske livstegn
   * hver morgen, og cron-svaret ville påstått at to prosjekt var holdt i live
   * når det var ett.
   */
  const perProsjekt = new Map<string, (typeof systemer)[number]>()
  for (const s of systemer) {
    if (s.supabaseProsjektRef && !perProsjekt.has(s.supabaseProsjektRef)) {
      perProsjekt.set(s.supabaseProsjektRef, s)
    }
  }

  // Bare systemer med tilsyn MÅLES. Alle med database får livstegn.
  const overvåkte = systemer.filter((s) => s.overvakes)

  const [oversikt, livstegn] = await Promise.all([
    hentOversikt(overvåkte),
    Promise.all(
      [...perProsjekt.values()].map(async (s) => {
        const token = tokenFor(tokenKart, s.kontoId)
        if (!token) return { slug: s.slug, hoppet: 'ingen token' }
        const r = await sendLivstegn(token, s.supabaseProsjektRef!, s.livstegnTabell)
        return {
          slug: s.slug,
          ref: s.supabaseProsjektRef,
          basenSvarte: r.basenSvarte,
          restNåddeFram: r.restNåddeFram,
          serPausetUt: r.serPausetUt,
          linjer: r.linjer,
        }
      }),
    ),
  ])

  const rader = oversikt.systemer.flatMap((s) =>
    s.maalinger.map((m) => ({
      system_id: s.system.id,
      kilde: m.kilde,
      tilstand: m.tilstand,
      melding: m.melding,
      detaljer: m.detaljer,
      svartid_ms: m.svartidMs,
    })),
  )

  if (rader.length > 0) {
    const { error: skriveFeil } = await supabaseAdmin
      .from('status_maalinger')
      .insert(rader)

    if (skriveFeil) {
      return Response.json(
        { feil: `Kunne ikke lagre målinger: ${skriveFeil.message}` },
        { status: 500 },
      )
    }
  }

  /*
   * Opprydding etter at svaret er sendt. En slett-spørring skal ikke
   * gjøre at cron-kallet ser ut som et tidsavbrudd i Vercel-loggen –
   * målingene er alt lagret på det tidspunktet, som er det som betyr noe.
   */
  after(async () => {
    const grense = new Date(
      Date.now() - OPPBEVARING_DAGER * 24 * 60 * 60 * 1000,
    ).toISOString()

    const { error: ryddeFeil } = await supabaseAdmin
      .from('status_maalinger')
      .delete()
      .lt('malt_tid', grense)

    if (ryddeFeil) {
      console.error(`Kunne ikke rydde statusmålinger: ${ryddeFeil.message}`)
    }
  })

  return Response.json({
    ok: true,
    systemer: systemer.length,
    maalinger: rader.length,
    nede: oversikt.systemer.filter((s) => s.samletTilstand === 'nede').length,
    // Utfallet per prosjekt tas med i svaret, ikke bare i en logg ingen leser.
    // Vercel viser svarkroppen på cron-kjøringen, og da er det der man ser at
    // livstegnet slutter å komme fram – før prosjektet pauses.
    livstegn,
  })
}
