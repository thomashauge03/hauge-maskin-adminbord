// Lesing av Authorization-headeren. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hentBearer } from './bearer.ts'

test('henter tokenet', () => {
  assert.equal(hentBearer('Bearer abc.def'), 'abc.def')
  assert.equal(hentBearer('bearer abc'), 'abc')
})

test('avviser alt annet', () => {
  assert.equal(hentBearer(null), null)
  assert.equal(hentBearer(''), null)
  assert.equal(hentBearer('Bearer'), null)
  assert.equal(hentBearer('Basic abc'), null)
  assert.equal(hentBearer('Bearer a b'), null)
})
