import { hentAlleBrukere, samlePåEpost } from '@/lib/brukere'
import type { System } from '@/lib/typer'
import { Feilstripe, Kort, KortTittel, Merke, Snurr, Tallkort } from '@/components/ui'
import { hentAlleRoller, hentAlleTilgangsoppsett } from '@/lib/tilgang'
import { tilgangsmerke } from '@/lib/tilgangsmerke'
import { Tilgangsmatrise } from './tilgangsmatrise'
import type { CelleVisning, PersonVisning, SystemVisning } from './visning'

/**
 * Kontoer og tilgang i alle systemene. Egen komponent bak en Suspense-grense
 * fordi den spør én database per system – den trege delen av siden.
 */
export async function Brukerliste({
  systemer,
  erEier,
}: {
  systemer: System[]
  erEier: boolean
}) {
  /*
   * Én bølge, to kall mot navet, så én runde mot prosjektene.
   *
   * Oppsettet MÅ være hentet før prosjektene spørres, siden det er det som
   * bestemmer spørringen – men det er ett kall for alle systemene, ikke ett
   * per system slik det var før. Rollene i hvert system hentes i den samme
   * runden mot prosjektene, ikke i en egen etterpå.
   */
  const [oppsett, registrerteRoller] = await Promise.all([
    hentAlleTilgangsoppsett(),
    hentAlleRoller(),
  ])

  // Bare eier utløser reserveveien, som bruker systemenes service
  // role-nøkler. Se kommentaren på hentBrukereISystem.
  const { lister, hentetMs: naa } = await hentAlleBrukere(systemer, {
    brukReserve: erEier,
    oppsett,
    registrerteRoller,
  })

  const personer = samlePåEpost(lister)

  const feilende = lister.filter((l) => l.feil)
  const lest = lister.filter((l) => l.rader)
  const medReserve = lister.filter((l) => l.merknad)
  const avkortede = lister.filter((l) => l.avkortet)
  const utenOppsett = lest.filter((l) => l.veier.length === 0)
  // Systemer der tilgang ikke KAN gis herfra. For leveringseddel og rørlager
  // var det ikke en mangel: der ga enhver konto full tilgang.
  const uteSkriving = lest.filter(
    (l) => l.veier.length > 0 && !l.veier.some((v) => v.kanSkrive),
  )
  // Roller systemene har som registeret ikke beskriver. Sagt høyt, fordi en
  // ny rolle i en app er nettopp det adminbordet ikke fikk med seg før.
  const nyeRoller = lest.flatMap((l) =>
    l.roller.filter((r) => r.ny).map((r) => `${r.verdi} i ${l.system.navn}`),
  )

  const antallKontoer = lest.reduce(
    (s, l) => s + (l.rader?.filter((r) => r.harKonto).length ?? 0),
    0,
  )
  /*
   * Kontoer som kan logge inn uten å se noe.
   *
   * Andre kunders brukere holdes UTENFOR. Uten det ville kortet vært
   * markedsført som ryddearbeid mens det talte Techauge- og TT
   * Anlegg-ansatte, som ikke er våre å rydde i.
   */
  const kunKonto = lest.reduce(
    (s, l) =>
      s +
      (l.rader?.filter(
        (r) => r.harKonto && r.harTilgang === false && r.annenKunde === 0,
      ).length ?? 0),
    0,
  )
  const annenKunde = lest.reduce(
    (s, l) => s + (l.rader?.filter((r) => r.annenKunde > 0).length ?? 0),
    0,
  )

  const systemvisning: SystemVisning[] = lest.map((l) => {
    const skrivbar = l.veier.find((v) => v.kanSkrive)
    return {
      id: l.system.id,
      navn: l.system.navn,
      skrivbarVei: skrivbar?.etikett ?? null,
      hvorforLaast:
        l.veier.length === 0
          ? `Adminbordet vet ikke hvilken tabell som avgjør tilgang i ${l.system.navn}. Legg inn tilgangsoppsett for systemet først.`
          : (l.veier[0].notat ??
            `Ingen av tilgangsveiene i ${l.system.navn} er merket som skrivbar.`),
      roller: l.roller,
      krevArPassord: skrivbar?.brukerNokkel === 'auth_id',
    }
  })

  // Ett sted bygger cellen, så matrisen og panelet viser det samme.
  const personvisning: PersonVisning[] = personer.map((p) => {
    const celler: Record<string, CelleVisning> = {}
    for (const l of lest) {
      const rad = p.iSystem.get(l.system.slug)
      if (!rad) continue
      /* Rollen og «har tilgang» i panelet gjelder veien adminbordet SKRIVER i.
         En heimeside-admin har tilgang til lageret, men ikke som lagerrolle –
         og skulle ikke stå med «admin (nå)» i en liste der admin ikke kan velges. */
      const skrivVei = l.veier.find((v) => v.kanSkrive)?.etikett
      const iSkrivVei = rad.veier.find((v) => v.etikett === skrivVei)
      celler[l.system.id] = {
        merke: tilgangsmerke(rad, {
          systemNavn: l.system.navn,
          harOppsett: l.veier.length > 0,
        }),
        harTilgang: iSkrivVei !== undefined,
        andreVeier: rad.veier
          .filter((v) => v.etikett !== skrivVei)
          .map((v) => (v.rolle ? `${v.etikett} (${v.rolle})` : v.etikett)),
        deaktivert: iSkrivVei?.aktiv === false,
        rolle: iSkrivVei?.rolle ?? null,
        harKonto: rad.harKonto,
        authId: rad.authId,
        kontoSperret: rad.kontoAktiv === false,
        annenKundesKonto: rad.annenKunde > 0 && !rad.harTilgang,
        sistInnlogget: rad.sistInnlogget,
      }
    }
    return {
      epost: p.epost,
      antallMedTilgang: p.antallMedTilgang,
      sistInnlogget: p.sistInnlogget,
      celler,
    }
  })

  // Rader uten e-post – telefoninnlogging, eller en tilgangsrad som peker på
  // en slettet konto – samles ikke på person, så de ville ellers vært usynlige.
  const utenEpost = lest.flatMap((l) =>
    (l.rader ?? []).filter((r) => !r.epost).map((r) => ({ system: l.system.navn, rad: r })),
  )

  const merknader = medReserve.length + utenOppsett.length + uteSkriving.length

  return (
    <div className="space-y-6">
      {/* Feil står åpent og først. En kolonne som mangler fordi systemet ikke
          svarte, ser ellers ut som et system uten brukere. */}
      {feilende.length > 0 && (
        <Feilstripe tittel={`Kunne ikke lese ${feilende.length} system`}>
          <ul className="space-y-0.5">
            {feilende.map((l) => (
              <li key={l.system.id}>
                <strong>{l.system.navn}:</strong> {l.feil}
              </li>
            ))}
          </ul>
        </Feilstripe>
      )}

      {/* Avkorting skal SIES. En liste som stopper på grensen ser ellers ut
          som en komplett liste, og da tar man beslutninger på et utsnitt. */}
      {avkortede.length > 0 && (
        <Feilstripe tittel="Listen er avkortet">
          <p>
            {avkortede.map((l) => l.system.navn).join(', ')} har flere rader enn
            grensen på 500. Det som vises er de første – ikke alle.
          </p>
        </Feilstripe>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tallkort merkelapp="Personer" verdi={personer.length} under="unike e-poster" />
        <Tallkort
          merkelapp="Med tilgang"
          verdi={personer.filter((p) => p.antallMedTilgang > 0).length}
          under={`av ${antallKontoer} kontoer`}
        />
        <Tallkort merkelapp="Kun konto" verdi={kunKonto} under="kan logge inn, ser ingenting" />
        <Tallkort
          merkelapp="I flere systemer"
          verdi={personer.filter((p) => p.antallMedTilgang > 1).length}
          under="har flere passord i dag"
        />
      </div>

      {nyeRoller.length > 0 && (
        <p className="border-l-4 border-hm-amber bg-hm-amber/10 px-3 py-2 text-sm">
          <strong>Nye roller funnet:</strong> {nyeRoller.join(', ')}. De kan velges
          allerede, men har ingen beskrivelse i adminbordet ennå.
        </p>
      )}

      <Tilgangsmatrise
        personer={personvisning}
        systemer={systemvisning}
        erEier={erEier}
        naa={naa}
        lest={`${lest.length}/${lister.length} system lest`}
      />

      {annenKunde > 0 && (
        <p className="text-xs text-[var(--blekk-svak)]">
          {annenKunde} konto{annenKunde > 1 ? 'er' : ''} hører til andre kunder i en
          delt base og er ikke vårt ryddearbeid. De er merket «annen kunde», og
          innloggingen deres kan ikke sperres eller slettes herfra.
        </p>
      )}

      {utenEpost.length > 0 && (
        <Kort>
          <KortTittel handling={<Merke type="gul">{utenEpost.length}</Merke>}>
            Rader uten e-post
          </KortTittel>
          <ul className="divide-y divide-[var(--kant)]">
            {utenEpost.map(({ system, rad }) => (
              <li key={`${system}-${rad.authId}`} className="px-4 py-2.5 text-sm">
                <strong>{system}:</strong>{' '}
                <span className="hm-kode">{rad.authId ?? 'ukjent id'}</span>
                <span className="block text-xs text-[var(--blekk-svak)]">
                  {rad.harKonto
                    ? 'Konto uten e-post, typisk telefoninnlogging.'
                    : 'Tilgangsraden peker på en auth-bruker som ikke finnes. Sannsynligvis en slettet konto.'}
                </span>
              </li>
            ))}
          </ul>
        </Kort>
      )}

      {/* Bakgrunn, ikke beskjeder. Lå før som tre åpne kort over matrisen og
          dyttet det man kom for under skjermkanten. */}
      {merknader > 0 && (
        <details className="border-2 border-[var(--kant)] bg-[var(--flate-opp)]">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold">
            Om systemene
            <Merke>{merknader} merknad{merknader > 1 ? 'er' : ''}</Merke>
          </summary>
          <ul className="divide-y divide-[var(--kant)] border-t-2 border-[var(--kant)] text-sm">
            {medReserve.map((l) => (
              <li key={`reserve-${l.system.id}`} className="px-4 py-2.5">
                <p className="font-semibold">{l.system.navn}: lest med systemets egen nøkkel</p>
                <p className="mt-0.5 text-xs text-[var(--blekk-svak)]">{l.merknad}</p>
              </li>
            ))}
            {utenOppsett.map((l) => (
              <li key={`ukjent-${l.system.id}`} className="px-4 py-2.5">
                <p className="font-semibold">{l.system.navn}: tilgangsmodell ukjent</p>
                <p className="mt-0.5 text-xs text-[var(--blekk-svak)]">
                  Adminbordet vet ikke hvilken tabell som avgjør tilgang her.
                  Kolonnen viser bare om personen har en konto – ikke om kontoen
                  gir tilgang.
                </p>
              </li>
            ))}
            {uteSkriving.map((l) => (
              <li key={`ute-${l.system.id}`} className="px-4 py-2.5">
                <p className="font-semibold">{l.system.navn}: tilgang kan ikke gis herfra</p>
                <ul className="mt-0.5 space-y-0.5 text-xs text-[var(--blekk-svak)]">
                  {l.veier.map((v) => (
                    <li key={v.id}>
                      <strong>{v.etikett}:</strong> {v.notat ?? 'Ingen notat.'}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export function BrukerlisteSkjelett() {
  return (
    <div className="space-y-6" aria-busy="true">
      <p className="flex items-center gap-2 text-sm text-[var(--blekk-svak)]">
        <Snurr />
        Henter brukere fra alle systemene …
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="border-2 border-[var(--kant)] bg-[var(--flate-opp)] px-4 py-3"
          >
            <div className="hm-skjelett h-3 w-20" />
            <div className="hm-skjelett mt-2 h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="border-2 border-[var(--kant)] bg-[var(--flate-opp)]">
        <div className="border-b-2 border-[var(--kant)] px-4 py-3">
          <div className="hm-skjelett h-4 w-44" />
        </div>
        <div className="space-y-2 px-4 py-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="hm-skjelett h-3.5 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
