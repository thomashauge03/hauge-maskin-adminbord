import type { Metadata } from 'next'
import { krevAdmin } from '@/lib/auth'
import { hentNavet, hentSisteSynk } from '@/lib/prosjekter/synk'
import { visDatoTid } from '@/lib/format'
import { Feilstripe, Kort, KortTittel, Merke, Seksjonstittel, TomTilstand } from '@/components/ui'
import { ImportSkjema } from './import-skjema'
import { Prosjektliste, ProsjektSkjema, SynkKnapp } from './prosjektliste'

export const metadata: Metadata = { title: 'Prosjekter' }

export default async function ProsjekterSide() {
  await krevAdmin()
  const [rader, synk] = await Promise.all([hentNavet(), hentSisteSynk()])
  const resultat = synk?.sist_resultat && !synk.sist_resultat.opptatt ? synk.sist_resultat : null

  return (
    <div className="space-y-7">
      <Seksjonstittel
        under={
          <>
            Den felles prosjektlista for lager, rørlager, utleie, tilbud og varsling. Prosjekter
            opprettes i SmartDok og hentes inn her, eller legges inn her med SmartDok-nummeret. Appene
            har ingen egne: lista sendes ut til alle innen et kvarter, og det appene har som ikke står
            her, blir satt inaktivt.
          </>
        }
      >
        Prosjekter
      </Seksjonstittel>

      <Kort>
        <KortTittel handling={<SynkKnapp />}>Synk til appene</KortTittel>
        <div className="space-y-3 p-4">
          {resultat ? (
            <>
              <p className="text-sm text-[var(--blekk-svak)]">
                Sist synket {visDatoTid(resultat.ferdig)}, {resultat.prosjekter} prosjekter i lista.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {resultat.apper.map((a) => (
                  <li key={a.slug} className="border-2 border-[var(--kant)] px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <strong>{a.navn}</strong>
                      <Merke type={a.ok ? 'grønn' : 'rød'}>{a.ok ? 'OK' : 'Feilet'}</Merke>
                    </div>
                    {a.ok ? (
                      <p className="mt-1 text-xs text-[var(--blekk-svak)]">
                        {a.nye} nye, {a.endret} endret
                        {a.deaktivert > 0 && `, ${a.deaktivert} egne satt inaktive`}
                        {a.hoppetOver > 0 && `, ${a.hoppetOver} kan ikke lagres der`}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs break-words text-hm-red-ink">{a.feil}</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-[var(--blekk-svak)]">Ikke synket ennå.</p>
          )}
        </div>
      </Kort>

      <Kort>
        <KortTittel>Hent fra SmartDok</KortTittel>
        <ImportSkjema />
      </Kort>

      <Kort>
        <KortTittel>Nytt prosjekt</KortTittel>
        <div className="p-4">
          <ProsjektSkjema />
        </div>
      </Kort>

      {resultat?.apper.some((a) => !a.ok) && (
        <Feilstripe tittel="Noen apper fikk ikke siste synk">
          De tas igjen ved neste kjøring. Står feilen fortsatt, sjekk nøkkelen på systemsiden.
        </Feilstripe>
      )}

      {rader.length === 0 ? (
        <TomTilstand tittel="Ingen prosjekter ennå">
          Last opp eksporten fra SmartDok over, så fylles lista og alle appene. Før det rører
          synken ingenting i appene.
        </TomTilstand>
      ) : (
        <Kort>
          <KortTittel>Alle prosjekter</KortTittel>
          <Prosjektliste rader={rader} />
        </Kort>
      )}
    </div>
  )
}
