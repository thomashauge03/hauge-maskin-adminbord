// Rene regler for sending av timer til Tripletex-ordre. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sjekkSending,
  sjekkKode,
  sjekkAvklar,
  vurder,
  sluttstatus,
  gjeldendeStatus,
  tillatt,
  kommentar,
  medKommentar,
  harKode,
  tolkPris,
  tolkNyOrdre,
  tolkOrdre,
  ordrerMedKode,
  linjeneKomInn,
  sumEksMva,
  MAKS_PDF_BYTE,
  MAKS_TIMER,
  tolkMal,
  delIBiter,
  FRIST_LINJER_MS,
  forSentForLinjer,
  kanMerke,
  kollisjonsmelding,
  frigiMelding,
} from './sending.ts'

const PDF = Buffer.from('%PDF-1.7\n%test\n').toString('base64')

function gyldig(over = {}) {
  return {
    prosjekt: '2026118',
    ordre: { ny: true },
    linjer: [{ produktId: 5, antall: 7.5, tekst: 'Gravemaskin 12t, uke 47' }],
    timerIder: [101, 102],
    pdf: PDF,
    filnavn: 'timer-2026118.pdf',
    periode: { fra: '2026-11-16', til: '2026-11-22' },
    ...over,
  }
}

/* ── Kroppen til legg-paa-ordre ─────────────────────────────── */

test('sending: godtar en gyldig kropp og dekoder PDF-en', () => {
  const r = sjekkSending(gyldig())
  assert.equal(typeof r, 'object')
  assert.equal(r.prosjekt, '2026118')
  assert.deepEqual(r.ordre, { ny: true })
  assert.deepEqual(r.timerIder, [101, 102])
  assert.equal(Buffer.from(r.pdf).subarray(0, 4).toString('latin1'), '%PDF')
  assert.deepEqual(r.periode, { fra: '2026-11-16', til: '2026-11-22' })
})

test('sending: eksisterende ordre med id', () => {
  const r = sjekkSending(gyldig({ ordre: { id: 42 } }))
  assert.deepEqual(r.ordre, { id: 42 })
})

test('sending: prosjektnummeret trimmes', () => {
  assert.equal(sjekkSending(gyldig({ prosjekt: ' 2026118 ' })).prosjekt, '2026118')
})

test('sending: linjene går gjennom sjekkLinjer', () => {
  assert.equal(typeof sjekkSending(gyldig({ linjer: [] })), 'string')
  assert.equal(typeof sjekkSending(gyldig({ linjer: [{ produktId: 5, antall: 1.234, tekst: 'x' }] })), 'string')
})

test('sending: avviser ugyldige kropper med norsk melding', () => {
  const stor = Buffer.alloc(MAKS_PDF_BYTE + 1, 0x20)
  stor.write('%PDF', 0, 'latin1')
  const ugyldig = [
    null,
    'tekst',
    [],
    gyldig({ prosjekt: '' }),
    gyldig({ prosjekt: '   ' }),
    gyldig({ prosjekt: 5 }),
    gyldig({ prosjekt: 'x'.repeat(51) }),
    gyldig({ ordre: undefined }),
    gyldig({ ordre: { ny: false } }),
    gyldig({ ordre: { id: 0 } }),
    gyldig({ ordre: { id: -3 } }),
    gyldig({ ordre: { id: 1.5 } }),
    gyldig({ ordre: { id: '42' } }),
    gyldig({ ordre: { ny: true, id: 42 } }),
    gyldig({ timerIder: [] }),
    gyldig({ timerIder: 'x' }),
    gyldig({ timerIder: [1, 1] }),
    gyldig({ timerIder: [0] }),
    gyldig({ timerIder: [-1] }),
    gyldig({ timerIder: [1.5] }),
    gyldig({ timerIder: ['1'] }),
    gyldig({ timerIder: [2147483648] }),
    gyldig({ pdf: '' }),
    gyldig({ pdf: 5 }),
    gyldig({ pdf: 'ikke base64!' }),
    gyldig({ pdf: Buffer.from('<html>').toString('base64') }),
    gyldig({ pdf: stor.toString('base64') }),
    gyldig({ filnavn: '' }),
    gyldig({ filnavn: 'timer.txt' }),
    gyldig({ filnavn: 'x'.repeat(117) + '.pdf' }),
    gyldig({ filnavn: 'a"b.pdf' }),
    gyldig({ filnavn: 'a/b.pdf' }),
    gyldig({ filnavn: 'a\nb.pdf' }),
    gyldig({ periode: undefined }),
    gyldig({ periode: { fra: '2026-02-30', til: '2026-03-01' } }),
    gyldig({ periode: { fra: '2026-11-22', til: '2026-11-16' } }),
  ]
  for (const x of ugyldig) {
    const r = sjekkSending(x)
    assert.equal(typeof r, 'string', JSON.stringify(x)?.slice(0, 120))
    assert.ok(r.length > 0)
  }
})

