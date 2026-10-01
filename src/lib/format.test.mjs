// Datoer i norsk tid, uansett hvor tjeneren står. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// Vercel kjører i UTC. Settes før fila lastes, for formatene lages da.
// Mangler tidssonen i visDato, gir det UTC her – ikke tida på maskinen
// testen kjører på, som her i landet ville skjult feilen.
process.env.TZ = 'UTC'
const { visDato } = await import('./format.ts')

test('visDato: like før midnatt i UTC er det neste dag i Norge', () => {
  assert.equal(visDato('2026-11-01T23:30:00Z'), '02.11.2026') // vintertid, UTC+1
  assert.equal(visDato('2026-07-01T22:30:00Z'), '02.07.2026') // sommertid, UTC+2
})
