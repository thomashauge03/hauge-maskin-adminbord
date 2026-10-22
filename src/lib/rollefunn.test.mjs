// Rollene lest fra systemene selv. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flettRoller, startrolle, tolkRollefunn, verdierFraSjekk } from './rollefunn.ts'

const rolle = (verdi, erStandard = false) => ({
  verdi,
  etikett: verdi.toUpperCase(),
  beskrivelse: null,
  erStandard,
  ny: false,
  iBruk: null,
})

// Slik står utleiens regel i den levende basen.
const UTLEIE =
  "CHECK ((rolle = ANY (ARRAY['admin'::text, 'service'::text, 'ansatt'::text])))"

test('CHECK-regelen gir de lovlige rollene', () => {
  assert.deepEqual(verdierFraSjekk(UTLEIE), ['admin', 'service', 'ansatt'])
})

test('en regel som ikke lister roller, sier ingenting', () => {
  assert.equal(verdierFraSjekk('CHECK ((length(rolle) > 0))'), null)
  assert.equal(verdierFraSjekk("CHECK ((email ~~ '%_@_%'::text))"), null)
})

test('apostrof i en rolle overlever', () => {
  assert.deepEqual(verdierFraSjekk("CHECK ((r = ANY (ARRAY['o''neil'::text])))"), ["o'neil"])
})

test('ny rolle i systemet kommer med, med rått navn', () => {
  const funn = tolkRollefunn([
    { kilde: 'sjekk', verdi: UTLEIE, antall: null },
    { kilde: 'i_bruk', verdi: 'ansatt', antall: 1 },
    { kilde: 'i_bruk', verdi: 'admin', antall: 2 },
  ])
  const roller = flettRoller([rolle('admin', true), rolle('service')], funn)
  assert.deepEqual(roller.map((r) => r.verdi), ['admin', 'service', 'ansatt'])
  const ansatt = roller.find((r) => r.verdi === 'ansatt')
  assert.equal(ansatt.ny, true)
  assert.equal(ansatt.etikett, 'Ansatt')
  assert.equal(ansatt.iBruk, 1)
  assert.equal(roller[0].iBruk, 2)
})

test('rolle i bruk uten CHECK-regel kommer også med', () => {
  const funn = tolkRollefunn([{ kilde: 'i_bruk', verdi: 'ansatt', antall: 2 }])
  const roller = flettRoller([rolle('admin', true), rolle('kontor')], funn)
  assert.deepEqual(roller.map((r) => r.verdi), ['admin', 'kontor', 'ansatt'])
})

test('registerrolle databasen avviser, tas ut', () => {
  const funn = tolkRollefunn([
    { kilde: 'sjekk', verdi: "CHECK ((rolle = ANY (ARRAY['admin'::text])))", antall: null },
  ])
  assert.deepEqual(flettRoller([rolle('admin'), rolle('service')], funn).map((r) => r.verdi), ['admin'])
})

test('uten funn vises registeret uendret', () => {
  const reg = [rolle('admin')]
  assert.equal(flettRoller(reg, null), reg)
})

test('enum og CHECK må begge holde', () => {
  const funn = tolkRollefunn([
    { kilde: 'enum', verdi: 'a', antall: null },
    { kilde: 'enum', verdi: 'b', antall: null },
    { kilde: 'sjekk', verdi: "CHECK ((r = ANY (ARRAY['b'::text, 'c'::text])))", antall: null },
  ])
  assert.deepEqual(funn.lovlige, ['b'])
})

// Lagerets user_roles: enumen har også heimesidas admin og en ubrukt user.
test('veiens rolleliste snevrer inn både lovlige og i bruk', () => {
  const funn = tolkRollefunn(
    ['admin', 'user', 'staff', 'viewer', 'lager']
      .map((v) => ({ kilde: 'enum', verdi: v, antall: null }))
      .concat([
        { kilde: 'i_bruk', verdi: 'admin', antall: 3 },
        { kilde: 'i_bruk', verdi: 'viewer', antall: 1 },
      ]),
    ['lager', 'staff', 'viewer'],
  )
  assert.deepEqual(funn.lovlige, ['staff', 'viewer', 'lager'])
  assert.deepEqual([...funn.iBruk.keys()], ['viewer'])
  assert.deepEqual(flettRoller([], funn).map((r) => r.verdi), ['staff', 'viewer', 'lager'])
})

// Feilen som gjorde en ansatt til admin med ett vanetrykk.
test('listen starter på personens egen rolle, også en ukjent', () => {
  const roller = [rolle('admin', true)]
  assert.equal(startrolle(roller, 'ansatt'), 'ansatt')
  assert.equal(startrolle(roller, null), 'admin')
  assert.equal(startrolle([], null), null)
})