test('sending: filnavn på 120 tegn med .PDF godtas', () => {
  assert.equal(typeof sjekkSending(gyldig({ filnavn: 'x'.repeat(116) + '.PDF' })), 'object')
})

test('sending: PDF på nøyaktig grensen godtas', () => {
  const b = Buffer.alloc(MAKS_PDF_BYTE, 0x20)
  b.write('%PDF', 0, 'latin1')
  assert.equal(typeof sjekkSending(gyldig({ pdf: b.toString('base64') })), 'object')
})

/* ── kode og avklaring ─────────────────────────────────────── */

test('kode: seks tegn a-z0-9', () => {
  assert.equal(sjekkKode({ kode: 'k7x2ab' }), 'k7x2ab')
  for (const x of [null, {}, { kode: 'K7X2AB' }, { kode: 'k7x2a' }, { kode: 'k7x2abc' }, { kode: 5 }, { kode: "k7x2a'" }]) {
    assert.equal(sjekkKode(x), null, JSON.stringify(x))
  }
})

test('avklar: kode og valg', () => {
  assert.deepEqual(sjekkAvklar({ kode: 'k7x2ab', valg: 'sjekk' }), { kode: 'k7x2ab', valg: 'sjekk', bekreftetLinjer: false })
  assert.deepEqual(sjekkAvklar({ kode: 'k7x2ab', valg: 'frigi' }), { kode: 'k7x2ab', valg: 'frigi', bekreftetLinjer: false })
  assert.deepEqual(sjekkAvklar({ kode: 'k7x2ab', valg: 'merk' }), { kode: 'k7x2ab', valg: 'merk', bekreftetLinjer: false })
  assert.deepEqual(
    sjekkAvklar({ kode: 'k7x2ab', valg: 'merk', bekreftetLinjer: true }),
    { kode: 'k7x2ab', valg: 'merk', bekreftetLinjer: true },
  )
  assert.deepEqual(
    sjekkAvklar({ kode: 'k7x2ab', valg: 'merk', bekreftetLinjer: false }),
    { kode: 'k7x2ab', valg: 'merk', bekreftetLinjer: false },
  )
  // Bare ekte true teller som bekreftelse; alt annet er en feil i kallet.
  assert.equal(typeof sjekkAvklar({ kode: 'k7x2ab', valg: 'merk', bekreftetLinjer: 'true' }), 'string')
  assert.equal(typeof sjekkAvklar({ kode: 'k7x2ab', valg: 'merk', bekreftetLinjer: 1 }), 'string')
  assert.equal(typeof sjekkAvklar({ kode: 'k7x2ab', valg: 'slett' }), 'string')
  assert.equal(typeof sjekkAvklar({ kode: 'x', valg: 'sjekk' }), 'string')
  assert.equal(typeof sjekkAvklar(null), 'string')
})

/* ── Hva et svar betyr, steg for steg ──────────────────────── */

test('vurder: 2xx er ok på alle steg', () => {
  for (const steg of ['ny_ordre', 'hent_ordre', 'kommentar', 'pris', 'linjer', 'vedlegg', 'merke']) {
    assert.equal(vurder(steg, 200), 'ok')
    assert.equal(vurder(steg, 201), 'ok')
  }
})

test('vurder: ny ordre og linjer — avvist er feilet, uten svar er ukjent', () => {
  for (const steg of ['ny_ordre', 'linjer']) {
    for (const s of [400, 401, 403, 404, 409, 422, 429]) assert.equal(vurder(steg, s), 'feilet', `${steg} ${s}`)
    for (const s of [500, 502, 503, 504, 'brudd', 302, 0]) assert.equal(vurder(steg, s), 'ukjent_utfall', `${steg} ${s}`)
  }
})

