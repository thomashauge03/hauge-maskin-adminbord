// Sidene i valget for én gruppe. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { siderIValget } from './gruppevalg.ts'

const SIDER = [
  { id: 'utleie', navn: 'Utleie', gruppe: 'Kunder', barePC: false },
  { id: 'tripletex', navn: 'Tripletex', gruppe: 'Kontor', barePC: false },
  { id: 'regnskap', navn: 'Regnskap', gruppe: 'Kontor', barePC: true },
]

// id, om gruppa gir den, og om den har en merknad om hvorfor den ikke vises på telefonen
const kort = (liste) => liste.map((s) => `${s.id}:${s.gir ? 'gir' : '-'}${s.merknad ? ':merknad' : ''}`)

test('telefonsidene står, med det gruppa gir', () => {
  assert.deepEqual(kort(siderIValget(SIDER, ['utleie'])), ['utleie:gir', 'tripletex:-'])
})

// Står under «Gir:», og må kunne tas ut. Før var den bare borte fra valget.
test('en PC-side gruppa fortsatt gir, står med merknad', () => {
  assert.deepEqual(kort(siderIValget(SIDER, ['regnskap'])), ['utleie:-', 'tripletex:-', 'regnskap:gir:merknad'])
})

test('en PC-side gruppa ikke gir, står ikke – å legge den til gjør ingenting', () => {
  assert.deepEqual(kort(siderIValget(SIDER, [])), ['utleie:-', 'tripletex:-'])
})

// Skjult eller slettet i sider.json. Id-en er alt vi har å vise.
test('en side gruppa gir som ikke er i sidelista, står med id-en og merknad', () => {
  const valg = siderIValget(SIDER, ['borte'])
  assert.deepEqual(kort(valg), ['utleie:-', 'tripletex:-', 'borte:gir:merknad'])
  assert.equal(valg[2].navn, 'borte')
})

/* En tom eller ukjent fil sier ingenting om hva som er slettet. Ellers så
   alt gruppa gir, slettet ut – og ble tilbudt tatt ut. */
test('uten sidelista står ingenting som slettet', () => {
  assert.deepEqual(kort(siderIValget([], ['utleie', 'regnskap'])), [])
})
