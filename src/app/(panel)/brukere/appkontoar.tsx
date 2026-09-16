import { Kort, KortTittel, Merke } from '@/components/ui'
import { visDatoTid } from '@/lib/format'
import {
  hentAppkontoer,
  hentForeldreløse,
  type Appkonto,
  type AppkontoStatus,
} from '@/lib/appbrukarar'
import {
  hentSiderFraFila,
  hentIkkeStandard,
  hentUnntakFor,
  hentAvvikPerSide,
  finnForeldreløseTilganger,
  serSiden,
  type Side,
} from '@/lib/sidetilgang'
import { AppkontoHandlinger, ForeldreløsHandling } from './appkonto-handlinger'
import { kanRedigereSider } from '@/lib/github-sider'
import { hentGrupper, hentGruppekartet, siderFraGrupper, type Gruppe } from '@/lib/grupper'
import { NyGruppe, GruppeDetalj, PersonGrupper } from './gruppe-handlinger'
import {
  StandardBryter,
  PersonSider,
  ForeldreløsSide,
} from './sidetilgang-handlinger'
import { NySide, SideRedigering } from './side-handlinger'

const STATUSMERKE: Record<AppkontoStatus, { type: 'gul' | 'grønn' | 'rød'; ord: string }> = {
  venter: { type: 'gul', ord: 'Venter' },
  godkjent: { type: 'grønn', ord: 'Slipper inn' },
  sperra: { type: 'rød', ord: 'Stengt ute' },
}

type SideForPerson = Side & { standard: boolean; ser: boolean; avviker: boolean }

function Rad({
  konto,
  erEier,
  sider,
  grupper,
  mineGrupper,
}: {
  konto: Appkonto
  erEier: boolean
  sider?: SideForPerson[]
  grupper?: Gruppe[]
  mineGrupper?: string[]
}) {
  const merke = STATUSMERKE[konto.status]

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="truncate">{konto.navn}</strong>
          <Merke type={merke.type}>{merke.ord}</Merke>
          {/*
            Om personen finnes i de andre systemene fra før er det viktigste
            på skjermen. Appen ligger åpent, så hvem som helst kan sende en
            forespørsel – en kollega er allerede i utleien eller rørlageret.
          */}
          {konto.kjentFraFør ? (
            <Merke type="nøytral">Har tilgang andre steder</Merke>
          ) : (
            konto.status === 'venter' && <Merke type="svart">Ukjent</Merke>
          )}
        </div>
        <div className="text-sm text-[var(--blekk-svak)]">
          {konto.epost}
          {konto.telefon ? ` · ${konto.telefon}` : ''}
          {' · ba om tilgang '}
          {visDatoTid(konto.registrert)}
        </div>
      </div>

      {erEier ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Sidene bare for dem som faktisk slipper inn. En som venter eller
              er stengt ute ser ingenting uansett hva som krysses av. */}
          {sider && konto.status === 'godkjent' && (
            <PersonSider person={{ id: konto.id, navn: konto.navn }} sider={sider} />
          )}
          <AppkontoHandlinger
            personId={konto.id}
            epost={konto.epost}
            navBrukerId={konto.navBrukerId}
            status={konto.status}
          />
          {grupper && konto.status === 'godkjent' && (
            <PersonGrupper
              person={{ id: konto.id, navn: konto.navn }}
              grupper={grupper}
              mine={mineGrupper ?? []}
            />
          )}
        </div>
      ) : (
        <span className="text-xs text-[var(--blekk-svak)]">Bare eier kan endre dette</span>
      )}
    </li>
  )
}

/**
 * Hvem som slipper inn i mobilappen.
 *
 * Folk registrerer seg selv, og står uten tilgang til noen her sier ja.
 * Køen er derfor øverst: den er det eneste på denne siden noen venter på.
 */