test('vurder: lesing, kommentar og pris kan ikke ha lagt noe på ordren', () => {
  for (const steg of ['hent_ordre', 'kommentar', 'pris']) {
    for (const s of [400, 404, 500, 503, 'brudd']) assert.equal(vurder(steg, s), 'feilet', `${steg} ${s}`)
  }
})

test('vurder: vedlegg og merke', () => {
  for (const s of [400, 413, 500, 'brudd']) assert.equal(vurder('vedlegg', s), 'sendt_uten_vedlegg')
  for (const s of [400, 500, 'brudd']) assert.equal(vurder('merke', s), 'sendt_uten_merke')
})

test('sluttstatus: merket teller mest, så vedlegget', () => {
  assert.equal(sluttstatus(true, true), 'sendt')
  assert.equal(sluttstatus(false, true), 'sendt_uten_vedlegg')
  assert.equal(sluttstatus(true, false), 'sendt_uten_merke')
  assert.equal(sluttstatus(false, false), 'sendt_uten_merke')
})

/* ── Overganger ────────────────────────────────────────────── */

test('gjeldende status: startet som er blitt gammel er ukjent utfall', () => {
  const naa = Date.parse('2026-11-26T12:00:00Z')
  assert.equal(gjeldendeStatus('startet', '2026-11-26T11:59:00Z', naa), 'startet')
  assert.equal(gjeldendeStatus('startet', '2026-11-26T11:49:00Z', naa), 'ukjent_utfall')
  assert.equal(gjeldendeStatus('startet', 'tull', naa), 'ukjent_utfall')
  assert.equal(gjeldendeStatus('sendt', '2020-01-01T00:00:00Z', naa), 'sendt')
})

test('tillatt: fjern merke bare fra sendt-statusene', () => {
  for (const s of ['sendt', 'sendt_uten_vedlegg', 'sendt_uten_merke']) assert.equal(tillatt('fjern-merke', s), true, s)
  for (const s of ['startet', 'ukjent_utfall', 'feilet', 'angret']) assert.equal(tillatt('fjern-merke', s), false, s)
})

test('tillatt: frigi og merk bare fra ukjent utfall og sendt uten merke', () => {
  for (const h of ['frigi', 'merk']) {
    for (const s of ['ukjent_utfall', 'sendt_uten_merke']) assert.equal(tillatt(h, s), true, `${h} ${s}`)
    for (const s of ['startet', 'sendt', 'sendt_uten_vedlegg', 'feilet', 'angret']) assert.equal(tillatt(h, s), false, `${h} ${s}`)
  }
})

test('tillatt: sjekk kan gjøres når som helst unntatt mens sendingen pågår', () => {
  for (const s of ['sendt', 'sendt_uten_vedlegg', 'sendt_uten_merke', 'ukjent_utfall', 'feilet', 'angret']) {
    assert.equal(tillatt('sjekk', s), true, s)
  }
  assert.equal(tillatt('sjekk', 'startet'), false)
})

/* ── Kommentar på ordren ───────────────────────────────────── */

test('kommentar: kode og periode', () => {
  assert.equal(kommentar('k7x2ab', '2026-11-16', '2026-11-22'), 'SmartDok til PDF k7x2ab, 2026-11-16–2026-11-22')
})

test('kommentar: legges etter det som står der fra før', () => {
  const k = 'SmartDok til PDF k7x2ab, 2026-11-16–2026-11-22'
  assert.equal(medKommentar('Ring før levering', k), `Ring før levering ${k}`)
  assert.equal(medKommentar('', k), k)
  assert.equal(medKommentar(null, k), k)
  assert.equal(medKommentar(undefined, k), k)
  assert.equal(medKommentar('  ', k), k)
})

test('harKode: leter etter hele merket, ikke bare seks tegn', () => {
  assert.equal(harKode('Ring før SmartDok til PDF k7x2ab, 2026-11-16–2026-11-22', 'k7x2ab'), true)
  assert.equal(harKode('k7x2ab', 'k7x2ab'), false)
  assert.equal(harKode('SmartDok til PDF k7x2abc, x', 'k7x2ab'), false)
  assert.equal(harKode(null, 'k7x2ab'), false)
})

/* ── Svar fra Tripletex ────────────────────────────────────── */

