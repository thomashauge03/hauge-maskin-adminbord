// Tilgangsregelen i appen. Kjøres med `npm test`.
//
// Samme tilfeller som supabase/test/0017_appen.test.sql. Står regelen ett
// sted og ikke det andre, viser adminbordet noe annet enn appen gjør.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foreldreløse, grunnFor, serSiden, siderFraGrupper, unntakFor } from './sideregel.ts'

const GRUPPER = [
  { id: 'sjafor', navn: 'Sjåfør', sider: ['leveringseddel', 'utleie'] },
  { id: 'kontor', navn: 'Kontor', sider: ['tripletex', 'utleie'] },
]
const ALLE = ['leveringseddel', 'smartdok', 'tilbudssystem', 'tripletex', 'utleie']

/** Sidene personen ser, sortert – som array_agg(side_id order by side_id). */
function ser(mineGrupper, unntak = {}) {
  const fra = siderFraGrupper(mineGrupper, GRUPPER)
  const egne = new Map(Object.entries(unntak))
  return ALLE.filter((s) => serSiden(s, egne, fra))
}

test('Ola i Sjåfør ser det Sjåfør gir', () => {
  assert.deepEqual(ser(['sjafor']), ['leveringseddel', 'utleie'])
})

test('Kari uten grupper ser ingenting', () => {
  assert.deepEqual(ser([], { tripletex: false }), [])
})

test('Per: eget unntak vinner begge veier, også over to grupper', () => {
  assert.deepEqual(ser(['sjafor', 'kontor'], { utleie: false, smartdok: true }), [
    'leveringseddel',
    'smartdok',
    'tripletex',
  ])
})

test('Begge: samme side fra to grupper kommer med én gang', () => {
  assert.deepEqual(ser(['sjafor', 'kontor']), ['leveringseddel', 'tripletex', 'utleie'])
})

test('grunnen nevner alle gruppene som gir siden', () => {
  const fra = siderFraGrupper(['sjafor', 'kontor'], GRUPPER)
  assert.deepEqual(grunnFor('utleie', new Map(), fra), {
    ser: true,
    hvorfor: 'gruppe',
    grupper: ['Sjåfør', 'Kontor'],
  })
})

test('grunnen for et unntak husker hva gruppene ville gitt', () => {
  const fra = siderFraGrupper(['sjafor'], GRUPPER)
  assert.deepEqual(grunnFor('utleie', new Map([['utleie', false]]), fra), {
    ser: false,
    hvorfor: 'tatt',
    grupper: ['Sjåfør'],
  })
  assert.deepEqual(grunnFor('smartdok', new Map([['smartdok', true]]), fra), {
    ser: true,
    hvorfor: 'gitt',
    grupper: [],
  })
  assert.deepEqual(grunnFor('smartdok', new Map(), fra), { ser: false, hvorfor: 'ingen', grupper: [] })
})

test('et unntak lagres bare når det avviker fra gruppene', () => {
  assert.equal(unntakFor(true, true), null)
  assert.equal(unntakFor(false, false), null)
  assert.equal(unntakFor(true, false), true)
  assert.equal(unntakFor(false, true), false)
})

test('foreldreløse: id-er som ikke står i fila, sortert og én gang', () => {
  assert.deepEqual(foreldreløse(new Set(['a']), ['a', 'c'], new Set(['c', 'b'])), ['b', 'c'])
  assert.deepEqual(foreldreløse(new Set(['a'])), [])
})
