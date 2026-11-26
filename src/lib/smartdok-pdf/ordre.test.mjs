// Rene hjelpere til Tripletex-ordre. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lagMerke, lagKode, overlapp, tolkProdukter, tolkProsjekt, tolkApneOrdrer, sjekkLinjer } from './ordre.ts'

test('merket har ordrenummer og kode', () => {
  assert.equal(lagMerke('1234', 'k7x2ab'), 'Tripletex ordre 1234 (k7x2ab)')
})

test('koden er seks tegn a-z og 0-9, og varierer', () => {
  const koder = new Set()
  for (let i = 0; i < 50; i++) {
    const k = lagKode()
    assert.match(k, /^[a-z0-9]{6}$/)
    koder.add(k)
  }
  assert.ok(koder.size > 40)
})

test('overlapp finner første aktive sending med felles id', () => {
  const aktive = [
    { kode: 'aaaaaa', ordrenummer: '1', timer_ider: [1, 2] },
    { kode: 'bbbbbb', ordrenummer: null, timer_ider: [3, 4] },
    { kode: 'cccccc', ordrenummer: '3', timer_ider: [4] },
  ]
  assert.deepEqual(overlapp([4, 9], aktive), { kode: 'bbbbbb', ordrenummer: null })
})

test('overlapp gir null uten felles id', () => {
  assert.equal(overlapp([7], [{ kode: 'aaaaaa', ordrenummer: '1', timer_ider: [1, 2] }]), null)
  assert.equal(overlapp([], [{ kode: 'aaaaaa', ordrenummer: '1', timer_ider: [1] }]), null)
  assert.equal(overlapp([1], []), null)
})

test('produkter: bare aktive, med pris eller null', () => {
  const json = {
    values: [
      { id: 1, number: '10', name: 'Gravemaskin', isInactive: false, priceExcludingVatCurrency: 1250.5 },
      { id: 2, number: '11', name: 'Gammel', isInactive: true, priceExcludingVatCurrency: 5 },
      { id: 3, number: 12, name: 'Uten pris', isInactive: false },
    ],
  }
  assert.deepEqual(tolkProdukter(json), [
    { id: 1, nummer: '10', navn: 'Gravemaskin', pris: 1250.5 },
    { id: 3, nummer: '12', navn: 'Uten pris', pris: null },
  ])
})

test('produkter: uventet form gir feil, ikke stille bortfall', () => {
  assert.throws(() => tolkProdukter(null))
  assert.throws(() => tolkProdukter({}))
  assert.throws(() => tolkProdukter({ values: [{ number: '1', name: 'x', isInactive: false }] }))
  assert.throws(() => tolkProdukter({ values: [{ id: 1, number: '1', isInactive: false }] }))
})

test('prosjekt: eksakt nummer, ikke prefiks', () => {
  const json = {
    values: [
      { id: 5, number: '20261180', customer: { id: 9 } },
      { id: 6, number: '2026118', customer: { id: 8 } },
    ],
  }
  assert.deepEqual(tolkProsjekt(json, '2026118'), { id: 6, kundeId: 8 })
})

test('prosjekt: ingen og flere', () => {
  assert.equal(tolkProsjekt({ values: [{ id: 5, number: '20261180', customer: { id: 9 } }] }, '2026118'), 'ingen')
  assert.equal(tolkProsjekt({ values: [] }, '2026118'), 'ingen')
  const to = { values: [{ id: 1, number: '7', customer: { id: 1 } }, { id: 2, number: '7', customer: { id: 2 } }] }
  assert.equal(tolkProsjekt(to, '7'), 'flere')
})

test('prosjekt: treff uten kunde eller uventet form gir feil', () => {
  assert.throws(() => tolkProsjekt({ values: [{ id: 1, number: '7' }] }, '7'))
  assert.throws(() => tolkProsjekt({}, '7'))
})

