// sider.json på GitHub, også etter at den har passert 1 MB. Kjøres med `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { hentSidefila, skrivSidefila } from './sidefila.ts'

const TOKEN = 'test-token'
const REPO = 'https://api.github.com/repos/thomashauge03/hauge-maskin-app'
const MB = 1024 * 1024
const OM = 'Sidelista i Hauge Maskin-appen – mobilen og PC-en leser den samme fila.'

/** SHA-en git gir en fil: sha1 av «blob <lengde>\0» fulgt av innholdet. */
function blobSha(tekst) {
  const innhold = Buffer.from(tekst, 'utf8')
  return createHash('sha1').update(`blob ${innhold.length}\0`).update(innhold).digest('hex')
}

/** En side slik skrivebordsappen lagrer den, med ikonet rett i fila. */
const side = (navn, ikonbyte = 100) => ({
  id: navn,
  name: navn,
  url: 'https://hm.no',
  group: 'Drift',
  image: `data:image/png;base64,${'A'.repeat(ikonbyte)}`,
})

/** Fila slik skrivebordsappen skriver den: to mellomrom, og linjeskift til slutt. */
const fil = (sider) => JSON.stringify({ _om: OM, pages: sider }, null, 2) + '\n'

/** Ikon på 29 kB, som de som ligger der. Førti av dem blir mer enn 1 MB. */
const førtiSider = () => Array.from({ length: 40 }, (_, i) => side(`Side ${i + 1}`, 29_000))

/**
 * GitHub i minnet: sider.json på main, alle versjonene fila har hatt, og de
 * kallene adminbordet gjør. Svarene har samme form som de ekte – også at
 * innholdet uteblir over 1 MB, som var det som knakk adminbordet.
 */
function lagGitHub(start) {
  const versjoner = new Map()
  let gjeldende = ''
  const lagre = (tekst) => {
    gjeldende = blobSha(tekst)
    versjoner.set(gjeldende, tekst)
  }
  lagre(start)

  const feil = (status, message) =>
    Response.json(
      { message, documentation_url: 'https://docs.github.com/rest', status: String(status) },
      { status },
    )

  const metadata = (sha, size) => ({
    name: 'sider.json',
    path: 'sider.json',
    sha,
    size,
    url: `${REPO}/contents/sider.json?ref=main`,
    html_url: 'https://github.com/thomashauge03/hauge-maskin-app/blob/main/sider.json',
    git_url: `${REPO}/git/blobs/${sha}`,
    download_url: 'https://raw.githubusercontent.com/thomashauge03/hauge-maskin-app/main/sider.json',
    type: 'file',
    _links: {
      self: `${REPO}/contents/sider.json?ref=main`,
      git: `${REPO}/git/blobs/${sha}`,
      html: 'https://github.com/thomashauge03/hauge-maskin-app/blob/main/sider.json',
    },
  })

  async function hent(url, init = {}) {
    const metode = init.method ?? 'GET'
    const hode = new Headers(init.headers)
    if (!url.startsWith(REPO)) return feil(404, 'Not Found')
    if (hode.get('authorization') !== `Bearer ${TOKEN}`) return feil(401, 'Bad credentials')
    const sti = url.slice(REPO.length)
    const raa = hode.get('accept') === 'application/vnd.github.raw+json'

    if (sti === '/contents/sider.json' && metode === 'GET') {
      const tekst = versjoner.get(gjeldende)
      if (raa) return new Response(tekst)
      const size = Buffer.byteLength(tekst)
      return Response.json({
        ...metadata(gjeldende, size),
        content: size > MB ? '' : Buffer.from(tekst).toString('base64').replace(/.{60}/g, '$&\n'),
        encoding: size > MB ? 'none' : 'base64',
      })
    }

    if (sti === '/contents/sider.json' && metode === 'PUT') {
      const { content, sha } = JSON.parse(init.body)
      if (!sha) return feil(422, 'Invalid request.\n\n"sha" wasn\'t supplied.')
      if (sha !== gjeldende) return feil(409, `sider.json does not match ${sha}`)
      const tekst = Buffer.from(content, 'base64').toString('utf8')
      lagre(tekst)
      return Response.json({
        content: metadata(gjeldende, Buffer.byteLength(tekst)),
        commit: { sha: blobSha(`commit ${gjeldende}`) },
      })
    }

    const blob = sti.match(/^\/git\/blobs\/([0-9a-f]{40})$/)
    if (blob && metode === 'GET' && versjoner.has(blob[1])) {
      const tekst = versjoner.get(blob[1])
      if (raa) return new Response(tekst)
      return Response.json({
        sha: blob[1],
        node_id: 'B_test',
        size: Buffer.byteLength(tekst),
        url: `${REPO}/git/blobs/${blob[1]}`,
        content: Buffer.from(tekst).toString('base64'),
        encoding: 'base64',
      })
    }

    return feil(404, 'Not Found')
  }

  return { hent, lagre, innhold: () => versjoner.get(gjeldende) }
}

