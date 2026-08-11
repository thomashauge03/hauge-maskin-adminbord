import type {
  Kilde,
  Maaling,
  StatusMaaling,
  System,
  SystemStatus,
  Tilstand,
} from '@/lib/typer'
import { hentKontoar, hentTokenKart, tokenFor } from '@/lib/kontoar'
import {
  hentAktivitet,
  hentSupabaseProsjekter,
  type ProsjektStatus,
  type SupabaseProsjekt,
} from '@/lib/plattform/supabase-api'
import {
  hentVercelProsjekter,
  type DeployTilstand,
  type VercelProsjekt,
} from '@/lib/plattform/vercel'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Samler status for alle systemer til det oversikten viser.

   Ett kall per Supabase-KONTO pluss ett til Vercel – ikke ett per system.
   Begge leverandørene gir hele lista si i ett kall, med status og siste
   deploy inkludert, så tolv systemer koster fem kall og ikke
   tjuefire. Alternativet ville truffet ratebegrensningen på en travel dag.

   Grunnen til at det er per konto og ikke ett totalt: et Supabase-token
   ser bare prosjekter i organisasjoner den kontoen er med i, og
   systemene er fordelt på fire ulike innlogginger. Se lib/kontoar.ts.

   Detaljene – helse per tjeneste, diskbruk, radtall – hentes først på
   systemsiden, der man har bedt om dem.
   ═══════════════════════════════════════════════════════════ */

/**
 * Oversetter Supabase sin prosjektstatus til en av våre fire.
 *
 * Grupperingen er det som gjør forsiden lesbar: det er forskjell på
 * «pauset, men kan vekkes» og «restore feilet», og bare den siste skal
 * få noen ut av stolen.
 */
function fraSupabaseStatus(status: ProsjektStatus): {
  tilstand: Tilstand
  melding: string
} {
  switch (status) {
    case 'ACTIVE_HEALTHY':
      return { tilstand: 'ok', melding: 'Aktiv' }

    // Pauset er ikke feil – gratisprosjekter pauses etter en uke uten
    // trafikk. Men det betyr at appen er nede for brukerne, så det kan
    // ikke være grønt heller.
    case 'INACTIVE':
      return { tilstand: 'advarsel', melding: 'Pauset' }
    case 'PAUSING':
      return { tilstand: 'advarsel', melding: 'Pauses nå' }
    case 'RESTORING':
      return { tilstand: 'advarsel', melding: 'Gjenopprettes' }
    case 'COMING_UP':
      return { tilstand: 'advarsel', melding: 'Starter opp' }
    case 'RESTARTING':
      return { tilstand: 'advarsel', melding: 'Starter på nytt' }
    case 'UPGRADING':
      return { tilstand: 'advarsel', melding: 'Oppgraderes' }
    case 'RESIZING':
      return { tilstand: 'advarsel', melding: 'Endrer størrelse' }

    case 'ACTIVE_UNHEALTHY':
      return { tilstand: 'nede', melding: 'Aktiv, men usunn' }
    case 'GOING_DOWN':
      return { tilstand: 'nede', melding: 'Går ned' }
    case 'INIT_FAILED':
      return { tilstand: 'nede', melding: 'Oppsett feilet' }
    case 'RESTORE_FAILED':
      return { tilstand: 'nede', melding: 'Gjenoppretting feilet' }
    case 'PAUSE_FAILED':
      return { tilstand: 'nede', melding: 'Pausing feilet' }
    case 'REMOVED':
      return { tilstand: 'nede', melding: 'Slettet' }

    case 'UNKNOWN':
      return { tilstand: 'ukjent', melding: 'Supabase vet ikke' }
  }
}

/** Oversetter Vercel sin byggetilstand til en av våre fire. */
function fraDeployTilstand(tilstand: DeployTilstand): {
  tilstand: Tilstand
  melding: string
} {
  switch (tilstand) {
    case 'READY':
      return { tilstand: 'ok', melding: 'Utrullet' }

    // Bygget feilet, men forrige versjon kjører fortsatt. Nettsiden er
    // altså oppe – det er endringen som ikke kom ut. Derfor advarsel og
    // ikke «nede»: det er to helt ulike ting å rykke ut på.
    case 'ERROR':
      return { tilstand: 'advarsel', melding: 'Byggefeil' }
    case 'CANCELED':
      return { tilstand: 'advarsel', melding: 'Avbrutt' }
    case 'BUILDING':
      return { tilstand: 'advarsel', melding: 'Bygger' }
    case 'QUEUED':
      return { tilstand: 'advarsel', melding: 'I kø' }
    case 'INITIALIZING':
      return { tilstand: 'advarsel', melding: 'Starter bygg' }

    case 'BLOCKED':
      return { tilstand: 'nede', melding: 'Blokkert' }
    case 'DELETED':
      return { tilstand: 'nede', melding: 'Slettet' }
  }
}

