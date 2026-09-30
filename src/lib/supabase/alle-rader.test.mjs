// Forbi grensen på 1000 rader per svar. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alleRader, RADER_PER_SVAR } from './alle-rader.ts'

test('henter videre til et svar har færre enn tusen rader', async () => {
  const kall = []
  const alle = Array.from({ length: 2500 }, (_, i) => i)
  const rader = await alleRader('testrader', async (fra, til) => {
    kall.push([fra, til])
    return { data: alle.slice(fra, til + 1), error: null }
  })
  assert.equal(rader.length, 2500)
  assert.deepEqual(kall, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('nøyaktig tusen rader gir ett kall til, som er tomt', async () => {
  let kall = 0
  const rader = await alleRader('testrader', async (fra) => {
    kall++
    return { data: fra === 0 ? Array.from({ length: RADER_PER_SVAR }, (_, i) => i) : [], error: null }
  })
  assert.equal(rader.length, RADER_PER_SVAR)
  assert.equal(kall, 2)
})

test('en feil sier hva som ikke kunne hentes', async () => {
  await assert.rejects(
    alleRader('gruppene', async () => ({ data: null, error: { message: 'borte' } })),
    /Kunne ikke hente gruppene: borte/,
  )
})