export async function Appkontoer({ erEier }: { erEier: boolean }) {
  const [kontoer, foreldreløse] = await Promise.all([
    hentAppkontoer(),
    hentForeldreløse(),
  ])

  const køen = kontoer.filter((k) => k.status === 'venter')
  const resten = kontoer.filter((k) => k.status !== 'venter')

  /*
   * Sidelista kommer fra sider.json på GitHub, ikke herfra.
   *
   * Går hentingen galt, skal resten av siden fortsatt virke - køen og
   * godkjenningen er viktigere enn avkryssingen, og en admin som skal slippe
   * noen inn skal ikke bli stoppet av at GitHub er nede.
   */
  let sider: Side[] = []
  let ikkeStandard = new Set<string>()
  let avvikPerSide = new Map<string, number>()
  let sidefeil: string | null = null

  try {
    ;[sider, ikkeStandard, avvikPerSide] = await Promise.all([
      hentSiderFraFila(),
      hentIkkeStandard(),
      hentAvvikPerSide(),
    ])
  } catch (e) {
    sidefeil = e instanceof Error ? e.message : 'Ukjent feil'
  }

  // Gruppene som allerede finnes, som forslag når man legger inn en ny side.
  // Fri tekst i feltet, så en ny gruppe ikke krever at man først lager den.
  const gruppenavn = [...new Set(sider.map((s) => s.gruppe))].sort()

  const godkjente = kontoer.filter((k) => k.status === 'godkjent')
  const unntak = new Map(
    await Promise.all(godkjente.map(async (k) => [k.id, await hentUnntakFor(k.id)] as const)),
  )

  /*
   * Gruppene er det nyeste her, og det som lettest mangler - tabellene kommer
   * med en migrasjon som må kjøres for hånd.
   *
   * Feiler de, skal resten av siden fortsatt virke. Køen og godkjenningen er
   * viktigere enn avkryssingen, og en admin som skal slippe noen inn skal
   * ikke møte en hvit feilside fordi en tabell mangler. Det var nøyaktig det
   * som skjedde første gang dette ble lagt ut.
   */
  let grupper: Gruppe[] = []
  let gruppekart = new Map<string, Set<string>>()
  let gruppefeil: string | null = null

  try {
    ;[grupper, gruppekart] = await Promise.all([hentGrupper(), hentGruppekartet()])
  } catch (e) {
    gruppefeil = e instanceof Error ? e.message : 'Ukjent feil'
  }

  const sidenePer = (personId: string): SideForPerson[] => {
    const mine = unntak.get(personId) ?? new Map<string, boolean>()
    const fraGrupper = siderFraGrupper(gruppekart.get(personId), grupper)
    return sider.map((s) => {
      const standard = !ikkeStandard.has(s.id)
      return {
        ...s,
        standard,
        ser: serSiden(s, standard, mine, fraGrupper),
        avviker: mine.has(s.id),
      }
    })
  }

  const glemte = finnForeldreløseTilganger(
    new Set(sider.map((s) => s.id)),
    ikkeStandard,
    avvikPerSide,
  )

  return (
    <div className="space-y-7">
      <Kort>
        <KortTittel
          handling={
            køen.length > 0 ? <Merke type="gul">{køen.length} venter</Merke> : undefined
          }
        >
          Ber om tilgang til appen
        </KortTittel>
        {køen.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--blekk-svak)]">
            Ingen venter. Nye som registrerer seg i mobilappen dukker opp her.
          </p>
        ) : (
          <ul>
            {køen.map((k) => (
              <Rad key={k.id} konto={k} erEier={erEier} />
            ))}
          </ul>
        )}
      </Kort>

      {resten.length > 0 && (
        <Kort>
          <KortTittel>Har konto i appen</KortTittel>
          <ul>
            {resten.map((k) => (
              <Rad
                key={k.id}
                konto={k}
                erEier={erEier}
                sider={sidenePer(k.id)}
                grupper={grupper}
                mineGrupper={[...(gruppekart.get(k.id) ?? [])]}
              />
            ))}
          </ul>
        </Kort>
      )}

      {/* Gruppene står før sidene: det er her du gjør jobben én gang, i
          stedet for å krysse av på hver person for seg. */}
      <Kort>
        <KortTittel
          handling={
            grupper.length > 0 ? (
              <span className="text-xs text-[var(--blekk-svak)]">
                {grupper.length} {grupper.length === 1 ? 'gruppe' : 'grupper'}
              </span>
            ) : undefined
          }
        >
          Grupper
        </KortTittel>

        <p className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
          En gruppe samler sidene en type ansatt trenger. Legger du en ny person
          i riktig gruppe, får de riktig liste med én gang – i stedet for å
          krysse av tretten sider hver gang noen begynner.
        </p>

        {gruppefeil ? (
          <p className="px-4 py-4 text-sm text-hm-red-ink">
            Gruppene er ikke satt opp i databasen ennå. Kjør migrasjon{' '}
            <code className="hm-kode">0016_grupper.sql</code> i SQL-editoren, så
            dukker de opp her.
            <span className="mt-1 block text-xs text-[var(--blekk-svak)]">
              {gruppefeil}
            </span>
          </p>
        ) : (
          <>{erEier && <NyGruppe />}</>
        )}

        {gruppefeil ? null : grupper.length === 0 ? (
          <p className="px-4 pb-5 text-sm text-[var(--blekk-svak)]">
            Ingen grupper ennå. Alle godkjente ser standardsidene, og du kan gi
            og ta bort enkeltsider per person under.
          </p>
        ) : (
          <ul>
            {grupper.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{g.navn}</strong>
                    <Merke type="nøytral">
                      {g.antallPersoner} {g.antallPersoner === 1 ? 'person' : 'personer'}
                    </Merke>
                  </div>
                  {g.beskrivelse && (
                    <div className="text-sm text-[var(--blekk-svak)]">{g.beskrivelse}</div>
                  )}
                </div>
                {erEier ? (
                  <GruppeDetalj
                    gruppe={{ id: g.id, navn: g.navn, antallPersoner: g.antallPersoner }}
                    sider={sider.map((s) => ({
                      id: s.id,
                      navn: s.navn,
                      gruppe: s.gruppe,
                      standard: !ikkeStandard.has(s.id),
                      gir: g.sider.includes(s.id),
                    }))}
                  />
                ) : (
                  <span className="text-xs text-[var(--blekk-svak)]">
                    Bare eier kan endre dette
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Kort>

      <Kort>
        <KortTittel>Sidene i appen</KortTittel>

        {sidefeil ? (
          <p className="px-4 py-6 text-sm text-hm-red-ink">
            Fikk ikke hentet sidelista: {sidefeil}
          </p>
        ) : (
          <>
            <p className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
              Samme liste som på PC – den ligger i <code className="hm-kode">sider.json</code>,
              og skrivebordsappen redigerer den samme fila. Endrer noen der mens
              du holder på, sier vi fra i stedet for å overskrive.
            </p>

            {erEier && kanRedigereSider() && <NySide grupper={gruppenavn} />}
            {erEier && !kanRedigereSider() && (
              <div className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
                <p>
                  For å legge til og slette sider herfra trenger adminbordet et
                  GitHub-token i <code className="hm-kode">HM_GITHUB_TOKEN</code>.
                  Uten det kan du fortsatt styre hvem som ser hva.
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>
                    Lag en fine-grained token med tilgang til bare{' '}
                    <code className="hm-kode">hauge-maskin-app</code>, og
                    tillatelsen Contents: Read and write.
                  </li>
                  <li>
                    Legg den inn som miljøvariabel på Vercel, ikke bare i{' '}
                    <code className="hm-kode">.env.local</code>.
                  </li>
                  <li>
                    <strong>Deploy på nytt.</strong> Vercel tar ikke i bruk nye
                    miljøvariabler før neste utrulling – legger du den bare inn,
                    skjer det ingenting, og det ser ut som tokenet er feil.
                  </li>
                </ol>
              </div>
            )}

            <ul className="mt-3">
              {sider.map((s) => {
                const standard = !ikkeStandard.has(s.id)
                const avvik = avvikPerSide.get(s.id) ?? 0
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{s.navn}</strong>
                        {!standard && <Merke type="gul">Bare utvalgte</Merke>}
                        {s.barePC && <Merke type="nøytral">Bare PC</Merke>}
                        {avvik > 0 && (
                          <Merke type="nøytral">
                            {avvik} {avvik === 1 ? 'unntak' : 'unntak'}
                          </Merke>
                        )}
                      </div>
                      <div className="text-sm text-[var(--blekk-svak)]">{s.gruppe}</div>
                    </div>
                    {erEier ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {!s.barePC && (
                          <StandardBryter sideId={s.id} navn={s.navn} standard={standard} />
                        )}
                        {kanRedigereSider() && (
                          <SideRedigering
                            sideId={s.id}
                            navn={s.navn}
                            url={s.url}
                            gruppe={s.gruppe}
                            hjelp={s.hjelp}
                            grupper={gruppenavn}
                          />
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--blekk-svak)]">
                        Bare eier kan endre dette
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Kort>

      {/* Sidene bor i en fil på GitHub, ikke her, så det finnes ingen
          fremmednøkkel som rydder av seg selv når en side blir slettet der. */}
      {glemte.length > 0 && (
        <Kort>
          <KortTittel handling={<Merke type="gul">{glemte.length}</Merke>}>
            Tilganger til sider som ikke finnes
          </KortTittel>
          <p className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
            Disse peker på sider som er borte fra sider.json. De gjør ingen
            skade, men de blir liggende til noen fjerner dem.
          </p>
          <ul className="mt-3">
            {glemte.map((id) => (
              <ForeldreløsSide key={id} sideId={id} />
            ))}
          </ul>
        </Kort>
      )}

      {/*
        Vises bare når det faktisk finnes noe. En tom liste her ville vært
        en fast påminnelse om en feil som nesten aldri skjer.
      */}
      {foreldreløse.length > 0 && (
        <Kort>
          <KortTittel handling={<Merke type="rød">{foreldreløse.length}</Merke>}>
            Registreringer som ikke kom fram
          </KortTittel>
          <p className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
            Disse har en innlogging, men ble aldri til en person – noe feilet
            underveis i registreringen. De kan verken godkjennes eller avvises,
            og ser for seg selv ut som om de venter. Å fjerne innloggingen gjør
            adressen ledig, så personen kan prøve på nytt.
          </p>
          <ul className="mt-3">
            {foreldreløse.map((f) => (
              <li
                key={f.navBrukerId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <strong className="truncate">{f.epost}</strong>
                  <div className="text-sm text-[var(--blekk-svak)]">
                    registrerte seg {visDatoTid(f.registrert)}
                  </div>
                </div>
                {erEier ? (
                  <ForeldreløsHandling navBrukerId={f.navBrukerId} epost={f.epost} />
                ) : (
                  <span className="text-xs text-[var(--blekk-svak)]">
                    Bare eier kan endre dette
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Kort>
      )}
    </div>
  )
}

export function AppkontoerSkjelett() {
  return (
    <Kort>
      <KortTittel>Ber om tilgang til appen</KortTittel>
      <div className="space-y-3 px-4 py-4">
        {[0, 1].map((i) => (
          <div key={i} className="h-10 animate-pulse bg-[var(--flate-2)]" />
        ))}
      </div>
    </Kort>
  )
}