/**
 * Hvor mange døgn før en ventet pause vi begynner å varsle.
 *
 * To, fordi Supabase kan pause hvor som helst i det sjuende døgnet, og
 * fordi det må være tid til å faktisk gjøre noe. Ett døgn ville betydd
 * at varselet kom samtidig som pausen.
 */
export const VARSLE_DAGER_FOR_PAUSE = 2

/** Verste tilstand vinner. Ett rødt system skal ikke skjules bak ni grønne. */
const vekt: Record<Tilstand, number> = {
  ok: 0,
  ukjent: 1,
  advarsel: 2,
  nede: 3,
}

export function verste(tilstander: Tilstand[]): Tilstand {
  if (tilstander.length === 0) return 'ukjent'
  return tilstander.reduce((a, b) => (vekt[b] > vekt[a] ? b : a))
}

/** Samme nøkkelform som hentReserveMaalinger bruker. */
function nøkkel(systemId: string, kilde: Kilde): string {
  return `${systemId}:${kilde}`
}

/**
 * Bytter en «uvisst»-måling mot siste lagrede, om den finnes.
 *
 * Bare `ukjent` byttes. En måling som faktisk fikk svar – også et dårlig
 * svar – skal aldri overskrives av noe eldre: da ville et system som
 * nettopp gikk ned blitt vist som grønt fordi det var grønt i morges.
 */
function brukReserve(
  maaling: Maaling,
  systemId: string,
  reserve: Map<string, StatusMaaling>,
): Maaling {
  if (maaling.tilstand !== 'ukjent') return maaling

  const lagret = reserve.get(nøkkel(systemId, maaling.kilde))
  if (!lagret) return maaling

  return {
    kilde: maaling.kilde,
    tilstand: lagret.tilstand,
    melding: lagret.melding,
    detaljer: lagret.detaljer,
    // Svartiden er fra det feilede kallet, ikke fra den lagrede
    // målingen: det er den som sier noe om hva som skjer nå.
    svartidMs: maaling.svartidMs,
    fraLager: lagret.maltTid,
  }
}

export type Oversikt = {
  systemer: SystemStatus[]
  /**
   * Da statusen ble hentet, i millisekunder.
   *
   * Følger med dataene i stedet for å bli lest med Date.now() nede i
   * visningen. En komponent som leser klokka under rendring er ikke
   * ren – den gir ulikt svar hver gang React rendrer den om igjen, og
   * alle «for 3 minutter siden» i samme visning kan bli regnet fra
   * ulike øyeblikk. Her er tidspunktet en del av målingen, som er det
   * det egentlig er.
   */
  hentetMs: number
  /** Satt når hele Vercel-integrasjonen ikke kunne brukes. */
  vercelFeil: string | null
  /** Satt bare når ALLE Supabase-kontoene feilet. */
  supabaseFeil: string | null
  /** Konto-id-er som mangler token. En oppsettsmangel, ikke et driftsavvik. */
  kontoerUtenToken: string[]
  /** Vercel-prosjekter som ikke er koblet til noe system i registeret. */
  ukobledeVercel: VercelProsjekt[]
  /** Supabase-prosjekter som ikke er koblet til noe system i registeret. */
  ukobledeSupabase: SupabaseProsjekt[]
}

/**
 * Bare de uregistrerte prosjektene, uten all statusen rundt.
 *
 * Egen funksjon fordi denne lista hører på registersiden og ikke på
 * forsiden. Forsiden skal svare på «er noe galt med det jeg driver»;
 * «her er fem prosjekter du har glemt» er en oppryddingsjobb, og den
 * hører der man rydder.
 *
 * Koster de samme fem kallene som oversikten, men på en egen sidelast.
 */
