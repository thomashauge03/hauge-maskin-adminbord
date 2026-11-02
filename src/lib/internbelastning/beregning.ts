/* ═══════════════════════════════════════════════════════════
   Internbelastningen: maskintimer × internkostnad per prosjekt.

   Ren logikk uten nettverk, så den kan testes. Valgene den bygger på står i
   docs/superpowers/specs/2026-11-02-internbelastning-design.md, og tallene
   viser hvor: «valg 4» osv.

   Beløp er i øre som heltall. Hvert prosjekt rundes én gang, og totalen er
   summen av de avrundede prosjektene. Rundet man totalen for seg, kunne
   kreditlinjen på 2011700 avveket et øre fra debetlinjene, og bilaget ville
   ikke gått i balanse.
   ═══════════════════════════════════════════════════════════ */

export const OBJEKTPROSJEKT = '2011700'

/** De som går inn i administrasjonspotten (valg 12). Vises for seg, men belastes som andre (valg 7). */
export const INTERNE_PROSJEKTER = new Set(['2011600', '2011601', '2011700', '2011800', '2013100'])

export type Maskintime = {
  /** SmartDoks MachineHourId. Det er den som skal huskes som belastet i steg 2. */
  id: number
  maskinId: number
  timer: number
  prosjektnummer: string | null
  prosjektnavn: string | null
  attestert: boolean
}

export type Maskin = {
  id: number
  nummer: string | null
  navn: string
  kategori: string | null
  /** InternalCost i SmartDok, kroner per time. Null når den ikke er fylt inn. */
  sats: number | null
}

export type Unntak = { maskinId: number | null; kategori: string | null; grunn: string }

export type Stoppord = 'mangler_sats' | 'ukjent_maskin' | 'uten_prosjekt' | 'mangler_prosjekt' | 'objektprosjekt'

export type Stopp = {
  ord: Stoppord
  maskinId: number | null
  maskinnavn: string | null
  prosjektnummer: string | null
  antall: number
  timer: number
}

export type Grunnlag = {
  rader: Maskintime[]
  maskiner: Maskin[]
  unntak: Unntak[]
  /** Prosjektnumrene i Tripletex. Null når de ikke kunne hentes. */
  tripletexProsjekter: Set<string> | null
}

export type Beregning = {
  perProsjekt: { nummer: string; navn: string; timer: number; øre: number; internt: boolean }[]
  perMaskin: { maskinId: number; nummer: string | null; navn: string; timer: number; sats: number; øre: number }[]
  unntatt: { maskinId: number; nummer: string | null; navn: string; timer: number; grunn: string }[]
  stopp: Stopp[]
  uattestert: { antall: number; timer: number }
  totalØre: number
  timer: number
  tripletexSjekket: boolean
}

/** Flyttall fra SmartDok summert mange ganger gir 3.4999999. To desimaler holder for timer. */
const rund = (timer: number) => Math.round(timer * 100) / 100

function grunnFor(maskin: Maskin, unntak: Unntak[]): string | null {
  const egen = unntak.find((u) => u.maskinId === maskin.id)
  if (egen) return egen.grunn
  const kategori = unntak.find((u) => u.kategori !== null && u.kategori === maskin.kategori)
  return kategori ? kategori.grunn : null
}

