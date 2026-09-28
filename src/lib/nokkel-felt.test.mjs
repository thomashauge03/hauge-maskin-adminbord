// Nøkkelbryteren som felt i sider.json. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { medNokkel } from './nokkel-felt.ts'

test('på fjerner feltet, så fila bare har det der det betyr noe', () => {
  assert.deepEqual(medNokkel({ id: 'a', nokkel: false }, true), { id: 'a' })
})

test('av skriver nokkel: false', () => {
  assert.deepEqual(medNokkel({ id: 'a' }, false), { id: 'a', nokkel: false })
})

test('andre felt står urørt', () => {
  assert.deepEqual(medNokkel({ id: 'a', plattform: 'pc', image: 'x' }, false), {
    id: 'a',
    plattform: 'pc',
    image: 'x',
    nokkel: false,
  })
})

test('sida som kom inn, blir ikke endret', () => {
  const side = { id: 'a', nokkel: false }
  medNokkel(side, true)
  assert.deepEqual(side, { id: 'a', nokkel: false })
})