export async function hentUkobledeProsjekter(systemer: System[]): Promise<{
  supabase: SupabaseProsjekt[]
  vercel: VercelProsjekt[]
  feil: string | null
}> {
  const tokenKart = await hentTokenKart()

  const kontoerIBruk = [
    ...new Set(
      systemer.filter((s) => s.supabaseProsjektRef).map((s) => s.kontoId ?? null),
    ),
  ]
  const tokens = kontoerIBruk
    .map((k) => tokenFor(tokenKart, k))
    .filter((t): t is string => Boolean(t))

  const [vercelSvar, ...kontoSvar] = await Promise.all([
    hentVercelProsjekter(),
    ...tokens.map((t) => hentSupabaseProsjekter(t)),
  ])

  /*
   * Sammenligner mot ALLE systemer, også skjulte og utgåtte. Et prosjekt
   * som er registrert på et skjult system er ikke ukjent – det er
   * registrert, og skal ikke dukke opp her og be om oppmerksomhet igjen.
   */
  const brukteRefer = new Set(
    systemer.map((s) => s.supabaseProsjektRef).filter(Boolean),
  )
  const brukteVercel = new Set(
    systemer.flatMap((s) =>
      [s.vercelProsjektId, s.vercelProsjektNavn].filter(Boolean),
    ),
  )

  return {
    supabase: kontoSvar
      .flatMap((s) => (s.ok ? s.data : []))
      .filter((p) => !brukteRefer.has(p.ref)),
    vercel: (vercelSvar.ok ? vercelSvar.data : []).filter(
      (p) => !brukteVercel.has(p.id) && !brukteVercel.has(p.navn),
    ),
    feil: vercelSvar.ok ? null : vercelSvar.feil.melding,
  }
}

/**
 * Henter status for alle systemer.
 *
 * De to plattformkallene startes samtidig og ventes på sammen. Kjørte de
 * etter hverandre, ville forsiden brukt summen av begge tidsfristene –
 * seksten sekunder i verste fall – i stedet for den lengste.
 *
 * `reserve` er nyeste lagrede måling per system og kilde, fra
 * hentReserveMaalinger. Er den oppgitt, brukes den når et live-kall
 * feiler, med alderen synlig i visningen. «Pauset, fra kl. 07:15» er
 * kvalitativt bedre enn «Uvisst».
 *
 * Cron-ruten sender den bevisst IKKE: den skal skrive det den faktisk
 * målte nå. Ellers ville en 429 blitt lagret som en fersk måling av noe
 * som skjedde seks timer før, og historikken – som er hele grunnen til
 * at tabellen finnes – ville forfalsket seg selv.
 */
