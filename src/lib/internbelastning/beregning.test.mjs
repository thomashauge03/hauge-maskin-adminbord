// Beregningen av internbelastningen. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { beregn } = await import('./beregning.ts')

const maskiner = [
  { id: 1, nummer: '100128', navn: 'Cat 325', kategori: 'Gravemaskiner', sats: 925 },
  { id: 2, nummer: '100604', navn: 'Håndarbeid', kategori: 'Håndarbeid', sats: 50 },
  { id: 3, nummer: '100420', navn: 'Scania R770', kategori: 'Lastebiler', sats: 0 },
  { id: 4, nummer: '100513', navn: 'Toyota Hilux', kategori: 'Firmabiler', sats: 0 },
  { id: 5, nummer: '100124', navn: 'Innleide 25 tonner', kategori: 'Gravemaskiner', sats: 224 },
  { id: 6, nummer: '100422', navn: 'Volvo FH16', kategori: 'Lastebiler', sats: null },
]
const unntak = [
  { maskinId: null, kategori: 'Firmabiler', grunn: 'Firmabiler' },
  { maskinId: 5, kategori: null, grunn: 'Innleid' },
]

let neste = 1
function rad(maskinId, timer, prosjekt = '2026118', attestert = true) {
  return { id: neste++, maskinId, timer, prosjektnummer: prosjekt, prosjektnavn: `${prosjekt} Navn`, attestert }
}

const tripletex = new Set(['2026118', '2026119', '2011600', '2011700'])
const grunnlag = (rader, tt = tripletex) => ({ rader, maskiner, unntak, tripletexProsjekter: tt })

test('timer × sats per prosjekt, i øre', () => {
  const b = beregn(grunnlag([rad(1, 2.5), rad(1, 1), rad(2, 7, '2026119')]))
  assert.equal(b.stopp.length, 0)
  assert.deepEqual(
    b.perProsjekt.map((p) => [p.nummer, p.timer, p.øre]),
    [
      ['2026118', 3.5, 323750],
      ['2026119', 7, 35000],
    ],
  )
  assert.equal(b.totalØre, 358750)
})

test('totalen er summen av de avrundede prosjektbeløpene, så bilaget går i balanse', () => {
  const b = beregn(grunnlag([rad(1, 0.333), rad(1, 0.333, '2026119')]))
  assert.equal(b.totalØre, b.perProsjekt.reduce((s, p) => s + p.øre, 0))
  assert.equal(b.perProsjekt[0].øre, 30803)
})

test('sats 0 og tom sats stopper, med eget ord', () => {
  const b = beregn(grunnlag([rad(3, 4), rad(6, 2), rad(1, 1)]))
  assert.deepEqual(
    b.stopp.map((s) => [s.ord, s.maskinId, s.timer]),
    [
      ['mangler_sats', 3, 4],
      ['mangler_sats', 6, 2],
    ],
  )
  assert.equal(b.totalØre, 92500)
})

test('maskin på listen belastes ikke og stopper ikke, også via kategori', () => {
  const b = beregn(grunnlag([rad(4, 3), rad(5, 8), rad(1, 1)]))
  assert.equal(b.stopp.length, 0)
  assert.deepEqual(
    b.unntatt.map((u) => [u.maskinId, u.timer, u.grunn]),
    [
      [5, 8, 'Innleid'],
      [4, 3, 'Firmabiler'],
    ],
  )
  assert.equal(b.totalØre, 92500)
})

test('ukjent maskin, uten prosjekt og prosjekt som mangler i Tripletex stopper', () => {
  const b = beregn(grunnlag([rad(99, 1), rad(1, 1, null), rad(1, 2, '2099999')]))
  assert.deepEqual(b.stopp.map((s) => s.ord).sort(), ['mangler_prosjekt', 'ukjent_maskin', 'uten_prosjekt'])
  assert.equal(b.totalØre, 0)
})

test('timer på 2011700 belastes aldri', () => {
  const b = beregn(grunnlag([rad(1, 1, '2011700')]))
  assert.deepEqual(b.stopp.map((s) => s.ord), ['objektprosjekt'])
  assert.equal(b.totalØre, 0)
})

test('uattesterte timer telles, men belastes ikke og stopper ikke', () => {
  const b = beregn(grunnlag([rad(1, 2, '2026118', false), rad(3, 5, '2026118', false), rad(1, 1)]))
  assert.equal(b.stopp.length, 0)
  assert.deepEqual(b.uattestert, { antall: 2, timer: 7 })
  assert.equal(b.totalØre, 92500)
})

test('uten Tripletex-liste stoppes ingen prosjekter, men det sies fra', () => {
  const b = beregn(grunnlag([rad(1, 1, '2099999')], null))
  assert.equal(b.stopp.length, 0)
  assert.equal(b.tripletexSjekket, false)
  assert.equal(b.totalØre, 92500)
})

test('interne prosjekter belastes, og merkes som interne', () => {
  const b = beregn(grunnlag([rad(1, 1, '2011600')]))
  assert.equal(b.perProsjekt[0].internt, true)
  assert.equal(b.totalØre, 92500)
})

test('per maskin har timer, sats og beløp', () => {
  const b = beregn(grunnlag([rad(2, 10), rad(2, 5, '2026119'), rad(1, 1)]))
  assert.deepEqual(
    b.perMaskin.map((m) => [m.maskinId, m.timer, m.sats, m.øre]),
    [
      [1, 1, 925, 92500],
      [2, 15, 50, 75000],
    ],
  )
})