test('under 1 MB: sidene, _om og SHA-en til versjonen', async () => {
  const tekst = fil([side('Kjøretøy'), side('Lager på Ås')])
  const github = lagGitHub(tekst)

  assert.deepEqual(await hentSidefila({ token: TOKEN, hent: github.hent }), {
    sider: [side('Kjøretøy'), side('Lager på Ås')],
    hylse: { _om: OM },
    sha: blobSha(tekst),
  })
})

test('over 1 MB: sidene kan leses og lagres igjen', async () => {
  const tekst = fil(førtiSider())
  assert.ok(Buffer.byteLength(tekst) > MB, 'testfila må være over 1 MB for å prøve det den skal')
  const github = lagGitHub(tekst)
  const kobling = { token: TOKEN, hent: github.hent }

  const { sider, sha, hylse } = await hentSidefila(kobling)
  assert.equal(sider.length, 40)
  assert.deepEqual(sider[39], side('Side 40', 29_000))
  assert.deepEqual(hylse, { _om: OM })
  assert.equal(sha, blobSha(tekst))

  const svar = await skrivSidefila(kobling, [...sider, side('Ny')], sha, 'Ny felles side: Ny', hylse)
  assert.deepEqual(svar, { ok: true })
  assert.equal(github.innhold(), fil([...førtiSider(), side('Ny')]))
})

test('lagrer skrivebordsappen mellom de to kallene våre, hører innholdet og SHA-en fortsatt sammen', async () => {
  const før = fil(førtiSider())
  const github = lagGitHub(før)
  let lagretFraPC = false
  const hent = async (url, init) => {
    const svar = await github.hent(url, init)
    if (!lagretFraPC) {
      lagretFraPC = true
      github.lagre(fil([...førtiSider(), side('Fra PC')]))
    }
    return svar
  }

  const { sider, sha } = await hentSidefila({ token: TOKEN, hent })
  assert.equal(sider.length, 40, 'innholdet er fra versjonen før skrivebordsappen lagret')
  assert.equal(sha, blobSha(før), 'og SHA-en er fra den samme versjonen')
})

test('409: lagret skrivebordsappen etter at vi leste, blir endringen dens stående', async () => {
  const github = lagGitHub(fil(førtiSider()))
  const kobling = { token: TOKEN, hent: github.hent }
  const { sider, sha, hylse } = await hentSidefila(kobling)

  const fraPC = fil([...førtiSider(), side('Fra PC')])
  github.lagre(fraPC)

  const svar = await skrivSidefila(kobling, [...sider, side('Herfra')], sha, 'Ny felles side: Herfra', hylse)
  assert.equal(svar.ok, false)
  assert.equal(svar.konflikt, true)
  assert.equal(github.innhold(), fraPC)
})