test('mal: pris og kunderabatt fra orderLineTemplate', () => {
  assert.deepEqual(tolkMal({ value: { unitPriceExcludingVatCurrency: 1250, discount: 10 } }), { pris: 1250, rabatt: 10 })
  assert.deepEqual(tolkMal({ value: { unitPriceExcludingVatCurrency: 99.5, discount: 0 } }), { pris: 99.5, rabatt: 0 })
  assert.deepEqual(tolkMal({ value: { unitPriceExcludingVatCurrency: 99.5, discount: 100 } }), { pris: 99.5, rabatt: 100 })
  // Uten rabatt i malen er det ingen rabatt.
  assert.deepEqual(tolkMal({ value: { unitPriceExcludingVatCurrency: 1250 } }), { pris: 1250, rabatt: 0 })
  assert.deepEqual(tolkMal({ value: { unitPriceExcludingVatCurrency: 1250, discount: null } }), { pris: 1250, rabatt: 0 })
})

test('mal: rabatt som ikke er en prosent mellom 0 og 100 stopper', () => {
  for (const discount of [-1, 100.5, '10', NaN, Infinity]) {
    assert.equal(tolkMal({ value: { unitPriceExcludingVatCurrency: 1250, discount } }), null, String(discount))
  }
})

test('mal: uten pris er det ingen mal', () => {
  assert.equal(tolkMal({ value: { discount: 10 } }), null)
  assert.equal(tolkMal({ value: { unitPriceExcludingVatCurrency: 0, discount: 10 } }), null)
})

test('pris: positivt tall fra malen, ellers null', () => {
  assert.equal(tolkPris({ value: { unitPriceExcludingVatCurrency: 1250 } }), 1250)
  assert.equal(tolkPris({ value: { unitPriceExcludingVatCurrency: 99.5 } }), 99.5)
  for (const j of [
    null,
    {},
    { value: {} },
    { value: { unitPriceExcludingVatCurrency: 0 } },
    { value: { unitPriceExcludingVatCurrency: -1 } },
    { value: { unitPriceExcludingVatCurrency: '1250' } },
    { value: { unitPriceExcludingVatCurrency: null } },
    { value: { unitPriceIncludingVatCurrency: 1250 } },
  ]) {
    assert.equal(tolkPris(j), null, JSON.stringify(j))
  }
})

test('ny ordre: id og nummer, ellers null', () => {
  assert.deepEqual(tolkNyOrdre({ value: { id: 77, number: '1234' } }), { id: 77, nummer: '1234' })
  assert.deepEqual(tolkNyOrdre({ value: { id: 77, number: 1234 } }), { id: 77, nummer: '1234' })
  for (const j of [null, {}, { value: { number: '1' } }, { value: { id: 0, number: '1' } }, { value: { id: 7 } }, { value: { id: '7', number: '1' } }]) {
    assert.equal(tolkNyOrdre(j), null, JSON.stringify(j))
  }
})

test('ordre: felt som trengs for å legge til og sjekke', () => {
  assert.deepEqual(
    tolkOrdre({
      value: {
        id: 77,
        version: 3,
        number: '1234',
        isClosed: false,
        isPrioritizeAmountsIncludingVat: false,
        project: { id: 9 },
        internalComment: 'hei',
        orderLines: [{ id: 1 }, { id: 2 }],
      },
    }),
    { id: 77, versjon: 3, nummer: '1234', lukket: false, prisInklMva: false, prosjektId: 9, kommentar: 'hei', antallLinjer: 2 },
  )
  assert.deepEqual(tolkOrdre({ value: { id: 77, version: 0, number: '1', isClosed: true, isPrioritizeAmountsIncludingVat: true } }), {
    id: 77,
    versjon: 0,
    nummer: '1',
    lukket: true,
    prisInklMva: true,
    prosjektId: null,
    kommentar: '',
    antallLinjer: 0,
  })
  // Ukjent lukket-status og ukjent prisvalg regnes ikke som åpen eller eks. mva.
  assert.equal(tolkOrdre({ value: { id: 77, version: 0, number: '1' } }).lukket, null)
  assert.equal(tolkOrdre({ value: { id: 77, version: 0, number: '1' } }).prisInklMva, null)
  for (const j of [null, {}, { value: { version: 1, number: '1' } }, { value: { id: 1, number: '1' } }, { value: { id: 1, version: 1 } }]) {
    assert.equal(tolkOrdre(j), null, JSON.stringify(j))
  }
})

