// Tolkning av SmartDoks timer, brukere og maskiner. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tolkTimer, delPeriode, sjekkPeriode, tolkNavn, tolkMaskiner } from './tolk-timer.ts'

const rad = (felter) => ({
  WorkHourID: 101,
  MachineHourId: null,
  WageAddition: false,
  UnitAddition: false,
  Date: '2026-11-10T00:00:00',
  OrdinaryHoursFrom: 7,
  OrdinaryHoursTo: 15.5,
  NetHours: 8,
  Comment: 'Grøfting',
  WorkDescription: 'Graving',
  WageName: 'Ordinær',
  Invoiced: false,
  ProjectNumber: '2026118',
  SubProjectNumber: null,
  SubProjectName: null,
  UserID: '17',
  EmployeeNo: '4711',
  EquipmentId: null,
  EquipmentCode: null,
  BirthDate: '1980-01-01',
  HourlyRate: 512,
  ...felter,
})

const navn = new Map([['17', 'Kari Testesen']])
const maskiner = new Map([[5, 'Gravemaskin CAT 320']])
const tolk = (rader, nr = '2026118') => tolkTimer(rader, nr, navn, maskiner)

test('tar bare rader med riktig prosjektnummer, fra både array og Items', () => {
  const rader = [rad({}), rad({ WorkHourID: 2, ProjectNumber: '9999999' })]
  assert.deepEqual(tolk(rader).map((t) => t.id), [101])
  assert.deepEqual(tolk({ Items: rader }).map((t) => t.id), [101])
})

test('prosjektnummer som tall i SmartDok matcher som tekst', () => {
  assert.equal(tolk([rad({ ProjectNumber: 2026118 })]).length, 1)
})

test('riktig type for vanlig rad, lønnstillegg, enhetstillegg og maskinrad', () => {
  const typer = tolk([
    rad({}),
    rad({ WageAddition: true }),
    rad({ UnitAddition: true }),
    rad({ MachineHourId: 9 }),
    rad({ MachineHourId: 9, WageAddition: true }),
  ]).map((t) => t.type)
  assert.deepEqual(typer, ['arbeid', 'tillegg', 'tillegg', 'maskin', 'maskin'])
})

test('dato klippes til YYYY-MM-DD og feltene får navets navn', () => {
  const [t] = tolk([rad({ SubProjectNumber: '12', SubProjectName: 'Veg' })])
  assert.deepEqual(t, {
    id: 101,
    maskinradId: null,
    maskinId: null,
    eksterntMerke: null,
    type: 'arbeid',
    dato: '2026-11-10',
    fra: 7,
    til: 15.5,
    navn: 'Kari Testesen',
    aktivitet: 'Graving',
    lonnsart: 'Ordinær',
    kommentar: 'Grøfting',
    mengde: 8,
    fakturert: false,
    underprosjekt: '12 Veg',
    maskin: '',
  })
})

test('ukjent bruker gir tomt navn, og ingen andre nøkler lekker ut', () => {
  const [t] = tolk([rad({ UserID: '999' })])
  assert.equal(t.navn, '')
  assert.deepEqual(Object.keys(t).sort(), [
    'aktivitet', 'dato', 'eksterntMerke', 'fakturert', 'fra', 'id', 'kommentar', 'lonnsart',
    'maskin', 'maskinId', 'maskinradId', 'mengde', 'navn', 'til', 'type', 'underprosjekt',
  ])
})

test('maskinId kommer bare fra maskinrader, og et ikke-tall gir null uten feil', () => {
  const [maskinrad, arbeidsrad, ugyldig] = tolk([
    rad({ MachineHourId: 9, EquipmentId: 5 }),
    rad({ EquipmentId: 5 }),
    rad({ MachineHourId: 9, EquipmentId: '5' }),
  ])
  assert.equal(maskinrad.maskinId, 5)
  assert.equal(arbeidsrad.maskinId, null)
  assert.equal(ugyldig.maskinId, null)
})

test('eksterntMerke er ExportedExternalId trimmet, og tom eller manglende gir null', () => {
  const [a, b, c, d] = tolk([
    rad({ ExportedExternalId: 'Tripletex ordre 12 (ab)' }),
    rad({ ExportedExternalId: '' }),
    rad({ ExportedExternalId: null }),
    rad({ ExportedExternalId: '  Tripletex ordre 13  ' }),
  ])
  assert.equal(a.eksterntMerke, 'Tripletex ordre 12 (ab)')
  assert.equal(b.eksterntMerke, null)
  assert.equal(c.eksterntMerke, null)
  assert.equal(d.eksterntMerke, 'Tripletex ordre 13')
})

test('maskin fra kartet via EquipmentId, ellers EquipmentCode, ellers tom', () => {
  const [a, b, c] = tolk([
    rad({ EquipmentId: 5, EquipmentCode: 'X1' }),
    rad({ EquipmentId: 6, EquipmentCode: 'GM-12' }),
    rad({}),
  ])
  assert.equal(a.maskin, 'Gravemaskin CAT 320')
  assert.equal(b.maskin, 'GM-12')
  assert.equal(c.maskin, '')
})

test('underprosjekt uten navn eller nummer blir ikke «null»', () => {
  const [a, b] = tolk([
    rad({ SubProjectNumber: '12' }),
    rad({ SubProjectName: 'Veg' }),
  ])
  assert.equal(a.underprosjekt, '12')
  assert.equal(b.underprosjekt, 'Veg')
})