export async function hentOversikt(
  systemer: System[],
  reserve?: Map<string, StatusMaaling>,
): Promise<Oversikt> {
  /*
   * Ett Supabase-kall per KONTO, ikke ett totalt og ikke ett per system.
   *
   * Systemene ligger under fire ulike innlogginger, og et token ser bare
   * prosjekter i organisasjoner den kontoen er med i. Ett kall ville
   * derfor vist tre av tolv systemer som «finnes ikke», uten at noe var
   * galt. Ett kall per system ville vært tolv kall der fire holder.
   *
   * Kontoer uten token hoppes over her og havner i `manglerToken`, som
   * grensesnittet viser som en egen beskjed – det er en
   * oppsettsmangel, ikke et driftsavvik.
   */
  const [tokenKart, kontoar] = await Promise.all([hentTokenKart(), hentKontoar()])
  const epostFor = new Map(kontoar.map((k) => [k.id, k.epost]))

  const kontoerIBruk = [
    ...new Set(
      systemer
        .filter((s) => s.supabaseProsjektRef)
        .map((s) => s.kontoId ?? null),
    ),
  ]

  const manglerToken: string[] = []
  const kontoOppslag: { kontoId: string | null; token: string }[] = []
  for (const kontoId of kontoerIBruk) {
    const token = tokenFor(tokenKart, kontoId)
    if (token) kontoOppslag.push({ kontoId, token })
    else if (kontoId) manglerToken.push(kontoId)
  }

  // Alle kontoene og Vercel startes samtidig. Etter hverandre ville
  // forsiden brukt summen av tidsfristene – over førti sekunder med fire
  // kontoer i verste fall.
  const [vercelSvar, ...kontoSvar] = await Promise.all([
    hentVercelProsjekter(),
    ...kontoOppslag.map((k) => hentSupabaseProsjekter(k.token)),
  ])

  const vercelListe = vercelSvar.ok ? vercelSvar.data : []

  /*
   * Prosjektene fra alle kontoene slås sammen til én liste. Refene er
   * globalt unike hos Supabase, så det kan ikke kollidere.
   */
  const supabaseListe = kontoSvar.flatMap((s) => (s.ok ? s.data : []))

  // Feilen fra en konto gjelder bare systemene under den. Vi tar vare på
  // den per konto, slik at ett utløpt token ikke får ni friske systemer
  // til å se uvisse ut.
  const feilPerKonto = new Map<string | null, string>()
  kontoSvar.forEach((s, i) => {
    if (!s.ok) feilPerKonto.set(kontoOppslag[i].kontoId, s.feil.melding)
  })

  const supabaseSvartid = Math.max(0, ...kontoSvar.map((s) => s.svartidMs))

  /*
   * Aktivitet per prosjekt: nar hadde databasen sist trafikk.
   *
   * Dette er forvarselet for appen gar ned. Et gratisprosjekt uten
   * trafikk i sju dogn blir pauset, og statusen sier ACTIVE_HEALTHY helt
   * til det skjer. Uten dette tallet er det ingen advarsel - bare en app
   * som plutselig er dod.
   *
   * Ett kall per prosjekt, alle samtidig. Analysendepunktene har egen
   * ratebegrensning per prosjekt, sa atte samtidige kall er trygt.
   */
  const medRef = systemer.filter(
    (s) => s.supabaseProsjektRef && tokenFor(tokenKart, s.kontoId),
  )
  const aktivitetSvar = await Promise.all(
    medRef.map((s) =>
      hentAktivitet(tokenFor(tokenKart, s.kontoId), s.supabaseProsjektRef!),
    ),
  )
  const aktivitetKart = new Map<string, SystemStatus['aktivitet']>()
  medRef.forEach((s, i) => {
    const a = aktivitetSvar[i]
    if (a.ok) {
      aktivitetKart.set(s.id, {
        sisteAktivitet: a.data.sisteAktivitet,
        dagerSiden: a.data.dagerSiden,
        dagerTilPause: a.data.dagerTilPause,
      })
    }
  })

  const vercelKart = new Map(vercelListe.map((p) => [p.id, p]))
  const vercelNavnKart = new Map(vercelListe.map((p) => [p.navn, p]))
  const supabaseKart = new Map(supabaseListe.map((p) => [p.ref, p]))

  const brukteVercel = new Set<string>()
  const brukteSupabase = new Set<string>()

  const status: SystemStatus[] = systemer.map((system) => {
    const maalinger: Maaling[] = []

    // ── Supabase ──
    if (system.supabaseProsjektRef) {
      const p = supabaseKart.get(system.supabaseProsjektRef)
      if (p) brukteSupabase.add(p.ref)

      // Feilen som gjelder DETTE systemet, ikke en samlefeil. Et utløpt
      // token på én konto skal ikke gjøre systemene under de tre andre
      // uvisse.
      const kontoFeil = feilPerKonto.get(system.kontoId ?? null)
      const harToken = Boolean(tokenFor(tokenKart, system.kontoId))

      if (!harToken) {
        maalinger.push({
          kilde: 'supabase',
          tilstand: 'ukjent',
          melding: 'Mangler token for kontoen som eier prosjektet',
          detaljer: { kontoId: system.kontoId },
          svartidMs: 0,
        })
      } else if (kontoFeil) {
        maalinger.push({
          kilde: 'supabase',
          tilstand: 'ukjent',
          melding: kontoFeil,
          detaljer: {},
          svartidMs: supabaseSvartid,
        })
      } else if (!p) {
        maalinger.push({
          kilde: 'supabase',
          tilstand: 'ukjent',
          // Tokenet svarte, men prosjektet var ikke i lista. Da er det
          // registrert på feil konto, eller refen er skrevet feil.
          melding:
            'Prosjektet er ikke i lista til den kontoen. Feil konto registrert?',
          detaljer: { ref: system.supabaseProsjektRef },
          svartidMs: supabaseSvartid,
        })
      } else {
        const { tilstand, melding } = fraSupabaseStatus(p.status)
        maalinger.push({
          kilde: 'supabase',
          tilstand,
          melding,
          detaljer: {
            status: p.status,
            region: p.region,
            postgres: p.postgresVersjon,
          },
          svartidMs: supabaseSvartid,
        })
      }
    }

    // ── Vercel ──
    // Kobler på ID når den finnes, ellers på navn. Navnekoblingen er
    // der for at et system skal kunne registreres før man har gravd
    // fram prosjekt-ID-en fra Vercel.
    const vp =
      (system.vercelProsjektId && vercelKart.get(system.vercelProsjektId)) ||
      (system.vercelProsjektNavn && vercelNavnKart.get(system.vercelProsjektNavn)) ||
      null

    if (system.vercelProsjektId || system.vercelProsjektNavn) {
      if (vp) brukteVercel.add(vp.id)

      if (!vercelSvar.ok) {
        maalinger.push({
          kilde: 'vercel',
          tilstand: 'ukjent',
          melding: vercelSvar.feil.melding,
          detaljer: {},
          svartidMs: vercelSvar.svartidMs,
        })
      } else if (!vp) {
        maalinger.push({
          kilde: 'vercel',
          tilstand: 'ukjent',
          melding: 'Prosjektet finnes ikke på Vercel-kontoen.',
          detaljer: {},
          svartidMs: vercelSvar.svartidMs,
        })
      } else if (vp.pauset) {
        maalinger.push({
          kilde: 'vercel',
          tilstand: 'advarsel',
          melding: 'Prosjektet er pauset på Vercel',
          detaljer: {},
          svartidMs: vercelSvar.svartidMs,
        })
      } else if (!vp.produksjon) {
        maalinger.push({
          kilde: 'vercel',
          tilstand: 'ukjent',
          melding: 'Ingen produksjonsutrulling ennå',
          detaljer: {},
          svartidMs: vercelSvar.svartidMs,
        })
      } else {
        const d = vp.produksjon
        const { tilstand, melding } = fraDeployTilstand(d.tilstand)
        maalinger.push({
          kilde: 'vercel',
          tilstand,
          // Et READY-bygg som ikke fikk domenet sitt er ikke oppe for
          // brukeren, selv om Vercel kaller det klart.
          melding: d.aliasFeil ? `${melding}, men domenet feilet` : melding,
          detaljer: {
            deployId: d.id,
            readyState: d.tilstand,
            url: d.url,
            opprettet: d.opprettet,
            commitGren: d.commitGren,
            commitMelding: d.commitMelding,
            feilmelding: d.feilmelding,
          },
          svartidMs: vercelSvar.svartidMs,
        })
      }
    }

    /*
     * Bytter ut «uvisst» med siste lagrede måling der vi har en.
     *
     * Gjøres her, etter at alle kildene er samlet, i stedet for inne i
     * hver gren over. Ellers måtte det samme oppslaget gjentas seks
     * steder, og den ene grenen som ble glemt ville sett tilfeldig
     * dårligere ut enn de andre.
     */
    const medReserve = reserve
      ? maalinger.map((m) => brukReserve(m, system.id, reserve))
      : maalinger

    const aktivitet = aktivitetKart.get(system.id) ?? null

    /*
     * Naer pause er en advarsel i seg selv.
     *
     * To dogn er valgt fordi Supabase kan pause hvor som helst i det
     * sjuende dognet, og fordi det ma vaere tid til a rekke a gjore noe.
     * Vi eskalerer bare til advarsel - aldri til nede, for databasen
     * virker fortsatt akkurat na.
     */
    const naerPause =
      aktivitet?.dagerTilPause !== null &&
      aktivitet?.dagerTilPause !== undefined &&
      aktivitet.dagerTilPause <= VARSLE_DAGER_FOR_PAUSE

    const tilstander = medReserve.map((m) => m.tilstand)
    if (naerPause) tilstander.push('advarsel')

    return {
      system,
      maalinger: medReserve,
      samletTilstand: verste(tilstander),
      kontoEpost: system.kontoId
        ? (epostFor.get(system.kontoId) ?? null)
        : null,
      aktivitet,
    }
  })

  return {
    systemer: status,
    hentetMs: Date.now(),
    vercelFeil: vercelSvar.ok ? null : vercelSvar.feil.melding,
    // Bare satt når ALLE kontoene feilet. Feiler én av fire, er det ikke
    // integrasjonen som er nede, og en stripe øverst ville vært feil.
    supabaseFeil:
      kontoOppslag.length > 0 && feilPerKonto.size === kontoOppslag.length
        ? [...feilPerKonto.values()][0]
        : null,
    kontoerUtenToken: manglerToken,
    // Dette er halve poenget med adminbordet: å se hva som finnes ute
    // som ikke står i registeret. Et Vercel-prosjekt ingen husker er
    // enten glemt eller noe som skulle vært slettet.
    ukobledeVercel: vercelListe.filter((p) => !brukteVercel.has(p.id)),
    ukobledeSupabase: supabaseListe.filter((p) => !brukteSupabase.has(p.ref)),
  }
}