test('ordrer med kode: plukker ordrene med koden i kommentaren', () => {
  const values = [
    { id: 1, number: '10', internalComment: 'SmartDok til PDF aaaaaa, x', orderLines: [{ id: 1 }] },
    { id: 2, number: '11', internalComment: 'SmartDok til PDF k7x2ab, 2026-11-16–2026-11-22', orderLines: [{ id: 1 }, { id: 2 }] },
    { id: 3, number: '12', internalComment: null },
    'søppel',
  ]
  assert.deepEqual(ordrerMedKode(values, 'k7x2ab'), [{ id: 2, nummer: '11', antallLinjer: 2 }])
  assert.deepEqual(ordrerMedKode(values, 'zzzzzz'), [])
})

test('linjene kom inn: like mange tilbake som sendt', () => {
  assert.equal(linjeneKomInn({ values: [{ id: 1 }, { id: 2 }] }, 2), true)
  assert.equal(linjeneKomInn({ values: [{ id: 1 }] }, 2), false)
  assert.equal(linjeneKomInn({}, 2), false)
  assert.equal(linjeneKomInn(null, 1), false)
})

test('sum eks. mva med to desimaler', () => {
  assert.equal(sumEksMva([{ antall: 7.5, pris: 1250 }, { antall: 0.1, pris: 0.2 }]), 9375.02)
  assert.equal(sumEksMva([]), 0)
})

test('sum eks. mva trekker fra rabatten', () => {
  assert.equal(sumEksMva([{ antall: 10, pris: 1000, rabatt: 10 }, { antall: 1, pris: 500, rabatt: 0 }]), 9500)
  assert.equal(sumEksMva([{ antall: 2, pris: 100, rabatt: 100 }]), 0)
})

/* ── Overlappsjekk i biter ─────────────────────────────────── */

