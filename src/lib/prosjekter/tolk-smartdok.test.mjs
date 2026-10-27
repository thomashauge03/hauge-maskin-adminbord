// Tolkning av SmartDoks GET /Projects. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tolkSmartdok } from './tolk-smartdok.ts'

const p = (felter) => ({
  ProjectNumber: '2026118',
  ProjectName: 'Skardheie Hyttefelt',
  IsActive: true,
  Finished: false,
  IsAbsenceProject: false,
  ClientCompanyName: 'Skardheie AS',
  Location: 'Skardheievegen 4',
  ...felter,
})

test('gjør SmartDok-prosjekter om til navets felt', () => {
  const t = tolkSmartdok({ Items: [p({})], TotalCount: 1 })
  assert.deepEqual(t.prosjekter, [
    { nummer: '2026118', navn: 'Skardheie Hyttefelt', kunde: 'Skardheie AS', adresse: 'Skardheievegen 4', aktiv: true },
  ])
  assert.equal(t.totalt, 1)
  assert.equal(t.mottatt, 1)
})

test('ferdigmeldt eller inaktivt blir inaktivt', () => {
  const t = tolkSmartdok({
    Items: [p({ ProjectNumber: '1', Finished: true }), p({ ProjectNumber: '2', IsActive: false })],
  })
  assert.deepEqual(
    t.prosjekter.map((x) => x.aktiv),
    [false, false],
  )
})

test('fravær og rader uten nummer eller navn tas ikke med', () => {
  const t = tolkSmartdok({
    Items: [p({ ProjectNumber: '900', ProjectName: 'Ferie', IsAbsenceProject: true }), p({ ProjectNumber: ' ' }), p({ ProjectName: null })],
  })
  assert.deepEqual(t.prosjekter, [])
  assert.equal(t.fravær, 1)
  assert.equal(t.hoppetOver, 2)
})

test('nummer uten mellomrom, nummeret ut av navnet, tomme felt til null', () => {
  const t = tolkSmartdok({
    Items: [p({ ProjectNumber: '2026 117', ProjectName: '2026117 Herdalen', ClientCompanyName: '  ', Location: '' })],
  })
  assert.deepEqual(t.prosjekter, [{ nummer: '2026117', navn: 'Herdalen', kunde: null, adresse: null, aktiv: true }])
})

test('samme nummer to ganger: den siste vinner', () => {
  const t = tolkSmartdok({ Items: [p({ ProjectName: 'Gammel' }), p({ ProjectName: 'Ny' })] })
  assert.deepEqual(
    t.prosjekter.map((x) => x.navn),
    ['Ny'],
  )
})

test('et svar uten Items er en feil, ikke en tom liste', () => {
  assert.throws(() => tolkSmartdok({ Message: 'Unauthorized' }), /Items mangler/)
  assert.throws(() => tolkSmartdok(null), /Items mangler/)
})
