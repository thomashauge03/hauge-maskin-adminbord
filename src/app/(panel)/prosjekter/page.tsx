import type { Metadata } from 'next'
import { krevAdmin } from '@/lib/auth'
import { hentNavet, hentSisteSynk } from '@/lib/prosjekter/synk'
import { hentTilkobling } from '@/lib/prosjekter/smartdok'
import { visDato, visDatoTid } from '@/lib/format'
import { Feilstripe, Kort, KortTittel, Merke, Seksjonstittel, TomTilstand } from '@/components/ui'
import { ImportSkjema } from './import-skjema'
import { Prosjektliste, ProsjektSkjema, SynkKnapp } from './prosjektliste'
import { SmartdokSkjema } from './smartdok-skjema'

export const metadata: Metadata = { title: 'Prosjekter' }

export default async function ProsjekterSide() {
  const meg = await krevAdmin()
  const [rader, synk, { iDag, nøkkel }] = await Promise.all([hentNavet(), hentSisteSynk(), hentTilkobling()])
  const resultat = synk?.sist_resultat && !synk.sist_resultat.opptatt ? synk.sist_resultat : null
  const smartdok = resultat?.smartdok ?? null

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
        <div className="space-y-3 p-4 text-sm">
          {nøkkel ? (
            <>
              <p className="text-[var(--blekk-svak)]">
                Hentes automatisk fra SmartDok-API-et: endringene i hver synk, hvert kvarter, og hele
                lista én gang i døgnet. Nøkkel{' '}
                <span className="hm-kode">{nøkkel.hint}</span>, laget {visDato(nøkkel.opprettet)}, utløper{' '}
                {visDato(nøkkel.utloper)}. Den fornyes automatisk fra {visDato(nøkkel.fornyesFra)}.
              </p>
              {nøkkel.dagerIgjen !== null && nøkkel.dagerIgjen <= 60 && (
                <p>
                  <Merke type={nøkkel.dagerIgjen <= 14 ? 'rød' : 'gul'}>
                    {nøkkel.dagerIgjen <= 0 ? 'Utløpt' : `${nøkkel.dagerIgjen} dager igjen`}
                  </Merke>{' '}
                  Fornyingen har ikke gått gjennom. Se feilen under, eller lag en ny nøkkel i SmartDok.
                </p>
              )}
              {smartdok?.ok === true && (
                <p>
                  Sist hentet {smartdok.hentet} {smartdok.hele === false ? 'endrede prosjekter' : 'prosjekter, hele lista'}:{' '}
                  {smartdok.nye} nye, {smartdok.endret} endret
                  {smartdok.fravær > 0 && `, ${smartdok.fravær} fraværsprosjekter utelatt`}.
                </p>
              )}
              {smartdok?.ok === true &&
                smartdok.merknader.map((m) => (
                  <p key={m} className="text-hm-red-ink">
                    {m}
                  </p>
                ))}
              {smartdok?.ok === false && <p className="font-semibold text-hm-red-ink">{smartdok.feil}</p>}
            </>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-[var(--blekk-svak)]">
              <li>Be SmartDok om å aktivere API-tilgang (smartdok.no/kontakt-oss eller 90 40 33 33).</li>
              <li>Lag en nøkkel under Firmainnstillinger → API-administrasjon. Kryss bare av for Prosjekter.</li>
              <li>Legg den inn her. Fram til da er opplastingen under veien inn.</li>
            </ol>
          )}
          {meg.rolle === 'eier' ? (
            <SmartdokSkjema harNøkkel={nøkkel !== null} iDag={iDag} />
          ) : (
            !nøkkel && <p className="text-[var(--blekk-svak)]">Bare eieren kan legge inn nøkkelen.</p>
          )}
        </div>
      </Kort>

      <Kort>
        <KortTittel>{nøkkel ? 'Last opp eksport (reserve)' : 'Last opp eksport fra SmartDok'}</KortTittel>
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
          Legg inn SmartDok-nøkkelen eller last opp eksporten over, så fylles lista og alle appene.
          Før det rører synken ingenting i appene.
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