test('biter: deler lista i biter på høyst n', () => {
  assert.deepEqual(delIBiter([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(delIBiter([1, 2], 200), [[1, 2]])
  assert.deepEqual(delIBiter([], 200), [])
  const mange = Array.from({ length: 3000 }, (_, i) => i + 1)
  const b = delIBiter(mange, 200)
  assert.equal(b.length, 15)
  assert.deepEqual(b.flat(), mange)
})

test('sending: høyst 3000 timer', () => {
  const ider = (n) => Array.from({ length: n }, (_, i) => i + 1)
  assert.equal(MAKS_TIMER, 3000)
  assert.equal(typeof sjekkSending(gyldig({ timerIder: ider(3000) })), 'object')
  assert.equal(typeof sjekkSending(gyldig({ timerIder: ider(3001) })), 'string')
})

/* ── Frist før linjene ─────────────────────────────────────── */

test('frist: linjene sendes ikke etter 45 sekunder', () => {
  assert.equal(FRIST_LINJER_MS, 45_000)
  assert.equal(forSentForLinjer(1000, 1000 + 45_000), false)
  assert.equal(forSentForLinjer(1000, 1000 + 45_001), true)
  assert.equal(forSentForLinjer(1000, 1000 + 60_000), true)
})

/* ── Merk etter ukjent utfall ──────────────────────────────── */

const FUNNET = { funnet: true, antallLinjer: 2, ordrenummer: '11' }

test('kan merke: sendt uten merke kan alltid merkes', () => {
  assert.equal(kanMerke('sendt_uten_merke', true, null), null)
  assert.equal(kanMerke('sendt_uten_merke', false, null), null)
  assert.equal(kanMerke('sendt_uten_merke', null, null), null)
})

test('kan merke: ukjent utfall bare på en ny ordre som er funnet og har linjer', () => {
  assert.equal(kanMerke('ukjent_utfall', true, FUNNET), null)
  for (const funn of [null, { funnet: false, antallLinjer: 0, ordrenummer: null }, { ...FUNNET, antallLinjer: 0 }]) {
    const r = kanMerke('ukjent_utfall', true, funn)
    assert.equal(typeof r, 'string', JSON.stringify(funn))
    assert.ok(r.length > 0)
  }
})

test('kan merke: eksisterende ordre, eller ukjent om ordren var ny, merkes ikke uten bekreftelse', () => {
  for (const ny of [false, null]) {
    for (const bekreftet of [undefined, false]) {
      const r = kanMerke('ukjent_utfall', ny, { ...FUNNET, antallLinjer: 5 }, bekreftet)
      assert.equal(typeof r, 'string', String(ny))
      assert.match(r, /eksisterende/)
      assert.match(r, /Tripletex/)
      assert.doesNotMatch(r, /for hånd i SmartDok/)
    }
  }
})

test('kan merke: eksisterende ordre med bekreftede linjer kan merkes', () => {
  for (const ny of [false, null]) {
    assert.equal(kanMerke('ukjent_utfall', ny, { ...FUNNET, antallLinjer: 5 }, true), null, String(ny))
  }
})

test('kan merke: bekreftelsen hjelper ikke når ordren ikke er funnet eller er tom', () => {
  for (const funn of [null, { funnet: false, antallLinjer: 0, ordrenummer: null }, { ...FUNNET, antallLinjer: 0 }]) {
    assert.equal(typeof kanMerke('ukjent_utfall', false, funn, true), 'string', JSON.stringify(funn))
  }
  for (const s of ['startet', 'sendt', 'feilet', 'angret']) {
    assert.equal(typeof kanMerke(s, false, FUNNET, true), 'string', s)
  }
})

test('frigi-melding: sier bare det som skjedde i SmartDok', () => {
  const uten = frigiMelding(null, false)
  assert.match(uten, /frigitt/)
  assert.doesNotMatch(uten, /SmartDok/)
  const ok = frigiMelding('Tripletex ordre 11 (k7x2ab)', false)
  assert.match(ok, /merker i SmartDok er fjernet/)
  const feilet = frigiMelding('Tripletex ordre 11 (k7x2ab)', true)
  assert.match(feilet, /kunne ikke fjernes/)
  assert.match(feilet, /«Tripletex ordre 11 \(k7x2ab\)»/)
  assert.doesNotMatch(feilet, /er fjernet/)
  for (const m of [uten, ok, feilet]) assert.match(m, /Tripletex først/)
})

test('kan merke: andre statuser kan ikke merkes', () => {
  for (const s of ['startet', 'sendt', 'sendt_uten_vedlegg', 'feilet', 'angret']) {
    assert.equal(typeof kanMerke(s, true, FUNNET), 'string', s)
  }
})

test('kommentar: samme enkle form på ny og eksisterende ordre', () => {
  assert.equal(kommentar('k7x2ab', '2026-11-16', '2026-11-22'), 'SmartDok til PDF k7x2ab, 2026-11-16–2026-11-22')
})

/* ── Samtidige sendinger ───────────────────────────────────── */

const NAA = Date.parse('2026-11-26T12:00:00Z')

test('kollisjon: en sending som pågår nå, ber om nytt forsøk og nevner koden', () => {
  assert.equal(
    kollisjonsmelding({ kode: 'aaaaaa', ordrenummer: null, status: 'startet', endret: '2026-11-26T11:59:30Z' }, NAA),
    'Timene sendes akkurat nå fra et annet sted (sending aaaaaa). Prøv igjen.',
  )
})

test('kollisjon: en «startet» som er blitt gammel, må avklares, ikke prøves igjen', () => {
  const m = kollisjonsmelding({ kode: 'aaaaaa', ordrenummer: null, status: 'startet', endret: '2026-11-26T11:00:00Z' }, NAA)
  assert.doesNotMatch(m, /Prøv igjen/)
  assert.match(m, /[Aa]vklar sending aaaaaa/)
})

test('kollisjon: ukjent utfall må avklares', () => {
  const m = kollisjonsmelding({ kode: 'aaaaaa', ordrenummer: '1234', status: 'ukjent_utfall', endret: '2026-11-26T11:00:00Z' }, NAA)
  assert.match(m, /[Aa]vklar sending aaaaaa/)
})

test('kollisjon: sendt nevner ordren og koden', () => {
  const m = kollisjonsmelding({ kode: 'aaaaaa', ordrenummer: '1234', status: 'sendt', endret: '2026-11-26T11:00:00Z' }, NAA)
  assert.match(m, /^Timene er alt sendt til ordre 1234/)
  assert.match(m, /aaaaaa/)
})

