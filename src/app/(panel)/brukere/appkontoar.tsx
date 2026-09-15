import { Kort, KortTittel, Merke } from '@/components/ui'
import { visDatoTid } from '@/lib/format'
import {
  hentAppkontoer,
  hentForeldreløse,
  type Appkonto,
  type AppkontoStatus,
} from '@/lib/appbrukarar'
import { AppkontoHandlinger, ForeldreløsHandling } from './appkonto-handlinger'

const STATUSMERKE: Record<AppkontoStatus, { type: 'gul' | 'grønn' | 'rød'; ord: string }> = {
  venter: { type: 'gul', ord: 'Venter' },
  godkjent: { type: 'grønn', ord: 'Slipper inn' },
  sperra: { type: 'rød', ord: 'Stengt ute' },
}

function Rad({ konto, erEier }: { konto: Appkonto; erEier: boolean }) {
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
        <AppkontoHandlinger
          personId={konto.id}
          epost={konto.epost}
          navBrukerId={konto.navBrukerId}
          status={konto.status}
        />
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
              <Rad key={k.id} konto={k} erEier={erEier} />
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
