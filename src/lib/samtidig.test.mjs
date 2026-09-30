// Høyst n om gangen, og lister i biter. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iBiter, medHøyst } from './samtidig.ts'

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

const tall = (antall) => Array.from({ length: antall }, (_, i) => i)

test('iBiter: 250 blir hundre, hundre og femti', () => {
  assert.deepEqual(
    iBiter(tall(250), 100).map((bit) => bit.length),
    [100, 100, 50],
  )
})

test('iBiter: nøyaktig hundre blir én bit, ikke en ekstra tom en', () => {
  const biter = iBiter(tall(100), 100)
  assert.equal(biter.length, 1)
  assert.equal(biter[0].length, 100)
})

test('iBiter: tom liste gir ingen biter', () => {
  assert.deepEqual(iBiter([], 100), [])
})

test('iBiter: rekkefølgen holdes, og ingenting går tapt eller kommer to ganger', () => {
  assert.deepEqual(iBiter(['a', 'b', 'c', 'd', 'e'], 2), [['a', 'b'], ['c', 'd'], ['e']])
  assert.deepEqual(iBiter(tall(250), 100).flat(), tall(250))
})

test('iBiter: størrelse under én blir én, så løkka aldri står fast', () => {
  assert.deepEqual(iBiter(['a', 'b', 'c'], 0), [['a'], ['b'], ['c']])
})