export function beregn({ rader, maskiner, unntak, tripletexProsjekter }: Grunnlag): Beregning {
  const maskinFor = new Map(maskiner.map((m) => [m.id, m]))
  const stopp = new Map<string, Stopp>()
  const prosjekter = new Map<string, { navn: string; kroner: number; timer: number }>()
  const perMaskin = new Map<number, { timer: number; kroner: number }>()
  const unntatt = new Map<number, { timer: number; grunn: string }>()
  const uattestert = { antall: 0, timer: 0 }

  const stopper = (ord: Stoppord, r: Maskintime, maskin: Maskin | undefined) => {
    const nøkkel = `${ord}|${ord === 'mangler_sats' || ord === 'ukjent_maskin' ? r.maskinId : r.prosjektnummer}`
    const s = stopp.get(nøkkel) ?? {
      ord,
      maskinId: r.maskinId,
      maskinnavn: maskin?.navn ?? null,
      prosjektnummer: r.prosjektnummer,
      antall: 0,
      timer: 0,
    }
    s.antall += 1
    s.timer += r.timer
    stopp.set(nøkkel, s)
  }

  for (const r of rader) {
    // Valg 8: uattesterte kan endres, og tas med når de er attestert.
    if (!r.attestert) {
      uattestert.antall += 1
      uattestert.timer += r.timer
      continue
    }

    const maskin = maskinFor.get(r.maskinId)
    if (!maskin) {
      stopper('ukjent_maskin', r, undefined)
      continue
    }

    // Før satsen: en maskin på listen skal ikke stoppe noe, uansett sats.
    const grunn = grunnFor(maskin, unntak)
    if (grunn !== null) {
      const u = unntatt.get(maskin.id) ?? { timer: 0, grunn }
      u.timer += r.timer
      unntatt.set(maskin.id, u)
      continue
    }

    if (!maskin.sats || maskin.sats <= 0) {
      stopper('mangler_sats', r, maskin)
      continue
    }

    const nummer = r.prosjektnummer?.trim() || null
    if (!nummer) {
      stopper('uten_prosjekt', r, maskin)
      continue
    }
    if (nummer === OBJEKTPROSJEKT) {
      stopper('objektprosjekt', r, maskin)
      continue
    }
    if (tripletexProsjekter && !tripletexProsjekter.has(nummer)) {
      stopper('mangler_prosjekt', r, maskin)
      continue
    }

    const kroner = r.timer * maskin.sats
    const p = prosjekter.get(nummer) ?? { navn: r.prosjektnavn ?? nummer, kroner: 0, timer: 0 }
    p.kroner += kroner
    p.timer += r.timer
    prosjekter.set(nummer, p)

    const m = perMaskin.get(maskin.id) ?? { timer: 0, kroner: 0 }
    m.timer += r.timer
    m.kroner += kroner
    perMaskin.set(maskin.id, m)
  }

  const perProsjekt = [...prosjekter]
    .map(([nummer, p]) => ({
      nummer,
      navn: p.navn,
      timer: rund(p.timer),
      øre: Math.round(p.kroner * 100),
      internt: INTERNE_PROSJEKTER.has(nummer),
    }))
    .sort((a, b) => b.øre - a.øre || a.nummer.localeCompare(b.nummer))

  return {
    perProsjekt,
    perMaskin: [...perMaskin]
      .map(([id, m]) => {
        const maskin = maskinFor.get(id) as Maskin
        return { maskinId: id, nummer: maskin.nummer, navn: maskin.navn, timer: rund(m.timer), sats: maskin.sats as number, øre: Math.round(m.kroner * 100) }
      })
      .sort((a, b) => b.øre - a.øre || a.maskinId - b.maskinId),
    unntatt: [...unntatt]
      .map(([id, u]) => {
        const maskin = maskinFor.get(id) as Maskin
        return { maskinId: id, nummer: maskin.nummer, navn: maskin.navn, timer: rund(u.timer), grunn: u.grunn }
      })
      .sort((a, b) => b.timer - a.timer),
    stopp: [...stopp.values()].map((s) => ({ ...s, timer: rund(s.timer) })).sort((a, b) => b.timer - a.timer),
    uattestert: { antall: uattestert.antall, timer: rund(uattestert.timer) },
    totalØre: perProsjekt.reduce((sum, p) => sum + p.øre, 0),
    timer: rund(perProsjekt.reduce((sum, p) => sum + p.timer, 0)),
    tripletexSjekket: tripletexProsjekter !== null,
  }
}
