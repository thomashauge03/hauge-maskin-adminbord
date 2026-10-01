// Filteret i adressen, uten å treffe grensa i Safari. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lagAdresseskriver } from './adresseskriver.ts'

function oppsett(t, skriv = null) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const skrevet = []
  const skriver = lagAdresseskriver(skriv ?? ((adresse) => skrevet.push(adresse)))
  return { skriver, skrevet }
}

/** Har løftet fått svar? Det er det overgangen i brukerlista venter på. */
async function ferdig(løfte) {
  let svar = false
  løfte.then(() => { svar = true })
  await Promise.resolve()
  await Promise.resolve()
  return svar
}

test('første endring skrives med en gang', async (t) => {
  const { skriver, skrevet } = oppsett(t)
  const løfte = skriver.skriv('/appen?q=o')
  assert.deepEqual(skrevet, ['/appen?q=o'])
  assert.ok(await ferdig(løfte))
})

test('det som kommer innen et sekund, blir ett skriv med det siste – og venter til det', async (t) => {
  const { skriver, skrevet } = oppsett(t)
  skriver.skriv('/appen?q=o')
  const andre = skriver.skriv('/appen?q=ol')
  const tredje = skriver.skriv('/appen?q=ola')

  assert.deepEqual(skrevet, ['/appen?q=o'])
  assert.equal(await ferdig(tredje), false, 'sa ferdig før adressen var skrevet')

  t.mock.timers.tick(1000)
  assert.deepEqual(skrevet, ['/appen?q=o', '/appen?q=ola'])
  assert.ok(await ferdig(andre))
  assert.ok(await ferdig(tredje))
})

/* Safari kaster etter 100 history-kall på 30 sekunder, og Next.js gjør ett
   kall til for hvert av våre. Vi må altså holde oss godt under 50. */
test('hundre tastetrykk på tretti sekunder gir høyst ett skriv i sekundet', (t) => {
  const { skriver, skrevet } = oppsett(t)
  for (let i = 1; i <= 100; i++) {
    skriver.skriv(`/appen?q=${i}`)
    t.mock.timers.tick(300)
  }
  t.mock.timers.tick(1000)
  assert.ok(skrevet.length <= 31, `${skrevet.length} skriv`)
  assert.equal(skrevet.at(-1), '/appen?q=100', 'det siste tastetrykket ble aldri skrevet')
})

test('et skriv som kaster, stopper ikke tastingen', async (t) => {
  let kast = true
  const skrevet = []
  const { skriver } = oppsett(t, (adresse) => {
    if (kast) throw new Error('SecurityError: Attempt to use history.replaceState() more than 100 times')
    skrevet.push(adresse)
  })
  assert.ok(await ferdig(skriver.skriv('/appen?q=o')))

  kast = false
  const neste = skriver.skriv('/appen?q=ol')
  t.mock.timers.tick(1000)
  assert.ok(await ferdig(neste))
  assert.deepEqual(skrevet, ['/appen?q=ol'])
})

// Når søkefeltet mister fokus, er det fordi noen trykker på noe – kanskje en lenke.
test('nå() skriver det som venter, med en gang', async (t) => {
  const { skriver, skrevet } = oppsett(t)
  skriver.skriv('/appen?q=o')
  const venter = skriver.skriv('/appen?q=ol')
  skriver.nå()
  assert.deepEqual(skrevet, ['/appen?q=o', '/appen?q=ol'])
  assert.ok(await ferdig(venter))
})

/* Lista er borte, eller nettleseren har gått tilbake. Et skriv da ville lagt
   filteret over adressen vi kom til – og overgangen som venter, må likevel
   få svar, ellers venter navigasjonen på den for alltid. */
test('slipp(): det som venter, får svar, men skrives aldri', async (t) => {
  const { skriver, skrevet } = oppsett(t)
  skriver.skriv('/appen?q=o')
  const venter = skriver.skriv('/appen?q=ol')
  skriver.slipp()
  assert.ok(await ferdig(venter))
  t.mock.timers.tick(5000)
  assert.deepEqual(skrevet, ['/appen?q=o'])
})
