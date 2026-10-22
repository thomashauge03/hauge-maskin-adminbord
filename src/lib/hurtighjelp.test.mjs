// Hurtighjelp-knappen: når den vises, og hva den sier etterpå. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { finnBro, svarTekst } = await import('./hurtighjelp.ts')

test('broen finnes bare når Windows-appen har lagt den på fanen', () => {
  const start = async () => 'app'
  assert.equal(finnBro({ hmApp: { hurtighjelp: { start } } })?.start, start)
  for (const w of [{}, { hmApp: {} }, { hmApp: { innboks: {} } }, { hmApp: { hurtighjelp: {} } }, undefined]) {
    assert.equal(finnBro(w), null, JSON.stringify(w))
  }
})

test('svaret fra appen blir en setning admin kan handle etter', () => {
  assert.match(svarTekst('app'), /Hjelp noen/)
  assert.match(svarTekst('gammel'), /Hjelp noen/)
  assert.match(svarTekst('butikk'), /Microsoft Store/)
  assert.match(svarTekst({ ok: false, feil: 'Bare adminbordet kan bruke dette.' }), /Bare adminbordet/)
  assert.match(svarTekst(undefined), /Fikk ikke startet/)
})
