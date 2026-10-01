// Søk og filter i lista over appbrukere. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STANDARDVALG, lagSøk, lesValg, normaliser, skrivValg, sorter, tellStatus } from './appsok.ts'

const bruker = (id, ekstra = {}) => ({
  id,
  navn: id,
  epost: `${id}@hm.no`,
  telefon: null,
  status: 'godkjent',
  registrert: '2026-09-01T10:00:00Z',
  kjentFraFør: true,
  grupper: [],
  unntak: 0,
  ...ekstra,
})

const GRUPPER = new Map([
  ['g1', 'Sjåfør'],
  ['g2', 'Kontor'],
])
const BRUKERE = [
  bruker('a', { navn: 'Bjørn Håkonsen', epost: 'bjorn@hm.no', telefon: '912 34 567', grupper: ['g1'], registrert: '2026-09-03T10:00:00Z' }),
  bruker('b', { navn: 'Kari Nordmann', epost: 'kari@kunde.no', status: 'venter', kjentFraFør: false, registrert: '2026-09-05T10:00:00Z' }),
  bruker('c', { navn: 'Ola Olsen', grupper: ['g1', 'g2'], status: 'sperra', registrert: '2026-09-04T10:00:00Z' }),
  bruker('d', { navn: 'Åse Ås', epost: 'ase@hm.no', registrert: '2026-09-02T10:00:00Z' }),
]
const søk = lagSøk(BRUKERE, GRUPPER)
const ider = (valg) => søk({ ...STANDARDVALG, ...valg }).map((b) => b.id)

test('normaliser: æ, ø, å og de gamle skrivemåtene blir det samme', () => {
  assert.equal(normaliser('Bjørn'), normaliser('bjorn'))
  assert.equal(normaliser('Bjørn'), normaliser('BJOERN'))
  assert.equal(normaliser('Håkon'), normaliser('haakon'))
  assert.equal(normaliser('Kjærnes'), normaliser('kjaernes'))
  assert.equal(normaliser('  Émile '), 'emile')
})

test('søk på navn uten æøå', () => {
  assert.deepEqual(ider({ q: 'bjorn hakonsen' }), ['a'])
})

// NFD deler ikke opp disse, så aksentfjerningen tar dem ikke.
test('normaliser: ł, đ, ð, ŋ, ŧ, þ, ß og ı skrives som folk skriver dem uten', () => {
  for (const [navn, skrevet] of [
    ['Łukasz', 'lukasz'],
    ['Đorđe', 'dorde'],
    ['Guðrún', 'gudrun'],
    ['Iŋgá', 'inga'],
    ['Ŧ', 't'],
    ['Þór', 'thor'],
    ['Strauß', 'strauss'],
    ['Yıldız', 'yildiz'],
  ]) {
    assert.equal(normaliser(navn), skrevet, navn)
  }
  const s = lagSøk([bruker('l', { navn: 'Łukasz Wójcik' })], GRUPPER)
  assert.deepEqual(s({ ...STANDARDVALG, q: 'lukasz wojcik' }).map((b) => b.id), ['l'])
})

test('flere ord må alle treffe, i hvilket som helst felt', () => {
  assert.deepEqual(ider({ q: 'ola kontor' }), ['c'])
  assert.deepEqual(ider({ q: 'ola sjåfør' }), ['c'])
  assert.deepEqual(ider({ q: 'kari kontor' }), [])
})

test('telefon med og uten mellomrom', () => {
  assert.deepEqual(ider({ q: '91234567' }), ['a'])
  assert.deepEqual(ider({ q: '912 34' }), ['a'])
})

test('telefon med bindestrek, parentes eller punktum: bare sifrene sammenlignes', () => {
  assert.deepEqual(ider({ q: '912-34-567' }), ['a'])
  assert.deepEqual(ider({ q: '(912) 34 567' }), ['a'])
  assert.deepEqual(ider({ q: '912.34.567' }), ['a'])
  // Tegn uten sifre er ikke et nummer, og skal ikke treffe alle som har telefon
  assert.deepEqual(ider({ q: '-' }), [])
})

test('e-post', () => {
  assert.deepEqual(ider({ q: 'kunde.no' }), ['b'])
})

test('status, gruppe, uten gruppe og ukjent', () => {
  assert.deepEqual(ider({ status: 'venter' }), ['b'])
  assert.deepEqual(ider({ gruppe: 'g2' }), ['c'])
  assert.deepEqual(ider({ gruppe: 'uten', sortering: 'navn' }), ['b', 'd'])
  assert.deepEqual(ider({ ukjent: true }), ['b'])
})

test('nyeste først er standard, og navn sorterer Æ, Ø og Å sist', () => {
  assert.deepEqual(ider({}), ['b', 'c', 'a', 'd'])
  const navn = sorter(
    [bruker('x', { navn: 'Åse' }), bruker('y', { navn: 'Zara' }), bruker('z', { navn: 'Øyvind' }), bruker('w', { navn: 'Bjørn' })],
    'navn',
  ).map((b) => b.navn)
  assert.deepEqual(navn, ['Bjørn', 'Zara', 'Øyvind', 'Åse'])
})

test('tellStatus teller alle, uavhengig av filter', () => {
  assert.deepEqual(tellStatus(BRUKERE), { venter: 1, godkjent: 2, sperra: 1 })
})

test('valgene fram og tilbake gjennom adressen', () => {
  const valg = { q: 'ola', status: 'venter', gruppe: 'g1', ukjent: true, sortering: 'navn' }
  assert.deepEqual(lesValg(new URLSearchParams(skrivValg(valg)), new Set(['g1'])), valg)
  assert.equal(skrivValg(STANDARDVALG), '')
})

test('ukjente verdier i adressen blir standard', () => {
  assert.deepEqual(
    lesValg(new URLSearchParams('status=tull&gruppe=slettet&sortering=x&ukjent=ja'), new Set(['g1'])),
    STANDARDVALG,
  )
})

test('1000 brukere og 100 søk tar under ett sekund', () => {
  const mange = Array.from({ length: 1000 }, (_, i) =>
    bruker(`p${i}`, { navn: `Person ${i} Ødegård`, telefon: `9${String(i).padStart(7, '0')}`, grupper: i % 2 ? ['g1'] : ['g2'] }),
  )
  const s = lagSøk(mange, GRUPPER)
  const start = performance.now()
  for (let i = 0; i < 100; i++) s({ ...STANDARDVALG, q: `odegard ${i}`, status: 'godkjent' })
  // Romslig grense med vilje. Poenget er å fange en feil som gjør søket
  // hundre ganger tregere, ikke å måle millisekunder.
  assert.ok(performance.now() - start < 1000, 'søket er for tregt')
})