test('ordrer: bare åpne på riktig prosjekt, med linjer', () => {
  const json = {
    values: [
      {
        id: 1, number: '100', orderDate: '2026-11-01', isClosed: false, project: { id: 6 },
        orderLines: [{ product: { name: 'Gravemaskin' }, count: 7.5 }, { description: 'Fritekst', count: 2 }],
      },
      { id: 2, number: '101', orderDate: '2026-11-02', isClosed: true, project: { id: 6 }, orderLines: [] },
      { id: 3, number: '102', orderDate: '2026-11-03', isClosed: false, project: { id: 7 }, orderLines: [] },
      { id: 4, number: '103', orderDate: '2026-11-04', isClosed: false, orderLines: [] },
    ],
  }
  assert.deepEqual(tolkApneOrdrer(json, 6), [
    {
      id: 1, nummer: '100', dato: '2026-11-01',
      linjer: [{ produktnavn: 'Gravemaskin', antall: 7.5 }, { produktnavn: 'Fritekst', antall: 2 }],
    },
  ])
})

test('ordrer: uventet form gir feil', () => {
  assert.throws(() => tolkApneOrdrer(null, 1))
  assert.throws(() => tolkApneOrdrer({ values: [{ id: 1, number: '1', orderDate: 'x', isClosed: false, project: { id: 1 }, orderLines: [{ count: 1 }] }] }, 1))
  assert.throws(() => tolkApneOrdrer({ values: [{ id: 1, number: '1', orderDate: 'x', isClosed: false, project: { id: 1 }, orderLines: [{ description: 'a', count: '1' }] }] }, 1))
})

test('linjer: godtar gyldige', () => {
  assert.deepEqual(sjekkLinjer([{ produktId: 5, antall: 7.25, tekst: 'Gravemaskin 12.11' }]), [
    { produktId: 5, antall: 7.25, tekst: 'Gravemaskin 12.11' },
  ])
  assert.ok(Array.isArray(sjekkLinjer([{ produktId: 5, antall: 10000, tekst: 'x' }])))
  assert.ok(Array.isArray(sjekkLinjer([{ produktId: 5, antall: 0.1, tekst: 'x'.repeat(200) }])))
})

test('linjer: produkt kan mangle (null) når teksten er der', () => {
  assert.deepEqual(sjekkLinjer([{ produktId: null, antall: 2, tekst: 'Maskin – arbeid utført iht. vedlegg' }]), [
    { produktId: null, antall: 2, tekst: 'Maskin – arbeid utført iht. vedlegg' },
  ])
  assert.equal(typeof sjekkLinjer([{ produktId: null, antall: 1, tekst: '' }]), 'string')
  assert.equal(typeof sjekkLinjer([{ antall: 1, tekst: 'x' }]), 'string')
})

test('linjer: antall kommer ut med nøyaktig to desimaler', () => {
  // 0.1 + 0.2 er 0.30000000000000004 i flyttall; det skal ikke gå videre til Tripletex.
  const r = sjekkLinjer([{ produktId: 5, antall: 0.1 + 0.2, tekst: 'x' }])
  assert.ok(Array.isArray(r))
  assert.equal(r[0].antall, 0.3)
  const s = sjekkLinjer([{ produktId: 5, antall: 7.5 + 0.15 + 0.1, tekst: 'x' }])
  assert.ok(Array.isArray(s))
  assert.equal(s[0].antall, 7.75)
})

test('linjer: tekst med bare mellomrom avvises', () => {
  assert.equal(typeof sjekkLinjer([{ produktId: 5, antall: 1, tekst: '   ' }]), 'string')
  assert.equal(typeof sjekkLinjer([{ produktId: 5, antall: 1, tekst: '\t\n' }]), 'string')
})

test('linjer: avviser det ugyldige med norsk melding', () => {
  const ugyldig = [
    [],
    'ikke liste',
    null,
    [{ produktId: '5', antall: 1, tekst: 'x' }],
    [{ produktId: 5.5, antall: 1, tekst: 'x' }],
    [{ produktId: 5, antall: 1.234, tekst: 'x' }],
    [{ produktId: 5, antall: 0, tekst: 'x' }],
    [{ produktId: 5, antall: -1, tekst: 'x' }],
    [{ produktId: 5, antall: 10000.01, tekst: 'x' }],
    [{ produktId: 5, antall: NaN, tekst: 'x' }],
    [{ produktId: 5, antall: 1, tekst: '' }],
    [{ produktId: 5, antall: 1, tekst: 'x'.repeat(201) }],
    [{ produktId: 5, antall: 1 }],
    [null],
  ]
  for (const x of ugyldig) {
    const r = sjekkLinjer(x)
    assert.equal(typeof r, 'string', JSON.stringify(x))
    assert.ok(r.length > 0)
  }
})
