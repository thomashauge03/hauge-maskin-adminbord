// Tolkning av SmartDok-eksporten. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { delCsv, tolkEksport } from './tolk-eksport.ts'

test('delCsv: semikolon, sitater og BOM', () => {
  const bom = String.fromCodePoint(0xfeff)
  assert.deepEqual(delCsv(`${bom}Nr;Navn\r\n1;"Veg; ny"\r\n2;"Sa ""hei"""\n`), [
    ['Nr', 'Navn'],
    ['1', 'Veg; ny'],
    ['2', 'Sa "hei"'],
  ])
  assert.deepEqual(delCsv('Nr,Navn\n1,A'), [['Nr', 'Navn'], ['1', 'A']])
})

test('finner kolonnene på overskriften, også under en tittelrad', () => {
  const t = tolkEksport([
    ['Prosjekter - Hauge Maskin AS'],
    [],
    ['Prosjektnavn', 'Prosjektnr.', 'Kunde', 'Aktiv'],
    ['Skardheie Hyttefelt', 2026118, 'Skardheie AS', 'Ja'],
    ['Rehabsenteret', '2026119', '', 'Nei'],
  ])
  assert.equal(t.ok, true)
  assert.deepEqual(t.kolonner, { nummer: 'Prosjektnr.', navn: 'Prosjektnavn', kunde: 'Kunde', aktiv: 'Aktiv' })
  assert.deepEqual(t.prosjekter, [
    { nummer: '2026118', navn: 'Skardheie Hyttefelt', kunde: 'Skardheie AS', adresse: null, aktiv: true },
    { nummer: '2026119', navn: 'Rehabsenteret', kunde: null, adresse: null, aktiv: false },
  ])
})

test('nummer og navn i samme celle deles', () => {
  const t = tolkEksport([['Pro.navn'], ['2026117 Herdalen'], ['Uten nummer']])
  assert.deepEqual(t.prosjekter.map((p) => [p.nummer, p.navn]), [['2026117', 'Herdalen']])
  assert.equal(t.hoppetOver, 1)
})

test('ferdig-kolonne gjør prosjektet inaktivt, og dubletter telles', () => {
  const t = tolkEksport([
    ['Nummer', 'Navn', 'Ferdig'],
    ['1', 'A', 'x'],
    ['1', 'A igjen', ''],
  ])
  assert.equal(t.dubletter, 1)
  assert.deepEqual(t.prosjekter, [{ nummer: '1', navn: 'A igjen', kunde: null, adresse: null, aktiv: true }])
})

test('uten navnekolonne kommer en forklaring med overskriftene som fantes', () => {
  const t = tolkEksport([['Dato', 'Timer']])
  assert.equal(t.ok, false)
  assert.match(t.feil, /Dato, Timer/)
})
