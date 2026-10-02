// E-postsøket i Brukere-lista på telefon. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passerSøk } from './personsok.ts'

test('tomt søk passer alle', () => {
  assert.equal(passerSøk('ola@haugemaskin.no', ''), true)
  assert.equal(passerSøk('ola@haugemaskin.no', '   '), true)
})

test('en del av adressen passer, uansett store og små bokstaver', () => {
  assert.equal(passerSøk('Ola.Nordmann@HaugeMaskin.no', 'nordmann@hauge'), true)
  assert.equal(passerSøk('ola@haugemaskin.no', 'OLA'), true)
})

// Telefontastaturet setter gjerne et mellomrom etter et ord valgt fra forslagene.
test('mellomrom foran og bak teller ikke', () => {
  assert.equal(passerSøk('kari@haugemaskin.no', ' kari '), true)
})

test('det som ikke står i adressen, passer ikke', () => {
  assert.equal(passerSøk('kari@haugemaskin.no', 'per'), false)
})
