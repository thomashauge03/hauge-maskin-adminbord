// Forbi grensen på 1000 rader per svar. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alleRader, følgSidene, RADER_PER_SVAR } from './alle-rader.ts'

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

/*
 * Slik listUsers i supabase-js svarer: brukerne på siden, og nextPage fra
 * Link-hodet. supabase-js leser bare første siffer i sidetallet der, så
 * etter side 9 kommer nextPage 1 – et kjent avvik i auth-js 2.112.
 */
function auth(antallSider, perSide) {
  const spurt = []
  const hent = async (side) => {
    spurt.push(side)
    if (spurt.length > antallSider + 5) throw new Error('løkka kommer aldri ut')
    const users = side <= antallSider ? Array.from({ length: perSide }, (_, i) => `${side}-${i}`) : []
    const neste = side < antallSider ? side + 1 : null
    return {
      data: { users, aud: 'authenticated', nextPage: neste === null ? null : Number(String(neste)[0]), lastPage: antallSider, total: antallSider * perSide },
      error: null,
    }
  }
  return { hent, spurt }
}

test('følgSidene: henter videre så lenge svaret sier det finnes en side til – også under tusen per side', async () => {
  // Auth kan gi færre per side enn vi ba om. Før stoppet lista da etter første side.
  const { hent, spurt } = auth(3, 500)
  const brukere = await følgSidene('navbrukere', hent)
  assert.equal(brukere.length, 1500)
  assert.deepEqual(spurt, [1, 2, 3])
})

test('følgSidene: side ti og videre blir ikke til side én igjen', async () => {
  const { hent, spurt } = auth(12, 2)
  const brukere = await følgSidene('navbrukere', hent)
  assert.equal(brukere.length, 24)
  assert.deepEqual(spurt, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

test('følgSidene: en feil sier hva som ikke kunne hentes', async () => {
  await assert.rejects(
    følgSidene('navbrukere', async () => ({ data: { users: [] }, error: { message: 'nede' } })),
    /Kunne ikke hente navbrukere: nede/,
  )
})
