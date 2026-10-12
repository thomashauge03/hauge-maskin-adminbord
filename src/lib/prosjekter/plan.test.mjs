// Synkreglene for den felles prosjektlisten. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliserNummer, rensNavn, planleggUtskriving } from './plan.ts'

const p = (nummer, navn, ekstra = {}) => ({ nummer, navn, kunde: null, adresse: null, aktiv: true, ...ekstra })
const rad = (id, nummer, navn, ekstra = {}) => ({ id, nummer, navn, kunde: null, adresse: null, aktiv: true, ...ekstra })

test('normaliserNummer: mellomrom, Excel-desimaler og tomt', () => {
  assert.equal(normaliserNummer(' 2026 117 '), '2026117')
  assert.equal(normaliserNummer(2026117), '2026117')
  assert.equal(normaliserNummer('2026117.0'), '2026117')
  assert.equal(normaliserNummer(''), null)
  assert.equal(normaliserNummer(null), null)
})

test('rensNavn: nummeret tas ut av navnet, men ikke hvis det er hele navnet', () => {
  assert.equal(rensNavn('2025151 Surtekvæven velforening', '2025151'), 'Surtekvæven velforening')
  assert.equal(rensNavn('2025151 - Surtekvæven', '2025151'), 'Surtekvæven')
  assert.equal(rensNavn('2025151', '2025151'), '2025151')
  assert.equal(rensNavn('Veg  Eiken ', '123'), 'Veg Eiken')
})

test('planleggUtskriving: nye, endrede og urørte', () => {
  const navet = [p('1', 'Ny'), p('2', 'Nytt navn', { aktiv: false }), p('3', 'Lik')]
  const app = [rad('x', '2', 'Gammelt navn'), rad('y', '3', 'Lik')]
  const plan = planleggUtskriving(navet, app)
  assert.deepEqual(plan.nye.map((n) => n.nummer), ['1'])
  assert.deepEqual(plan.endringer, [{ id: 'x', endring: { navn: 'Nytt navn', aktiv: false } }])
})

test('planleggUtskriving: kunde og adresse fylles bare der appen har tomt', () => {
  const navet = [p('1', 'A', { kunde: 'SmartDok-kunde', adresse: 'Vei 1' })]
  const app = [rad('x', '1', 'A', { kunde: 'Egen kunde' })]
  assert.deepEqual(planleggUtskriving(navet, app).endringer, [{ id: 'x', endring: { adresse: 'Vei 1' } }])
})

test('planleggUtskriving: prosjekt uten nummer med samme navn får nummeret', () => {
  const navet = [p('2026343', 'Test Veg')]
  const app = [rad('x', null, 'test veg')]
  const plan = planleggUtskriving(navet, app)
  assert.equal(plan.nye.length, 0)
  assert.deepEqual(plan.endringer, [{ id: 'x', endring: { nummer: '2026343', navn: 'Test Veg' } }])
})

test('planleggUtskriving: unike navn får nummeret bak, og endres ikke neste gang', () => {
  const navet = [p('1', 'Tun'), p('2', 'Tun')]
  const første = planleggUtskriving(navet, [], { unikeNavn: true })
  assert.deepEqual(første.nye.map((n) => n.navn), ['Tun', 'Tun (2)'])

  const app = [rad('a', '1', 'Tun'), rad('b', '2', 'Tun (2)')]
  assert.deepEqual(planleggUtskriving(navet, app, { unikeNavn: true }).endringer, [])
})

test('planleggUtskriving: nummer appen ikke kan lagre hoppes over', () => {
  const navet = [p('2026117', 'Tall'), p('A-12', 'Bokstav')]
  const plan = planleggUtskriving(navet, [], { godtarNummer: (n) => /^\d+$/.test(n) })
  assert.deepEqual(plan.nye.map((n) => n.nummer), ['2026117'])
  assert.deepEqual(plan.hoppetOver, ['A-12'])
})

test('planleggUtskriving: app uten aktiv-kolonne og kunde får ikke slike endringer', () => {
  const navet = [p('1', 'A', { aktiv: false, kunde: 'K' })]
  const app = [rad('x', '1', 'A', { aktiv: null })]
  const plan = planleggUtskriving(navet, app, { harAktiv: false, harKunde: false })
  assert.deepEqual(plan.endringer, [])
})

test('planleggUtskriving: appens egne prosjekter settes inaktive', () => {
  const navet = [p('2026118', 'Skardheie')]
  const app = [
    rad('a', '2026118', 'Skardheie'),
    rad('b', '9000001', 'Eget i rørlageret'),
    rad('c', null, 'Uten nummer'),
    rad('d', '123', 'Alt inaktivt', { aktiv: false }),
  ]
  const plan = planleggUtskriving(navet, app)
  assert.equal(plan.deaktivert, 2)
  assert.deepEqual(plan.endringer, [
    { id: 'b', endring: { aktiv: false } },
    { id: 'c', endring: { aktiv: false } },
  ])
})

test('planleggUtskriving: tom liste slår ikke av noe', () => {
  const plan = planleggUtskriving([], [rad('a', '1', 'A')])
  assert.equal(plan.deaktivert, 0)
  assert.deepEqual(plan.endringer, [])
})
