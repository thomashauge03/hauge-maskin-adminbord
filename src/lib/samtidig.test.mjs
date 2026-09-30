// Høyst n om gangen. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { medHøyst } from './samtidig.ts'

const vent = (ms) => new Promise((ferdig) => setTimeout(ferdig, ms))

test('svarene kommer i samme rekkefølge som lista', async () => {
  const svar = await medHøyst(3, [30, 10, 20, 0], async (ms, i) => {
    await vent(ms)
    return i
  })
  assert.deepEqual(svar, [0, 1, 2, 3])
})

test('aldri flere enn n om gangen', async () => {
  let underveis = 0
  let høyest = 0
  await medHøyst(8, Array.from({ length: 50 }, (_, i) => i), async () => {
    underveis++
    høyest = Math.max(høyest, underveis)
    await vent(1)
    underveis--
  })
  assert.equal(høyest, 8)
})

test('tom liste gir tomt svar', async () => {
  assert.deepEqual(await medHøyst(8, [], async () => 1), [])
})
