// Høyst n om gangen, og lister i biter. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iBiter, medHøyst, perBit } from './samtidig.ts'

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

/* En spørring som svarer med én rad per id den får, og feiler på kall
   nummer `feilPå`. Slik oppfører en skriving med .select() seg. */
function spørring({ feilPå = null, melding = 'nede' } = {}) {
  const kall = []
  const spør = async (bit) => {
    kall.push(bit)
    if (kall.length === feilPå) return { data: null, error: { message: melding } }
    return { data: bit.map((id) => ({ id })), error: null }
  }
  return { spør, kall }
}

test('perBit: alt gikk – alle er ferdige, med radene fra hver bit', async () => {
  const { spør, kall } = spørring()
  const svar = await perBit(tall(250), 100, spør)
  assert.deepEqual(kall.map((bit) => bit.length), [100, 100, 50])
  assert.equal(svar.feil, null)
  assert.deepEqual(svar.ferdige, tall(250))
  assert.deepEqual(svar.rader.map((r) => r.id), tall(250))
})

/* Bitene før feilen er skrevet på ekte. Glemmer bokføringen dem, sier
   skjermen «ingenting skjedde» om folk som faktisk er godkjent, og loggen
   mangler dem. */
test('perBit: stopper ved første feil, og gir fra seg bitene før den', async () => {
  const { spør, kall } = spørring({ feilPå: 2 })
  const svar = await perBit(tall(250), 100, spør)
  assert.equal(kall.length, 2, 'spurte videre etter feilen')
  assert.equal(svar.feil, 'nede')
  assert.deepEqual(svar.ferdige, tall(100))
  assert.deepEqual(svar.rader.map((r) => r.id), tall(100))
})

test('perBit: en feil uten melding er fortsatt en feil', async () => {
  const { spør } = spørring({ feilPå: 1, melding: '' })
  const svar = await perBit(tall(10), 100, spør)
  assert.equal(svar.feil, 'ukjent feil')
  assert.deepEqual(svar.ferdige, [])
})

// En skriving uten .select() svarer uten rader. Bitene er like fullt skrevet.
test('perBit: svar uten rader teller som ferdige', async () => {
  const svar = await perBit(tall(150), 100, async () => ({ data: null, error: null }))
  assert.equal(svar.feil, null)
  assert.deepEqual(svar.ferdige, tall(150))
  assert.deepEqual(svar.rader, [])
})
