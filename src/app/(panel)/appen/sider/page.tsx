import type { Metadata } from 'next'
import { krevAdmin } from '@/lib/auth'
import { hentGrupper } from '@/lib/grupper'
import { kanRedigereSider } from '@/lib/github-sider'
import {
  hentAvvikPerSide,
  hentSideStandardIder,
  hentSidelista,
  type Side,
} from '@/lib/sidetilgang'
import { foreldreløse, siderFraGrupper } from '@/lib/sideregel'
import { Kort, KortTittel, Merke } from '@/components/ui'
import { NySide, SideRedigering } from '../side-handlinger'
import { ForeldreløsSide } from '../sidetilgang-handlinger'

export const metadata: Metadata = { title: 'Sider' }

export default async function SiderSide() {
  const meg = await krevAdmin()
  const erEier = meg.rolle === 'eier'

  const [grupper, avvik, gamleStandard] = await Promise.all([
    hentGrupper(),
    hentAvvikPerSide(),
    hentSideStandardIder(),
  ])

  let sider: Side[] = []
  let alleIder = new Set<string>()
  let sidefeil: string | null = null
  try {
    ;({ sider, alleIder } = await hentSidelista())
  } catch (e) {
    sidefeil = e instanceof Error ? e.message : 'Ukjent feil'
  }

  const gisAv = siderFraGrupper(
    grupper.map((g) => g.id),
    grupper,
  )
  // Overskriftene i appens liste – ikke tilgangsgruppene. Forslag i feltet.
  const overskrifter = [...new Set(sider.map((s) => s.gruppe))].sort()
  // Uten sidelista – eller med en tom fil – vet vi ikke hva som finnes, og da
  // er ingenting foreldreløst.
  const glemte =
    sidefeil || alleIder.size === 0
      ? []
      : foreldreløse(alleIder, grupper.flatMap((g) => g.sider), avvik.keys(), gamleStandard)

  return (
    <div className="space-y-7">
      <Kort>
        <KortTittel>Sidene i appen</KortTittel>

        {sidefeil ? (
          <p className="px-4 py-6 text-sm text-hm-red-ink">Fikk ikke hentet sidelista: {sidefeil}</p>
        ) : (
          <>
            <p className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
              Samme liste som på PC – den ligger i <code className="hm-kode">sider.json</code>, og
              skrivebordsappen redigerer den samme fila. Endrer noen der mens du holder på, sier vi
              fra i stedet for å overskrive. En side ser ingen før en gruppe gir den.
            </p>

            {erEier && kanRedigereSider() && <NySide grupper={overskrifter} />}
            {erEier && !kanRedigereSider() && (
              <div className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
                <p>
                  For å legge til og slette sider herfra trenger adminbordet et GitHub-token i{' '}
                  <code className="hm-kode">HM_GITHUB_TOKEN</code>. Uten det kan du fortsatt styre
                  hvem som ser hva.
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>
                    Lag en fine-grained token med tilgang til bare{' '}
                    <code className="hm-kode">hauge-maskin-app</code>, og tillatelsen Contents:
                    Read and write.
                  </li>
                  <li>
                    Legg den inn som miljøvariabel på Vercel, ikke bare i{' '}
                    <code className="hm-kode">.env.local</code>.
                  </li>
                  <li>
                    <strong>Deploy på nytt.</strong> Vercel tar ikke i bruk nye miljøvariabler før
                    neste utrulling – legger du den bare inn, skjer det ingenting, og det ser ut som
                    tokenet er feil.
                  </li>
                </ol>
              </div>
            )}

            <ul className="mt-3">
              {sider.map((s) => {
                const gir = gisAv.get(s.id) ?? []
                const antall = avvik.get(s.id) ?? 0
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-3 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {/* Slik raden ser ut i appen: ikonet, eller fargen med
                          forbokstaven. Da ser du hva du endrer. */}
                      <span
                        className="grid h-10 w-10 flex-none place-items-center overflow-hidden border-2 border-[var(--kant)]"
                        style={{ background: s.bilete ? undefined : s.farge || '#e2001a' }}
                      >
                        {s.bilete ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.bilete} alt="" className="max-h-8 max-w-8 object-contain" />
                        ) : (
                          <span className="text-sm font-black text-white">
                            {s.navn.trim().charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>{s.navn}</strong>
                          {s.barePC && <Merke>Bare PC</Merke>}
                          {antall > 0 && <Merke>{antall} unntak</Merke>}
                        </div>
                        <div className="text-sm text-[var(--blekk-svak)]">
                          {s.gruppe} ·{' '}
                          {s.barePC
                            ? 'vises aldri på telefonen'
                            : gir.length > 0
                              ? `gis av ${gir.join(', ')}`
                              : 'ingen gruppe gir den – ingen ser den'}
                        </div>
                      </div>
                    </div>
                    {erEier && kanRedigereSider() && (
                      <SideRedigering
                        sideId={s.id}
                        navn={s.navn}
                        url={s.url}
                        gruppe={s.gruppe}
                        hjelp={s.hjelp}
                        bilete={s.bilete}
                        farge={s.farge}
                        nokkel={s.nokkel}
                        grupper={overskrifter}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Kort>

      {glemte.length > 0 && (
        <Kort>
          <KortTittel handling={<Merke type="gul">{glemte.length}</Merke>}>
            Tilganger til sider som ikke finnes
          </KortTittel>
          <p className="px-4 pt-3 text-sm text-[var(--blekk-svak)]">
            Disse peker på sider som er borte fra sider.json. De gjør ingen skade, men de blir
            liggende til noen fjerner dem.
          </p>
          <ul className="mt-3">
            {glemte.map((id) =>
              erEier ? (
                <ForeldreløsSide key={id} sideId={id} />
              ) : (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--kant)] px-4 py-2 last:border-b-0"
                >
                  <span className="hm-kode text-sm">{id}</span>
                  <span className="text-xs text-[var(--blekk-svak)]">Bare eier kan rydde</span>
                </li>
              )
            )}
          </ul>
        </Kort>
      )}
    </div>
  )
}
