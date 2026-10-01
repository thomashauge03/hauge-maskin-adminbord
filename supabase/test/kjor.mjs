// Kjører alle migrasjonene og SQL-testene mot en ekte Postgres i Docker.
// `npm run test:sql`. Krever Docker. Rører aldri navet.
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const her = dirname(fileURLToPath(import.meta.url))
const migrasjoner = join(her, '..', 'migrations')
const navn = `hm-sqltest-${process.pid}`

// Tidsgrense på hvert kall: et docker-kall som henger, skal ikke holde testen
// gående for alltid. Første `run` kan måtte hente bildet, og får lengst.
const SEKUND = 1000
const docker = (args, input, ms = 120 * SEKUND) =>
  spawnSync('docker', args, { input, encoding: 'utf8', timeout: ms })
const vent = (ms) => new Promise((ferdig) => setTimeout(ferdig, ms))
const grunn = (svar) =>
  [svar.error?.message, svar.stderr, svar.stdout].filter(Boolean).join('\n') || `kode ${svar.status}`

function kjør(fil) {
  const svar = docker(
    ['exec', '-i', navn, 'psql', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'],
    readFileSync(fil, 'utf8'),
  )
  if (svar.status !== 0) throw new Error(`${fil}\n${grunn(svar)}`)
}

async function klar() {
  // Bildet starter en midlertidig tjener mens det setter seg opp, og så den
  // ekte. pg_isready alene kan svare ja fra den første.
  for (let i = 0; i < 240; i++) {
    const logg = docker(['logs', navn], undefined, 30 * SEKUND)
    const ferdigSatt = `${logg.stdout}${logg.stderr}`.includes('PostgreSQL init process complete')
    if (ferdigSatt && docker(['exec', navn, 'pg_isready', '-U', 'postgres'], undefined, 30 * SEKUND).status === 0) return
    await vent(500)
  }
  throw new Error('Postgres ble aldri klar')
}

let stoppet = false
function stopp() {
  if (stoppet) return
  stoppet = true
  docker(['stop', navn], undefined, 60 * SEKUND)
}

// Ctrl-C avslutter Node uten å kjøre finally, og da ble beholderen stående.
// SIGBREAK er Ctrl-Break på Windows; på andre system kommer den aldri.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => {
    console.error(`\nAvbrutt (${signal}) – stopper ${navn}`)
    stopp()
    process.exit(130)
  })
}

const start = docker(
  ['run', '-d', '--rm', '--name', navn, '-e', 'POSTGRES_PASSWORD=test', 'postgres:17'],
  undefined,
  10 * 60 * SEKUND,
)
if (start.status !== 0) {
  console.error(`Fikk ikke startet Postgres i Docker:\n${grunn(start)}`)
  // Gikk tida ut, kan beholderen likevel ha kommet opp
  stopp()
  process.exit(1)
}

try {
  await klar()
  kjør(join(her, 'auth-stub.sql'))
  for (const fil of readdirSync(migrasjoner).filter((f) => f.endsWith('.sql')).sort()) {
    kjør(join(migrasjoner, fil))
  }
  for (const fil of readdirSync(her).filter((f) => f.endsWith('.test.sql')).sort()) {
    kjør(join(her, fil))
    console.log(`ok  ${fil}`)
  }
} catch (feil) {
  console.error(feil.message)
  process.exitCode = 1
} finally {
  stopp()
}