test('manglende felter gir trygge standardverdier', () => {
  const [t] = tolk([rad({ Comment: null, WorkDescription: undefined, WageName: null, OrdinaryHoursFrom: null, OrdinaryHoursTo: null })])
  assert.equal(t.kommentar, '')
  assert.equal(t.aktivitet, '')
  assert.equal(t.lonnsart, '')
  assert.equal(t.fra, null)
  assert.equal(t.til, null)
})

test('uventet svar og rader som ikke er objekter gir feil, ikke tom liste', () => {
  for (const svar of [null, undefined, {}, { Message: 'Feil' }, { items: [] }, 'x']) {
    assert.throws(() => tolk(svar), /uventet format/)
    assert.throws(() => tolkNavn(svar), /uventet format/)
    assert.throws(() => tolkMaskiner(svar), /uventet format/)
  }
  assert.throws(() => tolk([null, rad({})]), /uventet format/)
  assert.throws(() => tolk(['x']), /uventet format/)
})

test('manglende WorkHourID, NetHours eller Date gir feil uten persondata', () => {
  assert.throws(() => tolk([rad({ WorkHourID: undefined })]), /WorkHourID/)
  for (const NetHours of [undefined, null, '8', NaN]) {
    assert.throws(() => tolk([rad({ NetHours })]), (e) => /NetHours/.test(e.message) && !/Kari/.test(e.message))
  }
  for (const Date of [undefined, null, 20261110]) {
    assert.throws(() => tolk([rad({ Date })]), /Date/)
  }
})

test('rader fra andre prosjekter filtreres bort før de sjekkes', () => {
  assert.deepEqual(tolk([rad({ ProjectNumber: '1', NetHours: null })]), [])
})

test('delPeriode: ugyldig dato gir feil', () => {
  assert.throws(() => delPeriode('i går', '2026-01-01'), /ugyldig/)
  assert.throws(() => delPeriode('2026-01-01', '2026-02-30'), /ugyldig/)
})

test('delPeriode: ett år blir biter på maks 93 dager uten hull eller overlapp', () => {
  const biter = delPeriode('2026-01-01', '2026-12-31')
  const dag = (s) => Date.parse(`${s}T00:00:00Z`) / 86_400_000
  assert.equal(biter[0].fra, '2026-01-01')
  assert.equal(biter.at(-1).til, '2026-12-31')
  for (const b of biter) assert.ok(dag(b.til) - dag(b.fra) + 1 <= 93)
  for (let i = 1; i < biter.length; i++) {
    assert.equal(dag(biter[i].fra), dag(biter[i - 1].til) + 1)
  }
})

test('delPeriode: én dag gir én bit, og 93 dager gir fortsatt én', () => {
  assert.deepEqual(delPeriode('2026-05-05', '2026-05-05'), [{ fra: '2026-05-05', til: '2026-05-05' }])
  assert.equal(delPeriode('2026-01-01', '2026-04-03').length, 1)
  assert.equal(delPeriode('2026-01-01', '2026-04-04').length, 2)
})

test('sjekkPeriode: ugyldig format, fra etter til og over 366 dager gir melding', () => {
  assert.equal(typeof sjekkPeriode('10.11.2026', '2026-11-12'), 'string')
  assert.equal(typeof sjekkPeriode('2026-02-30', '2026-03-01'), 'string')
  assert.equal(typeof sjekkPeriode('2026-11-12', '2026-11-10'), 'string')
  assert.equal(typeof sjekkPeriode('2026-01-01', '2027-01-02'), 'string') // 367 dager
})

test('sjekkPeriode: 366 dager og samme dag er greit', () => {
  assert.equal(sjekkPeriode('2026-01-01', '2027-01-01'), null) // 366 dager
  assert.equal(sjekkPeriode('2026-11-10', '2026-11-10'), null)
})

test('tolkNavn: bare Id til Name, ingen sensitive felt', () => {
  const m = tolkNavn({ Items: [
    { Id: 17, Name: 'Kari Testesen', BirthDate: '1980-01-01', PhoneNumber: '99999999', NextOfKin: 'X' },
    { Id: '18', Name: 'Ola Prøvesen' },
    { Id: 19 },
  ] })
  assert.deepEqual([...m], [['17', 'Kari Testesen'], ['18', 'Ola Prøvesen']])
  assert.deepEqual([...tolkNavn([{ Id: 1, Name: 'A' }])], [['1', 'A']])
})

test('tolkMaskiner: Id til Name', () => {
  const m = tolkMaskiner({ Count: 2, Offset: 0, TotalCount: 2, Items: [
    { Id: 5, Name: 'Gravemaskin CAT 320', Secret: 'x' },
    { Id: 6, Name: 'Hjullaster' },
  ] })
  assert.deepEqual([...m], [[5, 'Gravemaskin CAT 320'], [6, 'Hjullaster']])
})

test('sidedelt svar der TotalCount er større enn Items gir feil', () => {
  assert.throws(() => tolk({ Items: [rad({})], TotalCount: 5 }), /1 av 5 rader/)
  assert.throws(() => tolkNavn({ Items: [], TotalCount: 2 }), /0 av 2 rader/)
  assert.equal(tolk({ Items: [rad({})], TotalCount: 1 }).length, 1)
})
