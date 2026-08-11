import { hentAlleBrukere, samlePåEpost } from '@/lib/brukere'
import type { System } from '@/lib/typer'
import { Feilstripe, Kort, KortTittel, Merke, Tallkort } from '@/components/ui'
import { visSiden } from '@/lib/format'
import { settSperret, slettBrukerISystem } from './actions'
import { giTilgangTilSystem, taBortTilgangFraSystem } from './tilgang-actions'
import { TilgangsCelle } from './tilgangs-celle'
import { hentAlleRoller, hentAlleTilgangsoppsett } from '@/lib/tilgang'
import { tilgangsmerke } from '@/lib/tilgangsmerke'
import { BrukerHandlinger } from './bruker-handlinger'

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
   * Én bølge, tre kall mot navet, så én runde mot prosjektene.
   *
   * Oppsettet MÅ være hentet før prosjektene spørres, siden det er det som
   * bestemmer spørringen – men det er ett kall for alle systemene, ikke ett
   * per system slik det var før. Rollene hentes samtidig fordi ingenting
   * venter på dem.
   */
  const [oppsett, rollerPerSystem] = await Promise.all([
    hentAlleTilgangsoppsett(),
    hentAlleRoller(),
  ])

  // Bare eier utløser reserveveien, som bruker systemenes service
  // role-nøkler. Se kommentaren på hentBrukereISystem.
  const { lister, hentetMs: naa } = await hentAlleBrukere(systemer, {
    brukReserve: erEier,
    oppsett,
  })

  const personer = samlePåEpost(lister)

  const feilende = lister.filter((l) => l.feil)
  const lest = lister.filter((l) => l.rader)
  const medReserve = lister.filter((l) => l.merknad)
  const avkortede = lister.filter((l) => l.avkortet)
  const utenOppsett = lest.filter((l) => l.veier.length === 0)
  // Systemer der tilgang ikke KAN gis herfra. For leveringseddel og rørlager
  // er det ikke en mangel: der gir enhver konto full tilgang, så det finnes
  // ingen rad å skrive.
  const uteSkriving = lest.filter(
    (l) => l.veier.length > 0 && !l.veier.some((v) => v.kanSkrive),
  )

  const antallKontoer = lest.reduce(
    (s, l) => s + (l.rader?.filter((r) => r.harKonto).length ?? 0),
    0,
  )
  /*
   * Kontoer som kan logge inn uten å se noe. Dette tallet er hele grunnen til
   * at matrisen ble bygget om: det sto som «tilgang» før.
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

  return (
    <div className="space-y-6">
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

      {/* Systemer som kom fram på reserveveien. Ikke en feil – listen er
          riktig – men det forklarer hvorfor databasestatus mangler for
          nettopp disse, og det er verdt å si framfor å la det se
          tilfeldig ut. */}
      {medReserve.length > 0 && (
        <Kort>
          <KortTittel
            handling={<Merke type="gul">{medReserve.length} system</Merke>}
          >
            Lest med systemets egen nøkkel
          </KortTittel>
          <ul className="divide-y divide-[var(--kant)]">
            {medReserve.map((l) => (
              <li key={l.system.id} className="px-4 py-2.5">
                <p className="text-sm font-semibold">{l.system.navn}</p>
                <p className="mt-0.5 text-xs text-[var(--blekk-svak)]">
                  {l.merknad}
                </p>
              </li>
            ))}
          </ul>
        </Kort>
      )}

      {/* Systemer der tilgang ikke KAN leses. Uten denne stripa ser en
          kolonne full av «konto» ut som et svar, og den er et spørsmål. */}
      {utenOppsett.length > 0 && (
        <Kort>
          <KortTittel
            handling={<Merke type="nøytral">{utenOppsett.length} system</Merke>}
          >
            Tilgangsmodell ukjent
          </KortTittel>
          <div className="px-4 py-2.5 text-sm text-[var(--blekk-svak)]">
            <p>
              {utenOppsett.map((l) => l.system.navn).join(', ')} mangler
              tilgangsoppsett, så adminbordet vet ikke hvilken tabell som
              avgjør tilgang der. Kolonnene viser bare om personen har en
              konto – ikke om kontoen gir tilgang.
            </p>
          </div>
        </Kort>
      )}

      {/* Systemer der tilgang ikke kan STYRES herfra. Egen stripe, fordi det
          ikke er en mangel i adminbordet: i to av systemene gir enhver konto
          full tilgang, og da finnes det ingen rad å skrive. */}
      {uteSkriving.length > 0 && (
        <Kort>
          <KortTittel
            handling={<Merke type="gul">{uteSkriving.length} system</Merke>}
          >
            Tilgang kan ikke gis herfra
          </KortTittel>
          <ul className="divide-y divide-[var(--kant)]">
            {uteSkriving.map((l) => (
              <li key={l.system.id} className="px-4 py-2.5">
                <p className="text-sm font-semibold">{l.system.navn}</p>
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
        </Kort>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tallkort
          merkelapp="Personer"
          verdi={personer.length}
          under="unike e-poster"
        />
        <Tallkort
          merkelapp="Med tilgang"
          verdi={personer.filter((p) => p.antallMedTilgang > 0).length}
          under={`av ${antallKontoer} kontoer`}
        />
        <Tallkort
          merkelapp="Kun konto"
          verdi={kunKonto}
          under="kan logge inn, ser ingenting"
        />
        <Tallkort
          merkelapp="I flere systemer"
          verdi={personer.filter((p) => p.antallMedTilgang > 1).length}
          under="har flere passord i dag"
        />
      </div>

      {/* ── Matrisen ──
          Personer nedover, systemer bortover. Dette er visningen som
          svarer på «hvem har tilgang til hva», og den som viser hvor
          mange passord den felles innloggingen faktisk vil erstatte. */}
      <Kort>
        <KortTittel
          handling={
            <span className="text-xs text-[var(--blekk-svak)]">
              {lest.length}/{lister.length} system lest
            </span>
          }
        >
          Hvem har tilgang hvor
        </KortTittel>
        {annenKunde > 0 && (
          <p className="border-b border-[var(--kant)] px-4 py-2 text-xs text-[var(--blekk-svak)]">
            {annenKunde} konto{annenKunde > 1 ? 'er' : ''} hører til andre
            kunder i en delt base og er ikke vårt ryddearbeid. De er merket
            «annen kunde», og innloggingen deres kan ikke sperres eller slettes
            herfra.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--kant)]">
                <th className="px-4 py-2 text-left text-xs font-bold tracking-widest uppercase">
                  E-post
                </th>
                {lest.map((l) => (
                  <th
                    key={l.system.id}
                    scope="col"
                    className="px-2 py-2 text-center text-xs font-bold tracking-widest uppercase"
                  >
                    {l.system.navn}
                  </th>
                ))}
                <th className="px-4 py-2 text-right text-xs font-bold tracking-widest uppercase">
                  Sist inne
                </th>
              </tr>
            </thead>
            <tbody>
              {personer.map((p) => (
                <tr
                  key={p.epost}
                  className="border-b border-[var(--kant)] last:border-b-0"
                >
                  <th
                    scope="row"
                    className="px-4 py-2 text-left font-semibold"
                  >
                    {p.epost}
                  </th>
                  {lest.map((l) => {
                    const rad = p.iSystem.get(l.system.slug)
                    const merke = tilgangsmerke(rad, {
                      systemNavn: l.system.navn,
                      harOppsett: l.veier.length > 0,
                    })

                    // Bare eier kan endre tilgang. For drift er cellen en
                    // ren visning – ingen knapp som later som.
                    if (!erEier) {
                      return (
                        <td
                          key={l.system.id}
                          className="px-2 py-2 text-center"
                          title={merke.forklaring}
                        >
                          {merke.tekst === '–' ? (
                            <span className="text-[var(--blekk-svak)]">–</span>
                          ) : (
                            <Merke type={merke.merke}>{merke.tekst}</Merke>
                          )}
                        </td>
                      )
                    }

                    return (
                      <td key={l.system.id} className="px-2 py-2 text-center align-top">
                        <TilgangsCelle
                          epost={p.epost}
                          navn={p.epost.split('@')[0]}
                          systemNavn={l.system.navn}
                          merke={merke}
                          harTilgang={rad?.harTilgang === true}
                          naavaerendeRolle={rad?.rolle ?? null}
                          harKonto={rad?.harKonto ?? false}
                          skrivbarVei={
                            l.veier.find((v) => v.kanSkrive)?.etikett ?? null
                          }
                          hvorforLaast={
                            l.veier.length === 0
                              ? `Adminbordet vet ikke hvilken tabell som avgjør tilgang i ${l.system.navn}. Legg inn tilgangsoppsett for systemet først.`
                              : (l.veier[0].notat ??
                                `Ingen av tilgangsveiene i ${l.system.navn} er merket som skrivbar.`)
                          }
                          roller={rollerPerSystem.get(l.system.id) ?? []}
                          krevArPassord={
                            l.veier.find((v) => v.kanSkrive)?.brukerNokkel ===
                            'auth_id'
                          }
                          gi={giTilgangTilSystem.bind(null, l.system.id)}
                          taBort={taBortTilgangFraSystem.bind(
                            null,
                            l.system.id,
                            p.epost,
                          )}
                        />
                      </td>
                    )
                  })}
                  <td className="hm-tall px-4 py-2 text-right text-xs text-[var(--blekk-svak)]">
                    {visSiden(p.sistInnlogget, naa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Kort>

      {/* ── Per system, med handlinger ── */}
      {erEier &&
        lest.map((l) => {
          const rader = l.rader ?? []
          const kontoer = rader.filter((r) => r.harKonto)
          // Tilgang uten konto: personen er lagt inn men har aldri registrert
          // seg. Vanlig i de e-postnøklede appene, og usynlig før.
          const utenKonto = rader.filter((r) => !r.harKonto && r.harTilgang)

          return (
            <Kort key={l.system.id}>
              <KortTittel
                handling={
                  <span className="text-xs text-[var(--blekk-svak)]">
                    {kontoer.length} kontoer
                    {l.veier.length > 0 && (
                      <>
                        {' · '}
                        {rader.filter((r) => r.harTilgang).length} med tilgang
                      </>
                    )}
                  </span>
                }
              >
                {l.system.navn}
              </KortTittel>

              {kontoer.length === 0 && utenKonto.length === 0 ? (
                <p className="px-4 py-3 text-sm text-[var(--blekk-svak)]">
                  Ingen kontoer og ingen tilgangsrader i dette systemet.
                </p>
              ) : (
                <ul>
                  {kontoer.map((r) => {
                    const merke = tilgangsmerke(r, {
                      systemNavn: l.system.navn,
                      harOppsett: l.veier.length > 0,
                    })
                    return (
                      <li
                        key={r.authId ?? r.epost}
                        className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--kant)] px-4 py-2 first:border-t-0"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            {r.epost ?? '(uten e-post)'}
                          </span>
                          <span title={merke.forklaring}>
                            <Merke type={merke.merke}>{merke.tekst}</Merke>
                          </span>
                          {r.epostBekreftet === false && (
                            <Merke type="gul">ubekreftet</Merke>
                          )}
                          <span className="text-xs text-[var(--blekk-svak)]">
                            sist inne {visSiden(r.sistInnlogget, naa)}
                          </span>
                        </span>

                        {/* ── Tenant-vakt ──
                            auth.users er DELT mellom kundene i et
                            flerkundesystem. Hører kontoen til en annen kunde og
                            har ingen tilgang hos oss, er verken sperring eller
                            sletting vår å gjøre – og «Slett» kaller
                            deleteUser i en produksjonsbase. Knappene ble
                            tilbudt for hver konto før. */}
                        {r.authId && r.annenKunde > 0 && !r.harTilgang ? (
                          <span className="max-w-md text-right text-xs text-[var(--blekk-svak)]">
                            Tilhører en annen kunde i den delte basen. Sperring
                            og sletting av innloggingen hører hos dem, ikke hos
                            oss.
                          </span>
                        ) : null}

                        {/* Måltilstanden for sperring bindes her, der vi vet
                            hva kontoen står i nå – ikke som en veksling i
                            nettleseren, som bommer hvis siden ble hentet før
                            noen andre endret kontoen. */}
                        {r.authId && !(r.annenKunde > 0 && !r.harTilgang) && (
                          <BrukerHandlinger
                            systemId={l.system.id}
                            brukerId={r.authId}
                            epost={r.epost ?? r.authId}
                            sperret={r.kontoAktiv === false}
                            settSperret={settSperret.bind(
                              null,
                              l.system.id,
                              r.authId,
                              r.kontoAktiv !== false,
                            )}
                            slett={slettBrukerISystem.bind(
                              null,
                              l.system.id,
                              r.authId,
                              r.epost ?? '',
                            )}
                          />
                        )}
                      </li>
                    )
                  })}

                  {utenKonto.map((r) => (
                    <li
                      key={`utenkonto-${r.epost ?? r.authId}`}
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--kant)] px-4 py-2"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {r.epost ?? `(foreldreløs rad: ${r.authId})`}
                        </span>
                        <Merke type="gul">
                          {r.rolle ?? 'tilgang'} · ingen konto
                        </Merke>
                      </span>
                      <span className="text-xs text-[var(--blekk-svak)]">
                        {r.epost
                          ? 'Tilgangen er lagt inn, men personen har ikke registrert seg. Den virker fra første innlogging.'
                          : 'Tilgangsraden peker på en auth-bruker som ikke finnes. Sannsynligvis en slettet konto.'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Kort>
          )
        })}
    </div>
  )
}

export function BrukerlisteSkjelett() {
  return (
    <div className="space-y-6">
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
